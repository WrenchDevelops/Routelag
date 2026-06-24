interface LogsPageProps {
  logs: string;
  onBack: () => void;
}

export function LogsPage({ logs, onBack }: LogsPageProps) {
  return (
    <div className="tool-view">
      <header className="tool-header">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1>Connection Logs</h1>
          <p>RouteLag Engine events</p>
        </div>
        <span className="header-spacer" />
      </header>
      <div className="tool-copy">
        <span className="panel-label">Recent Activity</span>
      </div>
      <pre className="logs-box">{logs || "No logs yet."}</pre>
    </div>
  );
}
