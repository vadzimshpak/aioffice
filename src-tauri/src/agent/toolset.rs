//! Набор инструментов агента: что он может вызвать и как это выполняется.
//! У исполнителя и мастера наборы разные, а цикл работы общий.

use serde_json::{Value, json};

pub trait Toolset {
    /// Описание инструментов для модели в формате OpenAI/OpenRouter.
    fn definitions(&self) -> Value;

    /// Выполняет вызов. Ошибка — тоже ответ для модели: она может исправиться.
    fn call(&self, name: &str, args: &Value) -> Result<String, String>;

    /// Короткая запись о вызове для журнала, без содержимого файлов.
    fn describe(&self, name: &str, args: &Value) -> String {
        describe_call(name, args)
    }
}

/// Описание одного инструмента-функции.
pub fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({ "type": "function", "function": {
        "name": name,
        "description": description,
        "parameters": { "type": "object", "properties": properties, "required": required },
    }})
}

/// Строковый аргумент вызова; нет — пустая строка.
pub fn arg<'a>(args: &'a Value, key: &str) -> &'a str {
    args[key].as_str().unwrap_or_default()
}

fn describe_call(name: &str, args: &Value) -> String {
    let arg = |key: &str| arg(args, key);
    match name {
        "list_dir" => format!("Смотрит папку «{}»", arg("path")),
        "read_file" => format!("Читает {}", arg("path")),
        "write_file" => format!("Записывает {}", arg("path")),
        "delete_file" => format!("Удаляет {}", arg("path")),
        "search" => format!("Ищет «{}»", arg("query")),
        "move_card" => format!("Переносит карточку {} в «{}»", arg("card_id"), arg("column")).replace("  ", " "),
        "create_card" => format!("Создаёт карточку «{}» в «{}»", arg("title"), arg("column")),
        "assign_agent" => format!("Назначает агента {} на карточку {}", arg("agent_id"), arg("card_id")),
        "comment" => format!("Комментирует карточку {}", arg("card_id")),
        "run_agent" => format!("Запускает агента карточки {}", arg("card_id")),
        "stop_agent" => format!("Останавливает агента карточки {}", arg("card_id")),
        "board_overview" => "Смотрит доску".to_owned(),
        "run_command" => format!("Запускает «{}»", arg("command")),
        _ => format!("Вызывает {name}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_calls_without_file_contents() {
        assert_eq!(describe_call("write_file", &json!({ "path": "a.md", "content": "секрет" })), "Записывает a.md");
        assert_eq!(describe_call("move_card", &json!({ "column": "Готово" })), "Переносит карточку в «Готово»");
    }
}
