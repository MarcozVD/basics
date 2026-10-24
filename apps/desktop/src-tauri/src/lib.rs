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
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const DEFAULT_PORT: u16 = 4747;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const LOG_LINES: usize = 40;
const RELEASES_URL: &str = "https://github.com/MarcozVD/basics/releases";

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
    /// True when the server refused to start because no vault is configured yet.
    needs_vault: bool,
}

#[derive(Default)]
struct Server {
    /// The sidecar this app started; `None` when attached to an existing server.
    child: Option<CommandChild>,
    status: Status,
    log: VecDeque<String>,
    /// Vault folder reported by the running server's `/api/health`.
    vault: Option<String>,
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
    let needs_vault = matches!(phase, Phase::Error) && server.log.iter().any(|line| line.contains("Vault not found"));
    server.status = Status { phase, message: message.into(), log: server.log.iter().cloned().collect(), url, needs_vault };
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

/// Put the sidecar in a job object that Windows closes when this process dies, so
/// even a killed or crashed app never leaves an orphan server holding the port.
#[cfg(windows)]
fn tie_to_app_lifetime(pid: u32) {
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    // One job for the app's lifetime; its handle is intentionally never closed.
    static JOB: OnceLock<usize> = OnceLock::new();
    let job = *JOB.get_or_init(|| unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return 0;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            CloseHandle(job);
            return 0;
        }
        job as usize
    });
    if job == 0 {
        return;
    }
    unsafe {
        let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if !process.is_null() {
            AssignProcessToJobObject(job as HANDLE, process);
            CloseHandle(process);
        }
    }
}

/// Elsewhere a killed app can leave the server running; the next launch attaches to it.
#[cfg(not(windows))]
fn tie_to_app_lifetime(_pid: u32) {}

fn remember_vault(app: &AppHandle, health: &serde_json::Value) {
    let vault = health.get("vault").and_then(|v| v.as_str()).map(str::to_owned);
    app.state::<ServerState>().0.lock().unwrap().vault = vault;
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

    if let Some(health) = basics_health(DEFAULT_PORT) {
        remember_vault(&app, &health);
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
    tie_to_app_lifetime(child.pid());
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
        if let Some(health) = basics_health(port) {
            remember_vault(&app, &health);
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

/// First run: pick (or create) a vault folder, run `basics init` there, then start.
#[tauri::command]
async fn choose_vault(app: AppHandle) -> Result<bool, String> {
    let Some(picked) = app.dialog().file().set_title("Choose a folder for your Basics vault").blocking_pick_folder() else {
        return Ok(false);
    };
    let dir = picked.into_path().map_err(|err| err.to_string())?;
    let resources = app.path().resource_dir().map_err(|err| err.to_string())?;
    let cli = plain_path(resources).join("basics").join("dist").join("cli.js");
    let output = app
        .shell()
        .sidecar("node")
        .map_err(|err| err.to_string())?
        .args([cli.to_string_lossy().into_owned(), "init".into(), plain_path(dir).to_string_lossy().into_owned(), "--packs".into(), "none".into()])
        .output()
        .await
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "basics init failed".into() } else { stderr });
    }
    retry_startup(app);
    Ok(true)
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost")),
        _ => false,
    }
}

fn open_external(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

fn build_main_window(app: &AppHandle) -> tauri::Result<()> {
    let nav_app = app.clone();
    let popup_app = app.clone();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("loading.html".into()))
        .title("Basics")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .center()
        // Links that leave the local server open in the system browser.
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            open_external(&nav_app, url);
            false
        })
        .on_new_window(move |url, _features| {
            if is_app_url(&url) {
                if let Some(window) = popup_app.get_webview_window("main") {
                    let _ = window.navigate(url);
                }
            } else {
                open_external(&popup_app, &url);
            }
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let open = MenuItem::with_id(app, "open", "Open Basics", true, None::<&str>)?;
    let copy_mcp = MenuItem::with_id(app, "copy-mcp", "Copy MCP URL", true, None::<&str>)?;
    let vault = MenuItem::with_id(app, "open-vault", "Open vault folder", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start at login", true, autostart_on, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", "Check for updates", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Basics", true, None::<&str>)?;
    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &copy_mcp, &vault, &separator_a, &autostart, &updates, &separator_b, &quit])?;

    let autostart_item = autostart.clone();
    let mut tray = TrayIconBuilder::with_id("main").tooltip("Basics").menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(move |app, event| match event.id().as_ref() {
        "open" => show_main(app),
        "copy-mcp" => {
            let url = app.state::<ServerState>().0.lock().unwrap().status.url.clone();
            if let Some(url) = url {
                let _ = app.clipboard().write_text(format!("{url}/mcp"));
            }
        }
        "open-vault" => {
            let vault = app.state::<ServerState>().0.lock().unwrap().vault.clone();
            if let Some(vault) = vault {
                let _ = app.opener().open_path(vault, None::<&str>);
            }
        }
        "autostart" => {
            let launcher = app.autolaunch();
            let enable = !launcher.is_enabled().unwrap_or(false);
            let _ = if enable { launcher.enable() } else { launcher.disable() };
            let _ = autostart_item.set_checked(launcher.is_enabled().unwrap_or(enable));
        }
        "updates" => {
            let _ = app.opener().open_url(RELEASES_URL, None::<&str>);
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Registered first: a second launch only focuses the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(ServerState(Mutex::new(Server::default())))
        .invoke_handler(tauri::generate_handler![startup_status, retry_startup, choose_vault])
        .setup(|app| {
            let handle = app.handle().clone();
            build_main_window(&handle)?;
            build_tray(&handle)?;
            std::thread::spawn(move || start(handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides the window; the server keeps serving MCP until Quit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Basics desktop app");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_sidecar(app);
        }
    });
}
