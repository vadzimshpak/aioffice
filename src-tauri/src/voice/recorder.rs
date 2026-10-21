//! Запись с микрофона по умолчанию через cpal.
//!
//! Поток cpal нельзя передавать между потоками, поэтому он живёт в отдельном
//! потоке записи, а наружу торчат только сигнал остановки и готовый звук.
//! Пока идёт запись, громкость сообщается колбэком, чтобы интерфейс мог рисовать волну.

use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};

/// Записанный звук: моно, значения от -1 до 1.
pub struct Audio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

/// Сколько раз в секунду сообщается громкость.
const LEVELS_PER_SECOND: u32 = 30;

/// Идущая запись. Остановить её — `stop`.
pub struct Recording {
    stop: mpsc::Sender<()>,
    thread: JoinHandle<Audio>,
}

impl Recording {
    /// Начинает запись; ошибка — если микрофона нет или он не открывается.
    /// `on_level` получает громкость от 0 до 1 [`LEVELS_PER_SECOND`] раз в секунду.
    pub fn start(on_level: impl Fn(f32) + Send + 'static) -> Result<Self, String> {
        let (stop, stopped) = mpsc::channel();
        let (ready, started) = mpsc::channel();
        let thread = thread::spawn(move || record(ready, stopped, on_level));
        match started.recv() {
            Ok(Ok(())) => Ok(Self { stop, thread }),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("поток записи завершился раньше времени".to_owned()),
        }
    }

    pub fn stop(self) -> Result<Audio, String> {
        // Если поток уже завершился, канал закрыт — это не ошибка.
        let _ = self.stop.send(());
        self.thread.join().map_err(|_| "поток записи упал".to_owned())
    }
}

/// Тело потока записи: открывает микрофон, сообщает об успехе и копит звук до сигнала остановки.
fn record(ready: mpsc::Sender<Result<(), String>>, stopped: mpsc::Receiver<()>, on_level: impl Fn(f32) + Send + 'static) -> Audio {
    let samples = Arc::new(Mutex::new(Vec::new()));
    match open_stream(Arc::clone(&samples), on_level) {
        Ok((stream, sample_rate)) => {
            let _ = ready.send(Ok(()));
            let _ = stopped.recv();
            drop(stream);
            let samples = std::mem::take(&mut *samples.lock().unwrap());
            Audio { samples, sample_rate }
        }
        Err(e) => {
            let _ = ready.send(Err(e));
            Audio { samples: Vec::new(), sample_rate: 0 }
        }
    }
}

fn open_stream(samples: Arc<Mutex<Vec<f32>>>, on_level: impl Fn(f32) + Send + 'static) -> Result<(cpal::Stream, u32), String> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or("микрофон не найден")?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate();
    let stream = match config.sample_format() {
        SampleFormat::I16 => build::<i16>(&device, config.into(), samples, on_level),
        SampleFormat::I32 => build::<i32>(&device, config.into(), samples, on_level),
        SampleFormat::U16 => build::<u16>(&device, config.into(), samples, on_level),
        SampleFormat::F32 => build::<f32>(&device, config.into(), samples, on_level),
        format => return Err(format!("микрофон отдаёт звук в неподдерживаемом формате {format}")),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, sample_rate))
}

/// Поток, который сводит каналы в моно, дописывает звук в `samples` и сообщает громкость.
fn build<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
    on_level: impl Fn(f32) + Send + 'static,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels).max(1);
    let mut meter = LevelMeter::new((config.sample_rate / LEVELS_PER_SECOND) as usize);
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &_| {
                let mono: Vec<f32> = data
                    .chunks(channels)
                    .map(|frame| frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / frame.len() as f32)
                    .collect();
                mono.iter().filter_map(|&s| meter.push(s)).for_each(&on_level);
                samples.lock().unwrap().extend(mono);
            },
            |e| eprintln!("ошибка записи с микрофона: {e}"),
            None,
        )
        .map_err(|e| e.to_string())
}

/// Громкость звука: среднеквадратичное значение по окнам из `window` отсчётов.
struct LevelMeter {
    window: usize,
    count: usize,
    sum_sq: f32,
}

impl LevelMeter {
    fn new(window: usize) -> Self {
        Self { window: window.max(1), count: 0, sum_sq: 0.0 }
    }

    /// Добавляет отсчёт; когда окно заполнено, возвращает его громкость от 0 до 1.
    fn push(&mut self, sample: f32) -> Option<f32> {
        self.sum_sq += sample * sample;
        self.count += 1;
        if self.count < self.window {
            return None;
        }
        let rms = (self.sum_sq / self.count as f32).sqrt().min(1.0);
        self.count = 0;
        self.sum_sq = 0.0;
        Some(rms)
    }
}

/// Пересчитывает звук на другую частоту линейной интерполяцией.
pub fn resample(samples: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = f64::from(from) / f64::from(to);
    let len = (samples.len() as f64 / ratio) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let left = pos as usize;
            let right = (left + 1).min(samples.len() - 1);
            let t = (pos - left as f64) as f32;
            samples[left] * (1.0 - t) + samples[right] * t
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_meter_reports_rms_once_per_window() {
        let mut meter = LevelMeter::new(2);
        assert_eq!(meter.push(0.5), None);
        assert_eq!(meter.push(-0.5), Some(0.5));
        assert_eq!(meter.push(0.0), None);
        assert_eq!(meter.push(0.0), Some(0.0));
    }

    #[test]
    fn resample_keeps_duration_and_interpolates() {
        let samples = [0.0, 1.0, 0.0, -1.0];
        assert_eq!(resample(&samples, 16_000, 16_000), samples);
        let up = resample(&samples, 16_000, 32_000);
        assert_eq!(up.len(), 8);
        assert_eq!(up[1], 0.5);
        assert_eq!(resample(&samples, 32_000, 16_000), [0.0, 0.0]);
    }
}
