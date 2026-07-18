import { Shield } from "lucide-react";

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
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        aria-describedby="admin-modal-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="admin-modal-icon" aria-hidden="true">
          <Shield size={22} strokeWidth={1.8} />
        </span>
        <h2 id="admin-modal-title">Administrator permission required</h2>
        <p id="admin-modal-desc">
          Zer0 needs administrator permission to control the Zer0 Engine
          network route. Zer0 does not modify Fortnite, inject into Fortnite,
          or interact with anti-cheat.
        </p>
        <div className="admin-modal-actions">
          <button type="button" className="admin-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-modal-confirm"
            onClick={onRestartAsAdmin}
            disabled={loading}
          >
            {loading ? "Requesting…" : "Restart as Administrator"}
          </button>
        </div>
      </div>
    </div>
  );
}
