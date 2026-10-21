//! Мастер-агент доски. Сам задачи не делает и файлы не меняет: смотрит доску,
//! проверяет результат в рабочей папке, двигает и создаёт карточки, назначает
//! исполнителей из группы, оставляет замечания и запускает исполнителей.

use std::cell::Cell;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use serde_json::{Value, json};
use tauri::AppHandle;

use super::board::{self, AgentState, Role};
use super::command;
use super::context::BoardContext;
use super::files::Files;
use super::log::{Kind, RunLog};
use super::runner::{self, Prompt};
use super::toolset::{Toolset, arg, tool};

/// Больше исполнителей за один обход мастер не запускает: защита от зацикливания.
pub const MAX_RUNS_PER_SWEEP: usize = 5;
/// Сколько последних комментариев карточки мастер видит в обзоре доски.
const COMMENTS_IN_OVERVIEW: usize = 3;

pub struct Master {
    pub ctx: BoardContext,
    master_id: String,
    files: Files,
    app: AppHandle,
    runs_left: Cell<usize>,
    /// Команды, которые админ разрешил запускать для проверки работы.
    commands: Vec<String>,
    timeout: Duration,
}

impl Toolset for Master {
    fn definitions(&self) -> Value {
        let card = json!({ "type": "string", "description": "id карточки из обзора доски" });
        let mut tools = vec![
            tool("board_overview", "Показывает всю доску: столбцы, карточки, исполнителей, статусы, расход и последние комментарии.", json!({}), &[]),
            tool(
                "create_card",
                "Создаёт карточку в столбце.",
                json!({ "column": { "type": "string" }, "title": { "type": "string" }, "description": { "type": "string" } }),
                &["column", "title"],
            ),
            tool("move_card", "Переносит карточку в другой столбец.", json!({ "card_id": card, "column": { "type": "string" } }), &["card_id", "column"]),
            tool(
                "assign_agent",
                "Назначает карточке исполнителя из группы доски.",
                json!({ "card_id": card, "agent_id": { "type": "string", "description": "id агента из списка группы" } }),
                &["card_id", "agent_id"],
            ),
            tool(
                "comment",
                "Оставляет комментарий в карточке: замечания к работе, уточнение задачи. Исполнитель прочтёт его при следующем запуске.",
                json!({ "card_id": card, "text": { "type": "string" } }),
                &["card_id", "text"],
            ),
            tool(
                "run_agent",
                &format!("Запускает исполнителя карточки. Не больше {MAX_RUNS_PER_SWEEP} запусков за обход."),
                json!({ "card_id": card }),
                &["card_id"],
            ),
            tool("stop_agent", "Останавливает работающего исполнителя карточки.", json!({ "card_id": card }), &["card_id"]),
        ];
        tools.extend(self.files.definitions());
        if !self.commands.is_empty() {
            tools.push(tool(
                "run_command",
                &format!(
                    "Запускает команду в рабочей папке, чтобы проверить работу (сборка, тесты, запуск программы), \
                     и возвращает вывод и код выхода. Можно только команды из списка, дольше {} с команда не работает.",
                    self.timeout.as_secs()
                ),
                json!({ "command": { "type": "string", "enum": self.commands } }),
                &["command"],
            ));
        }
        json!(tools)
    }

