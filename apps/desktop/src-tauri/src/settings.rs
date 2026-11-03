//! Desktop-only preferences: how a launch starts and what closing the window does.
//!
//! These belong to the app, not to the notes, so they live in a small JSON file in the
//! app config dir (`desktop-settings.json`) and are read once at startup. The Settings
//! page talks to them through `get_desktop_settings` / `set_desktop_settings`.
//!
//! Parsing is strict: unknown fields and unknown values are rejected, so a typo in the
//! page can never silently change what the app does. Reading falls back to the defaults
//! on a missing or corrupt file; writing reports the error to the page.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Passed to the app by the login item; only a launch at sign-in carries it.
pub const MINIMIZED_ARG: &str = "--minimized";
pub const FILE_NAME: &str = "desktop-settings.json";

/// "Start minimized to the tray" for a launch at sign-in only, on every launch, or never.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartMinimized {
    #[default]
    Never,
    Login,
    Always,
}

/// What the window's close button does.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    /// Keep the server (and MCP) running with only the tray icon left. Today's behaviour.
    #[default]
    Tray,
    Quit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct DesktopSettings {
    /// Mirror of the operating system's login item; the live value wins on read.
    pub start_at_login: bool,
    pub start_minimized: StartMinimized,
    pub close_behavior: CloseBehavior,
    /// Check the update server once per launch. Missing in older settings files, which
    /// means "on": an installed app should notice new versions without being told.
    pub check_updates_on_start: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            start_at_login: false,
            start_minimized: StartMinimized::default(),
            close_behavior: CloseBehavior::default(),
            check_updates_on_start: true,
        }
    }
}

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

/// Strict parse, used by the `set` command so bad input never reaches the disk.
pub fn parse(text: &str) -> Result<DesktopSettings, serde_json::Error> {
    serde_json::from_str(text)
}

/// Tolerant read: a missing, unreadable or corrupt file simply means "defaults".
pub fn load(dir: &Path) -> DesktopSettings {
    std::fs::read_to_string(path_in(dir))
        .ok()
        .and_then(|text| parse(&text).ok())
        .unwrap_or_default()
}

/// Write through a temporary file, so a crash never leaves half a settings file.
pub fn save(dir: &Path, settings: &DesktopSettings) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|err| format!("cannot create {}: {err}", dir.display()))?;
    let path = path_in(dir);
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    std::fs::write(&tmp, format!("{json}\n")).map_err(|err| format!("cannot write {}: {err}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|err| format!("cannot replace {}: {err}", path.display()))
}

/// True when the login item started this process.
pub fn launched_at_login<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter().any(|arg| arg == MINIMIZED_ARG)
}

