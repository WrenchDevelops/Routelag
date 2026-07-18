#!/usr/bin/env node
/** Upload files and run a remote command via password SSH. */
import { readFileSync } from "node:fs";
import { Client } from "ssh2";

const [host, password, remoteDir, ...localFiles] = process.argv.slice(2);
if (!host || !password || !remoteDir || localFiles.length === 0) {
  console.error("Usage: node remote-upload.mjs <host> <password> <remoteDir> <localFile...>");
  process.exit(1);
}

const remoteCommand = process.env.REMOTE_CMD ?? "";
const conn = new Client();

conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err.message);
        conn.end();
        process.exit(1);
      }

      conn.exec(`mkdir -p ${remoteDir}`, (mkdirErr) => {
        if (mkdirErr) {
          console.error(mkdirErr.message);
          conn.end();
          process.exit(1);
        }

        let pending = localFiles.length;
        for (const localPath of localFiles) {
          const base = localPath.replace(/\\/g, "/").split("/").pop();
          const remotePath = `${remoteDir}/${base}`;
          const data = readFileSync(localPath);
          sftp.writeFile(remotePath, data, { mode: 0o755 }, (writeErr) => {
            if (writeErr) {
              console.error(writeErr.message);
              conn.end();
              process.exit(1);
            }
            pending -= 1;
            if (pending === 0) {
              if (!remoteCommand) {
                conn.end();
                return;
              }
              conn.exec(remoteCommand, (execErr, stream) => {
                if (execErr) {
                  console.error(execErr.message);
                  conn.end();
                  process.exit(1);
                }
                stream
                  .on("close", (code) => {
                    conn.end();
                    process.exit(code ?? 0);
                  })
                  .on("data", (d) => process.stdout.write(d))
                  .stderr.on("data", (d) => process.stderr.write(d));
              });
            }
          });
        }
      });
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
