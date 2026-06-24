import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ServerConfig } from "./config.js";
import type { RouteSession } from "./store.js";

const execFileAsync = promisify(execFile);

export interface PeerStatus {
  latestHandshake: string | null;
  transferRx: string | null;
  transferTx: string | null;
  active: boolean;
}

export class PeerManager {
  constructor(private readonly config: ServerConfig) {}

  allocateIp(activeSessions: RouteSession[]): string {
    const used = new Set(activeSessions.map((session) => session.clientIp.split("/")[0]));
    for (let octet = 2; octet <= 254; octet += 1) {
      const ip = `10.66.66.${octet}`;
      if (!used.has(ip)) return `${ip}/32`;
    }
    throw new Error("No available tunnel IPs");
  }

  async createPeer(publicKey: string, clientIp: string): Promise<void> {
    if (this.config.peerMode === "mock") return;
    await execFileAsync("wg", [
      "set",
      this.config.wgInterface,
      "peer",
      publicKey,
      "allowed-ips",
      clientIp,
    ]);
  }

  async removePeer(publicKey: string): Promise<void> {
    if (this.config.peerMode === "mock") return;
    await execFileAsync("wg", ["set", this.config.wgInterface, "peer", publicKey, "remove"]);
  }

  async getPeerStatus(publicKey: string): Promise<PeerStatus> {
    if (this.config.peerMode === "mock") {
      return {
        latestHandshake: null,
        transferRx: null,
        transferTx: null,
        active: false,
      };
    }
    const { stdout } = await execFileAsync("wg", ["show", this.config.wgInterface]);
    return parsePeerStatus(stdout, publicKey);
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
