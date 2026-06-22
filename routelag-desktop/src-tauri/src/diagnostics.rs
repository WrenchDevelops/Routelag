use std::fs;
use std::path::Path;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::{self, redact_secrets, ConfigIdentity};
use crate::tester_profile::{self, TesterProfile};
use crate::health::handshake_is_recent;
use crate::network::get_public_ip;
use crate::network_diag::{
    get_dns_status, run_mtu_test, run_ping_test, run_traceroute, DetailedPingResult,
    DnsStatus, MtuTestResult, TracerouteResult, DIAG_PING_HOSTS, DIAG_TRACEROUTE_HOSTS,
};
use crate::sysinfo::{get_network_adapter_info, get_os_info, NetworkAdapterInfo, OsInfo};
use crate::tunnel::{self, WireGuardStatus};

pub const DIAGNOSTICS_FILENAME: &str = "diagnostics-latest.json";
pub const REPORT_TEXT_FILENAME: &str = "routelag-report.txt";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteSnapshot {
    pub label: String,
    pub public_ip: Option<String>,
    pub pings: Vec<DetailedPingResult>,
    pub traceroutes: Vec<TracerouteResult>,
    pub dns: DnsStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteComparison {
    pub ping_delta_ms: Option<f64>,
    pub normal_avg_ping_ms: Option<f64>,
    pub tunnel_avg_ping_ms: Option<f64>,
    pub normal_packet_loss_pct: Option<f64>,
    pub tunnel_packet_loss_pct: Option<f64>,
    pub public_ip_changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsReport {
    pub generated_at: String,
    pub app_version: String,
    pub include_public_ip: bool,
    pub normal_route: RouteSnapshot,
    pub routelag_route: Option<RouteSnapshot>,
    pub machine: OsInfo,
    pub network_adapter: NetworkAdapterInfo,
    pub wireguard: Option<WireGuardStatus>,
    pub mtu: MtuTestResult,
    pub route_score: String,
    pub recommendation: String,
    pub comparison: RouteComparison,
    pub privacy_warning: String,
    #[serde(default)]
    pub tester_profile: Option<TesterProfile>,
    #[serde(default)]
    pub config_identity: Option<ConfigIdentity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsProgress {
    pub step: String,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum DiagnosticsError {
    #[error("Tunnel is connected. Disconnect temporarily to test the normal route, or set disconnect_for_normal=true.")]
    NeedsDisconnect,
    #[error("Tunnel is not connected. Connect RouteLag before running tunnel diagnostics.")]
    NeedsConnect,
    #[error("Diagnostics failed: {0}")]
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunDiagnosticsOptions {
    pub disconnect_for_normal: bool,
    pub include_public_ip: bool,
    pub skip_tunnel_phase: bool,
}

impl Default for RunDiagnosticsOptions {
    fn default() -> Self {
        Self {
            disconnect_for_normal: false,
            include_public_ip: true,
            skip_tunnel_phase: false,
        }
    }
}

pub fn collect_route_snapshot(label: &str, include_public_ip: bool) -> RouteSnapshot {
    let public_ip = if include_public_ip {
        get_public_ip().ok()
    } else {
        None
    };

    let mut pings = Vec::new();
    for host in DIAG_PING_HOSTS {
        if let Ok(p) = run_ping_test(host) {
            pings.push(p);
        }
    }

    let mut traceroutes = Vec::new();
    for host in DIAG_TRACEROUTE_HOSTS {
        if let Ok(t) = run_traceroute(host) {
            traceroutes.push(t);
        }
    }

    let dns = get_dns_status();

    RouteSnapshot {
        label: label.to_string(),
        public_ip,
        pings,
        traceroutes,
        dns,
    }
}

pub fn run_full_diagnostics(
    app_data_dir: &Path,
    app_version: &str,
    options: RunDiagnosticsOptions,
) -> Result<DiagnosticsReport, DiagnosticsError> {
    let status = tunnel::tunnel_status();
    let was_connected = status.is_connected() || status.is_connecting();

    if was_connected && !options.disconnect_for_normal {
        return Err(DiagnosticsError::NeedsDisconnect);
    }

    if was_connected && options.disconnect_for_normal {
        if crate::elevation::is_elevated() {
            let _ = tunnel::disconnect_tunnel();
            std::thread::sleep(Duration::from_secs(2));
        }
    }

    let normal_route = collect_route_snapshot("normal", options.include_public_ip);

    let mut routelag_route = None;
    let mut wireguard = None;

    if !options.skip_tunnel_phase {
        if !tunnel::tunnel_status().is_connected() {
            if crate::elevation::is_elevated() && crate::config::has_config(app_data_dir) {
                tunnel::connect_tunnel(app_data_dir).map_err(|e| {
                    DiagnosticsError::Failed(format!("Could not connect tunnel: {e}"))
                })?;
                tunnel::wait_for_handshake(Duration::from_secs(45));
            } else if !tunnel::tunnel_status().is_connected() {
                return Err(DiagnosticsError::NeedsConnect);
            }
        }

        if tunnel::tunnel_status().is_connected() {
            routelag_route = Some(collect_route_snapshot(
                "routelag",
                options.include_public_ip,
            ));
            wireguard = Some(tunnel::get_wireguard_status());
        }
    }

    let mtu = run_mtu_test();
    let machine = get_os_info(app_version);
    let network_adapter = get_network_adapter_info();

    let comparison = build_comparison(&normal_route, routelag_route.as_ref());
    let (route_score, recommendation) =
        compute_score_and_recommendation(&normal_route, routelag_route.as_ref(), wireguard.as_ref(), &mtu, &comparison);

    let report = DiagnosticsReport {
        generated_at: Utc::now().to_rfc3339(),
        app_version: app_version.to_string(),
        include_public_ip: options.include_public_ip,
        normal_route,
        routelag_route,
        machine,
        network_adapter,
        wireguard,
        mtu,
        route_score,
        recommendation,
        comparison,
        privacy_warning: "This report may include your public IP, ISP/network info, ping results, and RouteLag tunnel status. Do not share it publicly.".to_string(),
        tester_profile: {
            let profile = tester_profile::load_profile(app_data_dir);
            if tester_profile::profile_is_empty(&profile) {
                None
            } else {
                Some(profile)
            }
        },
        config_identity: config::get_config_identity(app_data_dir),
    };

    save_report(app_data_dir, &report)?;
    Ok(report)
}

fn build_comparison(normal: &RouteSnapshot, tunnel: Option<&RouteSnapshot>) -> RouteComparison {
    let normal_ping = ping_for_host(normal, "1.1.1.1");
    let tunnel_ping = tunnel.and_then(|t| ping_for_host(t, "1.1.1.1"));

    let ping_delta_ms = match (normal_ping.and_then(|p| p.avg_ms), tunnel_ping.and_then(|p| p.avg_ms)) {
        (Some(n), Some(t)) => Some(t - n),
        _ => None,
    };

    RouteComparison {
        ping_delta_ms,
        normal_avg_ping_ms: normal_ping.and_then(|p| p.avg_ms),
        tunnel_avg_ping_ms: tunnel_ping.and_then(|p| p.avg_ms),
        normal_packet_loss_pct: normal_ping.map(|p| p.packet_loss_pct),
        tunnel_packet_loss_pct: tunnel_ping.map(|p| p.packet_loss_pct),
        public_ip_changed: match (normal.public_ip.as_ref(), tunnel.map(|t| t.public_ip.as_ref())) {
            (Some(n), Some(Some(t))) => n != t,
            _ => false,
        },
    }
}

fn ping_for_host<'a>(snap: &'a RouteSnapshot, host: &str) -> Option<&'a DetailedPingResult> {
    snap.pings.iter().find(|p| p.host == host)
}

pub fn compute_score_and_recommendation(
    normal: &RouteSnapshot,
    tunnel: Option<&RouteSnapshot>,
    wg: Option<&WireGuardStatus>,
    mtu: &MtuTestResult,
    comparison: &RouteComparison,
) -> (String, String) {
    let mut issues = Vec::new();
    let mut recs: Vec<String> = Vec::new();

    let delta = comparison.ping_delta_ms.unwrap_or(0.0);

    let tunnel_loss = comparison.tunnel_packet_loss_pct.unwrap_or(0.0);
    let normal_loss = comparison.normal_packet_loss_pct.unwrap_or(0.0);
    let _ = normal_loss;

    let dns_failed_tunnel = tunnel
        .map(|t| t.dns.results.iter().any(|r| !r.resolved))
        .unwrap_or(false);

    let handshake_bad = wg.map(|w| !handshake_is_recent(w)).unwrap_or(false);

    if tunnel_loss > 5.0 {
        issues.push("packet_loss");
    }
    if dns_failed_tunnel {
        issues.push("dns");
        recs.push("DNS failed while connected. Check tunnel DNS setting.".to_string());
    }
    if handshake_bad {
        issues.push("handshake");
        recs.push("No recent WireGuard handshake. UDP 51820 may be blocked.".to_string());
    }
    if mtu.best_mtu.is_none() || mtu.recommended_mtu <= 1280 {
        recs.push("MTU may be too high. Try MTU 1280.".to_string());
    } else if mtu.recommended_mtu < 1420 {
        recs.push(format!(
            "MTU test suggests using MTU {}.",
            mtu.recommended_mtu
        ));
    }

    let score = if tunnel.is_none() {
        "Incomplete".to_string()
    } else if !issues.is_empty() && (issues.contains(&"handshake") || tunnel_loss > 10.0) {
        "Bad".to_string()
    } else if delta > 50.0 {
        recs.push("Tunnel is stable, but server is too far away for Fortnite NA Central.".to_string());
        "Worse Than Normal".to_string()
    } else if delta > 35.0 {
        recs.push("Tunnel works but ping is noticeably higher than your normal route.".to_string());
        "Okay".to_string()
    } else if tunnel_loss < normal_loss && delta > 15.0 {
        recs.push("Packet loss improved with RouteLag, but ping increased.".to_string());
        "Okay".to_string()
    } else if delta <= 15.0 && tunnel_loss <= 1.0 && !issues.contains(&"dns") {
        if handshake_bad {
            "Good".to_string()
        } else {
            recs.push("Tunnel is stable for beta testing.".to_string());
            "Excellent".to_string()
        }
    } else if tunnel_loss <= 5.0 && delta <= 35.0 {
        "Good".to_string()
    } else if delta > 15.0 {
        "Okay".to_string()
    } else {
        "Good".to_string()
    };

    let recommendation = if recs.is_empty() {
        "No major issues detected. Compare in-game ping before sharing this report.".to_string()
    } else {
        recs.join(" ")
    };

    (score, recommendation)
}

pub fn save_report(app_data_dir: &Path, report: &DiagnosticsReport) -> Result<(), DiagnosticsError> {
    fs::create_dir_all(app_data_dir).map_err(|e| DiagnosticsError::Failed(e.to_string()))?;
    let json_path = app_data_dir.join(DIAGNOSTICS_FILENAME);
    let json = serde_json::to_string_pretty(report)
        .map_err(|e| DiagnosticsError::Failed(e.to_string()))?;
    fs::write(&json_path, json).map_err(|e| DiagnosticsError::Failed(e.to_string()))?;

    let text = build_report_text(report);
    fs::write(app_data_dir.join(REPORT_TEXT_FILENAME), &text)
        .map_err(|e| DiagnosticsError::Failed(e.to_string()))?;
    Ok(())
}

pub fn load_report(app_data_dir: &Path) -> Option<DiagnosticsReport> {
    let path = app_data_dir.join(DIAGNOSTICS_FILENAME);
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn build_report_text(report: &DiagnosticsReport) -> String {
    let mut out = String::new();
    out.push_str("=== RouteLag Beta Diagnostics Report ===\n");
    out.push_str(&format!("Generated: {}\n", report.generated_at));
    out.push_str(&format!("App version: {}\n", report.app_version));
    out.push_str(&format!("Route Score: {}\n", report.route_score));
    out.push_str(&format!("Recommendation: {}\n\n", report.recommendation));
    out.push_str(&format!("{}\n\n", report.privacy_warning));

    out.push_str("--- Machine ---\n");
    out.push_str(&format!("OS: {} {}\n", report.machine.os_name, report.machine.os_version));
    if let Some(cpu) = &report.machine.cpu_name {
        out.push_str(&format!("CPU: {cpu}\n"));
    }
    if let Some(ram) = report.machine.ram_total_gb {
        out.push_str(&format!("RAM: {ram:.1} GB\n"));
    }
    out.push_str(&format!("Admin: {}\n", report.machine.is_admin));
    out.push_str(&format!("WireGuard installed: {}\n", report.machine.wireguard_installed));
    if let Some(adapter) = &report.network_adapter.adapter_name {
        out.push_str(&format!("Network adapter: {adapter}\n"));
    }
    if let Some(ct) = &report.network_adapter.connection_type {
        out.push_str(&format!("Connection type: {ct}\n"));
    }

    if let Some(identity) = &report.config_identity {
        out.push_str("\n--- Config ---\n");
        out.push_str(&format!("Config name: {}\n", identity.original_filename));
        out.push_str(&format!(
            "Address: {}\n",
            identity.address.as_deref().unwrap_or("not provided")
        ));
        out.push_str(&format!(
            "Endpoint: {}\n",
            identity.endpoint.as_deref().unwrap_or("not provided")
        ));
        out.push_str(&format!(
            "DNS: {}\n",
            identity.dns.as_deref().unwrap_or("not provided")
        ));
        out.push_str(&format!(
            "MTU: {}\n",
            identity
                .mtu
                .map(|m| m.to_string())
                .unwrap_or_else(|| "not provided".to_string())
        ));
    }

    if let Some(profile) = &report.tester_profile {
        out.push_str("\n--- Tester Profile ---\n");
        out.push_str(&format!(
            "Tester name: {}\n",
            empty_as_not_provided(&profile.tester_name)
        ));
        out.push_str(&format!(
            "Discord: {}\n",
            empty_as_not_provided(&profile.discord_username)
        ));
        out.push_str(&format!(
            "State/country: {}\n",
            empty_as_not_provided(&profile.state_country)
        ));
        out.push_str(&format!("ISP: {}\n", empty_as_not_provided(&profile.isp)));
        out.push_str(&format!(
            "Connection type: {}\n",
            empty_as_not_provided(&profile.connection_type)
        ));
        out.push_str(&format!(
            "Normal Fortnite ping: {}\n",
            profile
                .normal_fortnite_ping_ms
                .map(|v| format!("{v} ms"))
                .unwrap_or_else(|| "not provided".to_string())
        ));
        out.push_str(&format!(
            "RouteLag Fortnite ping: {}\n",
            profile
                .routelag_fortnite_ping_ms
                .map(|v| format!("{v} ms"))
                .unwrap_or_else(|| "not provided".to_string())
        ));
        out.push_str(&format!(
            "Fortnite region: {}\n",
            empty_as_not_provided(&profile.fortnite_region)
        ));
        out.push_str(&format!(
            "Notes: {}\n",
            empty_as_not_provided(&profile.notes)
        ));
    }

    out.push_str("\n--- Normal Route ---\n");
    if report.include_public_ip {
        out.push_str(&format!(
            "Public IP: {}\n",
            report.normal_route.public_ip.as_deref().unwrap_or("hidden")
        ));
    }
    append_snapshot(&mut out, &report.normal_route);

    if let Some(tunnel) = &report.routelag_route {
        out.push_str("\n--- RouteLag Route ---\n");
        if report.include_public_ip {
            out.push_str(&format!(
                "Public IP: {}\n",
                tunnel.public_ip.as_deref().unwrap_or("hidden")
            ));
        }
        append_snapshot(&mut out, tunnel);
    }

    out.push_str("\n--- Comparison ---\n");
    out.push_str(&format!(
        "Ping delta (1.1.1.1): {:?} ms\n",
        report.comparison.ping_delta_ms
    ));
    out.push_str(&format!(
        "Public IP changed: {}\n",
        report.comparison.public_ip_changed
    ));

    out.push_str("\n--- MTU Test ---\n");
    out.push_str(&format!(
        "Best MTU: {:?}\nRecommended MTU: {}\n",
        report.mtu.best_mtu, report.mtu.recommended_mtu
    ));
    for p in &report.mtu.probes {
        out.push_str(&format!(
            "  MTU {}: {}\n",
            p.mtu,
            if p.success { "OK" } else { "FAIL" }
        ));
    }

    if let Some(wg) = &report.wireguard {
        out.push_str("\n--- WireGuard Status ---\n");
        out.push_str(&redact_secrets(&wg.wg_show));
        out.push('\n');
    }

    redact_secrets(&out)
}

fn append_snapshot(out: &mut String, snap: &RouteSnapshot) {
    out.push_str("Ping results:\n");
    for p in &snap.pings {
        out.push_str(&format!(
            "  {} — sent={} recv={} loss={}% avg={:?}ms jitter={:?}ms\n",
            p.host, p.sent, p.received, p.packet_loss_pct, p.avg_ms, p.jitter_ms
        ));
    }
    out.push_str("DNS:\n");
    for d in &snap.dns.results {
        out.push_str(&format!(
            "  {} — resolved={} addrs={:?}\n",
            d.host, d.resolved, d.addresses
        ));
    }
}

fn empty_as_not_provided(value: &str) -> &str {
    if value.trim().is_empty() {
        "not provided"
    } else {
        value
    }
}

pub fn enrich_report(app_data_dir: &Path, mut report: DiagnosticsReport) -> DiagnosticsReport {
    let profile = tester_profile::load_profile(app_data_dir);
    report.tester_profile = if tester_profile::profile_is_empty(&profile) {
        None
    } else {
        Some(profile)
    };
    report.config_identity = config::get_config_identity(app_data_dir);
    report
}

pub fn copy_report_text(app_data_dir: &Path) -> Result<String, DiagnosticsError> {
    if let Some(report) = load_report(app_data_dir) {
        let report = enrich_report(app_data_dir, report);
        return Ok(build_report_text(&report));
    }
    let path = app_data_dir.join(REPORT_TEXT_FILENAME);
    fs::read_to_string(path).map_err(|e| DiagnosticsError::Failed(e.to_string()))
}

pub fn remove_diagnostics(app_data_dir: &Path) {
    let _ = fs::remove_file(app_data_dir.join(DIAGNOSTICS_FILENAME));
    let _ = fs::remove_file(app_data_dir.join(REPORT_TEXT_FILENAME));
}
