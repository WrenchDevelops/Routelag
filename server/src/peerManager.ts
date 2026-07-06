import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ServerConfig } from "./config.js";
import { clientStartOctet, tunnelNetworkPrefix, type RouteNode } from "./nodes.js";
import { PeersStore } from "./peersStore.js";
import type { RouteSession } from "./store.js";

const execFileAsync = promisify(execFile);

export interface PeerStatus {
  latestHandshake: string | null;
  transferRx: string | null;
  transferTx: string | null;
  active: boolean;
}

/** Thrown when a node's provisioner.mode is "disabled". Callers should map this to HTTP 409. */
export class PeerProvisioningDisabledError extends Error {
  constructor(public readonly nodeId: string) {
    super("Peer provisioning is not configured for this node yet.");
    this.name = "PeerProvisioningDisabledError";
  }
}

export class PeerManager {
  private readonly peersStore: PeersStore;

  constructor(private readonly config: ServerConfig) {
    this.peersStore = new PeersStore(config.peersFile, config.wgConfigFile);
  }

  /** Allocates the next free client IP from the given node's own tunnel subnet. */
  allocateIp(node: RouteNode, activeSessions: RouteSession[]): string {
    const networkPrefix = tunnelNetworkPrefix(node.tunnelCidr);
    const startOctet = clientStartOctet(node.clientStartIp);
    const used = new Set(
      activeSessions
        .filter((session) => session.nodeId === node.id)
        .map((session) => session.clientIp.split("/")[0]),
    );
    const persisted = new Set(
      this.peersStore.listPeersForNode(node.id).map((peer) => peer.clientIp.split("/")[0]),
    );
    for (let octet = startOctet; octet <= 254; octet += 1) {
      const ip = `${networkPrefix}.${octet}`;
      if (!used.has(ip) && !persisted.has(ip)) return `${ip}/32`;
    }
    throw new Error(`No available tunnel IPs in ${node.tunnelCidr}`);
  }

  findPersistedPeer(node: RouteNode, publicKey: string) {
    return this.peersStore.findPeer(node.id, publicKey);
  }

  async createPeer(
    node: RouteNode,
    clientPublicKey: string,
    clientIp: string,
    testerId?: string,
  ): Promise<void> {
    if (node.provisioner.mode === "disabled") {
      throw new PeerProvisioningDisabledError(node.id);
    }
    if (this.config.peerMode === "mock") return;
    if (node.provisioner.mode === "ssh") {
      throw new Error(`SSH-based peer provisioning is not implemented yet for node "${node.id}".`);
    }
    // Server-side peer AllowedIPs must be the client tunnel /32 only — never game targets.
    await execFileAsync("wg", [
      "set",
      node.wgInterface,
      "peer",
      clientPublicKey,
      "allowed-ips",
      clientIp,
    ]);
    this.peersStore.upsertPeer({
      nodeId: node.id,
      publicKey: clientPublicKey,
      clientIp,
      createdAt: new Date().toISOString(),
      testerId,
    });
  }

  async removePeer(node: RouteNode, clientPublicKey: string): Promise<void> {
    if (this.config.peerMode === "mock" || node.provisioner.mode !== "local") {
      this.peersStore.removePeer(node.id, clientPublicKey);
      return;
    }
    await execFileAsync("wg", ["set", node.wgInterface, "peer", clientPublicKey, "remove"]);
    this.peersStore.removePeer(node.id, clientPublicKey);
  }

  async getPeerStatus(node: RouteNode, clientPublicKey: string): Promise<PeerStatus> {
    if (this.config.peerMode === "mock" || node.provisioner.mode !== "local") {
      return {
        latestHandshake: null,
        transferRx: null,
        transferTx: null,
        active: false,
      };
    }
    const { stdout } = await execFileAsync("wg", ["show", node.wgInterface]);
    return parsePeerStatus(stdout, clientPublicKey);
  }
}

export function parsePeerStatus(wgShow: string, publicKey: string): PeerStatus {
  const lines = wgShow.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `peer: ${publicKey}`);
  if (start === -1) {
    return { latestHandshake: null, transferRx: null, transferTx: null, active: false };
  }
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("peer:")) break;
    block.push(lines[i].trim());
  }
  const handshake = readField(block, "latest handshake");
  const transfer = readField(block, "transfer");
  const [rx, tx] = transfer?.split(",").map((part) => part.trim()) ?? [null, null];
  return {
    latestHandshake: handshake,
    transferRx: rx,
    transferTx: tx,
    active: Boolean(handshake && !handshake.includes("day")),
  };
}

function readField(lines: string[], field: string): string | null {
  const prefix = `${field}:`;
  const line = lines.find((item) => item.toLowerCase().startsWith(prefix));
  return line?.slice(prefix.length).trim() || null;
}
