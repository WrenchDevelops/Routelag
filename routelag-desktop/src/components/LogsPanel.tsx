interface LogsPanelProps {
  logs: string;
  onCopy: () => void;
  loading?: boolean;
}

export function LogsPanel({ logs, onCopy, loading }: LogsPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-gray-200">Application Logs</h3>
        <button
          type="button"
          onClick={onCopy}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
        >
          Copy logs
        </button>
      </div>
      <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-gray-300 cursor-text whitespace-pre-wrap">
        {loading ? "Loading logs..." : logs || "No logs yet."}
      </pre>
    </div>
  );
}
