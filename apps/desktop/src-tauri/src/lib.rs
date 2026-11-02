//! Basics desktop shell.
//!
//! The app does not ship its own UI: it starts the same `cli.js ui` server the npm
//! package runs (with a bundled Node binary as a Tauri sidecar) and points the
//! window at it. If a Basics server already answers on the default port, the app
//! attaches to it instead and never stops it.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
#[cfg(not(target_os = "linux"))]
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

mod settings;

use settings::{CloseBehavior, DesktopSettings};

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

/// The server this app started, so it can be stopped on quit. Linux spawns Node
/// itself (to set `PR_SET_PDEATHSIG`) and only keeps its pid; elsewhere the
/// process comes from tauri-plugin-shell.
enum Sidecar {
    #[cfg(not(target_os = "linux"))]
    Shell(CommandChild),
    #[cfg(target_os = "linux")]
    Pid(u32),
}

impl Sidecar {
    fn pid(&self) -> u32 {
        match self {
            #[cfg(not(target_os = "linux"))]
            Sidecar::Shell(child) => child.pid(),
            #[cfg(target_os = "linux")]
            Sidecar::Pid(pid) => *pid,
        }
    }

    fn stop(self) {
        match self {
            #[cfg(not(target_os = "linux"))]
            Sidecar::Shell(child) => {
                let _ = child.kill();
            }
            #[cfg(target_os = "linux")]
            Sidecar::Pid(pid) => unsafe {
                libc::kill(pid as libc::pid_t, libc::SIGKILL);
            },
        }
    }
}

#[derive(Default)]
struct Server {
    /// The sidecar this app started; `None` when attached to an existing server.
    child: Option<Sidecar>,
    status: Status,
    log: VecDeque<String>,
    /// Vault folder reported by the running server's `/api/health`.
    vault: Option<String>,
}

struct ServerState(Mutex<Server>);

/// Desktop settings as read at startup; the Settings page edits them through the two
/// `*_desktop_settings` commands. Kept in memory so the close handler never hits the disk.
struct Prefs(Mutex<DesktopSettings>);

/// The tray's "Start at login" checkbox, so the page and the tray stay in sync.
struct TrayMenu(Mutex<Option<CheckMenuItem<tauri::Wry>>>);

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("cannot locate the app config folder: {err}"))
}

fn autostart_enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

fn set_tray_autostart(app: &AppHandle, enabled: bool) {
    if let Some(item) = app.state::<TrayMenu>().0.lock().unwrap().as_ref() {
        let _ = item.set_checked(enabled);
    }
}

/// Store `start_at_login` after the tray checkbox changed, leaving the other settings
/// alone. A failed write is not worth a dialog: the login item itself already changed.
fn remember_start_at_login(app: &AppHandle, enabled: bool) {
    let state = app.state::<Prefs>();
    let mut prefs = state.0.lock().unwrap();
    if prefs.start_at_login == enabled {
        return;
    }
    prefs.start_at_login = enabled;
    let snapshot = prefs.clone();
    drop(prefs);
    if let Ok(dir) = config_dir(app) {
        let _ = settings::save(&dir, &snapshot);
    }
}

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

/// Linux is handled by `PR_SET_PDEATHSIG` where the sidecar is spawned; macOS has no
/// cheap equivalent, so a killed app can leave the server running and the next launch
/// attaches to it.
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
        child.stop();
    }
}

fn open_in_window(app: &AppHandle, url: &str) {
    if let (Some(window), Ok(parsed)) = (app.get_webview_window("main"), url.parse()) {
        let _ = window.navigate(parsed);
    }
}

/// Spawn the bundled `cli.js ui` server and stream its output to the log.
#[cfg(not(target_os = "linux"))]
fn start_server(app: &AppHandle, cli: &std::path::Path, port: u16) -> Result<Sidecar, String> {
    let command = app.shell().sidecar("node").map_err(|err| format!("the bundled Node runtime is missing: {err}"))?.args([
        cli.to_string_lossy().into_owned(),
        "ui".into(),
        "--no-open".into(),
        "--port".into(),
        port.to_string(),
    ]);
    let (mut events, child) = command.spawn().map_err(|err| format!("could not start the server: {err}"))?;

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

    Ok(Sidecar::Shell(child))
}

