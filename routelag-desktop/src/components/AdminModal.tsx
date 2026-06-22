interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  onRestartAsAdmin: () => void;
  loading?: boolean;
}

export function AdminModal({
  open,
  onClose,
  onRestartAsAdmin,
  loading,
}: AdminModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">
          Administrator permission required
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          RouteLag needs administrator permission to control the WireGuard
          network tunnel. RouteLag does not modify Fortnite, inject into
          Fortnite, or interact with anti-cheat.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onRestartAsAdmin}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Requesting..." : "Restart as Administrator"}
          </button>
        </div>
      </div>
    </div>
  );
}
