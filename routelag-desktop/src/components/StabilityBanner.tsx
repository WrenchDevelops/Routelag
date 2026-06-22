import type { TunnelHealth } from "../types";
import { healthTone } from "../types";

interface StabilityBannerProps {
  health: TunnelHealth | null;
  onReconnect: () => void;
  reconnecting?: boolean;
}

const toneBorder = {
  success: "border-success/40 bg-success/10 text-green-100",
  warning: "border-warning/40 bg-warning/10 text-amber-100",
  error: "border-error/40 bg-error/10 text-red-200",
  muted: "border-border bg-card text-muted",
};

export function StabilityBanner({
  health,
  onReconnect,
  reconnecting,
}: StabilityBannerProps) {
  if (!health || health.status === "disconnected") return null;

  const tone = health.reconnect_recommended ? "error" : healthTone(health.status);

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneBorder[tone]}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Tunnel health: {health.status}
            {health.handshake_secs_ago != null && (
              <span className="ml-2 font-normal opacity-80">
                Handshake {health.handshake_secs_ago}s ago
              </span>
            )}
          </p>
          <p className="mt-1 text-sm opacity-90">{health.message}</p>
        </div>
        {health.reconnect_recommended && (
          <button
            type="button"
            onClick={onReconnect}
            disabled={reconnecting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {reconnecting ? "Reconnecting..." : "Reconnect Tunnel"}
          </button>
        )}
      </div>
    </div>
  );
}
