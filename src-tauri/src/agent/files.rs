//! Файловые инструменты агентов. Все пути идут через песочницу рабочей папки.
//! Исполнитель может и менять файлы, мастер — только читать и проверять.

use std::fs;
use std::path::Path;

use serde_json::{Value, json};

use super::sandbox::Sandbox;
use super::toolset::{arg, tool};
use crate::explorer::{self, HIDDEN};

/// Больше этого файл не читается целиком: длинный текст забьёт контекст модели.
const MAX_READ_BYTES: u64 = 200_000;
const MAX_SEARCH_MATCHES: usize = 50;
/// Файлы крупнее при поиске пропускаются: скорее всего, это не текст.
const MAX_SEARCH_FILE_BYTES: u64 = 1_000_000;

pub struct Files {
    pub sandbox: Sandbox,
    /// Можно ли создавать, перезаписывать и удалять файлы.
    pub writable: bool,
}

impl Files {
    pub fn definitions(&self) -> Vec<Value> {
        let path = json!({ "type": "string", "description": "Путь от корня рабочей папки через /, пусто — сама папка" });
        let mut tools = vec![
            tool("list_dir", "Показывает файлы и папки внутри папки.", json!({ "path": path }), &["path"]),
            tool("read_file", "Читает текстовый файл целиком.", json!({ "path": path }), &["path"]),
            tool(
                "search",
                "Ищет строки с текстом во всех файлах папки (без учёта регистра).",
                json!({ "query": { "type": "string" }, "path": path }),
                &["query"],
            ),
        ];
        if self.writable {
            tools.push(tool(
                "write_file",
                "Создаёт текстовый файл или перезаписывает существующий целиком; недостающие папки создаются.",
                json!({ "path": path, "content": { "type": "string", "description": "Новый текст файла целиком" } }),
                &["path", "content"],
            ));
            tools.push(tool(
                "delete_file",
                "Удаляет файл или папку со всем содержимым (в Корзину системы). Саму рабочую папку удалить нельзя.",
                json!({ "path": path }),
                &["path"],
            ));
        }
        tools
    }

    /// Выполняет файловый инструмент; `None` — это не файловый инструмент (или он недоступен).
    pub fn call(&self, name: &str, args: &Value) -> Option<Result<String, String>> {
        let path = arg(args, "path");
        Some(match name {
            "list_dir" => self.list_dir(path),
            "read_file" => self.read_file(path),
            "search" => self.search(arg(args, "query"), path),
            "write_file" if self.writable => self.write_file(path, arg(args, "content")),
            "delete_file" if self.writable => self.delete_file(path),
            _ => return None,
        })
    }

