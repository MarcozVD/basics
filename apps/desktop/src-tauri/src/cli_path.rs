//! Puts a `basics` command on the user's PATH.
//!
//! The installed app bundles its own Node and CLI, so nothing in the installer puts
//! `basics` on the PATH the way `npm i -g` does. On first launch the app asks once; if
//! the answer is yes it writes a tiny launcher (`basics.cmd` / `basics`) that runs the
//! bundled Node on the bundled `cli.js`, and adds the launcher's folder to the PATH:
//!
//! - Windows: the *user* PATH in `HKCU\Environment` (no admin rights), then a
//!   `WM_SETTINGCHANGE` broadcast so new terminals see it.
//! - macOS / Linux: the launcher goes to `~/.local/bin`. Shell profiles are never edited;
//!   if that folder is not on the PATH yet the app says so.
//!
//! The answer is kept in a marker file in the app config dir (`cli-path.json`), not in
//! `desktop-settings.json`, whose strict parser the Settings page shares. When the answer
//! is yes the launcher is rewritten on every start, because an update can move the app.

use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "cli-path.json";

/// The commands the app provides, with the script each one runs inside the bundled `basics/` folder.
pub const COMMANDS: [(&str, &str); 2] = [("basics", "dist/cli.js"), ("basics-mcp", "dist/mcp/server.js")];

/// File name of the launcher for `command`.
pub fn shim_file(command: &str) -> String {
    if cfg!(windows) {
        format!("{command}.cmd")
    } else {
        command.to_string()
    }
}

#[cfg(windows)]
const SEP: char = ';';
#[cfg(not(windows))]
const SEP: char = ':';

/// What the person answered the first-run question with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Answer {
    Yes,
    No,
}

pub fn answer_path(config_dir: &Path) -> PathBuf {
    config_dir.join(FILE_NAME)
}

/// `None` means "never asked".
pub fn load_answer(config_dir: &Path) -> Option<Answer> {
    let text = std::fs::read_to_string(answer_path(config_dir)).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    match json.get("add_to_path")?.as_bool()? {
        true => Some(Answer::Yes),
        false => Some(Answer::No),
    }
}

pub fn save_answer(config_dir: &Path, answer: Answer) -> Result<(), String> {
    std::fs::create_dir_all(config_dir).map_err(|err| format!("cannot create {}: {err}", config_dir.display()))?;
    let path = answer_path(config_dir);
    let json = serde_json::json!({ "add_to_path": answer == Answer::Yes });
    std::fs::write(&path, format!("{json}\n")).map_err(|err| format!("cannot write {}: {err}", path.display()))
}

/// The launcher's text: run `node <script>` with every argument passed through.
pub fn shim_text(node: &Path, script: &Path) -> String {
    #[cfg(windows)]
    {
        format!("@echo off\r\n\"{}\" \"{}\" %*\r\n", node.display(), script.display())
    }
    #[cfg(not(windows))]
    {
        format!("#!/bin/sh\nexec '{}' '{}' \"$@\"\n", node.display(), script.display())
    }
}

