#!/usr/bin/env bash
# RouteLag MVP — server pre-flight checks.
# Verifies the VPS is ready for WireGuard installation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

require_root

print_section "RouteLag MVP — Server Check"

# --- Ubuntu version ---
print_section "Ubuntu Version"
if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    echo "  Distribution: ${PRETTY_NAME:-unknown}"
    echo "  Version ID:   ${VERSION_ID:-unknown}"
    if [[ "${VERSION_ID:-}" != "24.04" ]]; then
        safe_echo "WARN" "Expected Ubuntu 24.04. This script is designed for 24.04."
    fi
else
    safe_echo "WARN" "/etc/os-release not found."
fi

# --- Public IP ---
print_section "Public IP"
PUBLIC_IP="$(get_public_ip || true)"
echo "  ${PUBLIC_IP}"

# --- Default network interface ---
print_section "Default Network Interface"
DEFAULT_IFACE="$( ( detect_default_interface ) 2>/dev/null || echo 'unknown (could not detect)' )"
echo "  ${DEFAULT_IFACE}"

# --- Firewall status ---
print_section "Firewall (UFW)"
if command_exists ufw; then
    ufw status verbose || safe_echo "WARN" "Could not read UFW status."
else
    echo "  UFW is not installed."
fi

# --- UDP 51820 locally ---
print_section "UDP Port ${WG_PORT} (local)"
if command_exists ss; then
    if ss -ulnp 2>/dev/null | grep -q ":${WG_PORT} "; then
        echo "  Port ${WG_PORT}/udp is LISTENING locally."
        ss -ulnp 2>/dev/null | grep ":${WG_PORT} " || true
    else
        echo "  Port ${WG_PORT}/udp is NOT listening locally."
        safe_echo "INFO" "This is normal before WireGuard is installed."
    fi
elif command_exists nc; then
    if nc -u -z -w2 127.0.0.1 "${WG_PORT}" 2>/dev/null; then
        echo "  Port ${WG_PORT}/udp appears open on localhost."
    else
        echo "  Port ${WG_PORT}/udp is NOT listening locally."
    fi
else
    safe_echo "WARN" "Neither ss nor nc available to check port."
fi

# --- WireGuard installation ---
print_section "WireGuard"
if command_exists wg; then
    echo "  wireguard-tools: installed"
    WG_VERSION="$(wg --version 2>/dev/null || echo "unknown")"
    echo "  Version: ${WG_VERSION}"
else
    echo "  wireguard-tools: NOT installed"
fi

if systemctl is-active --quiet "wg-quick@${WG_INTERFACE}" 2>/dev/null; then
    echo "  Service wg-quick@${WG_INTERFACE}: active"
elif systemctl is-enabled --quiet "wg-quick@${WG_INTERFACE}" 2>/dev/null; then
    echo "  Service wg-quick@${WG_INTERFACE}: enabled but not running"
else
    echo "  Service wg-quick@${WG_INTERFACE}: not configured"
fi

if [[ -f "${WG_CONF}" ]]; then
    echo "  Config ${WG_CONF}: exists"
else
    echo "  Config ${WG_CONF}: not found"
fi

# --- IP forwarding ---
print_section "IP Forwarding"
FORWARD_STATUS="$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo "unknown")"
echo "  net.ipv4.ip_forward = ${FORWARD_STATUS}"

if [[ -f "${FORWARDING_CONF}" ]]; then
    echo "  ${FORWARDING_CONF}: exists"
    cat "${FORWARDING_CONF}"
else
    echo "  ${FORWARDING_CONF}: not found"
fi

print_section "Check Complete"
safe_echo "INFO" "Review the output above before running 01-install-server.sh."
