import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PersistedPeer {
  nodeId: string;
  publicKey: string;
  clientIp: string;
  createdAt: string;
  testerId?: string;
}

interface PeersFileShape {
  peers: PersistedPeer[];
}

export class PeersStore {
  constructor(
    private readonly filePath: string,
    private readonly wgConfigPath: string,
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  listPeers(): PersistedPeer[] {
    return this.read().peers;
  }

  listPeersForNode(nodeId: string): PersistedPeer[] {
    return this.listPeers().filter((peer) => peer.nodeId === nodeId);
  }

  findPeer(nodeId: string, publicKey: string): PersistedPeer | null {
    return (
      this.listPeers().find((peer) => peer.nodeId === nodeId && peer.publicKey === publicKey) ??
      null
    );
  }

  upsertPeer(peer: PersistedPeer): void {
    const db = this.read();
    const index = db.peers.findIndex(
      (item) => item.nodeId === peer.nodeId && item.publicKey === peer.publicKey,
    );
    if (index === -1) {
      db.peers.push(peer);
    } else {
      db.peers[index] = peer;
    }
    this.write(db);
    this.syncWgConfig(db.peers);
  }

  removePeer(nodeId: string, publicKey: string): void {
    const db = this.read();
    db.peers = db.peers.filter((peer) => !(peer.nodeId === nodeId && peer.publicKey === publicKey));
    this.write(db);
    this.syncWgConfig(db.peers);
  }

  private read(): PeersFileShape {
    if (!existsSync(this.filePath)) {
      return { peers: [] };
    }
    return JSON.parse(readFileSync(this.filePath, "utf8")) as PeersFileShape;
  }

  private write(db: PeersFileShape): void {
    writeFileSync(this.filePath, `${JSON.stringify(db, null, 2)}\n`);
  }

  private syncWgConfig(peers: PersistedPeer[]): void {
    if (!this.wgConfigPath || !existsSync(this.wgConfigPath)) {
      return;
    }
    const base = readBaseWgConfig(this.wgConfigPath);
    const peerBlocks = peers.map(
      (peer) =>
        `[Peer]\nPublicKey = ${peer.publicKey}\nAllowedIPs = ${peer.clientIp}\n`,
    );
    writeFileSync(this.wgConfigPath, `${base}${peerBlocks.join("\n")}`.trimEnd() + "\n");
  }
}

function readBaseWgConfig(path: string): string {
  const content = readFileSync(path, "utf8");
  const marker = content.indexOf("\n[Peer]");
  if (marker === -1) {
    return content.endsWith("\n") ? content : `${content}\n`;
  }
  return content.slice(0, marker + 1);
}
