#!/usr/bin/env node
/** Deploy built RouteLag server to the Dallas VPS. */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const [host, password] = process.argv.slice(2);
if (!host || !password) {
  console.error("Usage: node scripts/deploy-server-to-dallas.mjs <dallas-host> <dallas-password>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "server");
const tarball = join(root, "routelag-server-deploy.tgz");

execSync("npm run build", { cwd: root, stdio: "inherit" });
execSync(
  `tar -czf "${tarball}" dist package.json${existsSync(join(root, "package-lock.json")) ? " package-lock.json" : ""}`,
  { cwd: root, stdio: "inherit", shell: true },
);

const conn = new Client();

function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream
        .on("close", (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error(`Command failed (${code}): ${cmd}`));
        })
        .on("data", (data) => process.stdout.write(data))
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
        await new Promise((resolve, reject) => {
          const remoteTar = "/tmp/routelag-server-deploy.tgz";
          const stream = sftp.createWriteStream(remoteTar, { mode: 0o644 });
          stream.on("close", resolve);
          stream.on("error", reject);
          createReadStream(tarball).pipe(stream);
        });
        console.log("Uploaded server bundle");
        await exec(
          "cd /opt/routelag-server && tar xzf /tmp/routelag-server-deploy.tgz && npm ci --omit=dev && systemctl restart routelag-api && sleep 2 && systemctl is-active routelag-api && curl -s http://127.0.0.1:3001/health",
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
