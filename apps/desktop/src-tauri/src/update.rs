//! In-app updates.
//!
//! The Tauri updater plugin does the work: it fetches the release manifest, compares
//! versions, downloads the signed installer, verifies the signature against the public
//! key in `tauri.conf.json` and installs it. The page never talks to the plugin: the
//! remote loopback capability grants no `updater:*` permission at all, only the two app
//! commands in `lib.rs`, and neither of them takes a URL. So a compromised page can ask
//! "is there an update?" and "install the one you found", nothing else.
//!
//! This module holds the pure parts: the wire shapes, the plain-word error messages and
//! the config guards.

use serde::Serialize;

/// Progress events for the banner. `download` carries real bytes; `install` means the
/// verified installer is running and the app is about to exit.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum UpdateProgress {
    Download { downloaded: u64, total: Option<u64> },
    Install,
}

/// What `check_update` reports: `None` when the app is already current.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    /// Calendar date of the release (`YYYY-MM-DD`), straight from the manifest.
    pub date: Option<String>,
}

impl UpdateInfo {
    pub fn from_update(update: &tauri_plugin_updater::Update) -> Self {
        Self {
            version: update.version.clone(),
            notes: update.body.clone(),
            date: update.date.map(|date| date.date().to_string()),
        }
    }
}

/// Updater failures in words a person can act on. The raw error goes to the app log.
pub fn plain_error(error: &tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error;

    match error {
        Error::Network(_)
        | Error::Reqwest(_)
        | Error::Http(_)
        | Error::ReleaseNotFound
        | Error::TargetNotFound(_)
        | Error::TargetsNotFound(_)
        | Error::AuthenticationFailed => {
            "Basics could not reach the update server. Check your connection and try again.".into()
        }
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::MissingSignedVersion
        | Error::SignedVersionMismatch { .. }
        | Error::Serialization(_) => "The update could not be verified, so Basics did not install it.".into(),
        Error::InsecureTransportProtocol => {
            "The update address is not secure: Basics only installs updates over HTTPS.".into()
        }
        Error::PackageInstallFailed
        | Error::DebInstallFailed
        | Error::InvalidUpdaterFormat
        | Error::BinaryNotFoundInArchive => {
            "The update could not be installed. Try again, or download the new version from the releases page.".into()
        }
        _ => "The update failed. Try again, or download the new version from the releases page.".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The shipped configuration, checked as text: a test can never start the updater.
    const CONFIG: &str = include_str!("../tauri.conf.json");

    /// Reads the updater public key out of a `tauri.conf.json` document.
    fn updater_pubkey(config: &str) -> Option<String> {
        let value: serde_json::Value = serde_json::from_str(config).ok()?;
        Some(
            value
                .pointer("/plugins/updater/pubkey")?
                .as_str()?
                .to_owned(),
        )
    }

    /// Reads the configured update endpoints out of a `tauri.conf.json` document.
    fn updater_endpoints(config: &str) -> Option<Vec<String>> {
        let value: serde_json::Value = serde_json::from_str(config).ok()?;
        let endpoints = value.pointer("/plugins/updater/endpoints")?.as_array()?;
        Some(
            endpoints
                .iter()
                .filter_map(|endpoint| endpoint.as_str().map(str::to_owned))
                .collect(),
        )
    }

    #[test]
    fn the_endpoint_is_the_rolling_desktop_manifest() {
        assert_eq!(
            updater_endpoints(CONFIG).expect("plugins.updater.endpoints is a list of strings"),
            vec![
                "https://github.com/MarcozVD/basics/releases/download/desktop-updater/latest.json"
                    .to_owned()
            ]
        );
    }

    #[test]
    fn windows_installs_updates_passively() {
        let config: serde_json::Value = serde_json::from_str(CONFIG).unwrap();
        let mode = config
            .pointer("/plugins/updater/windows/installMode")
            .and_then(|value| value.as_str());
        assert_eq!(
            mode,
            Some("passive"),
            "the NSIS update must install without a wizard"
        );
    }

    #[test]
    fn the_config_ships_an_updater_public_key() {
        let key = updater_pubkey(CONFIG).expect("plugins.updater.pubkey must be a string");
        assert!(
            !key.trim().is_empty(),
            "plugins.updater.pubkey must not be empty"
        );
    }

    #[test]
    fn the_bundle_creates_updater_artifacts() {
        let config: serde_json::Value = serde_json::from_str(CONFIG).unwrap();
        assert_eq!(
            config.pointer("/bundle/createUpdaterArtifacts").and_then(|value| value.as_bool()),
            Some(true),
            "the release bundle must produce the .sig files the updater needs"
        );
    }

    #[test]
    fn progress_events_have_the_shape_the_page_reads() {
        let download = serde_json::to_value(UpdateProgress::Download {
            downloaded: 512,
            total: Some(2048),
        })
        .unwrap();
        assert_eq!(
            download,
            serde_json::json!({ "phase": "download", "downloaded": 512, "total": 2048 })
        );
        let install = serde_json::to_value(UpdateProgress::Install).unwrap();
        assert_eq!(install, serde_json::json!({ "phase": "install" }));
    }

    #[test]
    fn failures_are_explained_in_plain_words() {
        let offline = plain_error(&tauri_plugin_updater::Error::Network(
            "connection reset".into(),
        ));
        assert!(offline.contains("could not reach the update server"));
        let bad_signature = plain_error(&tauri_plugin_updater::Error::MissingSignedVersion);
        assert!(bad_signature.contains("could not be verified"));
    }
}
