import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  CloudUpload,
  FolderSearch,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { api } from "../api";
import { ensurePathGenSession, getPathGenToken, routeApi, PATHGEN_API_URL, type PathGenReplayQuota } from "../lib/api";
import type { LocalReplayFile, PathGenReplayDetail, PathGenReplaySummary, ReplayJob } from "../types";

type ReplayRow =
  | { kind: "local"; id: string; file: LocalReplayFile }
  | { kind: "job"; id: string; job: ReplayJob }
  | { kind: "parsed"; id: string; replay: PathGenReplaySummary };

export function ReplayEnginePage() {
  const [localFiles, setLocalFiles] = useState<LocalReplayFile[]>([]);
  const [jobs, setJobs] = useState<ReplayJob[]>([]);
  const [replays, setReplays] = useState<PathGenReplaySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PathGenReplayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quota, setQuota] = useState<PathGenReplayQuota | null>(null);
  const [deepAnalyzing, setDeepAnalyzing] = useState(false);
  const localPathByHashRef = useRef<Record<string, string>>({});
  const renamedHashesRef = useRef<Set<string>>(new Set());

  const rows = useMemo<ReplayRow[]>(() => {
    const parsedRows = replays.map((replay) => ({ kind: "parsed" as const, id: replay.id, replay }));
    const parsedJobIds = new Set(replays.map((replay) => replay.jobId));
    const jobRows = jobs
      .filter((job) => !parsedJobIds.has(job.id))
      .map((job) => ({ kind: "job" as const, id: job.id, job }));
    const knownHashes = new Set([
      ...jobs.map((job) => job.fileHash),
      ...replays.map((replay) => replay.fileHash),
    ]);
    const localRows = localFiles
      .filter((file) => !file.file_hash || !knownHashes.has(file.file_hash))
      .map((file) => ({ kind: "local" as const, id: file.path, file }));
    const query = search.trim().toLowerCase();
    const allRows = [...jobRows, ...parsedRows, ...localRows];
    if (!query) return allRows;
    return allRows.filter((row) => `${titleFor(row)} ${subtitleFor(row)}`.toLowerCase().includes(query));
  }, [jobs, localFiles, replays]);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const activeJobs = jobs.filter((job) => job.status !== "parsed");

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const hasActiveJobs = jobs.some((job) =>
      ["uploaded", "osirion_pending", "fetching_match_data", "uploading"].includes(job.status),
    );
    const hasActiveDeep = replays.some((replay) => replay.deepParseStatus === "analyzing");
    if (!hasActiveJobs && !hasActiveDeep) return undefined;
    const timer = window.setInterval(() => {
      void refresh();
    }, 90000);
    return () => window.clearInterval(timer);
  }, [jobs, replays]);

  useEffect(() => {
    for (const replay of replays) {
      if (replay.status !== "parsed" || renamedHashesRef.current.has(replay.fileHash)) continue;
      const sourcePath = localPathByHashRef.current[replay.fileHash];
      if (!sourcePath) continue;
      renamedHashesRef.current.add(replay.fileHash);
      const newName = parsedReplayFileName(replay);
      void api
        .renameParsedReplay(sourcePath, newName)
        .then(() => {
          setMessage(`Replay renamed to ${newName}.replay`);
          void api.scanReplayFolder().then(setLocalFiles).catch(() => undefined);
        })
        .catch(() => undefined);
    }
  }, [replays]);

  useEffect(() => {
    if (selected?.kind !== "parsed") {
      setSelectedDetail(null);
      return;
    }
    void routeApi
      .getParsedReplay(selected.replay.id)
      .then(setSelectedDetail)
      .catch(() => setSelectedDetail(null));
  }, [selected?.id]);

  async function refresh(options?: { clearMessage?: boolean }) {
    if (options?.clearMessage) {
      setMessage(null);
    }

    setLoading(true);
    try {
      const nextLocal = await api.scanReplayFolder().catch(() => [] as LocalReplayFile[]);
      setLocalFiles(nextLocal);
      setSelectedId(
        (current) => current ?? nextLocal[0]?.path ?? null,
      );
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }

    setSyncingRemote(true);
    try {
      const sessionReady = await ensurePathGenSession();
      if (!sessionReady) {
        setJobs([]);
        setReplays([]);
        setQuota(null);
        setMessage((current) =>
          current ??
            "PathGen cloud sync is unavailable. You can still import and scan local .replay files.",
        );
        return;
      }

      const [rawJobs, initialReplays, nextQuota] = await Promise.all([
        routeApi.getReplayJobs().catch((error) => {
          setMessage(readError(error));
          return [] as ReplayJob[];
        }),
        routeApi.getParsedReplays().catch((error) => {
          setMessage(readError(error));
          return [] as PathGenReplaySummary[];
        }),
        routeApi.getReplayQuota().catch(() => null),
      ]);
      let nextReplays = initialReplays;

      const pendingStatuses = new Set([
        "uploaded",
        "osirion_pending",
        "fetching_match_data",
        "uploading",
      ]);
      const nextJobs = await Promise.all(
        rawJobs.map((job) =>
          pendingStatuses.has(job.status)
            ? routeApi.getReplayJob(job.id, { sync: true }).catch(() => job)
            : job,
        ),
      );
      let nextReplays = await routeApi.getParsedReplays().catch((error) => {
        setMessage(readError(error));
        return [] as PathGenReplaySummary[];
      });
      if (nextJobs.some((job) => job.status === "parsed") && !nextReplays.length) {
        nextReplays = await routeApi.getParsedReplays().catch(() => [] as PathGenReplaySummary[]);
      }
      setJobs(nextJobs as ReplayJob[]);
      setReplays(nextReplays as PathGenReplaySummary[]);
      setQuota(nextQuota);
      setSelectedId(
        (current) =>
          current ??
          nextReplays[0]?.id ??
          nextJobs[0]?.id ??
          null,
      );
    } finally {
      setSyncingRemote(false);
    }
  }

  async function chooseReplayFolder() {
    setMessage(null);
    try {
      // Folder picker opens in the Fortnite Demos directory by default.
      const folder = await api.selectReplayFolder();
      const files = await api.scanReplayFolder(folder);
      setLocalFiles(files);
      setSelectedId((current) => current ?? files[0]?.path ?? null);
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function scanDefaultReplayFolder() {
    setMessage(null);
    try {
      const files = await api.scanReplayFolder();
      setLocalFiles(files);
      setSelectedId((current) => current ?? files[0]?.path ?? null);
      if (!files.length) {
        setMessage("No .replay files found in your Fortnite Demos folder.");
      }
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function importReplayFile() {
    setMessage(null);
    try {
      const file = await api.importReplayFile();
      const withHash = { ...file, file_hash: await api.hashReplayFile(file.path) };
      setLocalFiles((current) => [withHash, ...current.filter((item) => item.path !== withHash.path)]);
      setSelectedId(withHash.path);
      await uploadLocalReplay(withHash);
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function uploadLocalReplay(file: LocalReplayFile) {
    setUploading(true);
    setMessage("Uploading replay to PathGen...");
    const ready = await ensurePathGenSession();
    const token = getPathGenToken();
    if (!ready || !token) {
      setUploading(false);
      setMessage("PathGen login failed. Log out and sign in again with your invite code.");
      return;
    }
    try {
      const fileHash = file.file_hash ?? (await api.hashReplayFile(file.path));
      localPathByHashRef.current[fileHash] = file.path;
      const bodyText = await api.uploadReplayFile(file.path, PATHGEN_API_URL, token);
      const body = JSON.parse(bodyText) as {
        job?: ReplayJob;
        duplicate?: boolean;
        error?: string;
      };
      if (body.error) throw new Error(body.error);
      if (body.job) {
        setJobs((current) => [body.job as ReplayJob, ...current.filter((job) => job.id !== body.job?.id)]);
        setSelectedId(body.job.id);
        setMessage(
          body.duplicate
            ? "This replay was already submitted. PathGen is checking parse status."
            : body.job.status === "failed"
              ? `Upload failed: ${body.job.errorMessage ?? "Osirion could not parse this replay."}`
              : "PathGen is creating your basic match summary.",
        );
      } else {
        throw new Error("PathGen server did not return a replay job.");
      }
      if (body.job?.fileHash) {
        localPathByHashRef.current[body.job.fileHash] = file.path;
      }
      setLocalFiles((current) => current.filter((item) => item.path !== file.path));
      await refresh();
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setUploading(false);
    }
  }

  async function retryFailedJob(job: ReplayJob) {
    setMessage("Checking replay parse status...");
    try {
      const next = await routeApi.getReplayJob(job.id, { sync: true });
      setJobs((current) => [next as ReplayJob, ...current.filter((item) => item.id !== next.id)]);
      setSelectedId(next.id);
      if (next.status === "parsed" && next.replayId) {
        setMessage("Replay parsed successfully.");
        await refresh();
        return;
      }
      if (next.status === "failed") {
        setMessage(next.errorMessage ?? "Replay failed to parse. Try uploading the file again.");
        return;
      }
      setMessage("PathGen is still analyzing this replay.");
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function deepAnalyzeSelected() {
    if (selected?.kind !== "parsed") return;
    setDeepAnalyzing(true);
    setMessage("Running deep analyze...");
    try {
      const result = await routeApi.deepAnalyzeReplay(selected.replay.id);
      setQuota(result.quota);
      setReplays((current) =>
        current.map((replay) =>
          replay.id === result.replay.summary.id ? result.replay.summary : replay,
        ),
      );
      setSelectedDetail(result.replay);
      setMessage("Deep analyze complete.");
      await refresh();
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setDeepAnalyzing(false);
    }
  }

  function exportSupportReport() {
    if (!selected) return;
    const report =
      selected.kind === "job"
        ? supportReportForJob(selected.job)
        : selected.kind === "parsed"
          ? supportReportForReplay(selected.replay)
          : supportReportForLocal(selected.file);
    void navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
    setMessage("Replay support report copied.");
  }

  return (
    <main className="replay-engine-main">
      <header className="replay-header">
        <div>
          <div className="replay-title-row">
            <h1>PathGen Replay Engine</h1>
            <span className="replay-fortnite-pill">
              <img src="/games/fortnite.jpg" alt="" />
              Fortnite
            </span>
          </div>
          <p>Every replay gets a free basic summary. Deep analysis is limited per month.</p>
        </div>
        {quota ? (
          <div className="replay-quota-pill">
            Deep: {quota.remaining}/{quota.limit} mo · {quota.dailyRemaining}/{quota.dailyLimit} today
          </div>
        ) : null}
        <div className="replay-header-actions">
          <ReplayToolbarButton variant="primary" icon={Upload} onClick={() => void importReplayFile()}>
            Import Replay
          </ReplayToolbarButton>
          <ReplayToolbarButton variant="secondary" icon={FolderSearch} onClick={() => void scanDefaultReplayFolder()}>
            Scan Folder
          </ReplayToolbarButton>
        </div>
      </header>

      {message && <p className="pathgen-note">{message}</p>}

      <div className="replay-layout">
        <section className="replay-panel replay-list-panel">
          <div className="replay-panel-heading">
            <div>
              <h2>Replay Library</h2>
              <p>
                {loading
                  ? "Scanning local replay folder..."
                  : syncingRemote
                    ? "Syncing PathGen cloud replays..."
                    : "Real Fortnite replay files analyzed by PathGen."}
              </p>
            </div>
            <button type="button" aria-label="Refresh replays" onClick={() => void refresh({ clearMessage: true })}>
              <RefreshIcon />
            </button>
          </div>

          <label className="replay-search">
            <SearchIcon />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search replays..."
            />
          </label>

          <div className="replay-card-list">
            {rows.length ? (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`replay-card ${selected?.id === row.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <img src={thumbnailFor(row)} alt="" />
                  <span>
                    <strong>{titleFor(row)}</strong>
                    <small>{subtitleFor(row)}</small>
                  </span>
                  <em>{placementFor(row)}<small>Place</small></em>
                  <em>{numberValue(elimsFor(row))}<small>Elims</small></em>
                  <em>{durationFor(row)}<small>Duration</small></em>
                </button>
              ))
            ) : (
              <LibraryEmptyState onImport={importReplayFile} onFolder={scanDefaultReplayFolder} />
            )}
          </div>
          <small className="replay-count">Showing {rows.length} real replay items</small>

          <UploadQueue jobs={activeJobs} />
        </section>

        <section className="replay-panel replay-summary-panel">
          {selected ? (
            <ReplaySummary
              row={selected}
              detail={selectedDetail}
              quota={quota}
              uploading={uploading}
              deepAnalyzing={deepAnalyzing}
              onUpload={uploadLocalReplay}
              onDeepAnalyze={deepAnalyzeSelected}
              onRetryJob={retryFailedJob}
              onExport={exportSupportReport}
            />
          ) : (
            <PathGenOnboarding onImport={importReplayFile} onFolder={chooseReplayFolder} />
          )}
        </section>
      </div>
    </main>
  );
}

function ReplaySummary({
  row,
  detail,
  quota,
  uploading,
  deepAnalyzing,
  onUpload,
  onDeepAnalyze,
  onRetryJob,
  onExport,
}: {
  row: ReplayRow;
  detail: PathGenReplayDetail | null;
  quota: PathGenReplayQuota | null;
  uploading: boolean;
  deepAnalyzing: boolean;
  onUpload: (file: LocalReplayFile) => Promise<void>;
  onDeepAnalyze: () => Promise<void>;
  onRetryJob: (job: ReplayJob) => Promise<void>;
  onExport: () => void;
}) {
  if (row.kind === "local") {
    return (
      <div className="replay-selected-state">
        <div className="replay-selected-state-card">
          <span className="replay-state-icon replay-state-icon-large">
            <Upload size={28} strokeWidth={2.1} aria-hidden />
          </span>
          <div className="replay-selected-state-copy">
            <h2 title={row.file.name}>{row.file.name}</h2>
            <p>Ready to upload for PathGen analysis.</p>
          </div>
          <button
            type="button"
            className="replay-primary-button"
            disabled={uploading}
            onClick={() => void onUpload(row.file)}
          >
            {uploading ? "Uploading..." : "Upload Replay"}
          </button>
        </div>
      </div>
    );
  }

  if (row.kind === "job") {
    const failed = row.job.status === "failed";
    return (
      <div className="replay-selected-state">
        <div className={`replay-selected-state-card${failed ? " is-failed" : ""}`}>
          <span className={`replay-state-icon replay-state-icon-large ${failed ? "failed" : ""}`}>
            {failed ? (
              <AlertTriangle size={28} strokeWidth={2.1} aria-hidden />
            ) : (
              <BarChart3 size={28} strokeWidth={2.1} aria-hidden />
            )}
          </span>
          <div className="replay-selected-state-copy">
            <h2>{failed ? "Replay failed to parse." : "PathGen is analyzing this replay."}</h2>
            <p>{failed ? row.job.errorMessage ?? "The replay could not be parsed." : statusLabel(row.job.status)}</p>
          </div>
          <div className="replay-job-progress">
            <span title={row.job.fileName}>{row.job.fileName}</span>
            <strong>{failed ? "Failed" : "Analyzing"}</strong>
          </div>
          <div className="replay-actions replay-actions-centered">
            {failed && (
              <button type="button" onClick={() => void onRetryJob(row.job)}>
                Retry Parse
              </button>
            )}
            <button type="button" onClick={onExport}>Export Support Report</button>
          </div>
        </div>
      </div>
    );
  }

  const replay = mergeReplaySummary(row.replay, detail?.summary);
  const moments = detail?.keyMoments ?? [];
  const deepStatus = replay.deepParseStatus ?? "available";
  const weapons = Array.isArray(detail?.stats?.weapons) ? (detail?.stats?.weapons as Array<Record<string, unknown>>) : [];
  const zoneStats = Array.isArray(detail?.zoneStats) ? detail.zoneStats : [];
  const canDeepAnalyze =
    (deepStatus === "available" || deepStatus === "failed" || deepStatus === "none") &&
    (quota?.canTrigger ?? false);

  return (
    <>
      <div className="replay-summary-hero">
        <img src={replay.thumbnailUrl ?? "/games/fortnite.jpg"} alt="" />
        <div>
          <h2>PathGen Match Summary</h2>
          <strong>{friendlyModeLabel(replay.mode ?? replay.playlist) ?? replay.fileName}</strong>
          <span>{dateLabel(replay.startedAt ?? replay.parsedAt ?? replay.createdAt)}</span>
          <small>{replay.region ?? "--"} · Fortnite</small>
        </div>
      </div>

      <div className="replay-stat-grid">
        <StatCard value={replay.placement == null ? "--" : `#${replay.placement}`} label="Placement" />
        <StatCard value={numberValue(replay.eliminations)} label="Eliminations" />
        <StatCard value={numberValue(replay.assists)} label="Assists" />
        <StatCard value={numberValue(replay.damageDealt)} label="Damage" />
        <StatCard value={durationValue(replay.durationSeconds ?? replay.timeAliveSeconds)} label="Survival Time" />
        <StatCard value={replay.accuracy == null ? "--" : `${replay.accuracy}%`} label="Accuracy" />
        <StatCard value={numberValue(replay.damageTaken)} label="Damage Taken" />
        <StatCard value={numberValue(replay.distanceTraveled)} label="Distance Traveled" />
      </div>

      <div className="replay-actions">
        {canDeepAnalyze ? (
          <button
            type="button"
            className="replay-primary-button"
            disabled={deepAnalyzing}
            onClick={() => void onDeepAnalyze()}
          >
            {deepAnalyzing ? "Deep analyzing..." : "Deep Analyze Match"}
          </button>
        ) : deepStatus === "parsed" ? (
          <span className="pathgen-note">Deep analysis complete.</span>
        ) : deepStatus === "analyzing" ? (
          <span className="pathgen-note">Deep analyze in progress...</span>
        ) : quota && !quota.canTrigger ? (
          <span className="pathgen-note">
            {quota.cooldownRemainingMs > 0
              ? `Deep analyze cooldown (${Math.ceil(quota.cooldownRemainingMs / 1000)}s).`
              : quota.dailyRemaining <= 0
                ? `Daily deep limit reached (${quota.dailyLimit}/day).`
                : `Monthly deep limit reached (${quota.limit}/month).`}
          </span>
        ) : null}
        <button type="button" onClick={onExport}>Export Support Report</button>
      </div>

      {quota ? (
        <p className="pathgen-note">
          Deep analyzes: {quota.remaining}/{quota.limit} this month · {quota.dailyRemaining}/{quota.dailyLimit} today
        </p>
      ) : null}

      {deepStatus === "failed" && replay.deepParseError ? (
        <p className="pathgen-note">{replay.deepParseError}</p>
      ) : null}

      {deepStatus === "parsed" && weapons.length ? (
        <>
          <div className="replay-moments-header">
            <h2>Weapon Breakdown</h2>
            <span>Top weapons by damage</span>
          </div>
          <div className="replay-queue-list">
            {weapons
              .slice()
              .sort((a, b) => Number(b.damage ?? 0) - Number(a.damage ?? 0))
              .slice(0, 6)
              .map((weapon, index) => (
                <div key={`${weapon.weaponId ?? index}`} className="replay-queue-row">
                  <span>{String(weapon.weaponId ?? "Weapon")}</span>
                  <small>
                    {numberValue(Number(weapon.damage ?? 0))} dmg · {numberValue(Number(weapon.hits ?? 0))} hits
                  </small>
                </div>
              ))}
          </div>
        </>
      ) : null}

      {deepStatus === "parsed" && zoneStats.length ? (
        <>
          <div className="replay-moments-header">
            <h2>Zone Performance</h2>
            <span>Stats by storm zone</span>
          </div>
          <div className="replay-queue-list">
            {(zoneStats as Array<Record<string, unknown>>)
              .slice(0, 8)
              .map((zone, index) => (
                <div key={`zone_${zone.zoneIndex ?? index}`} className="replay-queue-row">
                  <span>Zone {String(zone.zoneIndex ?? index + 1)}</span>
                  <small>
                    {numberValue(Number(zone.damageToPlayers ?? zone.damageDone ?? 0))} dmg ·{" "}
                    {numberValue(Number(zone.eliminations ?? zone.humanElims ?? 0))} elims
                  </small>
                </div>
              ))}
          </div>
        </>
      ) : null}

      <div className="replay-moments-header">
        <h2>PathGen Key Moments</h2>
        <span>{deepStatus === "parsed" ? "Deep analysis" : "Run deep analyze for fight timeline"}</span>
      </div>
      {moments.length ? (
        <div className="replay-moment-grid">
          {moments.map((moment) => (
            <article key={moment.id} className="replay-moment">
              <div>
                <strong>{durationValue(moment.timestampSeconds)}</strong>
                <span>{moment.title}</span>
              </div>
              {moment.thumbnailUrl ? <img src={moment.thumbnailUrl} alt="" /> : <PlayIcon />}
            </article>
          ))}
        </div>
      ) : (
        <p className="pathgen-note">
          {canDeepAnalyze
            ? "Basic summary ready. Use Deep Analyze for kills, storm timing, and loadout changes."
            : "No key moments found for this replay."}
        </p>
      )}
    </>
  );
}

function LibraryEmptyState({
  onImport,
  onFolder,
}: {
  onImport: () => Promise<void>;
  onFolder: () => Promise<void>;
}) {
  return (
    <div className="replay-library-empty">
      <span className="replay-folder-illustration"><FolderPlayIcon /></span>
      <strong>No replays imported</strong>
      <p>Import a Fortnite .replay file or scan your replay folder.</p>
      <div className="replay-actions replay-actions-centered">
        <ReplayToolbarButton variant="primary" icon={Upload} onClick={() => void onImport()}>
          Import Replay
        </ReplayToolbarButton>
        <ReplayToolbarButton variant="secondary" icon={FolderSearch} onClick={() => void onFolder()}>
          Scan Folder
        </ReplayToolbarButton>
      </div>
    </div>
  );
}

function UploadQueue({ jobs }: { jobs: ReplayJob[] }) {
  return (
    <div className="replay-upload-queue">
      <div className="replay-section-label">
        <strong>
          <Upload size={14} strokeWidth={2.2} aria-hidden />
          Upload Queue
        </strong>
        <span>{jobs.length ? `${jobs.length} active` : "No active uploads"}</span>
      </div>
      {jobs.length ? (
        <div className="replay-queue-list">
          {jobs.slice(0, 4).map((job) => (
            <div key={job.id} className={`replay-queue-row ${job.status === "failed" ? "failed" : ""}`}>
              <span>{job.fileName}</span>
              <small>{statusLabel(job.status)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p>No active uploads</p>
      )}
    </div>
  );
}

function PathGenOnboarding({
  onImport,
  onFolder,
}: {
  onImport: () => Promise<void>;
  onFolder: () => Promise<void>;
}) {
  return (
    <div className="pathgen-onboarding">
      <div className="pathgen-onboarding-copy">
        <span className="replay-kicker">PathGen Ready</span>
        <h2>Get Started with PathGen</h2>
        <p>Import Fortnite replay files and PathGen will turn them into match summaries, stats, and key moments.</p>
      </div>

      <div className="pathgen-steps">
        <StepCard index="1" title="Import Replay" text="Choose a .replay file or scan your replay folder." />
        <StepCard index="2" title="PathGen Analyzes" text="Your replay is uploaded, parsed, and normalized." />
        <StepCard index="3" title="Review Match" text="See placement, eliminations, damage, and key moments." />
      </div>

      <div className="pathgen-drop-zone">
        <span className="replay-cloud-icon">
          <CloudUpload size={34} strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <strong>Drop .replay files here</strong>
          <p>or choose a replay folder</p>
        </div>
        <div className="replay-actions">
          <ReplayToolbarButton variant="primary" icon={Upload} onClick={() => void onImport()}>
            Import Replay
          </ReplayToolbarButton>
          <ReplayToolbarButton variant="secondary" icon={FolderSearch} onClick={() => void onFolder()}>
            Choose Folder
          </ReplayToolbarButton>
        </div>
      </div>

      <div className="parser-status-card">
        <h3>Parser Status</h3>
        <StatusRow icon={<BarChart3 size={15} strokeWidth={2.2} aria-hidden />} label="PathGen" value="Ready" tone="ready" />
        <StatusRow icon={<CloudUpload size={15} strokeWidth={2.2} aria-hidden />} label="Replay uploads" value="Waiting" />
        <StatusRow icon={<Clock3 size={15} strokeWidth={2.2} aria-hidden />} label="Last analysis" value="None yet" />
      </div>
    </div>
  );
}

function StepCard({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <article className="pathgen-step-card">
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "ready";
}) {
  return (
    <div className="parser-status-row">
      <span>{icon}{label}</span>
      <strong className={tone === "ready" ? "ready" : ""}>{value}</strong>
    </div>
  );
}

function ReplayToolbarButton({
  variant = "secondary",
  icon: Icon,
  onClick,
  children,
}: {
  variant?: "primary" | "secondary";
  icon: LucideIcon;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`replay-toolbar-btn replay-toolbar-btn--${variant}`}
      onClick={onClick}
    >
      <Icon size={17} strokeWidth={2.2} aria-hidden />
      <span>{children}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="replay-stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function mergeReplaySummary(
  summary: PathGenReplaySummary,
  detailSummary?: PathGenReplaySummary | null,
): PathGenReplaySummary {
  if (!detailSummary) return summary;
  return { ...summary, ...detailSummary };
}

function titleFor(row: ReplayRow) {
  if (row.kind === "local") return row.file.name;
  if (row.kind === "job") return row.job.fileName;
  return row.replay.mode ?? row.replay.playlist ?? row.replay.fileName;
}

function subtitleFor(row: ReplayRow) {
  if (row.kind === "local") return "Local replay found";
  if (row.kind === "job") return statusLabel(row.job.status);
  return dateLabel(row.replay.startedAt ?? row.replay.parsedAt ?? row.replay.createdAt);
}

function thumbnailFor(row: ReplayRow) {
  return row.kind === "parsed" ? row.replay.thumbnailUrl ?? "/games/fortnite.jpg" : "/games/fortnite.jpg";
}

function placementFor(row: ReplayRow) {
  return row.kind === "parsed" && row.replay.placement != null ? `#${row.replay.placement}` : "--";
}

function elimsFor(row: ReplayRow) {
  return row.kind === "parsed" ? row.replay.eliminations : null;
}

function durationFor(row: ReplayRow) {
  return row.kind === "parsed" ? durationValue(row.replay.durationSeconds) : "--";
}

function numberValue(value: number | null | undefined) {
  return value == null ? "--" : value.toLocaleString();
}

function durationValue(seconds: number | null | undefined) {
  if (seconds == null) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function dateLabel(value: string | number | null | undefined) {
  if (value == null) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function friendlyModeLabel(mode: string | null | undefined) {
  if (!mode) return null;
  return mode
    .replace(/^Playlist_/i, "")
    .replace(/^Default/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function parsedReplayFileName(replay: PathGenReplaySummary) {
  const place = replay.placement != null ? `P${replay.placement}` : "P--";
  const mode = (friendlyModeLabel(replay.mode ?? replay.playlist) ?? "Match").replace(/\s+/g, "");
  const region = replay.region ?? "UNK";
  const date = formatReplayDate(replay.startedAt ?? replay.parsedAt ?? replay.createdAt);
  return `PathGen-${place}-${mode}-${region}-${date}`;
}

function formatReplayDate(value: string | number | null | undefined) {
  const date = value == null ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "uploading":
      return "Uploading replay...";
    case "uploaded":
    case "osirion_pending":
    case "fetching_match_data":
      return "PathGen is analyzing this replay.";
    case "parsed":
      return "Parsed";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

function supportReportForJob(job: ReplayJob) {
  return {
    appVersion: "desktop",
    replayJobId: job.id,
    replayFileHash: job.fileHash,
    uploadStatus: job.status,
    parseStatus: job.status,
    parserErrorCode: job.errorCode ?? null,
    providerJobId: job.providerTrackingId ?? null,
    timestamps: { createdAt: job.createdAt, updatedAt: job.updatedAt, parsedAt: job.parsedAt ?? null },
  };
}

function supportReportForReplay(replay: PathGenReplaySummary) {
  return {
    appVersion: "desktop",
    replayJobId: replay.jobId,
    replayFileHash: replay.fileHash,
    uploadStatus: "uploaded",
    parseStatus: replay.status,
    parserErrorCode: null,
    providerJobId: null,
    timestamps: { createdAt: replay.createdAt, parsedAt: replay.parsedAt ?? null },
  };
}

function supportReportForLocal(file: LocalReplayFile) {
  return {
    appVersion: "desktop",
    replayJobId: null,
    replayFileHash: file.file_hash ?? null,
    uploadStatus: file.status,
    parseStatus: "not_started",
    parserErrorCode: null,
    providerJobId: null,
    timestamps: { modifiedAt: file.modified_at },
  };
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Replay action failed.";
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 5v5h-5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 7 8 5-8 5V7Z" />
    </svg>
  );
}

function FolderPlayIcon() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true">
      <path d="M7 13h18l4 4h28v24a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V13Z" />
      <path d="M11 9h16l4 4h23" />
      <path d="m29 25 11 7-11 7V25Z" />
    </svg>
  );
}
