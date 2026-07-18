import fs from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node analyze-pcapng.mjs <file.pcapng>");
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const dstUdp = new Map();
const dstAll = new Map();
const dstIpOnly = new Map();
const srcUdp = new Map();

function ip4(bytes, offset) {
  return `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
}

function bump(map, key, bytes = 1) {
  map.set(key, (map.get(key) ?? 0) + bytes);
}

const EXCLUDE_DST = new Set([
  "216.152.154.137",
  "66.163.122.222",
]);

function isPrivateIp(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function parseIpPacket(pkt) {
  let offset = 0;
  if (pkt.length >= 14 && pkt.readUInt16BE(12) === 0x0800) {
    offset = 14;
  } else if (pkt.length >= 20 && (pkt[0] >> 4) === 4) {
    offset = 0;
  } else {
    return;
  }

  if (pkt.length < offset + 20) return;
  const version = pkt[offset] >> 4;
  if (version !== 4) return;

  const ihl = (pkt[offset] & 0x0f) * 4;
  if (ihl < 20 || pkt.length < offset + ihl) return;
  const protocol = pkt[offset + 9];
  const src = ip4(pkt, offset + 12);
  const dst = ip4(pkt, offset + 16);
  const payloadLen = Math.max(0, pkt.length - offset - ihl);

  if (EXCLUDE_DST.has(dst)) return;
  if (isPrivateIp(dst)) return;
  if (dst.startsWith("10.67.") || dst.startsWith("10.68.")) return;

  bump(dstAll, `${src} -> ${dst}`, payloadLen);

  if (protocol !== 17) return;
  if (pkt.length < offset + ihl + 8) return;
  const udpOffset = offset + ihl;
  const srcPort = pkt.readUInt16BE(udpOffset);
  const dstPort = pkt.readUInt16BE(udpOffset + 2);
  const udpPayload = Math.max(0, pkt.length - udpOffset - 8);
  const key = `${dst}:${dstPort}`;
  bump(dstUdp, key, udpPayload);
  bump(dstIpOnly, dst, udpPayload);
  bump(srcUdp, `${src}:${srcPort} -> ${dst}:${dstPort}`, udpPayload);
}

let offset = 0;
let blocks = 0;
let packets = 0;

while (offset + 12 <= buf.length) {
  const blockType = buf.readUInt32LE(offset);
  const blockLen = buf.readUInt32LE(offset + 4);
  if (blockLen < 12 || offset + blockLen > buf.length) break;

  if (blockType === 0x00000006) {
    if (blockLen >= 32) {
      const capLen = buf.readUInt32LE(offset + 20);
      const pktStart = offset + 28;
      const pktEnd = Math.min(pktStart + capLen, offset + blockLen - 4);
      if (pktEnd > pktStart) {
        parseIpPacket(buf.subarray(pktStart, pktEnd));
        packets += 1;
      }
    }
  } else if (blockType === 0x00000002) {
    if (blockLen >= 32) {
      const capLen = buf.readUInt32LE(offset + 20);
      const pktStart = offset + 28;
      const pktEnd = Math.min(pktStart + capLen, offset + blockLen - 4);
      if (pktEnd > pktStart) {
        parseIpPacket(buf.subarray(pktStart, pktEnd));
        packets += 1;
      }
    }
  }

  blocks += 1;
  offset += blockLen;
}

function topEntries(map, limit = 25) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

console.log(JSON.stringify({
  file: filePath,
  sizeBytes: buf.length,
  blocks,
  packetsParsed: packets,
  topUdpDestinations: topEntries(dstUdp, 40),
  topUdpDestinationIps: topEntries(dstIpOnly, 25),
  topUdpFlows: topEntries(srcUdp, 30),
  topIpFlows: topEntries(dstAll, 20),
}, null, 2));
