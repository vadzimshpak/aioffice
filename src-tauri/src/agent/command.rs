//! Запуск команд из списка разрешённых: в рабочей папке, с таймаутом и сбором вывода.
//!
//! Команда должна совпасть со строкой из списка доски целиком, поэтому через неё
//! нельзя дописать что-то своё. Сама запущенная программа при этом работает
//! с правами пользователя: список — это граница доверия, его задаёт админ.

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde_json::Value;

/// Таймаут, если на доске он не задан.
pub const DEFAULT_TIMEOUT_SECS: u64 = 120;
/// Больше вывода модели не отдаём: хвост важнее, там обычно итог и ошибки.
const MAX_OUTPUT_CHARS: usize = 10_000;

/// Разрешённые команды доски (`allowedCommands`), без пустых строк.
pub fn allowed(board: &Value) -> Vec<String> {
    let list = board["allowedCommands"].as_array().into_iter().flatten();
    list.filter_map(|c| c.as_str()).map(str::trim).filter(|c| !c.is_empty()).map(str::to_owned).collect()
}

/// Таймаут команд доски (`commandTimeout`, в секундах).
pub fn timeout(board: &Value) -> Duration {
    Duration::from_secs(board["commandTimeout"].as_u64().filter(|&s| s > 0).unwrap_or(DEFAULT_TIMEOUT_SECS))
}

/// Команда из списка, совпавшая целиком (без учёта пробелов по краям).
pub fn check<'a>(allowed: &'a [String], command: &str) -> Result<&'a str, String> {
    let command = command.trim();
    allowed.iter().find(|c| *c == command).map(String::as_str).ok_or_else(|| {
        format!("команда «{command}» не разрешена; можно только: {}", allowed.join("; "))
    })
}

pub struct Outcome {
    /// Код выхода; нет — процесс убит по таймауту или сигналом.
    pub code: Option<i32>,
    pub timed_out: bool,
    /// stdout и stderr вместе.
    pub output: String,
}

impl Outcome {
    /// Итог для модели: как завершилась команда и её вывод.
    pub fn report(&self, timeout: Duration) -> String {
        let status = match (self.timed_out, self.code) {
            (true, _) => format!("Команда не уложилась в {} с и остановлена.", timeout.as_secs()),
            (false, Some(0)) => "Команда завершилась успешно (код 0).".to_owned(),
            (false, Some(code)) => format!("Команда завершилась с ошибкой (код {code})."),
            (false, None) => "Команда прервана.".to_owned(),
        };
        let output = if self.output.trim().is_empty() { "(вывода нет)" } else { &self.output };
        format!("{status}\nВывод:\n{output}")
    }
}

/// Выполняет команду через оболочку системы в папке `cwd`; дольше `timeout` — останавливает всё дерево процессов.
pub fn run(cwd: &Path, command: &str, timeout: Duration) -> Result<Outcome, String> {
    let mut child = shell(command)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("не удалось запустить команду: {e}"))?;
    // Вывод читаем в фоне: иначе программа с большим выводом встанет на полном канале.
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());

    let started = Instant::now();
    let (code, timed_out) = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break (status.code(), false);
        }
        if started.elapsed() >= timeout {
            kill_tree(&mut child);
            break (None, true);
        }
        thread::sleep(Duration::from_millis(100));
    };

    let output = [stdout, stderr].into_iter().map(|h| h.join().unwrap_or_default()).collect::<Vec<_>>().join("\n");
    Ok(Outcome { code, timed_out, output: tail(output.trim(), MAX_OUTPUT_CHARS) })
}

#[cfg(windows)]
fn shell(command: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("cmd");
    // chcp 65001: вывод в UTF-8, иначе русский текст придёт в кодировке консоли.
    cmd.raw_arg(format!("/D /S /C \"chcp 65001>nul & {command}\"")).creation_flags(CREATE_NO_WINDOW);
    // cmd не видит PATH длиннее 8191 символа, а cargo (и `tauri dev`) дописывает в него свои папки.
    if let Some(path) = std::env::var_os("PATH") {
        cmd.env("PATH", compact_path(&path));
    }
    cmd
}

#[cfg(not(windows))]
fn shell(command: &str) -> Command {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new("sh");
    // Своя группа процессов: по таймауту её можно остановить целиком.
    cmd.arg("-c").arg(command).process_group(0);
    cmd
}

