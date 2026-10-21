//! Модели Whisper: каталог, где они лежат на диске, и скачивание.
//! В установщик модели не входят: нужная скачивается при первом использовании.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const PROGRESS_EVENT: &str = "voice-model-progress";
pub const DEFAULT_MODEL: &str = "tiny";

/// Модель из каталога. Все многоязычные: понимают и русский, и английский.
pub struct ModelInfo {
    pub id: &'static str,
    pub title: &'static str,
    pub size_mb: u32,
}

/// От быстрой и лёгкой к точной и тяжёлой.
pub const MODELS: &[ModelInfo] = &[
    ModelInfo { id: "tiny", title: "Tiny — быстрая, для простых фраз", size_mb: 75 },
    ModelInfo { id: "base", title: "Base — быстрая, точнее Tiny", size_mb: 142 },
    ModelInfo { id: "small", title: "Small — заметно точнее, медленнее", size_mb: 466 },
    ModelInfo { id: "medium", title: "Medium — высокая точность, медленная", size_mb: 1500 },
    ModelInfo { id: "large-v3-turbo", title: "Large v3 Turbo — самая точная", size_mb: 1600 },
];

pub fn find(id: &str) -> Result<&'static ModelInfo, String> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| format!("неизвестная модель Whisper «{id}»"))
}

/// Модель, как её видит окно настроек.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: &'static str,
    title: &'static str,
    size_mb: u32,
    downloaded: bool,
}

/// Сколько скачано; уходит в интерфейс событием `voice-model-progress`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: &'a str,
    downloaded: u64,
    total: Option<u64>,
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("whisper"))
        .map_err(|e| e.to_string())
}

pub fn model_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(format!("ggml-{}.bin", find(id)?.id)))
}

pub fn statuses(app: &AppHandle) -> Result<Vec<ModelStatus>, String> {
    let dir = models_dir(app)?;
    Ok(MODELS
        .iter()
        .map(|m| ModelStatus {
            id: m.id,
            title: m.title,
            size_mb: m.size_mb,
            downloaded: dir.join(format!("ggml-{}.bin", m.id)).is_file(),
        })
        .collect())
}

/// Путь модели на диске; если её ещё нет — скачивает, сообщая о ходе загрузки.
pub fn ensure(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let path = model_path(app, id)?;
    if !path.is_file() {
        download(app, id, &path)?;
    }
    Ok(path)
}

/// Качает во временный файл и переименовывает в конце, чтобы оборванная загрузка не выглядела готовой моделью.
fn download(app: &AppHandle, id: &str, path: &Path) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let url = format!("{BASE_URL}/ggml-{id}.bin");
    let response = ureq::get(&url)
        .call()
        .map_err(|e| format!("не удалось скачать модель Whisper: {e}"))?;
    let body = response.into_body();
    let total = body.content_length();
    let mut reader = body.into_reader();

    let partial = path.with_extension("part");
    let mut file = File::create(&partial).map_err(|e| e.to_string())?;
    let mut buffer = vec![0; 1 << 16];
    let mut downloaded = 0u64;
    let mut reported = 0u64;
    loop {
        let read = reader.read(&mut buffer).map_err(|e| format!("загрузка модели оборвалась: {e}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        downloaded += read as u64;
        // Не чаще раза на мегабайт, чтобы не заваливать интерфейс событиями.
        if downloaded - reported >= 1 << 20 {
            reported = downloaded;
            let _ = app.emit(PROGRESS_EVENT, Progress { id, downloaded, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&partial, path).map_err(|e| e.to_string())?;
    let _ = app.emit(PROGRESS_EVENT, Progress { id, downloaded, total: Some(downloaded) });
    Ok(())
}
