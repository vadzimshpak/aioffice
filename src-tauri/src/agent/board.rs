//! Доска .kanban глазами агентов: карточки, их перенос, назначение, статусы,
//! комментарии и расход. Исполнитель работает со своей карточкой, мастер — со всей доской.
//!
//! Доска правится как JSON-значение, а не через структуры: так не теряются поля,
//! о которых Rust-часть не знает. Формат описан в `src/editor/kanban/board.ts`.
//! Каждая правка читает файл заново: доску в это время может менять и человек.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::openrouter::Usage;

/// Статус работы агента: поле `agentState` карточки или `masterState` доски.
#[derive(Clone, Copy)]
pub enum AgentState {
    Running,
    Done,
    Error,
}

impl AgentState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Done => "done",
            Self::Error => "error",
        }
    }
}

/// Карточка, как её видит агент.
pub struct CardInfo {
    pub title: String,
    pub description: String,
    pub assignee: Option<String>,
    /// Комментарии по порядку: автор (id агента, без автора — админ) и текст.
    pub comments: Vec<(Option<String>, String)>,
    /// Столбец, в котором карточка сейчас.
    pub column: String,
    pub state: Option<String>,
    pub cost: f64,
}

pub struct BoardFile {
    path: PathBuf,
}

impl BoardFile {
    pub fn new(path: &Path) -> Self {
        Self { path: path.to_owned() }
    }

    pub fn read(&self) -> Result<Value, String> {
        let text = fs::read_to_string(&self.path).map_err(|e| format!("не удалось прочитать доску: {e}"))?;
        serde_json::from_str(&text).map_err(|e| format!("доска повреждена: {e}"))
    }

    /// Применяет правку к свежей версии доски и сохраняет её в том же виде, что и окно приложения.
    fn update<T>(&self, change: impl FnOnce(&mut Value) -> Result<T, String>) -> Result<T, String> {
        let mut board = self.read()?;
        let result = change(&mut board)?;
        let text = serde_json::to_string_pretty(&board).map_err(|e| e.to_string())? + "\n";
        fs::write(&self.path, text).map_err(|e| format!("не удалось сохранить доску: {e}"))?;
        Ok(result)
    }

    pub fn card(&self, card_id: &str) -> Result<CardInfo, String> {
        card_info(&self.read()?, card_id)
    }

    pub fn move_card(&self, card_id: &str, column: &str) -> Result<(), String> {
        self.update(|board| move_card(board, card_id, column))
    }

    pub fn create_card(&self, column: &str, title: &str, description: &str) -> Result<String, String> {
        self.update(|board| create_card(board, column, title, description))
    }

    /// Назначает исполнителя; проверку, что он из группы, делает вызывающий.
    pub fn assign(&self, card_id: &str, agent_id: &str) -> Result<(), String> {
        self.update(|board| {
            find_card_mut(board, card_id)?["assignee"] = json!(agent_id);
            Ok(())
        })
    }

    pub fn set_state(&self, card_id: &str, state: Option<AgentState>) -> Result<(), String> {
        self.update(|board| {
            set_state(find_card_mut(board, card_id)?, "agentState", state);
            Ok(())
        })
    }

    pub fn set_master_state(&self, state: Option<AgentState>) -> Result<(), String> {
        self.update(|board| {
            set_state(board, "masterState", state);
            Ok(())
        })
    }

    /// Прибавляет расход запроса к расходу агентов на карточку (`agentUsage`).
    pub fn add_usage(&self, card_id: &str, usage: &Usage) -> Result<(), String> {
        self.update(|board| {
            add_usage(&mut find_card_mut(board, card_id)?["agentUsage"], usage);
            Ok(())
        })
    }

    /// Прибавляет расход мастер-агента (`masterUsage` доски).
    pub fn add_master_usage(&self, usage: &Usage) -> Result<(), String> {
        self.update(|board| {
            add_usage(&mut board["masterUsage"], usage);
            Ok(())
        })
    }

