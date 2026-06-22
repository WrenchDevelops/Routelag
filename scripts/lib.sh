#!/usr/bin/env bash
# RouteLag MVP — shared helper functions and constants.
# Sourced by all scripts in this directory.

set -euo pipefail

# --- Constants ---
readonly WG_INTERFACE="wg0"
readonly WG_PORT="51820"
readonly WG_SUBNET="10.66.66.0/24"
readonly SERVER_TUNNEL_IP="10.66.66.1/24"
readonly CLIENT_IP_START=2
readonly WG_CONF="/etc/wireguard/wg0.conf"
readonly WG_KEYS_DIR="/etc/wireguard"
readonly SERVER_PRIVATE_KEY="${WG_KEYS_DIR}/server_private.key"
readonly SERVER_PUBLIC_KEY="${WG_KEYS_DIR}/server_public.key"
readonly FORWARDING_CONF="/etc/sysctl.d/99-routelag-forwarding.conf"

# Project root is one level above scripts/
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT
readonly CLIENTS_DIR="${PROJECT_ROOT}/clients"

# --- Helper functions ---

# Exit with an error if not running as root.
require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        safe_echo "ERROR" "This script must be run as root (use sudo)."
        exit 1
    fi
}

# Detect the default network interface used for outbound traffic.
detect_default_interface() {
    local iface
    iface="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="dev") {print $(i+1); exit}}')"
    if [[ -z "${iface}" ]]; then
        iface="$(ip route | awk '/^default/ {print $5; exit}')"
    fi
    if [[ -z "${iface}" ]]; then
        safe_echo "ERROR" "Could not detect default network interface."
        exit 1
    fi
    echo "${iface}"
}

# Fetch the server's public IPv4 address.
get_public_ip() {
    local ip=""
    for url in "https://ifconfig.me" "https://icanhazip.com" "https://api.ipify.org"; do
        ip="$(curl -4 -s --max-time 5 "${url}" 2>/dev/null || true)"
        if [[ -n "${ip}" ]]; then
            echo "${ip}"
            return 0
        fi
    done
    safe_echo "WARN" "Could not determine public IP via curl."
    echo "unknown"
    return 1
}

# Print a timestamped log line: safe_echo LEVEL "message"
safe_echo() {
    local level="$1"
    shift
    printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "$*"
}

# Create a timestamped backup of a file before modifying it.
backup_file() {
    local file="$1"
    if [[ -f "${file}" ]]; then
        local backup="${file}.bak.$(date '+%Y%m%d-%H%M%S')"
        cp -a "${file}" "${backup}"
        safe_echo "INFO" "Backed up ${file} -> ${backup}"
    fi
}

# Return 0 if a command exists on PATH.
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Print a section header for status/diagnostic output.
print_section() {
    local title="$1"
    echo ""
    echo "========================================"
    echo " ${title}"
    echo "========================================"
}

# Prompt yes/no; returns 0 for yes, 1 for no.
confirm() {
    local prompt="$1"
    local answer
    read -r -p "${prompt} [y/N] " answer
    [[ "${answer}" =~ ^[Yy]$ ]]
}