pub fn write_shim(dir: &Path, command: &str, node: &Path, script: &Path) -> Result<PathBuf, String> {
    if !node.exists() {
        return Err(format!("the bundled Node runtime is missing: {}", node.display()));
    }
    if !script.exists() {
        return Err(format!("the bundled {command} script is missing: {}", script.display()));
    }
    std::fs::create_dir_all(dir).map_err(|err| format!("cannot create {}: {err}", dir.display()))?;
    let path = dir.join(shim_file(command));
    std::fs::write(&path, shim_text(node, script)).map_err(|err| format!("cannot write {}: {err}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .map_err(|err| format!("cannot make {} executable: {err}", path.display()))?;
    }
    Ok(path)
}

fn same_entry(a: &str, b: &str) -> bool {
    let trim = |s: &str| s.trim().trim_end_matches(['\\', '/']).to_string();
    #[cfg(windows)]
    {
        trim(a).eq_ignore_ascii_case(&trim(b))
    }
    #[cfg(not(windows))]
    {
        trim(a) == trim(b)
    }
}

/// True when `dir` is already one of the entries of `path_value`.
pub fn path_contains(path_value: &str, dir: &str) -> bool {
    path_value.split(SEP).any(|entry| !entry.trim().is_empty() && same_entry(entry, dir))
}

/// `path_value` with `dir` appended, or `None` when it is already there.
pub fn path_with(path_value: &str, dir: &str) -> Option<String> {
    if path_contains(path_value, dir) {
        return None;
    }
    let base = path_value.trim_end_matches(SEP);
    Some(if base.is_empty() { dir.to_string() } else { format!("{base}{SEP}{dir}") })
}

/// True when some folder of the current PATH already has a `basics` command (an npm
/// install, for example), so the app does not shadow or duplicate it.
pub fn command_on_path(path_value: &str) -> bool {
    let names: &[&str] = if cfg!(windows) { &["basics.cmd", "basics.exe", "basics.ps1", "basics.bat"] } else { &["basics"] };
    path_value
        .split(SEP)
        .filter(|entry| !entry.trim().is_empty())
        .any(|entry| names.iter().any(|name| Path::new(entry).join(name).is_file()))
}

/// Write every launcher; returns the first one (they share a folder).
pub fn write_all(dir: &Path, node: &Path, bundle: &Path) -> Result<PathBuf, String> {
    let mut first = None;
    for (command, script) in COMMANDS {
        let shim = write_shim(dir, command, node, &bundle.join(script))?;
        first.get_or_insert(shim);
    }
    first.ok_or_else(|| "no commands to install".to_string())
}

/// Folder the launcher lives in.
pub fn shim_dir(local_data_dir: &Path, home: Option<&Path>) -> PathBuf {
    #[cfg(windows)]
    {
        let _ = home;
        local_data_dir.join("bin")
    }
    #[cfg(not(windows))]
    {
        let _ = local_data_dir;
        home.map(|home| home.join(".local").join("bin")).unwrap_or_else(|| PathBuf::from(".local/bin"))
    }
}

/// What `add_to_path` did, in words for the dialog.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The folder was added to the user PATH; new terminals pick it up.
    Added(PathBuf),
    /// The folder was already on the PATH.
    AlreadyThere(PathBuf),
    /// Unix only: launcher written but its folder is not on the PATH.
    #[cfg_attr(windows, allow(dead_code))]
    NeedsManualPath(PathBuf),
}

/// Put the launcher's folder on the PATH (Windows) or report whether it already is (Unix).
pub fn add_to_path(shim: &Path) -> Result<Outcome, String> {
    let dir = shim.parent().ok_or("the launcher has no folder")?.to_path_buf();
    let dir_text = dir.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        let current = os::read_user_path()?;
        match path_with(&current, &dir_text) {
            None => Ok(Outcome::AlreadyThere(dir)),
            Some(updated) => {
                os::write_user_path(&updated)?;
                Ok(Outcome::Added(dir))
            }
        }
    }
    #[cfg(not(windows))]
    {
        let current = std::env::var("PATH").unwrap_or_default();
        if path_contains(&current, &dir_text) {
            Ok(Outcome::AlreadyThere(dir))
        } else {
            Ok(Outcome::NeedsManualPath(dir))
        }
    }
}

