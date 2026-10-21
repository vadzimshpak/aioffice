//! Цикл агента: запрос к модели, выполнение вызванных инструментов, снова запрос —
//! пока модель не ответит без инструментов.

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::{Value, json};

use super::log::{Kind, RunLog};
use super::openrouter::{self, Usage};
use super::toolset::Toolset;

/// Больше шагов (запросов к модели) за один запуск агент не делает.
const MAX_STEPS: usize = 30;

/// Модель и задание для одного запуска.
pub struct Prompt {
    pub api_key: String,
    pub model: String,
    pub system: String,
    pub task: String,
}

/// Работает до ответа без инструментов и возвращает этот ответ — отчёт агента.
/// `on_usage` получает расход каждого запроса.
pub fn run(
    prompt: &Prompt,
    tools: &dyn Toolset,
    log: &mut RunLog,
    stop: &AtomicBool,
    on_usage: &dyn Fn(&Usage),
) -> Result<String, String> {
    let definitions = tools.definitions();
    let mut messages = vec![
        json!({ "role": "system", "content": prompt.system }),
        json!({ "role": "user", "content": prompt.task }),
    ];

    for _ in 0..MAX_STEPS {
        if stop.load(Ordering::Relaxed) {
            return Err("Агента остановили".to_owned());
        }
        let (message, usage) = openrouter::chat(&prompt.api_key, &prompt.model, &messages, &definitions)?;
        on_usage(&usage);
        let content = message["content"].as_str().unwrap_or_default().to_owned();
        let calls = message["tool_calls"].as_array().cloned().unwrap_or_default();
        messages.push(message);
        if calls.is_empty() {
            return Ok(content);
        }
        if !content.trim().is_empty() {
            log.add(Kind::Thought, content.trim());
        }
        for call in calls {
            let name = call["function"]["name"].as_str().unwrap_or_default();
            let output = execute(tools, name, call["function"]["arguments"].as_str().unwrap_or("{}"), log);
            messages.push(json!({ "role": "tool", "tool_call_id": call["id"], "content": output }));
        }
    }
    Err(format!("агент не закончил работу за {MAX_STEPS} шагов"))
}

/// Выполняет вызов и пишет его в журнал; ошибка возвращается модели текстом.
fn execute(tools: &dyn Toolset, name: &str, arguments: &str, log: &mut RunLog) -> String {
    let args: Value = match serde_json::from_str(arguments) {
        Ok(args) => args,
        Err(e) => return format!("Ошибка: аргументы не похожи на JSON: {e}"),
    };
    log.add(Kind::Action, &tools.describe(name, &args));
    tools.call(name, &args).unwrap_or_else(|error| {
        log.add(Kind::Error, &error);
        format!("Ошибка: {error}")
    })
}
