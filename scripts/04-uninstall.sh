#!/usr/bin/env bash
# RouteLag MVP — safely remove WireGuard server configuration.
# Does NOT uninstall packages or remove UFW rules.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

require_root

safe_echo "INFO" "RouteLag MVP uninstall — this removes WireGuard server config only."
echo ""
echo "  This script will:"
echo "    - Stop and disable wg-quick@wg0"
echo "    - Remove /etc/wireguard/wg0.conf"
echo "    - Remove IP forwarding config created by this project"
echo ""
echo "  This script will NOT:"
echo "    - Uninstall packages (wireguard, ufw, etc.)"
echo "    - Remove UFW rules or disable SSH"
echo "    - Flush firewall rules"
echo ""

if ! confirm "Continue with uninstall?"; then
    safe_echo "INFO" "Uninstall cancelled."
    exit 0
fi

# --- Stop and disable WireGuard ---
print_section "Stopping WireGuard"
if systemctl is-active --quiet "wg-quick@${WG_INTERFACE}" 2>/dev/null; then
    systemctl stop "wg-quick@${WG_INTERFACE}"
    safe_echo "INFO" "Stopped wg-quick@${WG_INTERFACE}."
else
    safe_echo "INFO" "wg-quick@${WG_INTERFACE} was not running."
fi

if systemctl is-enabled --quiet "wg-quick@${WG_INTERFACE}" 2>/dev/null; then
    systemctl disable "wg-quick@${WG_INTERFACE}"
    safe_echo "INFO" "Disabled wg-quick@${WG_INTERFACE}."
fi

# PostDown hooks remove iptables rules when wg-quick stops.

# --- Remove server config ---
print_section "Removing Server Config"
if [[ -f "${WG_CONF}" ]]; then
    backup_file "${WG_CONF}"
    rm -f "${WG_CONF}"
    safe_echo "INFO" "Removed ${WG_CONF}"
else
    safe_echo "INFO" "${WG_CONF} not found — nothing to remove."
fi

# --- Optionally remove server keys ---
print_section "Server Keys"
if [[ -f "${SERVER_PRIVATE_KEY}" || -f "${SERVER_PUBLIC_KEY}" ]]; then
    if confirm "Remove server private/public keys?"; then
        rm -f "${SERVER_PRIVATE_KEY}" "${SERVER_PUBLIC_KEY}"
        safe_echo "INFO" "Server keys removed."
    else
        safe_echo "INFO" "Server keys kept at ${WG_KEYS_DIR}/."
    fi
else
    safe_echo "INFO" "No server keys found."
fi

# --- Remove IP forwarding config ---
print_section "IP Forwarding"
if [[ -f "${FORWARDING_CONF}" ]]; then
    rm -f "${FORWARDING_CONF}"
    safe_echo "INFO" "Removed ${FORWARDING_CONF}"

    # Re-apply sysctl defaults (may leave forwarding on if set elsewhere)
    sysctl -w net.ipv4.ip_forward=0 >/dev/null 2>&1 || true
    safe_echo "INFO" "Set net.ipv4.ip_forward=0 (unless overridden by other configs)."
else
    safe_echo "INFO" "${FORWARDING_CONF} not found."
fi

# --- Optionally remove client configs ---
print_section "Client Configs"
CLIENT_COUNT=0
if [[ -d "${CLIENTS_DIR}" ]]; then
    CLIENT_COUNT="$(find "${CLIENTS_DIR}" -maxdepth 1 -name '*.conf' 2>/dev/null | wc -l | tr -d ' ')"
fi

if [[ "${CLIENT_COUNT}" -gt 0 ]]; then
    echo "  Found ${CLIENT_COUNT} client config(s) in ${CLIENTS_DIR}/"
    if confirm "Delete all client configs in clients/?"; then
        rm -f "${CLIENTS_DIR}"/*.conf
        safe_echo "INFO" "Client configs removed."
    else
        safe_echo "INFO" "Client configs kept."
    fi
else
    safe_echo "INFO" "No client configs found."
fi

print_section "Uninstall Complete"
safe_echo "INFO" "WireGuard server configuration removed."
echo ""
echo "  UFW rules for SSH and WireGuard were left in place."
echo "  Installed packages were not removed."
echo ""
echo "  To reinstall, run: sudo ./scripts/01-install-server.sh"
