//! Песочница агента: все пути считаются от рабочей папки и не выходят за неё.

use std::path::{Path, PathBuf};

use crate::explorer;

pub struct Sandbox {
    /// Рабочая папка в каноническом виде: без `..` и символических ссылок.
    root: PathBuf,
}

impl Sandbox {
    pub fn new(root: &Path) -> Result<Self, String> {
        let root = root
            .canonicalize()
            .map_err(|e| format!("рабочая папка {} недоступна: {e}", root.display()))?;
        Ok(Self { root })
    }

    /// Абсолютный путь для пути агента (`docs/plan.md`, пусто — сама папка).
    ///
    /// Две проверки: по тексту (нет `..`, абсолютных путей и дисков) и по диску —
    /// ближайшая существующая часть пути после раскрытия ссылок лежит внутри папки.
    /// Вторая не даёт выйти наружу через символическую ссылку.
    pub fn resolve(&self, rel: &str) -> Result<PathBuf, String> {
        let path = explorer::resolve(&self.root, &rel.replace('\\', "/"))
            .map_err(|_| format!("путь «{rel}» недопустим: нужен путь внутри рабочей папки, без «..»"))?;
        let existing = path.ancestors().find(|p| p.exists()).unwrap_or(&self.root);
        let real = existing.canonicalize().map_err(|e| e.to_string())?;
        if real.starts_with(&self.root) {
            Ok(path)
        } else {
            Err(format!("путь «{rel}» ведёт за пределы рабочей папки"))
        }
    }

    /// Рабочая папка: в ней запускаются разрешённые команды.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Это сама рабочая папка: её агент удалить не может.
    pub fn is_root(&self, path: &Path) -> bool {
        path == self.root
    }

    /// Путь от корня рабочей папки через `/` — так его видит агент.
    pub fn relative(&self, path: &Path) -> String {
        let rel = path.strip_prefix(&self.root).unwrap_or(path);
        rel.components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sandbox() -> (tempfile::TempDir, Sandbox) {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("work/docs")).unwrap();
        fs::write(dir.path().join("secret.txt"), "секрет").unwrap();
        let sandbox = Sandbox::new(&dir.path().join("work")).unwrap();
        (dir, sandbox)
    }

    #[test]
    fn allows_paths_inside_including_new_files() {
        let (_dir, sandbox) = sandbox();
        assert!(sandbox.resolve("").is_ok());
        assert!(sandbox.resolve("docs").is_ok());
        let new_file = sandbox.resolve("docs/new/plan.md").unwrap();
        assert_eq!(sandbox.relative(&new_file), "docs/new/plan.md");
        assert!(sandbox.resolve("docs\\plan.md").is_ok());
    }

    #[test]
    fn rejects_escapes_by_text() {
        let (_dir, sandbox) = sandbox();
        for path in ["../secret.txt", "docs/../../secret.txt", "C:/Windows", "C:\\Windows", "./docs"] {
            assert!(sandbox.resolve(path).is_err(), "{path} должен быть запрещён");
        }
        // Начальный «/» просто убирается: путь всё равно считается от рабочей папки.
        assert!(sandbox.resolve("/docs").unwrap().starts_with(&sandbox.root));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_escapes_through_symlinks() {
        let (dir, sandbox) = sandbox();
        std::os::unix::fs::symlink(dir.path(), dir.path().join("work/outside")).unwrap();
        assert!(sandbox.resolve("outside/secret.txt").is_err());
        assert!(sandbox.resolve("outside/new.txt").is_err());
    }
}
