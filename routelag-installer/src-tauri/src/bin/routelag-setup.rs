// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "embed-uninstaller")]
static UNINSTALLER_BYTES: &[u8] = include_bytes!("../../target/release/routelag-uninstall.exe");
#[cfg(not(feature = "embed-uninstaller"))]
static UNINSTALLER_BYTES: &[u8] = &[];

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--elevated-worker") {
        let job_file = match args.get(pos + 1) {
            Some(path) => path.clone(),
            None => std::process::exit(1),
        };
        std::process::exit(routelag_installer_lib::run_elevated_worker(
            &job_file,
            UNINSTALLER_BYTES,
        ));
    }

    routelag_installer_lib::run_ui();
}
