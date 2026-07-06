import fs from "node:fs";

const buf = fs.readFileSync(process.argv[2]);
let offset = 0;
let n = 0;
const linkTypes = new Map();

while (offset + 12 <= buf.length && n < 5) {
  const blockType = buf.readUInt32LE(offset);
  const blockLen = buf.readUInt32LE(offset + 4);
  if (blockLen < 12 || offset + blockLen > buf.length) break;

  if (blockType === 0x00000001) {
    // IDB
    let o = offset + 8;
    while (o + 4 <= offset + blockLen - 4) {
      const optCode = buf.readUInt16LE(o);
      const optLen = buf.readUInt16LE(o + 2);
      if (optCode === 0) break;
      if (optCode === 1 && optLen >= 4) {
        const linkType = buf.readUInt16LE(o + 4);
        linkTypes.set(linkType, (linkTypes.get(linkType) ?? 0) + 1);
        console.log("IDB linktype", linkType);
      }
      o += 4 + optLen;
      if (optLen % 4) o += 4 - (optLen % 4);
    }
  }

  if (blockType === 0x00000006 || blockType === 0x00000002) {
    const capLen = buf.readUInt32LE(offset + 20);
    const pktStart = offset + 28;
    const pkt = buf.subarray(pktStart, pktStart + Math.min(capLen, 128));
    console.log(`block ${blockType.toString(16)} capLen=${capLen} first64=${pkt.subarray(0, 64).toString("hex")}`);
    n++;
  }

  offset += blockLen;
}

console.log("linkTypes", [...linkTypes.entries()]);
