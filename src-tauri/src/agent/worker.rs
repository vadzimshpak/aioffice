//! Исполнитель: агент, назначенный карточке. Работает только с файлами рабочей папки;
//! карточки по доске двигает мастер. Учитывает описание и комментарии админа и мастера.

use std::path::Path;
use std::sync::atomic::AtomicBool;

use serde_json::{Value, json};

use super::board::{AgentState, CardInfo};
use super::context::BoardContext;
use super::files::Files;
use super::log::{self, Kind, RunLog};
use super::runner::{self, Prompt};
use super::toolset::Toolset;

pub struct Worker {
    pub ctx: BoardContext,
    pub card_id: String,
    agent_id: String,
    files: Files,
}

/// У исполнителя только файловые инструменты: доску он не меняет.
impl Toolset for Worker {
    fn definitions(&self) -> Value {
        json!(self.files.definitions())
    }

    fn call(&self, name: &str, args: &Value) -> Result<String, String> {
        self.files.call(name, args).unwrap_or_else(|| Err(format!("нет инструмента «{name}»")))
    }
}

/// Собирает задание исполнителю карточки и проверяет, что ему есть с чем работать.
pub fn prepare(project: &Path, board_rel: &str, card_id: &str) -> Result<(Worker, Prompt, RunLog), String> {
    let ctx = BoardContext::load(project, board_rel)?;
    let card = ctx.file.card(card_id)?;
    let files = Files { sandbox: ctx.sandbox()?, writable: true };
    let agent_id = card.assignee.clone().ok_or("карточке не назначен агент")?;
    let (api_key, model) = ctx.launch(&agent_id)?;

    let skill = ctx.agent(&agent_id)?["skill"].as_str().unwrap_or_default();
    let prompt = Prompt {
        api_key,
        model,
        system: system_prompt(skill),
        task: task_prompt(&card, &agent_id, |id| author_name(&ctx, id)),
    };
    let log = RunLog::start(project, &agent_id, board_rel, Some((card_id, &card.title)));
    Ok((Worker { ctx, card_id: card_id.to_owned(), agent_id, files }, prompt, log))
}

/// Как подписать автора комментария для исполнителя.
fn author_name(ctx: &BoardContext, id: &str) -> String {
    if ctx.orchestrator() == Some(id) { "Мастер".to_owned() } else { ctx.agent_name(id) }
}

/// Работа исполнителя от начала до итога: статус карточки, расход, отчёт в комментарии.
pub fn work(worker: Worker, prompt: Prompt, mut log: RunLog, stop: &AtomicBool) {
    let file = &worker.ctx.file;
    let card = &worker.card_id;
    let on_usage = |usage: &_| {
        if let Err(e) = file.add_usage(card, usage) {
            eprintln!("не удалось записать расход агента: {e}");
        }
    };
    let state = match runner::run(&prompt, &worker, &mut log, stop, &on_usage) {
        Ok(report) => {
            log.add(Kind::Result, &report);
            if !report.trim().is_empty() {
                if let Err(e) = file.comment(card, &worker.agent_id, report.trim(), &log::now()) {
                    log.add(Kind::Error, &e);
                }
            }
            AgentState::Done
        }
        Err(error) => {
            log.add(Kind::Error, &error);
            AgentState::Error
        }
    };
    if let Err(e) = file.set_state(card, Some(state)) {
        eprintln!("не удалось отметить статус агента: {e}");
    }
}

fn system_prompt(skill: &str) -> String {
    format!(
        "{skill}

---
         Ты исполнитель одной карточки канбан-доски.
         У тебя есть доступ только к рабочей папке доски: все пути указывай от её корня через «/».          Других файлов и команд системы у тебя нет. Карточки по доске двигает мастер, не ты.
         Читай не только описание, но и комментарии: их оставляют админ, мастер и ты сам.          Если карточку вернули с замечаниями, сначала исправь то, о чём просят в последних комментариях.
         В конце ответь коротким отчётом о сделанном: он станет твоим комментарием к карточке,          по нему мастер проверит работу."
    )
}

/// Задача для модели: название, описание и комментарии по порядку, с подписями авторов.
fn task_prompt(card: &CardInfo, agent_id: &str, name: impl Fn(&str) -> String) -> String {
    let mut task = format!("Задача: {}\n", card.title);
    if !card.description.trim().is_empty() {
        task += &format!("\nОписание:\n{}\n", card.description);
    }
    if !card.comments.is_empty() {
        task += "\nКомментарии (от старых к новым):\n";
        for (author, text) in &card.comments {
            let who = match author.as_deref() {
                None => "Админ".to_owned(),
                Some(id) if id == agent_id => "Ты".to_owned(),
                Some(id) => name(id),
            };
            task += &format!("- {who}: {text}\n");
        }
    }
    task
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_names_comment_authors_in_order() {
        let card = CardInfo {
            title: "Сверстать".to_owned(),
            description: "шапку".to_owned(),
            assignee: Some("a1".to_owned()),
            comments: vec![
                (None, "срочно".to_owned()),
                (Some("a1".to_owned()), "сделал".to_owned()),
                (Some("boss".to_owned()), "переделай логотип".to_owned()),
            ],
            column: "TODO".to_owned(),
            state: None,
            cost: 0.0,
        };
        let task = task_prompt(&card, "a1", |id| if id == "boss" { "Мастер".to_owned() } else { id.to_owned() });
        assert!(task.contains("Задача: Сверстать"));
        assert!(task.ends_with("- Админ: срочно\n- Ты: сделал\n- Мастер: переделай логотип\n"));
    }

    #[test]
    fn worker_cannot_touch_the_board() {
        let prompt = system_prompt("");
        assert!(prompt.contains("Карточки по доске двигает мастер"));
    }

    #[test]
    fn prepare_explains_what_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let board = json!({ "version": 1, "columns": [{ "id": "c1", "title": "TODO", "cards": [
            { "id": "k1", "title": "t", "description": "", "comments": [] }
        ]}]});
        std::fs::write(dir.path().join("b.kanban"), board.to_string()).unwrap();
        let error = prepare(dir.path(), "b.kanban", "k1").err().unwrap();
        assert!(error.contains("рабочая папка"), "{error}");
    }
}