#[cfg(windows)]
mod os {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_EXPAND_SZ};
    use winreg::{RegKey, RegValue};
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    /// The user's own PATH (not the machine one), unexpanded.
    pub fn read_user_path() -> Result<String, String> {
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags("Environment", KEY_READ)
            .map_err(|err| format!("cannot read the user environment: {err}"))?;
        Ok(key.get_value::<String, _>("Path").unwrap_or_default())
    }

    /// Stored as REG_EXPAND_SZ so `%VARS%` already in the value keep working.
    pub fn write_user_path(value: &str) -> Result<(), String> {
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags("Environment", KEY_SET_VALUE)
            .map_err(|err| format!("cannot change the user environment: {err}"))?;
        let bytes: Vec<u8> = value.encode_utf16().chain(std::iter::once(0)).flat_map(|unit| unit.to_le_bytes()).collect();
        key.set_raw_value("Path", &RegValue { bytes, vtype: REG_EXPAND_SZ })
            .map_err(|err| format!("cannot save the user PATH: {err}"))?;
        broadcast_change();
        Ok(())
    }

    /// Tell running programs (Explorer, so new terminals) that the environment changed.
    fn broadcast_change() {
        let name: Vec<u16> = "Environment".encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, name.as_ptr() as LPARAM, SMTO_ABORTIFHUNG, 2000, std::ptr::null_mut());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("basics-cli-path-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn path_with_appends_once() {
        let first = path_with(&format!("a{SEP}b"), "c").unwrap();
        assert_eq!(first, format!("a{SEP}b{SEP}c"));
        assert_eq!(path_with(&first, "c"), None);
    }

    #[test]
    fn path_with_handles_empty_and_trailing_separator() {
        assert_eq!(path_with("", "c").unwrap(), "c");
        assert_eq!(path_with(&format!("a{SEP}"), "c").unwrap(), format!("a{SEP}c"));
    }

    #[test]
    fn trailing_slash_does_not_hide_an_existing_entry() {
        assert!(path_contains(&format!("a{SEP}c/"), "c"));
        assert!(!path_contains(&format!("a{SEP}cc"), "c"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths_compare_without_case() {
        assert!(path_contains(r"C:\Users\Me\AppData\Local\bin;D:\x", r"c:\users\me\appdata\local\BIN\"));
    }

    #[test]
    fn answer_round_trips_and_missing_means_never_asked() {
        let dir = temp_dir("answer");
        assert_eq!(load_answer(&dir), None);
        save_answer(&dir, Answer::Yes).unwrap();
        assert_eq!(load_answer(&dir), Some(Answer::Yes));
        save_answer(&dir, Answer::No).unwrap();
        assert_eq!(load_answer(&dir), Some(Answer::No));
        std::fs::write(answer_path(&dir), "{ not json").unwrap();
        assert_eq!(load_answer(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn shim_runs_node_on_the_cli_with_all_arguments() {
        let text = shim_text(Path::new("/app/node"), Path::new("/app/basics/dist/cli.js"));
        assert!(text.contains("node"));
        assert!(text.contains("cli.js"));
        #[cfg(windows)]
        assert!(text.contains("%*"));
        #[cfg(not(windows))]
        assert!(text.contains("\"$@\""));
    }

    #[test]
    fn write_shim_refuses_a_missing_runtime() {
        let dir = temp_dir("shim-missing");
        assert!(write_shim(&dir, "basics", &dir.join("node"), &dir.join("cli.js")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_shim_creates_the_launcher() {
        let dir = temp_dir("shim-ok");
        std::fs::create_dir_all(&dir).unwrap();
        let node = dir.join("node");
        std::fs::write(&node, "").unwrap();
        for (_, script) in COMMANDS {
            let path = dir.join(script);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "").unwrap();
        }
        let bin = dir.join("bin");
        let first = write_all(&bin, &node, &dir).unwrap();
        assert_eq!(first.file_name().unwrap().to_string_lossy(), shim_file("basics"));
        assert!(std::fs::read_to_string(&first).unwrap().contains("cli.js"));
        let mcp = bin.join(shim_file("basics-mcp"));
        assert!(std::fs::read_to_string(mcp).unwrap().contains("server.js"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn command_on_path_finds_an_existing_basics() {
        let dir = temp_dir("on-path");
        std::fs::create_dir_all(&dir).unwrap();
        let value = dir.to_string_lossy().into_owned();
        assert!(!command_on_path(&value));
        std::fs::write(dir.join(shim_file("basics")), "").unwrap();
        assert!(command_on_path(&value));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