    /// Комментарий агента. Писать в карточку могут только её исполнитель и мастер доски,
    /// админ пишет из окна приложения.
    pub fn comment(&self, card_id: &str, author: &str, text: &str, now: &str) -> Result<(), String> {
        self.update(|board| {
            let orchestrator = board["orchestrator"].as_str().map(str::to_owned);
            let card = find_card_mut(board, card_id)?;
            if card["assignee"].as_str() != Some(author) && orchestrator.as_deref() != Some(author) {
                return Err("комментарии в карточке могут оставлять только админ, мастер и исполнитель".to_owned());
            }
            let comment = json!({ "id": new_id(), "text": text, "createdAt": now, "author": author });
            match card["comments"].as_array_mut() {
                Some(comments) => comments.push(comment),
                None => card["comments"] = json!([comment]),
            }
            Ok(())
        })
    }
}

fn columns(board: &Value) -> &[Value] {
    board["columns"].as_array().map_or(&[], Vec::as_slice)
}

fn cards(column: &Value) -> &[Value] {
    column["cards"].as_array().map_or(&[], Vec::as_slice)
}

/// Названия столбцов по порядку — этапы, между которыми переносят карточки.
pub fn column_titles(board: &Value) -> Vec<String> {
    columns(board).iter().filter_map(|c| c["title"].as_str().map(str::to_owned)).collect()
}

/// Обязательные столбцы доски: «начало» (новые задачи) и «готово» (закрытые задачи).
/// Роль записана в поле `role` столбца; у старых досок без ролей это первый и последний столбцы.
#[derive(Clone, Copy, PartialEq)]
pub enum Role {
    Todo,
    Done,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Done => "done",
        }
    }
}

/// Название столбца с ролью `role`.
pub fn role_column(board: &Value, role: Role) -> Option<String> {
    let columns = columns(board);
    let column = if columns.iter().any(|c| c["role"].is_string()) {
        columns.iter().find(|c| c["role"] == role.as_str())
    } else if columns.len() < 2 {
        None
    } else if role == Role::Todo {
        columns.first()
    } else {
        columns.last()
    };
    column.and_then(|c| c["title"].as_str()).map(str::to_owned)
}

/// Карточка в столбце «готово»: работа закрыта, агенты её больше не трогают.
pub fn is_closed(board: &Value, card_id: &str) -> bool {
    let done = role_column(board, Role::Done);
    card_info(board, card_id).is_ok_and(|card| Some(card.column) == done)
}

/// Столбец проверки готовой работы («Тестирование», «Тест»), если он есть на доске.
pub fn testing_column(board: &Value) -> Option<String> {
    column_titles(board).into_iter().find(|t| t.to_lowercase().starts_with("тест"))
}

/// Все карточки доски по столбцам: id и карточка.
pub fn all_cards(board: &Value) -> Result<Vec<(String, CardInfo)>, String> {
    let ids = columns(board).iter().flat_map(cards).filter_map(|c| c["id"].as_str());
    ids.map(|id| Ok((id.to_owned(), card_info(board, id)?))).collect()
}

/// Сколько всего потрачено на доске: исполнители по всем карточкам и мастер.
pub fn spent(board: &Value) -> f64 {
    let cards: f64 = columns(board).iter().flat_map(cards).filter_map(|c| c["agentUsage"]["cost"].as_f64()).sum();
    cards + board["masterUsage"]["cost"].as_f64().unwrap_or(0.0)
}

/// Ошибка, если бюджет доски (`budget`, в долларах) уже потрачен.
pub fn check_budget(board: &Value) -> Result<(), String> {
    match board["budget"].as_f64() {
        Some(budget) if spent(board) >= budget => {
            Err(format!("бюджет доски ${budget} исчерпан: увеличьте его в шапке доски"))
        }
        _ => Ok(()),
    }
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

fn card_info(board: &Value, card_id: &str) -> Result<CardInfo, String> {
    for column in columns(board) {
        let Some(card) = cards(column).iter().find(|c| c["id"] == card_id) else { continue };
        let comments = card["comments"].as_array().into_iter().flatten();
        return Ok(CardInfo {
            title: text(&card["title"]),
            description: text(&card["description"]),
            assignee: card["assignee"].as_str().map(str::to_owned),
            comments: comments.map(|c| (c["author"].as_str().map(str::to_owned), text(&c["text"]))).collect(),
            column: text(&column["title"]),
            state: card["agentState"].as_str().map(str::to_owned),
            cost: card["agentUsage"]["cost"].as_f64().unwrap_or(0.0),
        });
    }
    Err(format!("карточки «{card_id}» нет на доске"))
}

fn find_card_mut<'a>(board: &'a mut Value, card_id: &str) -> Result<&'a mut Value, String> {
    board["columns"]
        .as_array_mut()
        .into_iter()
        .flatten()
        .filter_map(|column| column["cards"].as_array_mut())
        .flatten()
        .find(|card| card["id"] == card_id)
        .ok_or_else(|| format!("карточки «{card_id}» нет на доске"))
}