    fn call(&self, name: &str, args: &Value) -> Result<String, String> {
        if let Some(result) = self.files.call(name, args) {
            return result;
        }
        let file = &self.ctx.file;
        let card_id = arg(args, "card_id");
        // Карточка в «готово» закрыта: её больше не двигают, не комментируют и не запускают.
        if !card_id.is_empty() && board::is_closed(&file.read()?, card_id) {
            return Err("карточка уже в столбце готовых задач: она закрыта, её больше не трогают".to_owned());
        }
        match name {
            "board_overview" => self.overview(),
            "run_command" => {
                let allowed = command::check(&self.commands, arg(args, "command"))?;
                Ok(command::run(self.files.sandbox.root(), allowed, self.timeout)?.report(self.timeout))
            }
            "create_card" => {
                let id = file.create_card(arg(args, "column"), arg(args, "title"), arg(args, "description"))?;
                Ok(format!("Создана карточка {id}"))
            }
            "move_card" => {
                file.move_card(card_id, arg(args, "column"))?;
                Ok(format!("Карточка перенесена в «{}»", arg(args, "column")))
            }
            "assign_agent" => {
                let agent_id = arg(args, "agent_id");
                if agent_id == self.master_id {
                    return Err("мастер не может назначить исполнителем себя".to_owned());
                }
                self.ctx.agent(agent_id)?;
                file.assign(card_id, agent_id)?;
                Ok(format!("Исполнитель — {}", self.ctx.agent_name(agent_id)))
            }
            "comment" => {
                file.comment(card_id, &self.master_id, arg(args, "text"), &super::log::now())?;
                Ok("Комментарий оставлен".to_owned())
            }
            "run_agent" => {
                let left = self.runs_left.get();
                if left == 0 {
                    return Err(format!("лимит запусков за обход ({MAX_RUNS_PER_SWEEP}) исчерпан, продолжишь в следующем обходе"));
                }
                super::start_worker(&self.app, &self.ctx.project, &self.ctx.board_rel, card_id)?;
                self.runs_left.set(left - 1);
                Ok("Исполнитель запущен и работает в фоне".to_owned())
            }
            "stop_agent" => {
                if super::request_stop(&self.app, &self.ctx.board_rel, card_id) {
                    return Ok("Исполнителю отправлен сигнал остановки".to_owned());
                }
                // Исполнитель не работает, а статус остался (например, приложение закрывали): снимаем его.
                file.set_state(card_id, None)?;
                Ok("Исполнитель не работал, зависший статус снят".to_owned())
            }
            _ => Err(format!("нет инструмента «{name}»")),
        }
    }
}

impl Master {
    /// Доска текстом для модели.
    fn overview(&self) -> Result<String, String> {
        let board = self.ctx.file.read()?;
        let mut text = format!("Потрачено на доске: ${:.4}", board::spent(&board));
        if let Some(budget) = board["budget"].as_f64() {
            text += &format!(" из бюджета ${budget}");
        }
        let cards = board::all_cards(&board)?;
        let done = board::role_column(&board, Role::Done);
        for column in board::column_titles(&board) {
            // Закрытые карточки мастеру не нужны: только их число.
            if Some(&column) == done.as_ref() {
                let count = cards.iter().filter(|(_, c)| c.column == column).count();
                text += &format!("\n\nСтолбец «{column}» (готово): {count} закрытых карточек, их не трогай.");
                continue;
            }
            text += &format!("\n\nСтолбец «{column}»:");
            for (id, card) in cards.iter().filter(|(_, c)| c.column == column) {
                let assignee = card.assignee.as_deref().map_or("не назначен".to_owned(), |a| format!("{} ({a})", self.ctx.agent_name(a)));
                let state = match card.state.as_deref() {
                    Some("running") => "работает",
                    Some("done") => "закончил",
                    Some("error") => "ошибка",
                    _ => "не запускался",
                };
                text += &format!("\n- [{id}] {} — исполнитель: {assignee}; агент: {state}; расход ${:.4}", card.title, card.cost);
                if !card.description.trim().is_empty() {
                    text += &format!("\n  Описание: {}", card.description.trim());
                }
                let skip = card.comments.len().saturating_sub(COMMENTS_IN_OVERVIEW);
                for (author, comment) in card.comments.iter().skip(skip) {
                    text += &format!("\n  Комментарий {}: {comment}", self.author(author.as_deref()));
                }
            }
        }
        Ok(text)
    }

    fn author(&self, id: Option<&str>) -> String {
        match id {
            None => "админа".to_owned(),
            Some(id) if id == self.master_id => "твой".to_owned(),
            Some(id) => format!("исполнителя {}", self.ctx.agent_name(id)),
        }
    }
}

/// Собирает обход доски мастером.
pub fn prepare(app: &AppHandle, project: &Path, board_rel: &str) -> Result<(Master, Prompt, RunLog), String> {
    let ctx = BoardContext::load(project, board_rel)?;
    let master_id = ctx.orchestrator().ok_or("у доски не выбран мастер-агент")?.to_owned();
    let files = Files { sandbox: ctx.sandbox()?, writable: false };
    let (api_key, model) = ctx.launch(&master_id)?;

    let prompt = Prompt {
        api_key,
        model,
        system: system_prompt(&ctx, &master_id),
        task: "Сделай обход доски: посмотри её, проверь готовую работу и наведи порядок.".to_owned(),
    };
    let log = RunLog::start(project, &master_id, board_rel, None);
    let master = Master {
        commands: command::allowed(&ctx.board),
        timeout: command::timeout(&ctx.board),
        ctx,
        master_id,
        files,
        app: app.clone(),
        runs_left: Cell::new(MAX_RUNS_PER_SWEEP),
    };
    Ok((master, prompt, log))
}

