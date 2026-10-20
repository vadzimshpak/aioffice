//! Файлы проекта для редактора: чтение папок для Explorer, создание,
//! перемещение, удаление в Корзину, чтение и запись файлов и слежение за изменениями на диске.
//!
//! Работа с диском вынесена в функции, которые получают корень проекта,
//! а команды Tauri только находят этот корень по окну.

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

use crate::OpenProjects;

/// Файлы, которые Explorer не показывает.
const HIDDEN: &[&str] = &[".git", ".DS_Store", ".aioffice"];

/// Событие для окна редактора: что-то в папке проекта изменилось.
const FS_CHANGED: &str = "fs-changed";

#[derive(Debug, PartialEq, Serialize)]
pub struct Entry {
    name: String,
    /// Путь от корня проекта через `/`.
    path: String,
    is_dir: bool,
}

// --- Работа с диском ---

/// Проверяет имя одного файла или папки.
fn check_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err(format!("недопустимое имя: «{name}»"));
    }
    Ok(())
}

/// Превращает путь от корня проекта в абсолютный, не выпуская его за корень.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    for part in rel.split('/').filter(|p| !p.is_empty()) {
        check_name(part)?;
        path.push(part);
    }
    Ok(path)
}

fn join_rel(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    }
}

/// Содержимое папки: сначала папки, потом файлы, по алфавиту.
fn list(root: &Path, dir: &str) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = fs::read_dir(resolve(root, dir)?)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if HIDDEN.contains(&name.as_str()) {
                return None;
            }
            let is_dir = entry.file_type().ok()?.is_dir();
            Some(Entry { path: join_rel(dir, &name), name, is_dir })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Создаёт папку или файл с текстом `content` внутри `parent` и возвращает путь нового элемента.
fn create(root: &Path, parent: &str, name: &str, is_dir: bool, content: &str) -> Result<String, String> {
    let name = name.trim();
    check_name(name)?;
    let rel = join_rel(parent, name);
    let path = resolve(root, &rel)?;
    if path.exists() {
        return Err(format!("«{name}» уже существует"));
    }
    if is_dir {
        fs::create_dir(&path)
    } else {
        fs::File::create_new(&path).and_then(|mut file| file.write_all(content.as_bytes()))
    }
    .map_err(|e| e.to_string())?;
    Ok(rel)
}

/// Переносит файл или папку `from` внутрь папки `to_dir` и возвращает новый путь.
fn relocate(root: &Path, from: &str, to_dir: &str) -> Result<String, String> {
    let source = resolve(root, from)?;
    let target_dir = resolve(root, to_dir)?;
    let name = source
        .file_name()
        .ok_or("нельзя переместить корень проекта")?
        .to_string_lossy()
        .into_owned();

    if target_dir.starts_with(&source) {
        return Err("нельзя переместить папку внутрь неё самой".to_owned());
    }
    if !target_dir.is_dir() {
        return Err("перемещать можно только в папку".to_owned());
    }
    let target = target_dir.join(&name);
    if target == source {
        return Ok(from.to_owned());
    }
    if target.exists() {
        return Err(format!("в этой папке уже есть «{name}»"));
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())?;
    Ok(join_rel(to_dir, &name))
}

/// Проверяет, что `path` можно удалить, и возвращает его абсолютный путь.
fn removable(root: &Path, path: &str) -> Result<PathBuf, String> {
    let target = resolve(root, path)?;
    if target == root {
        return Err("нельзя удалить корень проекта".to_owned());
    }
    if !target.exists() {
        return Err(format!("«{path}» уже нет"));
    }
    Ok(target)
}

/// Перемещает файл или папку в Корзину системы: удаление можно отменить оттуда.
fn move_to_trash(root: &Path, path: &str) -> Result<(), String> {
    let target = removable(root, path)?;
    #[allow(unused_mut)]
    let mut trash = trash::TrashContext::default();
    // Через Finder macOS просит доступ к автоматизации и проигрывает звук; системный вызов — нет.
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        trash.set_delete_method(DeleteMethod::NsFileManager);
    }
    trash.delete(target).map_err(|e| e.to_string())
}

/// Текст файла `path`.
fn read_text(root: &Path, path: &str) -> Result<String, String> {
    fs::read_to_string(resolve(root, path)?).map_err(|e| e.to_string())
}

/// Перезаписывает текст существующего файла `path`. Новые файлы не создаёт:
/// если файл успели переместить или удалить, запись не воскресит его по старому пути.
fn write_text(root: &Path, path: &str, content: &str) -> Result<(), String> {
    let file = resolve(root, path)?;
    if !file.is_file() {
        return Err(format!("файла «{path}» больше нет"));
    }
    fs::write(file, content).map_err(|e| e.to_string())
}

// --- Слежение за диском ---

/// Следилки за папками проектов, по метке окна редактора.
#[derive(Default)]
pub struct Watchers(Mutex<HashMap<String, RecommendedWatcher>>);

impl Watchers {
    /// Начинает сообщать окну `label` обо всех изменениях в `root`.
    pub fn start(&self, app: &AppHandle, label: &str, root: &Path) -> Result<(), String> {
        let app = app.clone();
        let target = label.to_owned();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if let Ok(event) = event
                && !matches!(event.kind, EventKind::Access(_))
            {
                let _ = app.emit_to(target.as_str(), FS_CHANGED, ());
            }
        })
        .map_err(|e| e.to_string())?;
        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        self.0.lock().unwrap().insert(label.to_owned(), watcher);
        Ok(())
    }

    pub fn stop(&self, label: &str) {
        self.0.lock().unwrap().remove(label);
    }
}

