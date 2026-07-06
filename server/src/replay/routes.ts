import { createHash, timingSafeEqual } from "node:crypto";
import { createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";

import type { ServerConfig } from "../config.js";
import type { TokenClaims } from "../auth.js";
import { normalizeOsirionToPathGen } from "./pathgenNormalizer.js";
import { OsirionClientAdapter } from "./osirionClient.js";
import { ReplayStore } from "./replayStore.js";
import type { PathGenReplayDetail, ReplayJob } from "./types.js";

interface AuthedReplayRequest extends FastifyRequest {
  tester: TokenClaims;
}

export async function registerReplayRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  store: ReplayStore,
) {
  const maxBytes = config.replayUploadMaxMb * 1024 * 1024;
  const osirion = new OsirionClientAdapter(config);
  mkdirSync(config.replayStorageDir, { recursive: true });

  await app.register(multipart, {
    limits: {
      fileSize: maxBytes,
      files: 1,
    },
  });

  app.post("/api/replays/upload", async (request, reply) => {
    const tester = (request as AuthedReplayRequest).tester;
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "Replay file is required." });

    const originalName = sanitizeFileName(part.filename);
    if (extname(originalName).toLowerCase() !== ".replay") {
      await part.file.resume();
      return reply.code(400).send({ error: "Only Fortnite .replay files can be uploaded." });
    }

    const localName = `${Date.now()}-${tester.testerId}-${originalName}`;
    const savedPath = join(config.replayStorageDir, localName);
    const hash = createHash("sha256");
    part.file.on("data", (chunk) => hash.update(chunk));

    try {
      await pipeline(part.file, createWriteStream(savedPath, { flags: "wx" }));
    } catch (error) {
      unlinkIfExists(savedPath);
      return reply.code(400).send({ error: uploadError(error) });
    }

    const size = statSync(savedPath).size;
    if (part.file.truncated) {
      unlinkIfExists(savedPath);
      return reply.code(413).send({ error: `Replay is larger than ${config.replayUploadMaxMb} MB.` });
    }
    if (size > maxBytes) {
      unlinkIfExists(savedPath);
      return reply.code(413).send({ error: `Replay is larger than ${config.replayUploadMaxMb} MB.` });
    }

    const fileHash = hash.digest("hex");
    const duplicate = store.findJobByHash(tester.testerId, fileHash);
    if (duplicate && duplicate.status !== "failed") {
      unlinkIfExists(savedPath);
      return {
        duplicate: true,
        job: publicJob(duplicate),
      };
    }

    let job = store.createJob({
      userId: tester.testerId,
      inviteCode: tester.inviteCode,
      fileName: originalName,
      fileHash,
      fileSizeBytes: size,
      status: "uploaded",
      provider: "osirion",
    });

    try {
      const submitted = await osirion.submitReplayFile(savedPath);
      job = store.updateJob(job.id, {
        providerTrackingId: submitted.trackingId,
        status: "osirion_pending",
      }) ?? job;
    } catch (error) {
      job = store.updateJob(job.id, {
        status: "failed",
        errorCode: "OSIRION_SUBMIT_FAILED",
        errorMessage: safeError(error),
      }) ?? job;
    }

    return reply.code(201).send({ duplicate: false, job: publicJob(job) });
  });

  app.get("/api/replays/jobs", async (request) => {
    const tester = (request as AuthedReplayRequest).tester;
    return { jobs: store.listJobs(tester.testerId).map(publicJob) };
  });

  app.get<{ Params: { jobId: string } }>("/api/replays/jobs/:jobId", async (request, reply) => {
    const tester = (request as AuthedReplayRequest).tester;
    let job = store.getJob(request.params.jobId, tester.testerId);
    if (!job) return reply.code(404).send({ error: "Replay job not found." });
    job = await syncReplayJob(job, store, osirion);
    return { job: publicJob(job) };
  });

  app.get("/api/replays", async (request) => {
    const tester = (request as AuthedReplayRequest).tester;
    return {
      replays: store.listReplays(tester.testerId).map((replay) => replay.summary),
    };
  });

  app.get<{ Params: { replayId: string } }>("/api/replays/:replayId", async (request, reply) => {
    const tester = (request as AuthedReplayRequest).tester;
    const replay = store.getReplay(request.params.replayId, tester.testerId);
    if (!replay) return reply.code(404).send({ error: "Replay not found." });
    return { replay: publicReplay(replay) };
  });

  app.post<{ Params: { replayId: string } }>("/api/replays/:replayId/reparse", async (request, reply) => {
    const tester = (request as AuthedReplayRequest).tester;
    const replay = store.getReplay(request.params.replayId, tester.testerId);
    if (!replay) return reply.code(404).send({ error: "Replay not found." });
    const job = store.updateJob(replay.summary.jobId, {
      status: "osirion_pending",
      errorCode: undefined,
      errorMessage: undefined,
    });
    return { job: job ? publicJob(job) : null };
  });

  app.post("/api/replays/osirion/webhook", async (request, reply) => {
    if (!config.osirionWebhookSecret) return reply.code(404).send({ error: "Not found" });
    const header = String(request.headers["x-osirion-signature"] ?? "");
    if (!secureEquals(header, config.osirionWebhookSecret)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    return { ok: true };
  });
}

export async function syncReplayJob(
  job: ReplayJob,
  store: ReplayStore,
  osirion: OsirionClientAdapter,
): Promise<ReplayJob> {
  if (!job.providerTrackingId || job.status === "parsed" || job.status === "failed") return job;
  try {
    const status = await osirion.getUploadStatus(job.providerTrackingId);
    if (status.status === "COMPLETE" && status.matchId) {
      let nextJob = store.updateJob(job.id, {
        status: "fetching_match_data",
        providerMatchId: status.matchId,
        lastCheckedAt: new Date().toISOString(),
      }) ?? job;
      const match = await osirion.fetchMatch(status.matchId);
      const replay = normalizeOsirionToPathGen({
        jobId: job.id,
        userId: job.userId,
        fileName: job.fileName,
        fileHash: job.fileHash,
        createdAt: job.createdAt,
        match,
      });
      store.saveReplay(replay);
      nextJob = store.updateJob(job.id, {
        status: "parsed",
        replayId: replay.summary.id,
        parsedAt: replay.summary.parsedAt ?? new Date().toISOString(),
      }) ?? nextJob;
      return nextJob;
    }
    if (status.status === "FAILED") {
      return store.updateJob(job.id, {
        status: "failed",
        errorCode: "OSIRION_PARSE_FAILED",
        errorMessage: status.error ?? "Replay failed to parse.",
        lastCheckedAt: new Date().toISOString(),
      }) ?? job;
    }
    return store.updateJob(job.id, {
      status: "osirion_pending",
      lastCheckedAt: new Date().toISOString(),
    }) ?? job;
  } catch (error) {
    return store.updateJob(job.id, {
      status: "failed",
      errorCode: "OSIRION_POLL_FAILED",
      errorMessage: safeError(error),
    }) ?? job;
  }
}

function publicJob(job: ReplayJob) {
  return job;
}

function publicReplay(replay: PathGenReplayDetail): PathGenReplayDetail {
  const { rawProviderMetadata, ...safeReplay } = replay;
  return safeReplay;
}

function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^A-Za-z0-9._ -]/g, "_");
}

function unlinkIfExists(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // Best-effort cleanup.
  }
}

function uploadError(error: unknown) {
  const message = safeError(error);
  return message.includes("File too large") ? "Replay is too large." : message;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Replay processing failed.";
}

function secureEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
