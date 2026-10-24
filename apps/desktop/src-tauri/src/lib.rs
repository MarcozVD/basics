//! Basics desktop shell.
//!
//! The app does not ship its own UI: it starts the same `cli.js ui` server the npm
//! package runs (with a bundled Node binary as a Tauri sidecar) and points the
//! window at it. If a Basics server already answers on the default port, the app
//! attaches to it instead and never stops it.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_PORT: u16 = 4747;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const LOG_LINES: usize = 40;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "lowercase")]
enum Phase {
    #[default]
    Starting,
    Ready,
    Error,
}

#[derive(Clone, Serialize, Default)]
struct Status {
    phase: Phase,
    message: String,
    log: Vec<String>,
    url: Option<String>,
}

#[derive(Default)]
struct Server {
    /// The sidecar this app started; `None` when attached to an existing server.
    child: Option<CommandChild>,
    status: Status,
    log: VecDeque<String>,
}

struct ServerState(Mutex<Server>);

/// `GET /api/health` over a plain socket; `Some` only for a Basics server.
fn basics_health(port: u16) -> Option<serde_json::Value> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(400)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    let request = format!("GET /api/health HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let (head, body) = response.split_once("\r\n\r\n")?;
    if !head.lines().next()?.contains(" 200 ") {
        return None;
    }
    let json: serde_json::Value = serde_json::from_str(body.trim()).ok()?;
    let is_basics = json.get("ok") == Some(&serde_json::Value::Bool(true)) && json.get("version").is_some_and(|v| v.is_string());
    is_basics.then_some(json)
}

fn port_is_free(port: u16) -> bool {
    TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok()
}

fn any_free_port() -> Option<u16> {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).ok()?.local_addr().ok().map(|addr| addr.port())
}

/// Windows hands out verbatim paths (`\\?\C:\...`); Node's module loader resolves
/// relative imports from them badly, so pass it the ordinary form.
fn plain_path(path: std::path::PathBuf) -> std::path::PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => std::path::PathBuf::from(rest),
        _ => path,
    }
}

fn set_status(app: &AppHandle, phase: Phase, message: impl Into<String>, url: Option<String>) {
    let state = app.state::<ServerState>();
    let mut server = state.0.lock().unwrap();
    server.status = Status { phase, message: message.into(), log: server.log.iter().cloned().collect(), url };
}

fn push_log(app: &AppHandle, line: String) {
    let state = app.state::<ServerState>();
    let mut server = state.0.lock().unwrap();
    for part in line.lines().filter(|l| !l.trim().is_empty()) {
        if server.log.len() == LOG_LINES {
            server.log.pop_front();
        }
        server.log.push_back(part.to_string());
    }
}

fn stop_sidecar(app: &AppHandle) {
    let state = app.state::<ServerState>();
    let child = state.0.lock().unwrap().child.take();
    if let Some(child) = child {
        let _ = child.kill();
    }
}

fn open_in_window(app: &AppHandle, url: &str) {
    if let (Some(window), Ok(parsed)) = (app.get_webview_window("main"), url.parse()) {
        let _ = window.navigate(parsed);
    }
}

/// Attach to a running Basics server or spawn the sidecar, then wait for it.
fn start(app: AppHandle) {
    {
        let state = app.state::<ServerState>();
        let mut server = state.0.lock().unwrap();
        server.log.clear();
        server.status = Status::default();
    }

    if basics_health(DEFAULT_PORT).is_some() {
        let url = format!("http://127.0.0.1:{DEFAULT_PORT}");
        set_status(&app, Phase::Ready, "attached to a running Basics server", Some(url.clone()));
        open_in_window(&app, &url);
        return;
    }

    let port = if port_is_free(DEFAULT_PORT) { Some(DEFAULT_PORT) } else { any_free_port() };
    let Some(port) = port else {
        set_status(&app, Phase::Error, "no free local port to start the server on", None);
        return;
    };

    let cli = match app.path().resource_dir() {
        Ok(dir) => plain_path(dir).join("basics").join("dist").join("cli.js"),
        Err(err) => {
            set_status(&app, Phase::Error, format!("cannot locate the app resources: {err}"), None);
            return;
        }
    };
    if !cli.exists() {
        set_status(&app, Phase::Error, format!("the bundled server is missing: {}", cli.display()), None);
        return;
    }

    let command = match app.shell().sidecar("node") {
        Ok(command) => command.args([cli.to_string_lossy().into_owned(), "ui".into(), "--no-open".into(), "--port".into(), port.to_string()]),
        Err(err) => {
            set_status(&app, Phase::Error, format!("the bundled Node runtime is missing: {err}"), None);
            return;
        }
    };
    let (mut events, child) = match command.spawn() {
        Ok(spawned) => spawned,
        Err(err) => {
            set_status(&app, Phase::Error, format!("could not start the server: {err}"), None);
            return;
        }
    };
    app.state::<ServerState>().0.lock().unwrap().child = Some(child);

    let log_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => push_log(&log_app, String::from_utf8_lossy(&bytes).into_owned()),
                CommandEvent::Error(err) => push_log(&log_app, err),
                CommandEvent::Terminated(payload) => {
                    push_log(&log_app, format!("server exited (code {:?})", payload.code));
                    log_app.state::<ServerState>().0.lock().unwrap().child = None;
                }
                _ => {}
            }
        }
    });

    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        if basics_health(port).is_some() {
            let url = format!("http://127.0.0.1:{port}");
            set_status(&app, Phase::Ready, "server started", Some(url.clone()));
            open_in_window(&app, &url);
            return;
        }
        let exited = app.state::<ServerState>().0.lock().unwrap().child.is_none();
        if exited || Instant::now() >= deadline {
            stop_sidecar(&app);
            let reason = if exited { "the server stopped while starting" } else { "the server did not answer in time" };
            set_status(&app, Phase::Error, reason, None);
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Polled by the bundled loading page.
#[tauri::command]
fn startup_status(state: tauri::State<'_, ServerState>) -> Status {
    let server = state.0.lock().unwrap();
    let mut status = server.status.clone();
    status.log = server.log.iter().cloned().collect();
    status
}

#[tauri::command]
fn retry_startup(app: AppHandle) {
    stop_sidecar(&app);
    // Reset before the next poll so the page never re-reads the previous error.
    set_status(&app, Phase::Starting, "", None);
    std::thread::spawn(move || start(app));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState(Mutex::new(Server::default())))
        .invoke_handler(tauri::generate_handler![startup_status, retry_startup])
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || start(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Basics desktop app");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_sidecar(app);
        }
    });
}
