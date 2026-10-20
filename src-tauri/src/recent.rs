//! Список последних проектов, который хранится в папке настроек приложения.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const RECENT_FILE: &str = "recent_projects.json";
const MAX_RECENT: usize = 10;

fn file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(RECENT_FILE))
}

pub fn load(app: &AppHandle) -> Vec<String> {
    file_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, recent: &[String]) -> Result<(), String> {
    let path = file_path(app).ok_or("не найдена папка настроек")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(recent).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Поднимает проект наверх списка последних и сохраняет список.
pub fn remember(app: &AppHandle, project: &str) -> Result<(), String> {
    let mut recent = load(app);
    recent.retain(|p| p != project);
    recent.insert(0, project.to_owned());
    recent.truncate(MAX_RECENT);
    save(app, &recent)
}
