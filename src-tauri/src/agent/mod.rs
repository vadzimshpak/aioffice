//! Агенты канбан-доски. Исполнитель работает над своей карточкой в рабочей папке доски,
//! мастер-агент обходит доску и управляет исполнителями. Обе роли — один цикл
//! с разными наборами инструментов. Доступа к командам ОС (shell) у агентов нет.

mod board;
mod command;
mod context;
mod files;
mod log;
mod master;
mod openrouter;
mod runner;
mod sandbox;
mod toolset;
mod worker;

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::{OpenProjects, explorer};
use board::{AgentState, BoardFile};

/// Ключ обхода мастера в реестре: у него нет карточки.
const MASTER: &str = "master";

/// Агенты, которые работают сейчас: ключ — доска и карточка (или обход мастера), значение — флаг остановки.
#[derive(Default)]
pub struct Agents {
    running: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

fn run_key(board: &str, id: &str) -> String {
    format!("{board}#{id}")
}

/// Запускает `work` в фоне, если под этим ключом ничего не работает; по окончании убирает ключ.
fn spawn(app: &AppHandle, key: String, busy: &str, work: impl FnOnce(&AtomicBool) + Send + 'static) -> Result<(), String> {
    let stop = Arc::new(AtomicBool::new(false));
    {
        let agents = app.state::<Agents>();
        let mut running = agents.running.lock().unwrap();
        if running.contains_key(&key) {
            return Err(busy.to_owned());
        }
        running.insert(key.clone(), Arc::clone(&stop));
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        work(&stop);
        app.state::<Agents>().running.lock().unwrap().remove(&key);
    });
    Ok(())
}

/// Запускает исполнителя карточки в фоне. Исполнителей запускает только мастер.
fn start_worker(app: &AppHandle, project: &Path, board_rel: &str, card_id: &str) -> Result<(), String> {
    let (worker, prompt, log) = worker::prepare(project, board_rel, card_id)?;
    let key = run_key(board_rel, card_id);
    // Статус «работает» ставится до запуска, чтобы интерфейс сразу его показал.
    let running = app.state::<Agents>().running.lock().unwrap().contains_key(&key);
    if running {
        return Err("агент уже работает над этой карточкой".to_owned());
    }
    worker.ctx.file.set_state(card_id, Some(AgentState::Running))?;
    spawn(app, key, "агент уже работает над этой карточкой", move |stop| worker::work(worker, prompt, log, stop))
}

/// Просит агента остановиться после текущего шага; `false` — он не работает.
fn request_stop(app: &AppHandle, board_rel: &str, id: &str) -> bool {
    let agents = app.state::<Agents>();
    let running = agents.running.lock().unwrap();
    running.get(&run_key(board_rel, id)).map(|stop| stop.store(true, Ordering::Relaxed)).is_some()
}

/// Останавливает исполнителя после текущего шага. Если он не работает (например,
/// приложение закрыли посреди работы), снимает с карточки зависший статус.
#[tauri::command]
pub fn stop_agent(window: WebviewWindow, projects: State<'_, OpenProjects>, board: String, card_id: String) -> Result<(), String> {
    if request_stop(window.app_handle(), &board, &card_id) {
        return Ok(());
    }
    let project = explorer::project_root(&window, &projects)?;
    BoardFile::new(&explorer::resolve(&project, &board)?).set_state(&card_id, None)
}

/// Запускает один обход доски мастер-агентом. Если обход уже идёт, ничего не делает.
#[tauri::command]
pub fn run_master(window: WebviewWindow, projects: State<'_, OpenProjects>, board: String) -> Result<(), String> {
    let app = window.app_handle();
    if app.state::<Agents>().running.lock().unwrap().contains_key(&run_key(&board, MASTER)) {
        return Ok(());
    }
    let project = explorer::project_root(&window, &projects)?;
    let (master, prompt, log) = master::prepare(app, &project, &board)?;
    master.ctx.file.set_master_state(Some(AgentState::Running))?;
    spawn(app, run_key(&board, MASTER), "обход уже идёт", move |stop| master::work(master, prompt, log, stop))
}

/// Останавливает обход мастера; если он не идёт, снимает зависший статус.
#[tauri::command]
pub fn stop_master(window: WebviewWindow, projects: State<'_, OpenProjects>, board: String) -> Result<(), String> {
    if request_stop(window.app_handle(), &board, MASTER) {
        return Ok(());
    }
    let project = explorer::project_root(&window, &projects)?;
    BoardFile::new(&explorer::resolve(&project, &board)?).set_master_state(None)
}
