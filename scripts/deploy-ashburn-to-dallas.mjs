#!/usr/bin/env node
/**
 * Push Ashburn provisioning assets to the Dallas API VPS.
 *
 * Usage:
 *   node scripts/deploy-ashburn-to-dallas.mjs <dallas-host> <dallas-password>
 *
 * Copies:
 *   - server/data/nodes.production.json -> /opt/routelag-server/data/nodes.json
 *   - server/keys/ashburn-provisioner   -> /opt/routelag-server/keys/ashburn-provisioner
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const [host, password] = process.argv.slice(2);
if (!host || !password) {
  console.error("Usage: node scripts/deploy-ashburn-to-dallas.mjs <dallas-host> <dallas-password>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uploads = [
  {
    local: join(root, "server/data/nodes.production.json"),
    remote: "/opt/routelag-server/data/nodes.json",
    mode: 0o644,
  },
  {
    local: join(root, "server/keys/ashburn-provisioner"),
    remote: "/opt/routelag-server/keys/ashburn-provisioner",
    mode: 0o600,
  },
];

const conn = new Client();

function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream
        .on("close", (code) => {
          if (code === 0) resolve(out);
          else reject(new Error(`Command failed (${code}): ${cmd}\n${out}`));
        })
        .on("data", (data) => {
          out += data.toString();
          process.stdout.write(data);
        })
        .stderr.on("data", (data) => process.stderr.write(data));
    });
  });
}

conn
  .on("ready", () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
      }
      try {
        await exec("mkdir -p /opt/routelag-server/data /opt/routelag-server/keys");
        for (const file of uploads) {
          await new Promise((resolve, reject) => {
            sftp.writeFile(file.remote, readFileSync(file.local), { mode: file.mode }, (writeErr) => {
              if (writeErr) reject(writeErr);
              else resolve(undefined);
            });
          });
          console.log(`Uploaded ${file.remote}`);
        }
        await exec(
          "systemctl restart routelag-api 2>/dev/null || systemctl restart routelag-server 2>/dev/null || pm2 restart routelag-server 2>/dev/null || echo 'Restart the RouteLag API service manually.'",
        );
        conn.end();
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        conn.end();
        process.exit(1);
      }
    });
  })
  .on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  })
  .connect({
    host,
    port: 22,
    username: "root",
    password,
    readyTimeout: 30000,
  });
