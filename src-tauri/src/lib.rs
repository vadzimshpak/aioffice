mod explorer;
mod recent;
mod settings;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const WELCOME_LABEL: &str = "main";

/// Какой проект открыт в каком окне редактора (по метке окна).
#[derive(Default)]
struct OpenProjects {
    by_window: Mutex<HashMap<String, String>>,
    next_id: AtomicUsize,
}

impl OpenProjects {
    /// Запоминает проект под новой меткой окна и возвращает её.
    fn register(&self, project: &str) -> String {
        let label = format!("editor-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        self.by_window
            .lock()
            .unwrap()
            .insert(label.clone(), project.to_owned());
        label
    }

    fn project_of(&self, label: &str) -> Option<String> {
        self.by_window.lock().unwrap().get(label).cloned()
    }

    fn forget(&self, label: &str) {
        self.by_window.lock().unwrap().remove(label);
    }
}

fn project_name(project: &str) -> String {
    Path::new(project)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| project.to_owned())
}

/// Открывает окно редактора для проекта и закрывает окно приветствия.
fn open_editor(app: &AppHandle, project: String) -> Result<(), String> {
    recent::remember(app, &project)?;
    let label = app.state::<OpenProjects>().register(&project);

    // Обработчик перетаскивания Tauri отключён, иначе на Windows
    // не работает HTML5 drag and drop в Explorer.
    let editor = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("editor.html".into()))
        .title(format!("{} — AIOffice", project_name(&project)))
        .inner_size(1200.0, 800.0)
        .min_inner_size(600.0, 400.0)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?;

    app.state::<explorer::Watchers>()
        .start(app, &label, Path::new(&project))?;

    let handle = app.clone();
    editor.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            handle.state::<explorer::Watchers>().stop(&label);
            handle.state::<OpenProjects>().forget(&label);
        }
    });

    if let Some(welcome) = app.get_webview_window(WELCOME_LABEL) {
        welcome.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Показывает выбор папки и открывает её в редакторе; «Отмена» ничего не делает.
fn pick_and_open(app: &AppHandle, title: &str) -> Result<(), String> {
    match app.dialog().file().set_title(title).blocking_pick_folder() {
        Some(folder) => open_editor(app, folder.to_string()),
        None => Ok(()),
    }
}

/// Показывает окно приветствия, описанное в `tauri.conf.json`.
fn open_welcome(app: &AppHandle) -> Result<(), String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == WELCOME_LABEL)
        .ok_or("в tauri.conf.json нет окна приветствия")?;
    WebviewWindowBuilder::from_config(app, config)
        .and_then(|builder| builder.build())
        .map(drop)
        .map_err(|e| e.to_string())
}

/// Папка проекта из аргумента запуска (`aioffice <папка>`), если она есть.
fn project_from_args() -> Option<String> {
    let arg = std::env::args().nth(1)?;
    match std::fs::canonicalize(&arg) {
        Ok(path) if path.is_dir() => Some(path.to_string_lossy().into_owned()),
        _ => {
            eprintln!("aioffice: «{arg}» не папка, открываю окно приветствия");
            None
        }
    }
}

#[tauri::command]
fn recent_projects(app: AppHandle) -> Vec<String> {
    recent::load(&app)
}

#[tauri::command]
async fn create_project(app: AppHandle) -> Result<(), String> {
    pick_and_open(&app, "Создать проект")
}

#[tauri::command]
async fn open_project(app: AppHandle) -> Result<(), String> {
    pick_and_open(&app, "Открыть проект")
}

#[tauri::command]
async fn open_recent(app: AppHandle, project: String) -> Result<(), String> {
    open_editor(&app, project)
}

/// Путь проекта, открытого в окне редактора, которое вызвало команду.
#[tauri::command]
fn current_project(window: WebviewWindow, projects: State<'_, OpenProjects>) -> Option<String> {
    projects.project_of(window.label())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenProjects::default())
        .manage(explorer::Watchers::default())
        .setup(|app| {
            // С папкой в аргументах сразу открываем редактор, без приветствия.
            match project_from_args() {
                Some(project) => open_editor(app.handle(), project)?,
                None => open_welcome(app.handle())?,
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            recent_projects,
            create_project,
            open_project,
            open_recent,
            current_project,
            explorer::list_dir,
            explorer::create_entry,
            explorer::move_entry,
            explorer::delete_entry,
            explorer::read_file,
            explorer::write_file,
            settings::load_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
