import type { TunnelHealth } from "../types";

interface StuckTunnelBannerProps {
  health: TunnelHealth | null;
  onReconnect: () => void;
  onDisconnect: () => void;
  onEmergencyCleanup: () => void;
  reconnecting?: boolean;
  busy?: boolean;
}

export function StuckTunnelBanner({
  health,
  onReconnect,
  onDisconnect,
  onEmergencyCleanup,
  reconnecting,
  busy,
}: StuckTunnelBannerProps) {
  if (!health?.stuck_tunnel) return null;

  return (
    <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-red-100">
      <p className="text-sm font-medium">{health.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReconnect}
          disabled={reconnecting || busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reconnecting ? "Reconnecting..." : "Reconnect Tunnel"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect RouteLag
        </button>
        <button
          type="button"
          onClick={onEmergencyCleanup}
          disabled={busy}
          className="rounded-lg border border-error/40 px-4 py-2 text-sm text-red-200 hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Emergency Cleanup
        </button>
      </div>
    </div>
  );
}