/// Обход от начала до итога: статус мастера на доске, расход, журнал.
pub fn work(master: Master, prompt: Prompt, mut log: RunLog, stop: &AtomicBool) {
    let file = &master.ctx.file;
    let on_usage = |usage: &_| {
        if let Err(e) = file.add_master_usage(usage) {
            eprintln!("не удалось записать расход мастера: {e}");
        }
    };
    let state = match runner::run(&prompt, &master, &mut log, stop, &on_usage) {
        Ok(report) => {
            log.add(Kind::Result, &report);
            AgentState::Done
        }
        Err(error) => {
            log.add(Kind::Error, &error);
            AgentState::Error
        }
    };
    if let Err(e) = file.set_master_state(Some(state)) {
        eprintln!("не удалось отметить статус мастера: {e}");
    }
}

fn system_prompt(ctx: &BoardContext, master_id: &str) -> String {
    let skill = ctx.agent(master_id).ok().and_then(|a| a["skill"].as_str()).unwrap_or_default();
    let team = ctx
        .agents
        .iter()
        .filter(|a| a["id"] != master_id)
        .map(|a| {
            let first_line = a["skill"].as_str().unwrap_or_default().lines().find(|l| !l.trim().is_empty()).unwrap_or("");
            format!("- {} (id {}): {}", a["name"].as_str().unwrap_or("?"), a["id"].as_str().unwrap_or("?"), first_line.trim())
        })
        .collect::<Vec<_>>()
        .join("\n");
    let stages = board::column_titles(&ctx.board).iter().map(|c| format!("«{c}»")).collect::<Vec<_>>().join(", ");
    let todo = board::role_column(&ctx.board, Role::Todo).unwrap_or_else(|| "первый столбец".to_owned());
    let done = board::role_column(&ctx.board, Role::Done).unwrap_or_else(|| "последний столбец".to_owned());
    let commands = match command::allowed(&ctx.board) {
        list if list.is_empty() => String::new(),
        list => format!(
            " Для проверки можешь запускать в ней разрешённые команды инструментом run_command: {}. \
             Если команда падает, приложи к замечаниям в комментарии важную часть её вывода.",
            list.iter().map(|c| format!("«{c}»")).collect::<Vec<_>>().join(", ")
        ),
    };
    let check = match board::testing_column(&ctx.board) {
        Some(testing) => format!("перенеси карточку в «{testing}» и проверь её"),
        None => "проверь карточку".to_owned(),
    };
    format!(
        "{skill}\n\n---\n\
         Ты мастер-агент канбан-доски: менеджер команды агентов. Сам задачи не выполняешь и файлы не меняешь — \
         только смотришь доску, проверяешь результат и управляешь исполнителями.\n\
         Этапы доски по порядку: {stages}.\n\
         Команда (назначать можно только их):\n{team}\n\n\
         Карточки по доске двигаешь только ты: исполнители работают с файлами и в доску не заглядывают.\n\n\
         Как проходит обход:\n\
         1. Посмотри доску инструментом board_overview.\n\
         2. Новые карточки в «{todo}»: назначь подходящего исполнителя из команды, перенеси карточку в столбец работы и запусти исполнителя.\n\
         3. Карточки, где исполнитель закончил: {check}. Читай файлы в рабочей папке и сверяй их с описанием, комментариями и отчётом исполнителя. \
         Если всё сделано — перенеси карточку в «{done}». Если нет — напиши в комментарии, что именно исправить, \
         верни карточку в столбец работы и снова запусти исполнителя.\n\
         4. Карточки с ошибкой агента: если причина понятна, уточни задачу комментарием и перезапусти; если нет — оставь комментарий для админа.\n\
         5. Если задача слишком большая, раздели её на новые карточки.\n\
         «{done}» — столбец закрытых задач: карточку, которая туда попала, больше не трогай. \
         Не трогай карточки, над которыми агент сейчас работает. \
         Не запускай одну карточку повторно без нового комментария с замечаниями. \
         Рабочую папку ты можешь только читать.{commands}\n\
         В конце ответь коротким итогом обхода."
    )
}