/// True when this launch keeps the window hidden. `at_login` is only true for a launch
/// from the login item, so `Login` hides there and `Always` hides on every launch.
pub fn start_hidden(settings: &DesktopSettings, at_login: bool) -> bool {
    match settings.start_minimized {
        StartMinimized::Never => false,
        StartMinimized::Login => at_login,
        StartMinimized::Always => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("basics-desktop-settings-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn defaults_are_never_and_tray() {
        let settings = DesktopSettings::default();
        assert!(!settings.start_at_login);
        assert_eq!(settings.start_minimized, StartMinimized::Never);
        assert_eq!(settings.close_behavior, CloseBehavior::Tray);
        assert!(settings.check_updates_on_start);
    }

    #[test]
    fn serialises_with_snake_case_values() {
        let settings = DesktopSettings {
            start_at_login: true,
            start_minimized: StartMinimized::Always,
            close_behavior: CloseBehavior::Quit,
            check_updates_on_start: false,
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains(r#""start_at_login":true"#));
        assert!(json.contains(r#""start_minimized":"always""#));
        assert!(json.contains(r#""close_behavior":"quit""#));
        assert!(json.contains(r#""check_updates_on_start":false"#));
        assert_eq!(parse(&json).unwrap(), settings);
    }

    #[test]
    fn every_enum_value_round_trips() {
        for value in [StartMinimized::Never, StartMinimized::Login, StartMinimized::Always] {
            let json = format!(r#"{{"start_minimized":"{}"}}"#, serde_json::to_value(value).unwrap().as_str().unwrap());
            assert_eq!(parse(&json).unwrap().start_minimized, value);
        }
        for value in [CloseBehavior::Tray, CloseBehavior::Quit] {
            let json = format!(r#"{{"close_behavior":"{}"}}"#, serde_json::to_value(value).unwrap().as_str().unwrap());
            assert_eq!(parse(&json).unwrap().close_behavior, value);
        }
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let settings = parse(r#"{"close_behavior":"quit"}"#).unwrap();
        assert!(!settings.start_at_login);
        assert_eq!(settings.start_minimized, StartMinimized::Never);
        assert_eq!(settings.close_behavior, CloseBehavior::Quit);
        assert!(settings.check_updates_on_start);
        assert_eq!(parse("{}").unwrap(), DesktopSettings::default());
    }

    #[test]
    fn a_file_from_before_the_updates_setting_checks_on_start() {
        // Settings written by 1.4.2 have no `check_updates_on_start` key at all.
        let settings = parse(r#"{"start_at_login":true,"start_minimized":"login","close_behavior":"tray"}"#).unwrap();
        assert!(settings.check_updates_on_start);
        // An explicit "off" is kept.
        assert!(!parse(r#"{"check_updates_on_start":false}"#).unwrap().check_updates_on_start);
    }

    #[test]
    fn unknown_fields_are_rejected() {
        assert!(parse(r#"{"start_minimized":"login","launch_rockets":true}"#).is_err());
    }

    #[test]
    fn unknown_values_are_rejected() {
        assert!(parse(r#"{"start_minimized":"sometimes"}"#).is_err());
        assert!(parse(r#"{"close_behavior":"minimize"}"#).is_err());
        assert!(parse(r#"{"start_at_login":"yes"}"#).is_err());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = temp_dir("round-trip");
        let settings = DesktopSettings {
            start_at_login: true,
            start_minimized: StartMinimized::Login,
            close_behavior: CloseBehavior::Quit,
            check_updates_on_start: false,
        };
        save(&dir, &settings).unwrap();
        assert!(path_in(&dir).exists());
        assert_eq!(load(&dir), settings);
        // No temporary file is left behind.
        assert!(!path_in(&dir).with_extension("json.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_or_corrupt_file_reads_as_defaults() {
        let dir = temp_dir("corrupt");
        assert_eq!(load(&dir), DesktopSettings::default());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(path_in(&dir), "{ not json").unwrap();
        assert_eq!(load(&dir), DesktopSettings::default());
        std::fs::write(path_in(&dir), r#"{"start_minimized":"nope"}"#).unwrap();
        assert_eq!(load(&dir), DesktopSettings::default());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_from_an_older_version_keeps_its_values() {
        let dir = temp_dir("older");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(path_in(&dir), r#"{"start_minimized":"always"}"#).unwrap();
        let settings = load(&dir);
        assert_eq!(settings.start_minimized, StartMinimized::Always);
        assert_eq!(settings.close_behavior, CloseBehavior::Tray);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn login_flag_is_detected_among_other_arguments() {
        let args = ["C:\\Basics\\Basics.exe", "--minimized"].map(str::to_owned);
        assert!(launched_at_login(args));
        assert!(!launched_at_login(["C:\\Basics\\Basics.exe"].map(str::to_owned)));
        assert!(!launched_at_login(["--minimized-later"].map(str::to_owned)));
    }

    #[test]
    fn start_hidden_follows_the_setting_and_the_launch() {
        let mut settings = DesktopSettings::default();
        assert!(!start_hidden(&settings, true));
        assert!(!start_hidden(&settings, false));

        settings.start_minimized = StartMinimized::Login;
        assert!(start_hidden(&settings, true));
        assert!(!start_hidden(&settings, false));

        settings.start_minimized = StartMinimized::Always;
        assert!(start_hidden(&settings, true));
        assert!(start_hidden(&settings, false));
    }
}
