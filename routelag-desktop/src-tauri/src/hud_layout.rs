use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::AppState;

const HUD_LAYOUT_FILENAME: &str = "hud-layout.json";

pub fn hud_layout_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(HUD_LAYOUT_FILENAME)
}

pub fn read_hud_layout(app_data_dir: &Path) -> String {
    fs::read_to_string(hud_layout_path(app_data_dir)).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
pub fn save_hud_layout_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    layout: String,
) -> Result<(), String> {
    fs::write(hud_layout_path(&state.app_data_dir), &layout)
        .map_err(|e| e.to_string())?;
    state.hud_bridge.bump_layout_revision();
    app.emit("hud-layout-changed", layout)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_hud_layout_cmd(state: State<'_, AppState>) -> String {
    read_hud_layout(&state.app_data_dir)
}
