use std::sync::Mutex;

use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub struct HudOverlayState {
    edit_mode: Mutex<bool>,
}

impl HudOverlayState {
    pub fn new() -> Self {
        Self {
            edit_mode: Mutex::new(false),
        }
    }
}

fn hud_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("hud-overlay")
}

pub fn is_hud_visible(app: &AppHandle) -> bool {
    hud_window(app)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// Create the transparent HUD overlay on demand. Avoid creating it at process
/// startup — a second transparent WebView2 instance is a common Windows crash source.
pub fn ensure_hud_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = hud_window(app) {
        return Ok(window);
    }

    crate::startup::write_startup_log("Creating HUD overlay window on demand");

    let window = WebviewWindowBuilder::new(
        app,
        "hud-overlay",
        WebviewUrl::App("index.html?overlay=1".into()),
    )
    .title("Zer0 HUD")
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .visible(false)
    .inner_size(1920.0, 1080.0)
    .build()
    .map_err(|error| {
        let message = format!("Failed to create HUD overlay window: {error}");
        crate::startup::write_startup_log(&message);
        message
    })?;

    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
    let _ = window.set_ignore_cursor_events(true);

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            on_hud_overlay_close(&app_handle);
            let _ = app_handle.emit("hud-overlay-closed", ());
        }
    });

    crate::startup::write_startup_log("HUD overlay window created");
    Ok(window)
}

fn refocus_main_window(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
}

pub fn apply_hud_edit_mode(app: &AppHandle, edit_mode: bool) -> Result<(), String> {
    let window = hud_window(app)
        .ok_or_else(|| "HUD overlay window is not open.".to_string())?;

    // Display mode: clicks pass through to other apps. Edit mode: capture mouse for dragging.
    window
        .set_ignore_cursor_events(!edit_mode)
        .map_err(|e| e.to_string())?;

    if edit_mode {
        let _ = window.set_focus();
    } else {
        refocus_main_window(app);
    }

    if let Some(state) = app.try_state::<HudOverlayState>() {
        if let Ok(mut guard) = state.edit_mode.lock() {
            *guard = edit_mode;
        }
    }

    app.emit("hud-overlay-edit-mode", edit_mode)
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn toggle_hud_edit_mode(app: &AppHandle) -> Result<bool, String> {
    if !is_hud_visible(app) {
        return Ok(false);
    }

    let next = app
        .try_state::<HudOverlayState>()
        .and_then(|state| {
            state.edit_mode.lock().ok().map(|mut guard| {
                *guard = !*guard;
                *guard
            })
        })
        .unwrap_or(false);

    apply_hud_edit_mode(app, next)?;
    Ok(next)
}

pub fn on_hud_overlay_open(app: &AppHandle) -> Result<(), String> {
    apply_hud_edit_mode(app, false)
}

pub fn on_hud_overlay_close(app: &AppHandle) {
    let _ = apply_hud_edit_mode(app, false);
}

#[tauri::command]
pub fn set_hud_overlay_edit_mode_cmd(app: AppHandle, edit_mode: bool) -> Result<(), String> {
    apply_hud_edit_mode(&app, edit_mode)
}

#[tauri::command]
pub fn toggle_hud_overlay_edit_mode_cmd(app: AppHandle) -> Result<bool, String> {
    toggle_hud_edit_mode(&app)
}