/// Номер столбца по названию без учёта регистра; ошибка перечисляет все этапы.
fn column_index(board: &Value, column: &str) -> Result<usize, String> {
    let wanted = column.trim().to_lowercase();
    column_titles(board)
        .iter()
        .position(|title| title.to_lowercase() == wanted)
        .ok_or_else(|| format!("на доске нет столбца «{column}»; есть: {}", column_titles(board).join(", ")))
}

fn push_card(board: &mut Value, column: usize, card: Value) {
    let cards = &mut board["columns"][column]["cards"];
    match cards.as_array_mut() {
        Some(cards) => cards.push(card),
        None => *cards = json!([card]),
    }
}

/// Переносит карточку в конец столбца с названием `column`.
fn move_card(board: &mut Value, card_id: &str, column: &str) -> Result<(), String> {
    let target = column_index(board, column)?;
    let mut moved = None;
    for column in board["columns"].as_array_mut().into_iter().flatten() {
        if let Some(cards) = column["cards"].as_array_mut() {
            if let Some(index) = cards.iter().position(|c| c["id"] == card_id) {
                moved = Some(cards.remove(index));
            }
        }
    }
    let card = moved.ok_or_else(|| format!("карточки «{card_id}» нет на доске"))?;
    push_card(board, target, card);
    Ok(())
}

fn create_card(board: &mut Value, column: &str, title: &str, description: &str) -> Result<String, String> {
    if title.trim().is_empty() {
        return Err("у карточки должно быть название".to_owned());
    }
    let target = column_index(board, column)?;
    let id = new_id();
    push_card(board, target, json!({ "id": id, "title": title.trim(), "description": description, "comments": [] }));
    Ok(id)
}

fn set_state(object: &mut Value, field: &str, state: Option<AgentState>) {
    match state {
        Some(state) => object[field] = json!(state.as_str()),
        None => drop(object.as_object_mut().and_then(|o| o.remove(field))),
    }
}

