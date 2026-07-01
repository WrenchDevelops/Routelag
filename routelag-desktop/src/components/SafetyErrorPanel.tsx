import type { InlineError } from "../types";

interface SafetyErrorPanelProps {
  error: InlineError;
  onRepair?: () => void;
  onRetry?: () => void;
  onRestore?: () => void;
  showRepair?: boolean;
}

export function SafetyErrorPanel({
  error,
  onRestore,
  onRepair,
  onRetry,
  showRepair = true,
}: SafetyErrorPanelProps) {
  const canRepair = showRepair && onRepair;
  const hasActions =
    (error.canRetry && onRetry) || (error.canRestore && onRestore) || canRepair;

  return (
    <section className="safety-error-panel">
      <div>
        <strong>{error.title}</strong>
        <p>{error.message}</p>
      </div>
      {hasActions && (
        <div className="safety-error-actions">
          {error.canRetry && onRetry && (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          )}
          {error.canRestore && onRestore && (
            <button type="button" className="danger-action" onClick={onRestore}>
              Restore Internet
            </button>
          )}
          {canRepair && (
            <button type="button" onClick={onRepair}>
              Repair Windows Network
            </button>
          )}
        </div>
      )}
    </section>
  );
}
