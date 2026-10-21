//! Журнал запуска агента: `.aioffice/logs/<id агента>.jsonl`, одна строка — один запуск.
//! Формат описан в `src/editor/logs/logs.ts`. Строка запуска переписывается после
//! каждого шага, поэтому экран логов видит работу агента сразу, а не в конце.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

pub const LOGS_DIR: &str = ".aioffice/logs";

#[derive(Clone, Copy)]
pub enum Kind {
    Thought,
    Action,
    Result,
    Error,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Thought => "thought",
            Self::Action => "action",
            Self::Result => "result",
            Self::Error => "error",
        }
    }
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub struct RunLog {
    path: PathBuf,
    run: Value,
}

impl RunLog {
    /// `board` — путь доски от корня проекта, как его пишет интерфейс.
    /// `card` — id и название карточки; у обхода доски мастером карточки нет.
    pub fn start(project: &Path, agent_id: &str, board: &str, card: Option<(&str, &str)>) -> Self {
        let mut run = json!({
            "id": format!("r{}", chrono::Utc::now().timestamp_millis()),
            "agentId": agent_id,
            "startedAt": now(),
            "board": board,
            "entries": [],
        });
        if let Some((id, title)) = card {
            run["cardId"] = json!(id);
            run["cardTitle"] = json!(title);
        }
        Self { path: project.join(LOGS_DIR).join(format!("{agent_id}.jsonl")), run }
    }

    /// Дописывает запись и сохраняет журнал. Сбой записи журнала не должен останавливать агента.
    pub fn add(&mut self, kind: Kind, text: &str) {
        if let Some(entries) = self.run["entries"].as_array_mut() {
            entries.push(json!({ "time": now(), "kind": kind.as_str(), "text": text }));
        }
        if let Err(e) = self.save() {
            eprintln!("не удалось записать журнал агента: {e}");
        }
    }

    /// Заменяет строку этого запуска в файле или дописывает её в конец.
    fn save(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let line = self.run.to_string();
        let id = &self.run["id"];
        let mut lines: Vec<String> = fs::read_to_string(&self.path)
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(str::to_owned)
            .collect();
        match lines.iter().position(|l| serde_json::from_str::<Value>(l).is_ok_and(|v| &v["id"] == id)) {
            Some(index) => lines[index] = line,
            None => lines.push(line),
        }
        fs::write(&self.path, lines.join("\n") + "\n").map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_own_line_and_keeps_other_runs() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(LOGS_DIR).join("a1.jsonl");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "{\"id\":\"old\"}\n").unwrap();

        let mut log = RunLog::start(dir.path(), "a1", "b.kanban", Some(("k1", "Задача")));
        log.add(Kind::Thought, "думаю");
        log.add(Kind::Result, "готово");

        let text = fs::read_to_string(&file).unwrap();
        let lines: Vec<Value> = text.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0]["id"], "old");
        assert_eq!(lines[1]["entries"][1]["kind"], "result");
        assert_eq!(lines[1]["cardTitle"], "Задача");
    }
}