fn add_usage(total: &mut Value, usage: &Usage) {
    let tokens = total["tokens"].as_u64().unwrap_or(0) + usage.tokens;
    let cost = total["cost"].as_f64().unwrap_or(0.0) + usage.cost;
    *total = json!({ "tokens": tokens, "cost": cost });
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    format!("c{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board() -> Value {
        json!({
            "version": 1,
            "workdir": "site",
            "orchestrator": "boss",
            "columns": [
                { "id": "c1", "title": "TODO", "cards": [
                    { "id": "k1", "title": "Сверстать", "description": "шапку", "comments": [{ "id": "m1", "text": "срочно", "createdAt": "" }], "assignee": "a1" }
                ] },
                { "id": "c2", "title": "В прогрессе", "cards": [] },
                { "id": "c3", "title": "Тестирование", "cards": [] },
            ],
        })
    }

    fn file(board: &Value) -> (tempfile::TempDir, BoardFile) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("b.kanban");
        fs::write(&path, serde_json::to_string_pretty(board).unwrap()).unwrap();
        (dir, BoardFile::new(&path))
    }

    #[test]
    fn reads_card_with_its_column_and_comments() {
        let card = card_info(&board(), "k1").unwrap();
        assert_eq!((card.title.as_str(), card.column.as_str()), ("Сверстать", "TODO"));
        assert_eq!(card.assignee.as_deref(), Some("a1"));
        assert_eq!(card.comments, vec![(None, "срочно".to_owned())]);
        assert!(card_info(&board(), "нет").is_err());
        assert_eq!(all_cards(&board()).unwrap().len(), 1);
    }

    #[test]
    fn moves_card_by_column_title_ignoring_case() {
        let mut board = board();
        move_card(&mut board, "k1", "в ПРОГРЕССЕ").unwrap();
        assert_eq!(board["columns"][0]["cards"], json!([]));
        assert_eq!(board["columns"][1]["cards"][0]["id"], "k1");
        // Неизвестный столбец — понятная ошибка со списком этапов, карточка на месте.
        let error = move_card(&mut board, "k1", "Архив").unwrap_err();
        assert!(error.contains("TODO, В прогрессе"));
        assert_eq!(board["columns"][1]["cards"][0]["id"], "k1");
    }

    #[test]
    fn finds_required_columns_by_role_or_position() {
        // Без ролей — первый и последний столбцы.
        assert_eq!(role_column(&board(), Role::Todo).as_deref(), Some("TODO"));
        assert_eq!(role_column(&board(), Role::Done).as_deref(), Some("Тестирование"));
        // С ролями — по ним, как бы столбцы ни назывались и где бы ни стояли.
        let with_roles = json!({ "columns": [
            { "title": "Backlog", "role": "todo", "cards": [] },
            { "title": "Ready", "role": "done", "cards": [{ "id": "k9" }] },
            { "title": "Архив", "cards": [] },
        ]});
        assert_eq!(role_column(&with_roles, Role::Done).as_deref(), Some("Ready"));
        assert!(is_closed(&with_roles, "k9"));
        assert!(!is_closed(&board(), "k1"));
    }

    #[test]
    fn finds_testing_column() {
        assert_eq!(testing_column(&board()).as_deref(), Some("Тестирование"));
        assert_eq!(testing_column(&json!({ "columns": [{ "title": "TODO" }] })), None);
    }

    #[test]
    fn creates_cards_in_a_column() {
        let mut board = board();
        let id = create_card(&mut board, "todo", "Новая", "текст").unwrap();
        assert_eq!(board["columns"][0]["cards"][1]["id"], id.as_str());
        assert!(create_card(&mut board, "TODO", "  ", "").is_err());
    }

    #[test]
    fn budget_counts_cards_and_master() {
        let mut board = board();
        board["columns"][0]["cards"][0]["agentUsage"] = json!({ "tokens": 1, "cost": 0.5 });
        board["masterUsage"] = json!({ "tokens": 1, "cost": 0.25 });
        assert_eq!(spent(&board), 0.75);
        assert!(check_budget(&board).is_ok());
        board["budget"] = json!(0.75);
        assert!(check_budget(&board).is_err());
    }

    #[test]
    fn only_assignee_and_master_can_comment() {
        let (_dir, file) = file(&board());
        file.comment("k1", "a1", "сделал", "t").unwrap();
        file.comment("k1", "boss", "переделай", "t").unwrap();
        assert!(file.comment("k1", "a2", "чужой", "t").is_err());
        let comments = file.card("k1").unwrap().comments;
        assert_eq!(comments.len(), 3);
        assert_eq!(comments[2], (Some("boss".to_owned()), "переделай".to_owned()));
    }

    #[test]
    fn usage_accumulates_for_cards_and_master() {
        let (_dir, file) = file(&board());
        file.add_usage("k1", &Usage { tokens: 100, cost: 0.5 }).unwrap();
        file.add_usage("k1", &Usage { tokens: 20, cost: 0.25 }).unwrap();
        file.add_master_usage(&Usage { tokens: 5, cost: 0.125 }).unwrap();
        let saved = file.read().unwrap();
        assert_eq!(saved["columns"][0]["cards"][0]["agentUsage"], json!({ "tokens": 120, "cost": 0.75 }));
        assert_eq!(saved["masterUsage"], json!({ "tokens": 5, "cost": 0.125 }));
    }

    #[test]
    fn file_keeps_unknown_fields_and_key_order() {
        let (_dir, file) = file(&board());
        file.set_state("k1", Some(AgentState::Running)).unwrap();
        file.assign("k1", "a2").unwrap();
        file.move_card("k1", "В прогрессе").unwrap();
        file.set_master_state(Some(AgentState::Done)).unwrap();
        let saved = file.read().unwrap();
        let card = &saved["columns"][1]["cards"][0];
        assert_eq!((card["agentState"].as_str(), card["assignee"].as_str()), (Some("running"), Some("a2")));
        assert_eq!(saved["workdir"], "site");
        assert_eq!(saved["masterState"], "done");
        assert!(fs::read_to_string(&file.path).unwrap().starts_with("{\n  \"version\": 1"));

        file.set_state("k1", None).unwrap();
        assert!(file.read().unwrap()["columns"][1]["cards"][0].get("agentState").is_none());
    }
}
