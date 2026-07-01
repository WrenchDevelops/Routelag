interface MiniFooterNavProps {
  onDiagnostics?: () => void;
  onRestoreInternet: () => void;
  onExport?: () => void;
  onLogs?: () => void;
  cleanupBusy?: boolean;
}

export function MiniFooterNav({
  cleanupBusy,
  onDiagnostics,
  onRestoreInternet,
  onExport,
  onLogs,
}: MiniFooterNavProps) {
  return (
    <nav className="mini-footer" aria-label="RouteLag tools">
      {onDiagnostics && (
        <button type="button" onClick={onDiagnostics}>
          Diagnostics
        </button>
      )}
      {onExport && (
        <button type="button" onClick={onExport}>
          Export
        </button>
      )}
      {onLogs && (
        <button type="button" onClick={onLogs}>
          Logs
        </button>
      )}
      <button
        type="button"
        className="mini-footer-danger"
        onClick={onRestoreInternet}
        disabled={cleanupBusy}
      >
        {cleanupBusy ? "Restoring..." : "Restore Internet"}
      </button>
    </nav>
  );
}
