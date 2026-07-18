import { useState } from "react";

import { LegalDocModal } from "./LegalDocModal";
import {
  LEGAL_DOCUMENTS,
  type LegalDocId,
} from "../lib/legalConsent";
import { openExternalUrl } from "../lib/openExternalUrl";
import { SUPPORT_BASE_URL } from "../lib/supportUrls";

interface LegalLinksProps {
  className?: string;
  /** Compact single-line variant for footers. */
  compact?: boolean;
  /** Limit which docs appear; default all primary links. */
  ids?: LegalDocId[];
}

const DEFAULT_IDS: LegalDocId[] = [
  "privacy",
  "terms",
  "beta-tester-agreement",
  "routing-risk",
];

export function LegalLinks({
  className,
  compact = false,
  ids = DEFAULT_IDS,
}: LegalLinksProps) {
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);
  const docs = LEGAL_DOCUMENTS.filter((doc) => ids.includes(doc.id));

  const openHosted = async (hostedPath: string) => {
    try {
      await openExternalUrl(`${SUPPORT_BASE_URL}${hostedPath}`);
    } catch {
      // Hosted pages may not exist yet; in-app draft remains available.
    }
  };

  return (
    <>
      <nav
        className={["legal-links", compact ? "legal-links--compact" : "", className]
          .filter(Boolean)
          .join(" ")}
        aria-label="Legal documents"
      >
        {docs.map((doc, index) => (
          <span key={doc.id} className="legal-links-item">
            {index > 0 && <span className="legal-links-sep" aria-hidden="true">·</span>}
            <button
              type="button"
              className="legal-links-btn"
              onClick={() => setOpenDoc(doc.id)}
            >
              {doc.title}
            </button>
            {!compact && (
              <button
                type="button"
                className="legal-links-hosted"
                title="Open hosted URL when published"
                onClick={() => void openHosted(doc.hostedPath)}
              >
                (web)
              </button>
            )}
          </span>
        ))}
      </nav>
      <LegalDocModal docId={openDoc} onClose={() => setOpenDoc(null)} />
    </>
  );
}
