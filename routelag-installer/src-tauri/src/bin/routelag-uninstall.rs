// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--elevated-worker") {
        let job_file = match args.get(pos + 1) {
            Some(path) => path.clone(),
            None => std::process::exit(1),
        };
        // The uninstaller never installs anything, so it has no uninstaller payload of its own.
        std::process::exit(routelag_installer_lib::run_elevated_worker(&job_file, &[]));
    }

    routelag_installer_lib::run_ui();
}
