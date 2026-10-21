//! Всё, что нужно агентам доски: файл доски, её группа агентов, рабочая папка и ключ OpenRouter.

use std::path::{Path, PathBuf};

use serde_json::Value;

use super::board::{self, BoardFile};
use super::sandbox::Sandbox;
use crate::{explorer, settings};

pub struct BoardContext {
    pub project: PathBuf,
    /// Путь доски от корня проекта, как его знает интерфейс.
    pub board_rel: String,
    pub file: BoardFile,
    /// Доска на момент загрузки.
    pub board: Value,
    board_dir: PathBuf,
    /// Агенты группы доски.
    pub agents: Vec<Value>,
}

impl BoardContext {
    pub fn load(project: &Path, board_rel: &str) -> Result<Self, String> {
        let path = explorer::resolve(project, board_rel)?;
        let board_dir = path.parent().unwrap_or(project).to_path_buf();
        let file = BoardFile::new(&path);
        let board = file.read()?;
        let agents = load_group(&board_dir, &board)?;
        Ok(Self { project: project.to_owned(), board_rel: board_rel.to_owned(), file, board, board_dir, agents })
    }

    /// Песочница рабочей папки доски.
    pub fn sandbox(&self) -> Result<Sandbox, String> {
        let workdir = self.board["workdir"].as_str().ok_or("у доски не выбрана рабочая папка")?;
        Sandbox::new(&self.board_dir.join(workdir))
    }

    pub fn agent(&self, id: &str) -> Result<&Value, String> {
        self.agents.iter().find(|a| a["id"] == id).ok_or_else(|| format!("агента «{id}» нет в группе доски"))
    }

    pub fn orchestrator(&self) -> Option<&str> {
        self.board["orchestrator"].as_str()
    }

    /// Имя агента для людей и моделей; неизвестный id остаётся как есть.
    pub fn agent_name(&self, id: &str) -> String {
        self.agent(id).ok().and_then(|a| a["name"].as_str()).unwrap_or(id).to_owned()
    }

    /// Ключ OpenRouter, модель агента и проверка бюджета доски — общая подготовка к запуску.
    pub fn launch(&self, agent_id: &str) -> Result<(String, String), String> {
        board::check_budget(&self.file.read()?)?;
        let key = settings::openrouter_key()?;
        if key.is_empty() {
            return Err("не задан ключ OpenRouter: добавьте его в настройках, раздел «Подключения»".to_owned());
        }
        let model = self.agent(agent_id)?["model"].as_str().unwrap_or_default().to_owned();
        if model.is_empty() {
            return Err(format!("у агента «{}» не выбрана модель", self.agent_name(agent_id)));
        }
        Ok((key, model))
    }
}

/// Агенты группы доски (файл .group рядом с доской); без группы — пустой список.
fn load_group(board_dir: &Path, board: &Value) -> Result<Vec<Value>, String> {
    let Some(name) = board["group"].as_str() else { return Ok(Vec::new()) };
    let text = std::fs::read_to_string(explorer::resolve(board_dir, name)?)
        .map_err(|e| format!("не удалось прочитать группу «{name}»: {e}"))?;
    let group: Value = serde_json::from_str(&text).map_err(|e| format!("группа «{name}» повреждена: {e}"))?;
    Ok(group["agents"].as_array().cloned().unwrap_or_default())
}
