# Multi-Hop Routing Architecture

**Status: NOT IMPLEMENTED in this build (v0.1.3)**

This document describes the intended architecture for multi-hop (route chain) routing. No chain routing is active in the current beta. Chain route candidates shown in the Auto Route screen are always marked "Multi-hop coming soon" and cannot be started.

`POST /api/routes/create` with `routePlan.type = "chain"` returns HTTP 409:
```
"Multi-hop routing is not available in this build."
```

---

## Intended Architecture

When implemented, a two-node chain (e.g. Johannesburg → Frankfurt) works as follows:

```
Client (SA)
  │
  │  WireGuard tunnel (targeted /32 only, no 0.0.0.0/0)
  ▼
Entry Node (Johannesburg VPS)
  │
  │  Internal forwarding to exit node
  │  (iptables DNAT or policy route — game IPs only)
  ▼
Exit Node (Frankfurt VPS)
  │
  │  NAT to Fortnite Middle East game server
  ▼
Fortnite Game Server
```

Return path: `Fortnite → Exit → Entry → Client`

---

## Requirements for Real Chain Routing

### Client tunnel

- Client establishes WireGuard tunnel to **entry node only**.
- `AllowedIPs` remains strictly `/32` host routes (Fortnite game IPs) — never `0.0.0.0/0` or `::/0`.
- Full tunnel is blocked at both API (server-side `allowedIpsAreTargeted` check) and client (`classifyAllowedIps`).

### Entry node responsibilities

- Accepts inbound game-IP packets from the client.
- Forwards those IPs to the exit node via internal tunnel or static route.
- Does NOT forward general internet traffic.
- Runs per-session firewall rules scoped to the game IPs.
- Cleans up forwarding rules on session end or timeout.

### Exit node responsibilities

- Receives forwarded game-IP packets from the entry node.
- NATs them to the Fortnite game server using the exit node's public IP.
- Returns traffic back to the entry node.
- Runs per-session NAT rules scoped to the tester's tunnel IP.
- Cleans up NAT rules on session end or timeout.

### Session lifecycle for chain routes

1. Client calls `POST /api/routes/create` with `routePlan.type = "chain"`, `entryServerId`, `exitServerId`.
2. API creates a WireGuard peer on the entry node (existing peer management).
3. API sets up inter-node forwarding rule on entry node (new: SSH or control plane).
4. API sets up NAT rule on exit node (new: SSH or control plane).
5. API returns entry node connection details to client (same format as today).
6. Client connects tunnel to entry node (unchanged).
7. On session end: API removes peer and cleans up both nodes' rules.
8. On timeout: background cleanup runs on both nodes.
9. Emergency cleanup (Restore Internet) removes client-side tunnel, then calls `POST /api/routes/end`.

### Safety requirements (unchanged from single-hop)

| Requirement | Enforcement point |
|-------------|-------------------|
| No full tunnel (`0.0.0.0/0`, `::/0`) | API create + client classify |
| Targeted `/32` only | `allowedIpsAreTargeted()` on both nodes |
| Restore Internet always visible | `MiniFooterNav` (client) |
| End Optimization visible during active route | `StatsPage` (client) |
| Rollback on create failure | `routeEngine.ts` |
| Missing/stopped services = cleanup success | `cleanup.rs` |
| No Fortnite file modification | unchanged (RouteLag only routes traffic) |
| No anti-cheat bypass | unchanged |

### Inter-node control plane (not yet built)

To set up forwarding and NAT rules on remote nodes, the API needs a control channel to each VPS. Options:

- **SSH + iptables scripts** — simplest, works with existing Ubuntu 24 VPS setup.
- **WireGuard inter-node tunnel** — more robust but adds complexity.
- **Agent daemon on each node** — most flexible, required for production.

In beta, SSH with scoped iptables scripts is the recommended first step. Each node accepts inbound connections from the API server's IP only.

### Scoring for chain routes

Once real chain routing is implemented, Auto Route will measure:

```
estimated_total_ms = client_to_entry_ms + entry_to_exit_ms + exit_to_game_ms
```

Where:
- `client_to_entry_ms` — measured from client to entry node endpoint (ICMP or TCP).
- `entry_to_exit_ms` — measured from entry node to exit node (server-side probe, RouteLag nodes only).
- `exit_to_game_ms` — measured from exit node to Fortnite game IPs (ICMP if responsive, omitted otherwise).

Chain hop penalty in scoring formula: `+8 ms`.

---

## Current State Summary

| Feature | Status |
|---------|--------|
| Single-hop routing (client → one node) | Implemented |
| Chain candidates in Auto Route (estimate-only) | Implemented |
| Chain route creation | Rejected with clear error |
| Inter-node forwarding rules | Not implemented |
| Inter-node NAT | Not implemented |
| Dual-node session management | Not implemented |
| Inter-node control plane | Not implemented |

Do not implement chain routing until the inter-node control plane, per-session firewall cleanup, and session timeout logic are in place on both nodes.
