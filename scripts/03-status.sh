#!/usr/bin/env bash
# RouteLag MVP — show WireGuard server status and diagnostics.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

require_root

print_section "RouteLag MVP — Status"

# --- WireGuard interface ---
print_section "WireGuard Interface (wg show)"
if command_exists wg && ip link show "${WG_INTERFACE}" &>/dev/null; then
    wg show "${WG_INTERFACE}" || safe_echo "WARN" "Could not read WireGuard interface."
else
    echo "  WireGuard interface ${WG_INTERFACE} is not up."
fi

# --- Service status ---
print_section "Service Status"
systemctl status "wg-quick@${WG_INTERFACE}" --no-pager -l 2>/dev/null || \
    safe_echo "WARN" "wg-quick@${WG_INTERFACE} service not found or not running."

# --- Connected peers ---
print_section "Connected Peers"
if command_exists wg && ip link show "${WG_INTERFACE}" &>/dev/null; then
    PEER_COUNT=0
    while IFS= read -r line; do
        if [[ "${line}" =~ ^peer:\ (.+)$ ]]; then
            PEER_KEY="${BASH_REMATCH[1]}"
            PEER_COUNT=$((PEER_COUNT + 1))
            echo ""
            echo "  Peer: ${PEER_KEY}"
        elif [[ "${line}" =~ ^[[:space:]]+allowed\ ips:\ (.+)$ ]]; then
            echo "    Allowed IPs: ${BASH_REMATCH[1]}"
        elif [[ "${line}" =~ ^[[:space:]]+latest\ handshake:\ (.+)$ ]]; then
            HANDSHAKE="${BASH_REMATCH[1]}"
            echo "    Latest handshake: ${HANDSHAKE}"
            if [[ "${HANDSHAKE}" == *"second"* || "${HANDSHAKE}" == *"minute"* ]]; then
                # Parse rough age — if minutes > 3, mark stale
                if [[ "${HANDSHAKE}" =~ ([0-9]+)\ minute ]]; then
                    MINS="${BASH_REMATCH[1]}"
                    if [[ "${MINS}" -gt 3 ]]; then
                        echo "    Status: STALE (no recent handshake)"
                    else
                        echo "    Status: CONNECTED"
                    fi
                else
                    echo "    Status: CONNECTED"
                fi
            elif [[ "${HANDSHAKE}" == *"hour"* || "${HANDSHAKE}" == *"day"* ]]; then
                echo "    Status: DISCONNECTED (stale handshake)"
            fi
        elif [[ "${line}" =~ ^[[:space:]]+transfer:\ (.+)$ ]]; then
            echo "    Transfer: ${BASH_REMATCH[1]}"
        fi
    done < <(wg show "${WG_INTERFACE}" 2>/dev/null || true)

    if [[ "${PEER_COUNT}" -eq 0 ]]; then
        echo "  No peers configured."
    fi
else
    echo "  WireGuard not running — no peer info available."
fi

# --- Public IP ---
print_section "Server Public IP"
PUBLIC_IP="$(get_public_ip || true)"
echo "  ${PUBLIC_IP}"

# --- Routing / NAT ---
print_section "Routing and NAT"
DEFAULT_IFACE="$(detect_default_interface)"
echo "  Default interface: ${DEFAULT_IFACE}"

FORWARD_STATUS="$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo 'unknown')"
echo "  IP forwarding:     net.ipv4.ip_forward = ${FORWARD_STATUS}"

echo ""
echo "  NAT (MASQUERADE) rules:"
iptables -t nat -L POSTROUTING -n -v 2>/dev/null | grep MASQUERADE || \
    echo "    No MASQUERADE rules found."

echo ""
echo "  FORWARD rules (wg0):"
iptables -L FORWARD -n -v 2>/dev/null | grep "${WG_INTERFACE}" || \
    echo "    No FORWARD rules for ${WG_INTERFACE}."

# --- UFW ---
print_section "UFW Firewall"
if command_exists ufw; then
    ufw status numbered 2>/dev/null || ufw status verbose
else
    echo "  UFW is not installed."
fi

# --- Recent logs ---
print_section "Recent Logs (last 50 lines)"
journalctl -u "wg-quick@${WG_INTERFACE}" -n 50 --no-pager 2>/dev/null || \
    safe_echo "WARN" "No journal logs available for wg-quick@${WG_INTERFACE}."

print_section "Status Complete"
