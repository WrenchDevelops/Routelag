use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use thiserror::Error;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::config::redact_secrets;
use crate::diagnostics::{
    build_report_text, enrich_report, load_report, DiagnosticsReport, DIAGNOSTICS_FILENAME,
    REPORT_TEXT_FILENAME,
};
use crate::logs::LOG_FILENAME;
use crate::network_diag::ping_results_to_csv;
use crate::tunnel;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("No diagnostics report found. Run Full Diagnostics first.")]
    NoReport,
    #[error("Export failed: {0}")]
    Failed(String),
}

pub fn export_report_zip(app_data_dir: &Path, dest_zip: &Path) -> Result<PathBuf, ExportError> {
    let report = load_report(app_data_dir).ok_or(ExportError::NoReport)?;
    let report = enrich_report(app_data_dir, report);

    if let Some(parent) = dest_zip.parent() {
        fs::create_dir_all(parent).map_err(|e| ExportError::Failed(e.to_string()))?;
    }

    let file = File::create(dest_zip).map_err(|e| ExportError::Failed(e.to_string()))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let text_report = build_report_text(&report);
    write_zip_string(&mut zip, "routelag-report.txt", &text_report, options)?;

    let json = serde_json::to_string_pretty(&report)
        .map_err(|e| ExportError::Failed(e.to_string()))?;
    write_zip_string(&mut zip, "routelag-report.json", &json, options)?;

    let mut all_pings = report.normal_route.pings.clone();
    if let Some(t) = &report.routelag_route {
        for p in &t.pings {
            all_pings.push(p.clone());
        }
    }
    let csv = ping_results_to_csv(&all_pings);
    write_zip_string(&mut zip, "ping-results.csv", &csv, options)?;

    let tr_normal = traceroute_text(&report, true);
    write_zip_string(&mut zip, "traceroute-normal.txt", &tr_normal, options)?;

    let tr_tunnel = traceroute_text(&report, false);
    write_zip_string(&mut zip, "traceroute-tunnel.txt", &tr_tunnel, options)?;

    let wg_status = wireguard_status_text(&report);
    write_zip_string(&mut zip, "wireguard-status.txt", &wg_status, options)?;

    let app_log = read_app_log(app_data_dir);
    write_zip_string(&mut zip, "app-log.txt", &app_log, options)?;

    zip.finish().map_err(|e| ExportError::Failed(e.to_string()))?;
    Ok(dest_zip.to_path_buf())
}

fn write_zip_string(
    zip: &mut ZipWriter<File>,
    name: &str,
    content: &str,
    options: SimpleFileOptions,
) -> Result<(), ExportError> {
    zip.start_file(name, options)
        .map_err(|e| ExportError::Failed(e.to_string()))?;
    zip.write_all(content.as_bytes())
        .map_err(|e| ExportError::Failed(e.to_string()))?;
    Ok(())
}

fn traceroute_text(report: &DiagnosticsReport, normal: bool) -> String {
    let snap = if normal {
        &report.normal_route
    } else {
        match &report.routelag_route {
            Some(s) => s,
            None => return "No tunnel route data.".to_string(),
        }
    };
    let mut out = String::new();
    for tr in &snap.traceroutes {
        out.push_str(&format!("=== {} ===\n{}\n\n", tr.host, tr.output));
    }
    redact_secrets(&out)
}

fn wireguard_status_text(report: &DiagnosticsReport) -> String {
    if let Some(wg) = &report.wireguard {
        format!(
            "Service status:\n{}\n\nwg show:\n{}",
            wg.service_status, wg.wg_show
        )
    } else {
        let snippet = tunnel::wireguard_service_status_snippet();
        format!("{snippet}\n\nNo tunnel phase was captured.")
    }
}

fn read_app_log(app_data_dir: &Path) -> String {
    let path = app_data_dir.join(LOG_FILENAME);
    let mut content = fs::read_to_string(path).unwrap_or_else(|_| "No app log.".to_string());
    if content.len() > 100_000 {
        content = content.chars().skip(content.len() - 100_000).collect();
    }
    redact_secrets(&content)
}