    fn list_dir(&self, path: &str) -> Result<String, String> {
        let dir = self.sandbox.resolve(path)?;
        let mut names: Vec<String> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter(|e| !HIDDEN.contains(&e.file_name().to_string_lossy().as_ref()))
            .map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.path().is_dir() { format!("{name}/") } else { name }
            })
            .collect();
        names.sort();
        Ok(if names.is_empty() { "(папка пуста)".to_owned() } else { names.join("\n") })
    }

    fn read_file(&self, path: &str) -> Result<String, String> {
        let file = self.sandbox.resolve(path)?;
        let size = fs::metadata(&file).map_err(|e| e.to_string())?.len();
        if size > MAX_READ_BYTES {
            return Err(format!("файл слишком большой ({size} байт), используй search"));
        }
        fs::read_to_string(&file).map_err(|e| format!("не удалось прочитать как текст: {e}"))
    }

    fn write_file(&self, path: &str, content: &str) -> Result<String, String> {
        let file = self.sandbox.resolve(path)?;
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&file, content).map_err(|e| e.to_string())?;
        Ok(format!("Записано {} байт в {}", content.len(), self.sandbox.relative(&file)))
    }

    /// Удаляет в Корзину, а не насовсем: ошибку агента можно будет исправить.
    fn delete_file(&self, path: &str) -> Result<String, String> {
        let target = self.sandbox.resolve(path)?;
        if self.sandbox.is_root(&target) {
            return Err("саму рабочую папку удалить нельзя".to_owned());
        }
        if !target.exists() {
            return Err(format!("«{path}» нет"));
        }
        let rel = self.sandbox.relative(&target);
        explorer::trash_path(target)?;
        Ok(format!("Удалено в Корзину: {rel}"))
    }

    fn search(&self, query: &str, path: &str) -> Result<String, String> {
        if query.is_empty() {
            return Err("пустой запрос".to_owned());
        }
        let mut matches = Vec::new();
        self.search_in(&self.sandbox.resolve(path)?, &query.to_lowercase(), &mut matches);
        Ok(if matches.is_empty() { "Ничего не найдено".to_owned() } else { matches.join("\n") })
    }

    fn search_in(&self, dir: &Path, query: &str, matches: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.filter_map(Result::ok) {
            if matches.len() >= MAX_SEARCH_MATCHES {
                return;
            }
            let path = entry.path();
            if HIDDEN.contains(&entry.file_name().to_string_lossy().as_ref()) {
                continue;
            }
            // Ссылки не раскрываем: они могли бы вести за пределы рабочей папки.
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                self.search_in(&path, query, matches);
            } else if kind.is_file() && entry.metadata().is_ok_and(|m| m.len() <= MAX_SEARCH_FILE_BYTES) {
                let Ok(text) = fs::read_to_string(&path) else { continue };
                let lines = text.lines().enumerate().filter(|(_, line)| line.to_lowercase().contains(query));
                for (number, line) in lines.take(MAX_SEARCH_MATCHES - matches.len()) {
                    matches.push(format!("{}:{}: {}", self.sandbox.relative(&path), number + 1, line.trim()));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(writable: bool) -> (tempfile::TempDir, Files) {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("work/docs")).unwrap();
        fs::write(dir.path().join("work/docs/plan.md"), "# План\nСделать шапку\n").unwrap();
        fs::write(dir.path().join("secret.txt"), "шапка снаружи").unwrap();
        let files = Files { sandbox: Sandbox::new(&dir.path().join("work")).unwrap(), writable };
        (dir, files)
    }

    fn call(files: &Files, name: &str, args: Value) -> Result<String, String> {
        files.call(name, &args).expect("файловый инструмент")
    }

    #[test]
    fn works_with_files_inside_the_folder() {
        let (dir, files) = files(true);
        assert_eq!(call(&files, "list_dir", json!({ "path": "" })).unwrap(), "docs/");
        call(&files, "write_file", json!({ "path": "out/a.txt", "content": "шапка" })).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("work/out/a.txt")).unwrap(), "шапка");
        call(&files, "write_file", json!({ "path": "docs/plan.md", "content": "новый план" })).unwrap();
        assert_eq!(call(&files, "read_file", json!({ "path": "docs/plan.md" })).unwrap(), "новый план");

        let found = call(&files, "search", json!({ "query": "ШАПК" })).unwrap();
        assert!(found.contains("out/a.txt:1: шапка"));
        assert!(!found.contains("снаружи"), "поиск не должен выходить из папки");
    }

    #[test]
    fn refuses_to_leave_the_folder() {
        let (dir, files) = files(true);
        assert!(call(&files, "read_file", json!({ "path": "../secret.txt" })).is_err());
        assert!(call(&files, "write_file", json!({ "path": "../evil.txt", "content": "x" })).is_err());
        assert!(!dir.path().join("evil.txt").exists());
        // Настоящее удаление уходит в Корзину системы, поэтому здесь проверяются только отказы.
        for path in ["", "/", "../secret.txt", "C:/Windows", "нет.txt"] {
            assert!(call(&files, "delete_file", json!({ "path": path })).is_err(), "{path} не должен удаляться");
        }
        assert!(dir.path().join("secret.txt").exists());
    }

    #[test]
    fn read_only_files_cannot_change_anything() {
        let (dir, files) = files(false);
        assert!(files.call("write_file", &json!({ "path": "a.txt", "content": "x" })).is_none());
        assert!(files.call("delete_file", &json!({ "path": "docs" })).is_none());
        assert!(!dir.path().join("work/a.txt").exists());
        let names: Vec<_> = files.definitions().iter().map(|t| t["function"]["name"].clone()).collect();
        assert_eq!(names, ["list_dir", "read_file", "search"]);
    }
}
