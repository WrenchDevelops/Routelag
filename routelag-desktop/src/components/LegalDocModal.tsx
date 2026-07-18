import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { getLegalDoc, type LegalDocId } from "../lib/legalConsent";

interface LegalDocModalProps {
  docId: LegalDocId | null;
  onClose: () => void;
}

export function LegalDocModal({ docId, onClose }: LegalDocModalProps) {
  const [body, setBody] = useState<string>("Loading…");
  const [error, setError] = useState<string | null>(null);
  const meta = docId ? getLegalDoc(docId) : undefined;

  useEffect(() => {
    if (!docId || !meta) {
      setBody("");
      return;
    }
    let cancelled = false;
    setError(null);
    setBody("Loading…");
    void fetch(meta.bundledPath)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${meta.title} (${response.status}).`);
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setBody(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setBody("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId, meta]);

  if (!docId || !meta) return null;

  return (
    <div className="legal-doc-backdrop" role="presentation" onClick={onClose}>
      <div
        className="legal-doc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="legal-doc-header">
          <h2 id="legal-doc-title">{meta.title}</h2>
          <button
            type="button"
            className="legal-doc-close"
            onClick={onClose}
            aria-label="Close document"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <p className="legal-doc-draft-note">
          Draft for private beta — not a claim of legal compliance. Placeholders like{" "}
          <code>{"{{LEGAL_COMPANY_NAME}}"}</code> require owner input.
        </p>
        <div className="legal-doc-body">
          {error ? <p className="legal-doc-error">{error}</p> : <pre>{body}</pre>}
        </div>
        <footer className="legal-doc-footer">
          <button type="button" className="legal-doc-done" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