/// PATH для команд: без папок сборки самого приложения, повторов и несуществующих папок.
/// При запуске через cargo (`tauri dev`) в PATH попадают сотни папок сборки whisper.cpp.
#[cfg(windows)]
fn compact_path(path: &std::ffi::OsStr) -> std::ffi::OsString {
    // Программа лежит в target\debug (тесты — в target\debug\deps), папки сборки — в target\debug\build.
    let own_build = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.ancestors().skip(1).take(2).map(|dir| dir.join("build")).find(|build| build.is_dir()));
    let mut seen = std::collections::HashSet::new();
    let dirs = std::env::split_paths(path).filter(|dir| {
        let ours = own_build.as_ref().is_some_and(|build| dir.starts_with(build));
        !ours && dir.is_dir() && seen.insert(dir.to_string_lossy().to_lowercase().trim_end_matches('\\').to_owned())
    });
    std::env::join_paths(dirs.collect::<Vec<_>>()).unwrap_or_else(|_| path.to_owned())
}

/// Останавливает процесс вместе с запущенными им программами.
fn kill_tree(child: &mut Child) {
    let pid = child.id().to_string();
    #[cfg(windows)]
    let killed = {
        use std::os::windows::process::CommandExt;
        Command::new("taskkill").args(["/T", "/F", "/PID", &pid]).creation_flags(0x0800_0000).status()
    };
    #[cfg(not(windows))]
    let killed = Command::new("kill").args(["-9", &format!("-{pid}")]).status();
    if !killed.is_ok_and(|s| s.success()) {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn drain(pipe: Option<impl Read + Send + 'static>) -> JoinHandle<String> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut bytes);
        }
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

/// Последние `max` символов текста с пометкой, что начало обрезано.
fn tail(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_owned();
    }
    let rest: String = text.chars().skip(count - max).collect();
    format!("…(начало вывода обрезано)\n{rest}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_exact_commands_from_the_list_are_allowed() {
        let board = json!({ "allowedCommands": ["npm test", "  ", "cargo build"] });
        let list = allowed(&board);
        assert_eq!(list, ["npm test", "cargo build"]);
        assert_eq!(check(&list, "  npm test ").unwrap(), "npm test");
        assert!(check(&list, "npm test && del /q *").is_err());
        assert!(check(&list, "npm").is_err());
        assert!(check(&[], "npm test").is_err());
    }

    #[test]
    fn timeout_comes_from_the_board() {
        assert_eq!(timeout(&json!({})), Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        assert_eq!(timeout(&json!({ "commandTimeout": 5 })), Duration::from_secs(5));
        assert_eq!(timeout(&json!({ "commandTimeout": 0 })), Duration::from_secs(DEFAULT_TIMEOUT_SECS));
    }

    #[test]
    fn runs_in_the_folder_and_reports_output_and_code() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("marker.txt"), "").unwrap();
        let list = if cfg!(windows) { "dir /b" } else { "ls" };
        let outcome = run(dir.path(), list, Duration::from_secs(20)).unwrap();
        assert_eq!(outcome.code, Some(0));
        assert!(outcome.output.contains("marker.txt"), "{}", outcome.output);

        let failing = run(dir.path(), "exit 3", Duration::from_secs(20)).unwrap();
        assert_eq!(failing.code, Some(3));
        assert!(failing.report(Duration::from_secs(20)).contains("код 3"));
    }

    #[test]
    fn stops_commands_that_run_too_long() {
        let dir = tempfile::tempdir().unwrap();
        let slow = if cfg!(windows) { "ping -n 30 127.0.0.1" } else { "sleep 30" };
        let started = Instant::now();
        let outcome = run(dir.path(), slow, Duration::from_secs(1)).unwrap();
        assert!(outcome.timed_out, "{}", outcome.output);
        assert!(started.elapsed() < Duration::from_secs(15));
    }

    #[test]
    fn keeps_the_tail_of_long_output() {
        let text = "a".repeat(10) + "конец";
        assert_eq!(tail(&text, 5), "…(начало вывода обрезано)\nконец");
        assert_eq!(tail("коротко", 50), "коротко");
    }
}
