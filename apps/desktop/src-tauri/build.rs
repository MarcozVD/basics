fn main() {
    // Declaring the app's own commands gives each of them an `allow-<command>` permission.
    // The page the app loads is served by the local Basics server, so Tauri treats it as a
    // remote origin and refuses every command unless a capability names it; this manifest
    // is what makes "grant only these four in the remote capability" possible.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "startup_status",
            "retry_startup",
            "choose_vault",
            "open_vault_folder",
            "get_desktop_settings",
            "set_desktop_settings",
            "check_update",
            "install_update",
            "desktop_version",
        ])),
    )
    .expect("failed to run tauri-build");
}
