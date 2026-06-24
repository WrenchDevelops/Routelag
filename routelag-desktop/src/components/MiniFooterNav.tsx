interface MiniFooterNavProps {
  onDiagnostics: () => void;
  onExport: () => void;
  onLogs: () => void;
}

export function MiniFooterNav({
  onDiagnostics,
  onExport,
  onLogs,
}: MiniFooterNavProps) {
  return (
    <nav className="mini-footer" aria-label="RouteLag tools">
      <button type="button" onClick={onDiagnostics}>
        Diagnostics
      </button>
      <button type="button" onClick={onExport}>
        Export
      </button>
      <button type="button" onClick={onLogs}>
        Logs
      </button>
    </nav>
  );
}
