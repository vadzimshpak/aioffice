//! Голосовой ввод: запись с микрофона и распознавание речи моделью Whisper на этом компьютере.

mod models;
mod recorder;
mod transcriber;

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::settings;
use models::ModelStatus;
use recorder::Recording;
use transcriber::{SAMPLE_RATE, Transcriber};

pub use models::DEFAULT_MODEL;

const LEVEL_EVENT: &str = "voice-level";

/// Состояние голосового ввода: идущая запись и загруженная модель.
#[derive(Default)]
pub struct Voice {
    recording: Mutex<Option<Recording>>,
    transcriber: Transcriber,
}

/// Модели Whisper и скачаны ли они.
#[tauri::command]
pub fn voice_models(app: AppHandle) -> Result<Vec<ModelStatus>, String> {
    models::statuses(&app)
}

/// Скачивает модель заранее, не дожидаясь первого голосового ввода.
#[tauri::command]
pub async fn download_voice_model(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || models::ensure(&app, &id).map(drop))
        .await
        .map_err(|e| e.to_string())?
}

/// Начинает запись. Пока она идёт, окно, которое её начало, получает громкость
/// событием `voice-level`, чтобы рисовать волну.
#[tauri::command]
pub fn start_recording(window: WebviewWindow, voice: State<'_, Voice>) -> Result<(), String> {
    let mut recording = voice.recording.lock().unwrap();
    if recording.is_none() {
        let label = window.label().to_owned();
        let app = window.app_handle().clone();
        *recording = Some(Recording::start(move |level| {
            let _ = app.emit_to(&label, LEVEL_EVENT, level);
        })?);
    }
    Ok(())
}

/// Останавливает запись и возвращает распознанный текст.
/// Модель из настроек скачивается, если её ещё нет.
#[tauri::command]
pub async fn stop_recording(app: AppHandle, voice: State<'_, Voice>) -> Result<String, String> {
    let recording = voice.recording.lock().unwrap().take().ok_or("запись не идёт")?;
    let audio = recording.stop()?;
    let samples = recorder::resample(&audio.samples, audio.sample_rate, SAMPLE_RATE);
    if samples.is_empty() {
        return Ok(String::new());
    }

    let model = settings::whisper_model(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = models::ensure(&handle, &model)?;
        handle.state::<Voice>().transcriber.transcribe(&model, &path, &samples)
    })
    .await
    .map_err(|e| e.to_string())?
}
