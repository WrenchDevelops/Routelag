// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Always keep a console attached in debug so real startup errors are visible.
    #[cfg(debug_assertions)]
    {
        eprintln!(
            "RouteLag debug boot — crash logs: %LOCALAPPDATA%\\RouteLag\\logs\\startup-crash.log"
        );
    }

    install_startup_panic_hook();
    routelag_desktop_lib::run();
}

fn install_startup_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|loc| format!("{}:{}", loc.file(), loc.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let message = if let Some(text) = info.payload().downcast_ref::<&str>() {
            *text
        } else if let Some(text) = info.payload().downcast_ref::<String>() {
            text.as_str()
        } else {
            "unknown panic payload"
        };
        let cwd = std::env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|error| format!("unavailable ({error})"));
        let exe = std::env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|error| format!("unavailable ({error})"));
        let backtrace = std::backtrace::Backtrace::force_capture();
        routelag_desktop_lib::write_startup_crash_log(&format!(
            "panic\nversion={}\nlocation={location}\nmessage={message}\ncurrent_dir={cwd}\nexe={exe}\nbacktrace:\n{backtrace}\n",
            env!("CARGO_PKG_VERSION")
        ));
    }));
}