/// On Linux the server is spawned directly so the child can be tied to this process's
/// lifetime with `PR_SET_PDEATHSIG`: the kernel then sends it `SIGTERM` the moment the
/// app dies, even on `SIGKILL`, so a killed or crashed app never leaves an orphan server
/// holding the port. tauri-plugin-shell spawns without a `pre_exec` hook, so we take its
/// resolved sidecar path (via `Into<StdCommand>`) and keep the same stdout/stderr capture.
#[cfg(target_os = "linux")]
fn start_server(app: &AppHandle, cli: &std::path::Path, port: u16) -> Result<Sidecar, String> {
    use std::os::unix::process::CommandExt;
    use std::process::Stdio;

    let mut command: std::process::Command = app.shell().sidecar("node").map_err(|err| format!("the bundled Node runtime is missing: {err}"))?.into();
    let port_arg = port.to_string();
    command
        .arg(cli)
        .args(["ui", "--no-open", "--port"])
        .arg(&port_arg)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    unsafe {
        command.pre_exec(|| {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let log_app = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    // The thread that forks Node must outlive it: PR_SET_PDEATHSIG fires when the forking
    // *thread* ends, and we want that to mean "the app process ended". Blocking on `wait()`
    // keeps this thread alive for exactly as long as the server runs.
    std::thread::spawn(move || {
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                let _ = tx.send(Err(format!("could not start the server: {err}")));
                return;
            }
        };
        let _ = tx.send(Ok(child.id()));
        let stdout = child.stdout.take().map(|out| log_pipe(out, log_app.clone()));
        let stderr = child.stderr.take().map(|err| log_pipe(err, log_app.clone()));
        match child.wait() {
            Ok(status) => push_log(&log_app, format!("server exited (code {:?})", status.code())),
            Err(err) => push_log(&log_app, err.to_string()),
        }
        if let Some(handle) = stdout {
            let _ = handle.join();
        }
        if let Some(handle) = stderr {
            let _ = handle.join();
        }
        log_app.state::<ServerState>().0.lock().unwrap().child = None;
    });

    let pid = rx.recv().map_err(|err| err.to_string())??;
    Ok(Sidecar::Pid(pid))
}

/// Forward one of the server's output streams to the in-app log.
#[cfg(target_os = "linux")]
fn log_pipe<R: std::io::Read + Send + 'static>(stream: R, app: AppHandle) -> std::thread::JoinHandle<()> {
    use std::io::BufRead;

    std::thread::spawn(move || {
        for line in std::io::BufReader::new(stream).lines() {
            match line {
                Ok(line) => push_log(&app, line),
                Err(_) => break,
            }
        }
    })
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

    let sidecar = match start_server(&app, &cli, port) {
        Ok(sidecar) => sidecar,
        Err(err) => {
            set_status(&app, Phase::Error, err, None);
            return;
        }
    };
    tie_to_app_lifetime(sidecar.pid());
    app.state::<ServerState>().0.lock().unwrap().child = Some(sidecar);

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

/// The Settings page's Startup section. `start_at_login` always reports the real login
/// item, so the page and the tray checkbox cannot disagree.
#[tauri::command]
fn get_desktop_settings(app: AppHandle) -> DesktopSettings {
    let mut settings = app.state::<Prefs>().0.lock().unwrap().clone();
    settings.start_at_login = autostart_enabled(&app);
    settings
}

/// Save the Startup section and apply what has an immediate effect: the login item and
/// the tray checkbox. `start_minimized` and `close_behavior` are read by the next launch
/// (or by the close handler), so they need no extra wiring here.
#[tauri::command]
fn set_desktop_settings(app: AppHandle, settings: DesktopSettings) -> Result<DesktopSettings, String> {
    let launcher = app.autolaunch();
    let wanted = settings.start_at_login;
    if wanted != autostart_enabled(&app) {
        let result = if wanted { launcher.enable() } else { launcher.disable() };
        result.map_err(|err| format!("could not {} the login item: {err}", if wanted { "add" } else { "remove" }))?;
    }
    // Read the state back instead of trusting the request: the OS call is the truth.
    let mut saved = settings;
    saved.start_at_login = autostart_enabled(&app);
    settings::save(&config_dir(&app)?, &saved)?;
    *app.state::<Prefs>().0.lock().unwrap() = saved.clone();
    set_tray_autostart(&app, saved.start_at_login);
    Ok(saved)
}

/// Open the vault the running server uses in the system file manager. Deliberately takes
/// no argument: the page can never ask the app to open an arbitrary path.
#[tauri::command]
fn open_vault_folder(app: AppHandle) -> Result<(), String> {
    let vault = app.state::<ServerState>().0.lock().unwrap().vault.clone();
    let Some(vault) = vault else {
        return Err("Basics is not running yet.".into());
    };
    app.opener().open_path(vault, None::<&str>).map_err(|err| err.to_string())
}

#[tauri::command]
fn retry_startup(app: AppHandle) {
    stop_sidecar(&app);
    // Reset before the next poll so the page never re-reads the previous error.
    set_status(&app, Phase::Starting, "", None);
    std::thread::spawn(move || start(app));
}

/// First run and Settings → General → "Change folder": pick (or create) a vault folder,
/// run `basics init` there (which also records it as the configured vault), then restart
/// the server. Only a folder the person picked in the native dialog is ever written to.
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

/// Tray "Connect agents…": run the bundled `basics connect` so every detected coding agent
/// gets the MCP server (stdio through this app's Node, so it works while the app is closed)
/// and the Basics skill, for the vault the running server uses.
fn connect_agents(app: AppHandle) {
    let vault = app.state::<ServerState>().0.lock().unwrap().vault.clone();
    let Some(vault) = vault else {
        app.dialog()
            .message("Basics is not running yet. Choose or create a vault first, then try again.")
            .title("Connect agents")
            .kind(MessageDialogKind::Warning)
            .blocking_show();
        return;
    };
    let confirmed = app
        .dialog()
        .message(format!(
            "Register Basics with the coding agents found on this computer (Claude Code, OpenCode, Codex, Cursor, Claude Desktop) and install the Basics skill?

Vault: {vault}

Each changed config file is backed up once as <file>.basics-backup."
        ))
        .title("Connect agents")
        .buttons(MessageDialogButtons::OkCancelCustom("Connect".into(), "Cancel".into()))
        .blocking_show();
    if !confirmed {
        return;
    }
    let (kind, text) = match tauri::async_runtime::block_on(run_connect(&app, &vault)) {
        Ok(report) => (MessageDialogKind::Info, format!("{report}

Restart your agents to load Basics.")),
        Err(err) => (MessageDialogKind::Error, err),
    };
    app.dialog().message(text).title("Connect agents").kind(kind).blocking_show();
}

async fn run_connect(app: &AppHandle, vault: &str) -> Result<String, String> {
    let resources = app.path().resource_dir().map_err(|err| err.to_string())?;
    let cli = plain_path(resources).join("basics").join("dist").join("cli.js");
    let output = app
        .shell()
        .sidecar("node")
        .map_err(|err| err.to_string())?
        .args([cli.to_string_lossy().into_owned(), "--vault".into(), vault.to_owned(), "connect".into()])
        .output()
        .await
        .map_err(|err| err.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail: String = format!("{stdout}
{stderr}").trim().chars().take(2000).collect();
        return Err(if detail.is_empty() { "basics connect failed".into() } else { detail });
    }
    // The table is all a person needs; per-file diffs and paths stay in the CLI.
    Ok(stdout.lines().take_while(|line| !line.trim().is_empty()).collect::<Vec<_>>().join("
"))
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

fn build_main_window(app: &AppHandle, start_hidden: bool) -> tauri::Result<()> {
    let nav_app = app.clone();
    let popup_app = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("loading.html".into()))
        .title("Basics")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        // A launch at sign-in can hide the window; the tray icon still shows it.
        .visible(!start_hidden)
        // Ctrl +/-/0 and Ctrl+wheel must not zoom a desktop window (default true in wry).
        .zoom_hotkeys_enabled(false)
        .center();

    // The app draws its own title bar (the page header in the UI, a small bar on the
    // loading page), so Windows and Linux drop the native decorations entirely.
    //
    // Frameless still resizes by dragging edges and corners: for undecorated windows
    // Tauri keeps the native resize band (tao hit-tests it; `tauri-runtime-wry` also
    // overlays a `TAURI_DRAG_RESIZE_BORDERS` child for the top edge on Windows and a
    // 5px inset on Linux). That path needs the window to stay resizable, and on
    // Windows it lives in the shadow frame, so keep both options on unless explicit
    // resize handles are added.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.decorations(false).resizable(true).shadow(true);
    }
    // macOS keeps its own traffic lights, laid over the page header. The header
    // reserves 76px on the left for them (see `layout.tsx`).
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    }

    let window = builder
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

    disable_browser_accelerator_keys(&window);
    Ok(())
}

/// WebView2 handles a few keys itself (F5, Ctrl+P, Ctrl+F, Ctrl+Shift+I, zoom) before the
/// page can `preventDefault` them, so the UI's key filter alone cannot stop reload/print.
/// wry exposes this as `browser_accelerator_keys`, but tauri-runtime-wry does not plumb that
/// attribute through, so reach the WebView2 settings directly. Text keys (Ctrl+C/V/X/A/Z,
/// Home/End/PgUp/PgDn) keep working: only browser-specific accelerators are turned off.
///
/// Debug builds keep them on: F12/DevTools and F5 are development tools, and the page filter
/// still swallows everything it can see. Release builds are where "no browser" matters.
#[cfg(all(windows, not(debug_assertions)))]
fn disable_browser_accelerator_keys(window: &tauri::WebviewWindow) {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let apply = |webview: PlatformWebview| {
        let settings = (|| -> windows::core::Result<()> {
            let core = unsafe { webview.controller().CoreWebView2()? };
            let settings: ICoreWebView2Settings3 = unsafe { core.Settings()? }.cast()?;
            unsafe { settings.SetAreBrowserAcceleratorKeysEnabled(false.into()) }
        })();
        // Chrome-only window settings must never take the app down.
        if let Err(error) = settings {
            eprintln!("basics: could not disable WebView2 browser accelerator keys: {error}");
        }
    };

    if let Err(error) = window.with_webview(apply) {
        eprintln!("basics: could not reach the WebView2 webview: {error}");
    }
}

/// Everything that is not a Windows release build: other engines (wry maps
/// `zoom_hotkeys_enabled` for them) and debug builds, where F12/DevTools and F5 stay usable.
#[cfg(not(all(windows, not(debug_assertions))))]
fn disable_browser_accelerator_keys(_window: &tauri::WebviewWindow) {}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let open = MenuItem::with_id(app, "open", "Open Basics", true, None::<&str>)?;
    let copy_mcp = MenuItem::with_id(app, "copy-mcp", "Copy MCP URL", true, None::<&str>)?;
    let vault = MenuItem::with_id(app, "open-vault", "Open vault folder", true, None::<&str>)?;
    let connect = MenuItem::with_id(app, "connect", "Connect agents…", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start at login", true, autostart_on, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", "Check for updates", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Basics", true, None::<&str>)?;
    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&open, &copy_mcp, &vault, &connect, &settings_item, &separator_a, &autostart, &updates, &separator_b, &quit],
    )?;

    // Kept so the Settings page can tick the same checkbox.
    *app.state::<TrayMenu>().0.lock().unwrap() = Some(autostart.clone());
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
        "connect" => {
            // Dialogs block until answered, so keep them off the event loop.
            let app = app.clone();
            std::thread::spawn(move || connect_agents(app));
        }
        "settings" => {
            show_main(app);
            let url = app.state::<ServerState>().0.lock().unwrap().status.url.clone();
            if let Some(url) = url {
                open_in_window(app, &format!("{url}/settings"));
            }
        }
        "autostart" => {
            let launcher = app.autolaunch();
            let enable = !autostart_enabled(app);
            let changed = if enable { launcher.enable() } else { launcher.disable() };
            if changed.is_ok() {
                let enabled = autostart_enabled(app);
                let _ = autostart_item.set_checked(enabled);
                // Same setting as Settings → Startup, so keep the stored copy honest.
                remember_start_at_login(app, enabled);
            }
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
        // The login item always carries `--minimized`; whether that hides the window is
        // the `start_minimized` setting's decision, so it can change without re-registering.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![settings::MINIMIZED_ARG])))
        .manage(ServerState(Mutex::new(Server::default())))
        .manage(Prefs(Mutex::new(DesktopSettings::default())))
        .manage(TrayMenu(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            startup_status,
            retry_startup,
            choose_vault,
            open_vault_folder,
            get_desktop_settings,
            set_desktop_settings
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // Read the settings before the window exists: `start_minimized` decides
            // whether it is shown at all, and the close handler needs `close_behavior`.
            let prefs = config_dir(&handle).map(|dir| settings::load(&dir)).unwrap_or_default();
            let start_hidden = settings::start_hidden(&prefs, settings::launched_at_login(std::env::args()));
            *handle.state::<Prefs>().0.lock().unwrap() = prefs;
            build_main_window(&handle, start_hidden)?;
            build_tray(&handle)?;
            std::thread::spawn(move || start(handle));
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides the window by default, so the server keeps serving MCP until
            // Quit; "Quit Basics" in Settings → Startup makes the button quit instead.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let quit = window.app_handle().state::<Prefs>().0.lock().unwrap().close_behavior == CloseBehavior::Quit;
                    if quit {
                        api.prevent_close();
                        window.app_handle().exit(0);
                    } else {
                        api.prevent_close();
                        let _ = window.hide();
                    }
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
