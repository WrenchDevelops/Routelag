import { PingCard } from "./PingCard";
import type { DiagnosticsReport, MtuTestResult, TunnelHealth } from "../types";
import { healthTone, scoreTone } from "../types";

const toneClasses = {
  success: "text-success border-success/40",
  warning: "text-warning border-warning/40",
  error: "text-error border-error/40",
  muted: "text-muted border-border",
};

interface ScoreCardProps {
  label: string;
  value: string;
  tone?: keyof typeof toneClasses;
}

function ScoreCard({ label, value, tone = "muted" }: ScoreCardProps) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

interface DiagnosticsCardsProps {
  report: DiagnosticsReport | null;
  health: TunnelHealth | null;
  mtu: MtuTestResult | null;
}

export function DiagnosticsSummaryCards({
  report,
  health,
  mtu,
}: DiagnosticsCardsProps) {
  const score = report?.route_score ?? "—";
  const scoreT = scoreTone(score);
  const healthStatus = health?.status ?? "—";
  const healthT = health ? healthTone(health.status) : "muted";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ScoreCard label="Route Score" value={score} tone={scoreT} />
      <div className="rounded-xl border border-border bg-card p-4 sm:col-span-1 lg:col-span-1">
        <p className="text-xs uppercase tracking-wide text-muted">Recommendation</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-200">
          {report?.recommendation ?? "Run full diagnostics to get a recommendation."}
        </p>
      </div>
      <ScoreCard
        label="Tunnel Health"
        value={healthStatus}
        tone={healthT}
      />
      <PingCard
        title="MTU Test"
        value={
          mtu
            ? `Best: ${mtu.best_mtu ?? "none"} · Use ${mtu.recommended_mtu}`
            : report
              ? `Recommended ${report.mtu.recommended_mtu}`
              : "—"
        }
        subtitle={
          mtu && !mtu.best_mtu
            ? "All probes failed — try MTU 1280"
            : undefined
        }
        highlight={mtu && !mtu.best_mtu ? "warning" : "default"}
      />
    </div>
  );
}

interface RouteComparisonProps {
  report: DiagnosticsReport | null;
}

export function RouteComparisonCard({ report }: RouteComparisonProps) {
  if (!report) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
        No comparison data yet.
      </div>
    );
  }

  const { comparison, normal_route, routelag_route } = report;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-white">Normal vs Zer0</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-muted">Normal route</p>
          <p className="mt-1 font-mono text-lg">
            {comparison.normal_avg_ping_ms != null
              ? `${Math.round(comparison.normal_avg_ping_ms)} ms`
              : "—"}
          </p>
          <p className="text-sm text-muted">
            Loss {comparison.normal_packet_loss_pct ?? "—"}%
            {report.include_public_ip && normal_route.public_ip && (
              <> · IP {normal_route.public_ip}</>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-muted">Zer0 route</p>
          <p className="mt-1 font-mono text-lg">
            {comparison.tunnel_avg_ping_ms != null
              ? `${Math.round(comparison.tunnel_avg_ping_ms)} ms`
              : "—"}
          </p>
          <p className="text-sm text-muted">
            Loss {comparison.tunnel_packet_loss_pct ?? "—"}%
            {report.include_public_ip && routelag_route?.public_ip && (
              <> · IP {routelag_route.public_ip}</>
            )}
          </p>
        </div>
      </div>
      {comparison.ping_delta_ms != null && (
        <p
          className={`mt-4 text-sm ${
            comparison.ping_delta_ms > 15 ? "text-warning" : "text-success"
          }`}
        >
          Ping delta: {comparison.ping_delta_ms > 0 ? "+" : ""}
          {Math.round(comparison.ping_delta_ms)} ms
          {comparison.public_ip_changed ? " · Public IP changed" : ""}
        </p>
      )}
    </div>
  );
}
