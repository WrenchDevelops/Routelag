use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::network::get_public_ip;
use crate::network_diag::lightweight_ping_ok;
use crate::tunnel::{self, WireGuardStatus};

const HANDSHAKE_STALE_SECS: u64 = 180;
const FAIL_THRESHOLD: u32 = 3;

#[derive(Default)]
pub struct StabilityTracker {
    pub consecutive_failures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelHealth {
    pub status: String,
    pub service_running: bool,
    pub handshake_recent: bool,
    pub handshake_secs_ago: Option<u64>,
    pub ping_ok: bool,
    pub failed_checks: u32,
    pub reconnect_recommended: bool,
    pub public_ip_changed: Option<bool>,
    pub stuck_tunnel: bool,
    pub message: String,
}

fn is_valid_baseline_ip(ip: &str) -> bool {
    !ip.is_empty() && ip != "—" && ip != "Unavailable" && ip.contains('.')
}

pub fn get_tunnel_health(
    tracker: &Mutex<StabilityTracker>,
    baseline_public_ip: Option<&str>,
) -> TunnelHealth {
    let status = tunnel::tunnel_status();

    if !status.is_connected() && !status.is_connecting() {
        let mut t = tracker.lock().unwrap();
        t.consecutive_failures = 0;
        return TunnelHealth {
            status: "disconnected".to_string(),
            service_running: false,
            handshake_recent: false,
            handshake_secs_ago: None,
            ping_ok: false,
            failed_checks: 0,
            reconnect_recommended: false,
            public_ip_changed: None,
            stuck_tunnel: false,
            message: "Tunnel is not connected.".to_string(),
        };
    }

    let wg = tunnel::get_wireguard_status();
    let service_running = wg
        .service_status
        .to_uppercase()
        .contains("RUNNING")
        || status.is_connected();
    let handshake_secs = wg.latest_handshake_secs_ago;
    let handshake_recent = handshake_secs.map(|s| s < HANDSHAKE_STALE_SECS).unwrap_or(false);
    let ping_ok = lightweight_ping_ok();

    let public_ip_changed = if status.is_connected() {
        if let Some(baseline) = baseline_public_ip.filter(|ip| is_valid_baseline_ip(ip)) {
            match get_public_ip() {
                Ok(current) => Some(current != baseline),
                Err(_) => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let stuck_tunnel = status.is_connected()
        && (!ping_ok || public_ip_changed == Some(false));

    let check_failed = !service_running || !handshake_recent || !ping_ok;

    let mut t = tracker.lock().unwrap();
    if check_failed {
        t.consecutive_failures += 1;
    } else {
        t.consecutive_failures = 0;
    }
    let failed_checks = t.consecutive_failures;
    let reconnect_recommended = failed_checks >= FAIL_THRESHOLD;

    let health_status = if stuck_tunnel || reconnect_recommended {
        "degraded"
    } else if check_failed {
        "degraded"
    } else {
        "healthy"
    };

    let message = if stuck_tunnel {
        "RouteLag is connected but internet is not working correctly.".to_string()
    } else if reconnect_recommended {
        "Reconnect Recommended — tunnel checks failed multiple times in a row.".to_string()
    } else if !handshake_recent {
        "No recent WireGuard handshake. UDP 51820 may be blocked.".to_string()
    } else if !ping_ok {
        "Internet ping through tunnel failed.".to_string()
    } else if !service_running {
        "WireGuard tunnel service is not running.".to_string()
    } else {
        "Tunnel is stable.".to_string()
    };

    TunnelHealth {
        status: health_status.to_string(),
        service_running,
        handshake_recent,
        handshake_secs_ago: handshake_secs,
        ping_ok,
        failed_checks,
        reconnect_recommended,
        public_ip_changed,
        stuck_tunnel,
        message,
    }
}

pub fn reset_stability(tracker: &Mutex<StabilityTracker>) {
    if let Ok(mut t) = tracker.lock() {
        t.consecutive_failures = 0;
    }
}

pub fn handshake_is_recent(wg: &WireGuardStatus) -> bool {
    wg.latest_handshake_secs_ago
        .map(|s| s < HANDSHAKE_STALE_SECS)
        .unwrap_or(false)
}
