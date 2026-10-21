//! Распознавание речи моделью Whisper. Загруженная модель держится в памяти,
//! пока не выберут другую: загрузка с диска занимает заметное время.

use std::path::Path;
use std::sync::Mutex;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Частота звука, которую ждёт Whisper.
pub const SAMPLE_RATE: u32 = 16_000;

#[derive(Default)]
pub struct Transcriber {
    loaded: Mutex<Option<(String, WhisperContext)>>,
}

impl Transcriber {
    /// Текст из звука `samples` (моно, 16 кГц). Язык речи Whisper определяет сам.
    pub fn transcribe(&self, model: &str, path: &Path, samples: &[f32]) -> Result<String, String> {
        let mut loaded = self.loaded.lock().unwrap();
        if loaded.as_ref().is_none_or(|(name, _)| name != model) {
            let context = WhisperContext::new_with_params(path, WhisperContextParameters::default())
                .map_err(|e| format!("не удалось загрузить модель Whisper: {e}"))?;
            *loaded = Some((model.to_owned(), context));
        }
        let (_, context) = loaded.as_ref().unwrap();

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("auto"));
        params.set_n_threads(threads());
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        let mut state = context.create_state().map_err(|e| e.to_string())?;
        state.full(params, samples).map_err(|e| format!("Whisper не смог распознать речь: {e}"))?;
        let text = state
            .as_iter()
            .map(|segment| segment.to_str_lossy().map(|s| s.into_owned()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(text.concat().trim().to_owned())
    }
}

fn threads() -> i32 {
    std::thread::available_parallelism().map_or(4, |n| n.get().min(8) as i32)
}
