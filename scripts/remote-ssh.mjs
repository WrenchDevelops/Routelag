#!/usr/bin/env node
/** Minimal SSH helper for one-off VPS setup (password auth). */
import { Client } from "ssh2";

const [host, password, ...cmdParts] = process.argv.slice(2);
if (!host || !password || cmdParts.length === 0) {
  console.error("Usage: node remote-ssh.mjs <host> <password> <command...>");
  process.exit(1);
}

const command = cmdParts.join(" ");
const conn = new Client();

conn
  .on("ready", () => {
    conn.exec(command, (err, stream) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
      }
      stream
        .on("close", (code) => {
          conn.end();
          process.exit(code ?? 0);
        })
        .on("data", (data) => process.stdout.write(data))
        .stderr.on("data", (data) => process.stderr.write(data));
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
