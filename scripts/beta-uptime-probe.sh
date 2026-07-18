#!/usr/bin/env bash
# External uptime probe helper for Zer0 / RouteLag trusted beta.
# Usage:
#   API_BASE=http://216.152.154.137:3001 ./scripts/beta-uptime-probe.sh
# Prefer /healthz; fall back to /health when /healthz is not deployed yet.
# For alert delivery + consecutive-failure policy see:
#   scripts/beta-dallas-monitor.mjs
#   scripts/beta-dallas-alert.mjs
#   docs/BETA_MONITORING.md

set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3001}"
BASE="${API_BASE%/}"
TMP="$(mktemp)"

probe() {
  local url="$1"
  local code
  code=$(curl -sS -o "${TMP}" -w "%{http_code}" --max-time 10 "${url}" || true)
  echo "Probing ${url} -> HTTP ${code} body=$(tr '\n' ' ' < "${TMP}" | head -c 400)"
  echo "${code}"
}

CODE="$(probe "${BASE}/healthz")"
if [[ "${CODE}" == "404" ]]; then
  echo "/healthz missing — falling back to /health"
  CODE="$(probe "${BASE}/health")"
fi

rm -f "${TMP}"

if [[ "${CODE}" != "200" ]]; then
  echo "Uptime probe failed"
  exit 1
fi

echo "Uptime probe ok"
exit 0