// --- Команды ---

fn project_root(window: &WebviewWindow, projects: &OpenProjects) -> Result<PathBuf, String> {
    projects
        .project_of(window.label())
        .map(PathBuf::from)
        .ok_or_else(|| "в этом окне не открыт проект".to_owned())
}

#[tauri::command]
pub fn list_dir(
    window: WebviewWindow,
    projects: State<'_, OpenProjects>,
    path: String,
) -> Result<Vec<Entry>, String> {
    list(&project_root(&window, &projects)?, &path)
}

#[tauri::command]
pub fn create_entry(
    window: WebviewWindow,
    projects: State<'_, OpenProjects>,
    parent: String,
    name: String,
    is_dir: bool,
    content: String,
) -> Result<String, String> {
    create(&project_root(&window, &projects)?, &parent, &name, is_dir, &content)
}

#[tauri::command]
pub fn move_entry(
    window: WebviewWindow,
    projects: State<'_, OpenProjects>,
    from: String,
    to_dir: String,
) -> Result<String, String> {
    relocate(&project_root(&window, &projects)?, &from, &to_dir)
}

#[tauri::command]
pub fn delete_entry(window: WebviewWindow, projects: State<'_, OpenProjects>, path: String) -> Result<(), String> {
    move_to_trash(&project_root(&window, &projects)?, &path)
}

#[tauri::command]
pub fn read_file(
    window: WebviewWindow,
    projects: State<'_, OpenProjects>,
    path: String,
) -> Result<String, String> {
    read_text(&project_root(&window, &projects)?, &path)
}

#[tauri::command]
pub fn write_file(
    window: WebviewWindow,
    projects: State<'_, OpenProjects>,
    path: String,
    content: String,
) -> Result<(), String> {
    write_text(&project_root(&window, &projects)?, &path, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("src/ui")).unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join("README.md"), "").unwrap();
        fs::write(dir.path().join("src/main.rs"), "").unwrap();
        dir
    }

    fn names(root: &Path, dir: &str) -> Vec<String> {
        list(root, dir).unwrap().into_iter().map(|e| e.name).collect()
    }

    #[test]
    fn lists_folders_first_and_hides_git() {
        let dir = project();
        assert_eq!(names(dir.path(), ""), ["src", "README.md"]);
        assert_eq!(names(dir.path(), "src"), ["ui", "main.rs"]);
    }

    #[test]
    fn creates_files_and_folders() {
        let dir = project();
        assert_eq!(create(dir.path(), "src", " docs ", true, "").unwrap(), "src/docs");
        assert_eq!(create(dir.path(), "src/docs", "a.md", false, "").unwrap(), "src/docs/a.md");
        assert!(dir.path().join("src/docs/a.md").is_file());
        create(dir.path(), "", "board.kanban", false, "{}").unwrap();
        assert_eq!(read_text(dir.path(), "board.kanban").unwrap(), "{}");
        assert!(create(dir.path(), "", "README.md", false, "").is_err());
    }

    #[test]
    fn rejects_paths_outside_project() {
        let dir = project();
        assert!(list(dir.path(), "..").is_err());
        assert!(create(dir.path(), "", "../evil", false, "").is_err());
        assert!(relocate(dir.path(), "README.md", "src/../..").is_err());
    }

    #[test]
    fn moves_into_folders() {
        let dir = project();
        assert_eq!(relocate(dir.path(), "README.md", "src/ui").unwrap(), "src/ui/README.md");
        assert_eq!(relocate(dir.path(), "src/ui", "").unwrap(), "ui");
        assert_eq!(names(dir.path(), ""), ["src", "ui"]);
        assert_eq!(names(dir.path(), "ui"), ["README.md"]);
    }

    #[test]
    fn reads_and_writes_files() {
        let dir = project();
        write_text(dir.path(), "src/main.rs", "fn main() {}").unwrap();
        assert_eq!(read_text(dir.path(), "src/main.rs").unwrap(), "fn main() {}");
        assert!(write_text(dir.path(), "src/new.md", "x").is_err());
        assert!(write_text(dir.path(), "src", "x").is_err());
        assert!(write_text(dir.path(), "", "x").is_err());
        assert!(read_text(dir.path(), "../secret").is_err());
    }

    // Сам перенос в Корзину не проверяем: тест засорял бы настоящую Корзину.
    #[test]
    fn refuses_removing_root_and_missing_paths() {
        let dir = project();
        assert!(removable(dir.path(), "").is_err());
        assert!(removable(dir.path(), "nope.md").is_err());
        assert!(removable(dir.path(), "../x").is_err());
        assert_eq!(removable(dir.path(), "src/ui").unwrap(), dir.path().join("src/ui"));
    }

    #[test]
    fn refuses_moving_folder_into_itself() {
        let dir = project();
        assert!(relocate(dir.path(), "src", "src/ui").is_err());
        assert!(relocate(dir.path(), "src", "src").is_err());
        assert!(dir.path().join("src/ui").is_dir());
    }
}
