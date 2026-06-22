import type { TunnelStatus } from "../types";
import { normalizeTunnelStatus } from "../types";

interface StatusCardProps {
  status: TunnelStatus;
  elevated?: boolean;
}

const toneClasses = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  error: "border-error/40 bg-error/10 text-error",
  muted: "border-border bg-card text-muted",
};

export function StatusCard({ status, elevated }: StatusCardProps) {
  const { label, tone } = normalizeTunnelStatus(status);
  const errorMessage = status.state === "error" ? status.message : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium ${toneClasses[tone]}`}
      >
        <span
          className={`mr-2 h-2 w-2 rounded-full ${
            tone === "success"
              ? "bg-success"
              : tone === "warning"
                ? "bg-warning"
                : tone === "error"
                  ? "bg-error"
                  : "bg-muted"
          }`}
        />
        {label}
      </span>
      {elevated !== undefined && (
        <span className="text-xs text-muted">
          {elevated ? "Admin mode" : "Normal mode"}
        </span>
      )}
      {errorMessage && (
        <span className="text-sm text-error">{errorMessage}</span>
      )}
    </div>
  );
}
