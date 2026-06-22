use std::net::ToSocketAddrs;
use std::process::Command;

use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::config::redact_secrets;

pub const DIAG_PING_HOSTS: &[&str] = &["1.1.1.1", "8.8.8.8", "cloudflare.com", "google.com"];
pub const DIAG_TRACEROUTE_HOSTS: &[&str] = &["1.1.1.1", "cloudflare.com"];
pub const DIAG_DNS_HOSTS: &[&str] = &["cloudflare.com", "google.com", "1.1.1.1"];
pub const MTU_CANDIDATES: &[u32] = &[1420, 1380, 1360, 1320, 1280];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedPingResult {
    pub host: String,
    pub sent: u32,
    pub received: u32,
    pub packet_loss_pct: f64,
    pub min_ms: Option<f64>,
    pub avg_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracerouteResult {
    pub host: String,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsHostResult {
    pub host: String,
    pub resolved: bool,
    pub addresses: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsStatus {
    pub results: Vec<DnsHostResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtuProbe {
    pub mtu: u32,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtuTestResult {
    pub probes: Vec<MtuProbe>,
    pub best_mtu: Option<u32>,
    pub recommended_mtu: u32,
}

#[derive(Debug, Error)]
pub enum DiagNetworkError {
    #[error("Ping failed for {host}: {message}")]
    PingFailed { host: String, message: String },
    #[error("Traceroute failed for {host}: {message}")]
    TracerouteFailed { host: String, message: String },
}

pub fn run_ping_test(host: &str) -> Result<DetailedPingResult, DiagNetworkError> {
    let output = if cfg!(windows) {
        Command::new("ping")
            .args(["-n", "4", "-w", "1000", host])
            .output()
    } else {
        Command::new("ping")
            .args(["-c", "4", "-W", "1", host])
            .output()
    }
    .map_err(|e| DiagNetworkError::PingFailed {
        host: host.to_string(),
        message: e.to_string(),
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_detailed_ping(host, &stdout))
}

fn parse_detailed_ping(host: &str, output: &str) -> DetailedPingResult {
    let mut samples_ms = Vec::new();
    let win_re = Regex::new(r"(?i)time[=<](\d+)ms").unwrap();
    let unix_re = Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap();

    for cap in win_re.captures_iter(output) {
        if let Some(m) = cap.get(1) {
            if let Ok(v) = m.as_str().parse::<f64>() {
                samples_ms.push(v);
            }
        }
    }
    if samples_ms.is_empty() {
        for cap in unix_re.captures_iter(output) {
            if let Some(m) = cap.get(1) {
                if let Ok(v) = m.as_str().parse::<f64>() {
                    samples_ms.push(v);
                }
            }
        }
    }

    let packet_loss_pct = parse_packet_loss(output);
    let sent = parse_packets_sent(output).unwrap_or(4);
    let received = parse_packets_received(output).unwrap_or(samples_ms.len() as u32);

    let min_ms = samples_ms.iter().copied().reduce(f64::min);
    let max_ms = samples_ms.iter().copied().reduce(f64::max);
    let avg_ms = if samples_ms.is_empty() {
        parse_average_ms(output)
    } else {
        Some(samples_ms.iter().sum::<f64>() / samples_ms.len() as f64)
    };
    let jitter_ms = compute_jitter(&samples_ms);

    DetailedPingResult {
        host: host.to_string(),
        sent,
        received,
        packet_loss_pct,
        min_ms,
        avg_ms,
        max_ms,
        jitter_ms,
    }
}

fn parse_packet_loss(output: &str) -> f64 {
    let re = Regex::new(r"(\d+(?:\.\d+)?)\s*%\s*(?:packet loss|loss)").unwrap();
    re.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0.0)
}

fn parse_packets_sent(output: &str) -> Option<u32> {
    let win = Regex::new(r"(?i)Packets:\s*Sent\s*=\s*(\d+)").unwrap();
    win.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .or_else(|| {
            let unix = Regex::new(r"(\d+)\s+packets transmitted").unwrap();
            unix.captures(output)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse().ok())
        })
}

fn parse_packets_received(output: &str) -> Option<u32> {
    let win = Regex::new(r"(?i)Received\s*=\s*(\d+)").unwrap();
    win.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .or_else(|| {
            let unix = Regex::new(r"(\d+)\s+packets received").unwrap();
            unix.captures(output)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse().ok())
        })
}

fn parse_average_ms(output: &str) -> Option<f64> {
    let win = Regex::new(r"(?i)Average\s*=\s*(\d+)ms").unwrap();
    if let Some(c) = win.captures(output) {
        return c.get(1).and_then(|m| m.as_str().parse().ok());
    }
    let unix = Regex::new(r"(?i)round-trip.*=\s*[\d.]+/([\d.]+)/").unwrap();
    unix.captures(output)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

fn compute_jitter(samples: &[f64]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let variance = samples
        .iter()
        .map(|s| (s - mean).powi(2))
        .sum::<f64>()
        / samples.len() as f64;
    Some(variance.sqrt())
}

pub fn run_traceroute(host: &str) -> Result<TracerouteResult, DiagNetworkError> {
    let output = if cfg!(windows) {
        Command::new("tracert")
            .args(["-d", "-h", "15", host])
            .output()
    } else {
        Command::new("traceroute")
            .args(["-m", "15", "-n", host])
            .output()
    }
    .map_err(|e| DiagNetworkError::TracerouteFailed {
        host: host.to_string(),
        message: e.to_string(),
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}\n{stderr}");
    Ok(TracerouteResult {
        host: host.to_string(),
        output: redact_paths(&redact_secrets(&combined)),
    })
}

pub fn get_dns_status() -> DnsStatus {
    let results = DIAG_DNS_HOSTS
        .iter()
        .map(|host| resolve_host(host))
        .collect();
    DnsStatus { results }
}

fn resolve_host(host: &str) -> DnsHostResult {
    let addrs: Vec<String> = match (host, 0).to_socket_addrs() {
        Ok(iter) => iter.map(|a| a.ip().to_string()).collect(),
        Err(e) => {
            return DnsHostResult {
                host: host.to_string(),
                resolved: false,
                addresses: vec![],
                error: Some(e.to_string()),
            };
        }
    };
    DnsHostResult {
        host: host.to_string(),
        resolved: !addrs.is_empty(),
        addresses: addrs,
        error: None,
    }
}

pub fn run_mtu_test() -> MtuTestResult {
    let mut probes = Vec::new();
    let mut best_mtu = None;

    for &mtu in MTU_CANDIDATES {
        let success = probe_mtu(mtu);
        if success && best_mtu.is_none() {
            best_mtu = Some(mtu);
        }
        probes.push(MtuProbe { mtu, success });
    }

    let recommended_mtu = best_mtu.unwrap_or(1280);

    MtuTestResult {
        probes,
        best_mtu,
        recommended_mtu,
    }
}

fn probe_mtu(mtu: u32) -> bool {
    let payload = mtu.saturating_sub(28);
    if payload == 0 {
        return false;
    }

    let output = if cfg!(windows) {
        Command::new("ping")
            .args(["-n", "1", "-f", "-l", &payload.to_string(), "1.1.1.1"])
            .output()
    } else {
        Command::new("ping")
            .args(["-c", "1", "-M", "do", "-s", &payload.to_string(), "1.1.1.1"])
            .output()
    };

    match output {
        Ok(o) => {
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&o.stdout),
                String::from_utf8_lossy(&o.stderr)
            )
            .to_lowercase();
            o.status.success()
                && !text.contains("fragment")
                && !text.contains("message too long")
                && !text.contains("need to frag")
        }
        Err(_) => false,
    }
}

pub fn redact_paths(text: &str) -> String {
    let re = Regex::new(r"(?i)C:\\Users\\[^\\]+").unwrap();
    let text = re.replace_all(text, "C:\\Users\\[REDACTED]");
    let re2 = Regex::new(r"(?i)/Users/[^/]+").unwrap();
    re2.replace_all(&text, "/Users/[REDACTED]").to_string()
}

pub fn ping_results_to_csv(pings: &[DetailedPingResult]) -> String {
    let mut csv = String::from("host,sent,received,packet_loss_pct,min_ms,avg_ms,max_ms,jitter_ms\n");
    for p in pings {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            p.host,
            p.sent,
            p.received,
            p.packet_loss_pct,
            opt_f64(p.min_ms),
            opt_f64(p.avg_ms),
            opt_f64(p.max_ms),
            opt_f64(p.jitter_ms),
        ));
    }
    csv
}

fn opt_f64(v: Option<f64>) -> String {
    v.map(|n| n.round().to_string()).unwrap_or_default()
}

pub fn lightweight_ping_ok() -> bool {
    run_ping_test("1.1.1.1")
        .map(|p| p.packet_loss_pct < 100.0 && p.received > 0)
        .unwrap_or(false)
}
