//! Настройки приложения. Обычные настройки лежат в `settings.json` в папке настроек,
//! а API-ключи — в хранилище паролей системы (Связка ключей на macOS), не в файле.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";
const KEYRING_SERVICE: &str = "com.aioffice.app";
const OPENROUTER_KEY: &str = "openrouter-api-key";

/// Настройки, которые лежат в файле.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct StoredSettings {
    language: String,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self { language: "ru".to_owned() }
    }
}

/// Все настройки, как их видит окно настроек.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    language: String,
    /// Пустая строка — ключа нет.
    openrouter_api_key: String,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|e| e.to_string())
}

/// Битый или отсутствующий файл — настройки по умолчанию.
fn read_stored(path: &Path) -> StoredSettings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_stored(path: &Path, settings: &StoredSettings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn openrouter_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, OPENROUTER_KEY).map_err(|e| e.to_string())
}

fn read_openrouter_key() -> Result<String, String> {
    match openrouter_entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Пустой ключ удаляет его из хранилища.
fn write_openrouter_key(key: &str) -> Result<(), String> {
    let entry = openrouter_entry()?;
    let result = if key.is_empty() { entry.delete_credential() } else { entry.set_password(key) };
    match result {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Settings, String> {
    let stored = read_stored(&settings_path(&app)?);
    Ok(Settings { language: stored.language, openrouter_api_key: read_openrouter_key()? })
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    write_stored(&settings_path(&app)?, &StoredSettings { language: settings.language })?;
    write_openrouter_key(settings.openrouter_api_key.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_settings_round_trip_and_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(SETTINGS_FILE);
        assert_eq!(read_stored(&path), StoredSettings::default());

        write_stored(&path, &StoredSettings { language: "ru".to_owned() }).unwrap();
        assert_eq!(read_stored(&path).language, "ru");
        // Ключ API в файл не попадает.
        assert!(!fs::read_to_string(&path).unwrap().contains("openrouter"));

        fs::write(&path, "{ битый").unwrap();
        assert_eq!(read_stored(&path), StoredSettings::default());
    }
}
