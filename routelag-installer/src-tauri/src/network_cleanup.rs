//! Best-effort cleanup of Zer0 / legacy RouteLag owned tunnel services.
//!
//! Never touches unrelated WireGuard/VPN products — only the owned profile name set.

use std::path::Path;
use std::process::Command;

/// Tunnel profile names positively identified as Zer0 or legacy RouteLag.
const OWNED_TUNNEL_PROFILES: &[&str] = &[
    "routelag-engine",
    "routelag-beta",
    "RouteLag",
    "routelag",
    "zer0-engine",
    "Zer0",
    "zer0",
];

const ENGINE_PROCESS_NAMES: &[&str] = &["RouteLagEngine.exe", "routelag-wg.exe", "routelag-engine.exe"];

fn service_name(profile: &str) -> String {
    format!("WireGuardTunnel${profile}")
}

fn run_hidden(program: &str, args: &[&str]) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new(program)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = (program, args);
    }
}

fn stop_and_delete_owned_service(profile: &str) {
    let service = service_name(profile);
    run_hidden("sc", &["stop", &service]);
    // Brief pause so the SCM can release the service before delete.
    std::thread::sleep(std::time::Duration::from_millis(200));
    run_hidden("sc", &["delete", &service]);
}

fn uninstall_via_engine(engine_dir: &Path, profile: &str) {
    let candidates = [
        engine_dir.join("RouteLagEngine.exe"),
        engine_dir.join("routelag-engine.exe"),
    ];
    for exe in candidates {
        if !exe.is_file() {
            continue;
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let _ = Command::new(&exe)
                .args(["/uninstalltunnelservice", profile])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = (exe, profile);
        }
        break;
    }
}

/// Stop/uninstall owned Zer0/RouteLag tunnel services only.
/// Safe to call when no tunnel exists (idempotent best-effort).
pub fn disconnect_owned_networking(install_dir: Option<&Path>) {
    crate::logging::append("network_cleanup: disconnecting owned Zer0/RouteLag tunnels");

    for name in ENGINE_PROCESS_NAMES {
        crate::process_kill::kill_by_name(name);
    }

    let engine_dir = install_dir.map(|dir| dir.join("engine"));
    for profile in OWNED_TUNNEL_PROFILES {
        if let Some(ref engine) = engine_dir {
            uninstall_via_engine(engine, profile);
        }
        stop_and_delete_owned_service(profile);
    }

    run_hidden("ipconfig", &["/flushdns"]);
    crate::logging::append("network_cleanup: owned tunnel cleanup attempted");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_profiles_do_not_include_generic_wireguard() {
        for profile in OWNED_TUNNEL_PROFILES {
            assert!(!profile.eq_ignore_ascii_case("WireGuard"));
            assert!(!profile.eq_ignore_ascii_case("wg"));
            assert!(!profile.to_lowercase().contains("nord"));
            assert!(!profile.to_lowercase().contains("mullvad"));
            assert!(!profile.to_lowercase().contains("openvpn"));
        }
    }

    #[test]
    fn service_name_uses_wireguard_tunnel_prefix() {
        assert_eq!(service_name("routelag-engine"), "WireGuardTunnel$routelag-engine");
    }
}
