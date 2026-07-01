#!/usr/bin/env bash
# RouteLag MVP — create a WireGuard client config and register peer on server.
# Usage: ./scripts/02-create-client.sh <client-name>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

require_root

# --- Validate arguments ---
if [[ $# -lt 1 ]]; then
    safe_echo "ERROR" "Usage: $0 <client-name>"
    echo "  Example: $0 aiden-pc"
    exit 1
fi

CLIENT_NAME="$1"

if [[ ! "${CLIENT_NAME}" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]*$ ]]; then
    safe_echo "ERROR" "Invalid client name '${CLIENT_NAME}'."
    echo "  Use alphanumeric characters and hyphens only."
    exit 1
fi

# --- Verify server is installed ---
if [[ ! -f "${WG_CONF}" ]]; then
    safe_echo "ERROR" "Server not installed. Run 01-install-server.sh first."
    exit 1
fi

if [[ ! -f "${SERVER_PUBLIC_KEY}" ]]; then
    safe_echo "ERROR" "Server public key not found at ${SERVER_PUBLIC_KEY}."
    exit 1
fi

mkdir -p "${CLIENTS_DIR}"

CLIENT_CONF="${CLIENTS_DIR}/${CLIENT_NAME}.conf"
if [[ -f "${CLIENT_CONF}" ]]; then
    safe_echo "ERROR" "Client config already exists: ${CLIENT_CONF}"
    echo "  Choose a different name or remove the existing file."
    exit 1
fi

# --- Find next available client IP ---
find_next_client_ip() {
    local used_ips=()
    local ip

    # Collect IPs already assigned in wg0.conf
    while IFS= read -r ip; do
        [[ -n "${ip}" ]] && used_ips+=("${ip}")
    done < <(grep -E 'AllowedIPs\s*=\s*10\.66\.66\.[0-9]+' "${WG_CONF}" 2>/dev/null \
        | sed -E 's/.*10\.66\.66\.([0-9]+).*/\1/' || true)

    local candidate="${CLIENT_IP_START}"
    while [[ "${candidate}" -le 254 ]]; do
        local found=false
        for ip in "${used_ips[@]:-}"; do
            if [[ "${ip}" == "${candidate}" ]]; then
                found=true
                break
            fi
        done
        if [[ "${found}" == "false" ]]; then
            echo "${candidate}"
            return 0
        fi
        candidate=$((candidate + 1))
    done

    safe_echo "ERROR" "No available client IPs in 10.66.66.0/24 subnet."
    exit 1
}

CLIENT_OCTET="$(find_next_client_ip)"
CLIENT_TUNNEL_IP="10.66.66.${CLIENT_OCTET}/32"

safe_echo "INFO" "Assigning client IP: ${CLIENT_TUNNEL_IP}"

# --- Generate client keys ---
CLIENT_PRIVATE_KEY="$(wg genkey)"
CLIENT_PUBLIC_KEY="$(echo "${CLIENT_PRIVATE_KEY}" | wg pubkey)"

SERVER_PUB="$(cat "${SERVER_PUBLIC_KEY}")"
PUBLIC_IP="$(get_public_ip || true)"
CLIENT_ALLOWED_IPS="${ROUTELAG_ALLOWED_IPS:-}"

if [[ -z "${CLIENT_ALLOWED_IPS}" ]]; then
    safe_echo "ERROR" "ROUTELAG_ALLOWED_IPS must be set to captured Fortnite Middle East /32 routes."
    echo "  Example: ROUTELAG_ALLOWED_IPS='203.0.113.10/32,203.0.113.11/32' $0 ${CLIENT_NAME}"
    exit 1
fi

IFS=',' read -ra ALLOWED_IP_ENTRIES <<< "${CLIENT_ALLOWED_IPS}"
for allowed_ip in "${ALLOWED_IP_ENTRIES[@]}"; do
    allowed_ip="$(echo "${allowed_ip}" | xargs)"
    if [[ ! "${allowed_ip}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/32$ ]]; then
        safe_echo "ERROR" "Unsafe AllowedIPs entry '${allowed_ip}'. Only IPv4 /32 routes are allowed."
        exit 1
    fi
done

# --- Write client config ---
cat > "${CLIENT_CONF}" <<EOF
# RouteLag MVP — client config for ${CLIENT_NAME}
# Import this file into the WireGuard app on your PC.

[Interface]
PrivateKey = ${CLIENT_PRIVATE_KEY}
Address = ${CLIENT_TUNNEL_IP}
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUB}
Endpoint = ${PUBLIC_IP}:${WG_PORT}
AllowedIPs = ${CLIENT_ALLOWED_IPS}
PersistentKeepalive = 25
EOF

chmod 600 "${CLIENT_CONF}"
safe_echo "INFO" "Client config written to: ${CLIENT_CONF}"

# --- Add peer to server config ---
backup_file "${WG_CONF}"

cat >> "${WG_CONF}" <<EOF

[Peer]
# ${CLIENT_NAME}
PublicKey = ${CLIENT_PUBLIC_KEY}
AllowedIPs = ${CLIENT_TUNNEL_IP}
EOF

safe_echo "INFO" "Peer added to ${WG_CONF}"

# --- Restart WireGuard ---
systemctl restart "wg-quick@${WG_INTERFACE}"
sleep 1

if ! systemctl is-active --quiet "wg-quick@${WG_INTERFACE}"; then
    safe_echo "ERROR" "WireGuard failed to restart after adding peer."
    journalctl -u "wg-quick@${WG_INTERFACE}" -n 20 --no-pager || true
    exit 1
fi

# --- Verify peer registered ---
if wg show "${WG_INTERFACE}" 2>/dev/null | grep -qF "${CLIENT_PUBLIC_KEY}"; then
    safe_echo "INFO" "Peer registered successfully."
else
    safe_echo "WARN" "Peer may not be visible until client connects."
fi

# --- Output instructions ---
print_section "Client Created: ${CLIENT_NAME}"
echo ""
echo "  Config file: ${CLIENT_CONF}"
echo ""
echo "  Copy to your local computer:"
echo "    scp root@${PUBLIC_IP}:${CLIENT_CONF} ."
echo ""
echo "  Import into WireGuard:"
echo "    Windows — see docs/WINDOWS-CLIENT.md"
echo "    Mac     — see docs/MAC-CLIENT.md"
echo ""
echo "  After connecting, verify your public IP changed:"
echo "    curl -4 ifconfig.me"
echo ""
safe_echo "INFO" "Client '${CLIENT_NAME}' created successfully."
