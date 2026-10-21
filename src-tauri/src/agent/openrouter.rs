//! Запрос к Chat Completions API OpenRouter с инструментами.

use serde_json::{Value, json};

const URL: &str = "https://openrouter.ai/api/v1/chat/completions";

/// Сколько стоил один запрос.
#[derive(Debug, Default, PartialEq)]
pub struct Usage {
    pub tokens: u64,
    /// В долларах; OpenRouter считает её сам по цене модели.
    pub cost: f64,
}

/// Отправляет переписку и возвращает ответное сообщение модели (`choices[0].message`) и расход.
pub fn chat(key: &str, model: &str, messages: &[Value], tools: &Value) -> Result<(Value, Usage), String> {
    // Ошибки HTTP читаем сами: в теле OpenRouter объясняет, что не так.
    let agent: ureq::Agent = ureq::Agent::config_builder().http_status_as_error(false).build().into();
    let mut response = agent
        .post(URL)
        .header("Authorization", &format!("Bearer {key}"))
        .header("X-Title", "AIOffice")
        // usage.include просит OpenRouter вернуть в ответе стоимость запроса.
        .send_json(json!({ "model": model, "messages": messages, "tools": tools, "usage": { "include": true } }))
        .map_err(|e| format!("нет связи с OpenRouter: {e}"))?;
    let status = response.status();
    let body: Value = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("OpenRouter ответил не JSON (код {status}): {e}"))?;

    if let Some(message) = body["error"]["message"].as_str() {
        // Частый случай: агент создан до списка моделей OpenRouter, и в нём старое имя модели.
        if message.contains("not a valid model ID") {
            return Err(format!(
                "в OpenRouter нет модели «{model}»: откройте агента в группе и выберите модель из списка"
            ));
        }
        return Err(format!("OpenRouter: {message} (код {status})"));
    }
    match &body["choices"][0]["message"] {
        Value::Null => Err(format!("OpenRouter прислал ответ без сообщения (код {status})")),
        message => Ok((message.clone(), usage(&body))),
    }
}

/// Расход из поля `usage` ответа; чего нет — считается нулём.
fn usage(body: &Value) -> Usage {
    Usage {
        tokens: body["usage"]["total_tokens"].as_u64().unwrap_or(0),
        cost: body["usage"]["cost"].as_f64().unwrap_or(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_usage_and_tolerates_its_absence() {
        let body = json!({ "usage": { "prompt_tokens": 90, "completion_tokens": 10, "total_tokens": 100, "cost": 0.0021 } });
        assert_eq!(usage(&body), Usage { tokens: 100, cost: 0.0021 });
        assert_eq!(usage(&json!({})), Usage::default());
    }
}
