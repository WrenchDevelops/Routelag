use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const HUD_BRIDGE_PORT: u16 = 17389;
pub const HUD_BRIDGE_URL: &str = "http://127.0.0.1:17389/hud/telemetry";

#[derive(Clone)]
pub struct HudBridgeState {
    app_data_dir: PathBuf,
    inner: Arc<Mutex<HudBridgeInner>>,
    shutdown: Arc<AtomicBool>,
}

#[derive(Default)]
struct HudBridgeInner {
    token: String,
    latest: Option<HudTelemetryMessage>,
    last_event_at: Option<u64>,
    event_count: u64,
    rejected_count: u64,
    rate_window_ms: u64,
    rate_count: u32,
    server_started: bool,
    server_error: Option<String>,
    overlay_show_requested: bool,
    overlay_hide_requested: bool,
    layout_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HudTelemetryMessage {
    pub source: String,
    pub game: String,
    #[serde(rename = "type")]
    pub message_type: HudTelemetryType,
    pub timestamp: u64,
    #[serde(default)]
    pub data: HudTelemetryData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HudTelemetryType {
    HudUpdate,
    MatchEvent,
    ConnectionStatus,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudTelemetryData {
    pub connected: Option<bool>,
    pub fortnite_detected: Option<bool>,
    pub match_active: Option<bool>,
    pub phase: Option<String>,
    pub ping: Option<u32>,
    pub health: Option<u32>,
    pub shield: Option<u32>,
    pub over_shield: Option<u32>,
    pub kills: Option<u32>,
    pub assists: Option<u32>,
    pub deaths: Option<u32>,
    pub damage_dealt: Option<u32>,
    pub damage_taken: Option<u32>,
    pub placement: Option<u32>,
    pub total_players: Option<u32>,
    pub total_teams: Option<u32>,
    pub match_mode: Option<String>,
    pub is_ranked: Option<bool>,
    pub build_mode: Option<String>,
    pub materials: Option<HudMaterials>,
    pub inventory: Option<serde_json::Value>,
    pub location: Option<serde_json::Value>,
    pub storm: Option<HudStorm>,
    pub fps: Option<u32>,
    pub last_update_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HudMaterials {
    pub wood: Option<u32>,
    pub stone: Option<u32>,
    pub metal: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HudStorm {
    pub current: Option<u32>,
    pub max: Option<u32>,
    pub damage: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudBridgeStatus {
    pub url: String,
    pub token: String,
    pub connected: bool,
    pub stale: bool,
    pub last_event_at: Option<u64>,
    pub event_count: u64,
    pub rejected_count: u64,
    pub server_started: bool,
    pub server_error: Option<String>,
    pub fortnite_detected: bool,
    pub match_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudTelemetrySnapshot {
    pub status: HudBridgeStatus,
    pub latest: Option<HudTelemetryMessage>,
}

impl HudBridgeState {
    pub fn new(app_data_dir: &Path) -> Self {
        let (token, token_error) = load_or_create_token(app_data_dir);
        Self {
            app_data_dir: app_data_dir.to_path_buf(),
            inner: Arc::new(Mutex::new(HudBridgeInner {
                token,
                server_error: token_error,
                layout_revision: 1,
                ..HudBridgeInner::default()
            })),
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn stop(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
        if let Ok(mut inner) = self.inner.lock() {
            inner.server_started = false;
        }
    }

    pub fn start(&self) {
        let state = self.clone();
        let shutdown = self.shutdown.clone();
        thread::spawn(move || {
            let listener = match TcpListener::bind(("127.0.0.1", HUD_BRIDGE_PORT)) {
                Ok(listener) => listener,
                Err(e) => {
                    if let Ok(mut inner) = state.inner.lock() {
                        inner.server_started = false;
                        inner.server_error = Some(e.to_string());
                    }
                    return;
                }
            };

            if let Err(e) = listener.set_nonblocking(true) {
                if let Ok(mut inner) = state.inner.lock() {
                    inner.server_started = false;
                    inner.server_error = Some(e.to_string());
                }
                return;
            }

            if let Ok(mut inner) = state.inner.lock() {
                inner.server_started = true;
                inner.server_error = None;
            }

            loop {
                if shutdown.load(Ordering::Relaxed) {
                    break;
                }

                match listener.accept() {
                    Ok((stream, _)) => handle_client(stream, &state),
                    Err(e) if e.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        if shutdown.load(Ordering::Relaxed) {
                            break;
                        }
                        if let Ok(mut inner) = state.inner.lock() {
                            inner.server_error = Some(e.to_string());
                        }
                        thread::sleep(Duration::from_millis(100));
                    }
                }
            }
        });
    }

    pub fn status(&self) -> HudBridgeStatus {
        let inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        status_from_inner(&inner)
    }

    pub fn snapshot(&self) -> HudTelemetrySnapshot {
        let inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        HudTelemetrySnapshot {
            status: status_from_inner(&inner),
            latest: inner.latest.clone(),
        }
    }

    pub fn bump_layout_revision(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.layout_revision = inner.layout_revision.saturating_add(1);
        }
    }

    pub fn request_overlay_show(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.overlay_show_requested = true;
            inner.overlay_hide_requested = false;
        }
    }

    pub fn request_overlay_hide(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.overlay_hide_requested = true;
            inner.overlay_show_requested = false;
        }
    }

    pub fn apply_demo_data(&self) {
        let now = now_ms();
        let message = HudTelemetryMessage {
            source: "routelag-demo-data".to_string(),
            game: "fortnite".to_string(),
            message_type: HudTelemetryType::HudUpdate,
            timestamp: now,
            data: HudTelemetryData {
                connected: Some(true),
                fortnite_detected: Some(true),
                match_active: Some(true),
                phase: Some("in_match".to_string()),
                ping: Some(23),
                health: Some(100),
                shield: Some(50),
                kills: Some(3),
                damage_dealt: Some(842),
                damage_taken: Some(156),
                placement: Some(12),
                match_mode: Some("solo".to_string()),
                materials: Some(HudMaterials {
                    wood: Some(420),
                    stone: Some(310),
                    metal: Some(190),
                }),
                storm: Some(HudStorm {
                    current: Some(1),
                    max: Some(9),
                    damage: Some(1),
                }),
                fps: Some(240),
                last_update_at: Some(now),
                ..HudTelemetryData::default()
            },
        };
        if let Ok(mut inner) = self.inner.lock() {
            inner.latest = Some(message);
            inner.last_event_at = Some(now);
            inner.event_count += 1;
        }
    }
}

fn handle_client(mut stream: TcpStream, state: &HudBridgeState) {
    let mut buffer = vec![0_u8; 64 * 1024];
    let read = match stream.read(&mut buffer) {
        Ok(read) => read,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..read]);
    let response = process_request(&request, state);
    let _ = stream.write_all(response.as_bytes());
}

fn process_request(request: &str, state: &HudBridgeState) -> String {
    let mut parts = request.split("\r\n\r\n");
    let headers = parts.next().unwrap_or("");
    let body = parts.next().unwrap_or("");
    let first_line = headers.lines().next().unwrap_or("");

    if first_line.starts_with("OPTIONS ") {
        return response(204, "No Content", "");
    }

    if first_line.starts_with("GET /hud/pair ") {
        let token = {
            let inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.token.clone()
        };
        let payload = serde_json::json!({
            "token": token,
            "telemetryUrl": HUD_BRIDGE_URL,
            "layoutUrl": "http://127.0.0.1:17389/hud/layout",
        });
        return response(200, "OK", &payload.to_string());
    }

    if first_line.starts_with("GET /hud/layout ") {
        let expected_token = {
            let inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.token.clone()
        };
        if !has_valid_token(headers, &expected_token) {
            reject(state);
            return response(401, "Unauthorized", "unauthorized");
        }
        let layout_raw = crate::hud_layout::read_hud_layout(&state.app_data_dir);
        let layout_value = serde_json::from_str::<serde_json::Value>(&layout_raw)
            .unwrap_or_else(|_| serde_json::json!([]));
        let payload = serde_json::json!({ "layout": layout_value });
        return response(200, "OK", &payload.to_string());
    }

    if first_line.starts_with("GET /hud/runtime ") {
        let expected_token = {
            let inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
            inner.token.clone()
        };
        if !has_valid_token(headers, &expected_token) {
            reject(state);
            return response(401, "Unauthorized", "unauthorized");
        }

        let layout_raw = crate::hud_layout::read_hud_layout(&state.app_data_dir);
        let layout_value = serde_json::from_str::<serde_json::Value>(&layout_raw)
            .unwrap_or_else(|_| serde_json::json!([]));

        let (overlay_show, overlay_hide, layout_revision) = {
            let mut inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
            let overlay_show = inner.overlay_show_requested;
            let overlay_hide = inner.overlay_hide_requested;
            let layout_revision = inner.layout_revision;
            inner.overlay_show_requested = false;
            inner.overlay_hide_requested = false;
            (overlay_show, overlay_hide, layout_revision)
        };

        let payload = serde_json::json!({
            "overlayShow": overlay_show,
            "overlayHide": overlay_hide,
            "layoutRevision": layout_revision,
            "layout": layout_value,
        });
        return response(200, "OK", &payload.to_string());
    }

    let is_telemetry_post = first_line.starts_with("POST /hud/telemetry ")
        || first_line.starts_with("POST /hud/event ");
    if !is_telemetry_post {
        return response(404, "Not Found", "not found");
    }

    let expected_token = {
        let inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
        inner.token.clone()
    };
    if !has_valid_token(headers, &expected_token) {
        reject(state);
        return response(401, "Unauthorized", "unauthorized");
    }

    if !allow_rate(state) {
        reject(state);
        return response(429, "Too Many Requests", "rate limited");
    }

    let message = match serde_json::from_str::<HudTelemetryMessage>(body.trim()) {
        Ok(message) => message,
        Err(_) => {
            reject(state);
            return response(400, "Bad Request", "invalid schema");
        }
    };

    if let Err(reason) = validate_message(&message) {
        reject(state);
        return response(400, "Bad Request", reason);
    }

    if let Ok(mut inner) = state.inner.lock() {
        inner.latest = Some(message);
        inner.last_event_at = Some(now_ms());
        inner.event_count += 1;
    }

    response(202, "Accepted", "{\"ok\":true}")
}

fn has_valid_token(headers: &str, expected: &str) -> bool {
    headers.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower == format!("x-routelag-hud-token: {}", expected).to_ascii_lowercase()
            || lower == format!("authorization: bearer {}", expected).to_ascii_lowercase()
    })
}

fn allow_rate(state: &HudBridgeState) -> bool {
    let now = now_ms();
    let mut inner = state.inner.lock().unwrap_or_else(|error| error.into_inner());
    if now.saturating_sub(inner.rate_window_ms) > 1000 {
        inner.rate_window_ms = now;
        inner.rate_count = 0;
    }
    inner.rate_count += 1;
    inner.rate_count <= 30
}

fn reject(state: &HudBridgeState) {
    if let Ok(mut inner) = state.inner.lock() {
        inner.rejected_count += 1;
    }
}

fn validate_message(message: &HudTelemetryMessage) -> Result<(), &'static str> {
    if message.source != "routelag-hud-companion" && message.source != "routelag-demo-data" {
        return Err("invalid source");
    }
    if message.game != "fortnite" {
        return Err("invalid game");
    }
    if message.timestamp == 0 {
        return Err("invalid timestamp");
    }
    Ok(())
}

fn response(status: u16, reason: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: authorization,x-routelag-hud-token,content-type\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
}

fn status_from_inner(inner: &HudBridgeInner) -> HudBridgeStatus {
    let now = now_ms();
    let stale = inner
        .last_event_at
        .map(|last| now.saturating_sub(last) > 5000)
        .unwrap_or(true);
    let data = inner.latest.as_ref().map(|message| &message.data);
    HudBridgeStatus {
        url: HUD_BRIDGE_URL.to_string(),
        token: inner.token.clone(),
        connected: inner.last_event_at.is_some() && !stale,
        stale,
        last_event_at: inner.last_event_at,
        event_count: inner.event_count,
        rejected_count: inner.rejected_count,
        server_started: inner.server_started,
        server_error: inner.server_error.clone(),
        fortnite_detected: data.and_then(|item| item.fortnite_detected).unwrap_or(false),
        match_active: data.and_then(|item| item.match_active).unwrap_or(false),
    }
}

fn load_or_create_token(app_data_dir: &Path) -> (String, Option<String>) {
    let path = app_data_dir.join("hud-bridge-token.txt");
    if let Ok(token) = fs::read_to_string(&path) {
        let trimmed = token.trim().to_string();
        if trimmed.len() >= 24 {
            return (trimmed, None);
        }
    }
    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
    let token_error = fs::write(&path, &token)
        .err()
        .map(|error| format!("HUD bridge token could not be persisted: {error}"));
    (token, token_error)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}
