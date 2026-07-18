import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { GlowButton } from "./GlowButton";
import { GlowLogo } from "./GlowLogo";
import { LegalDocModal } from "./LegalDocModal";
import { LegalLinks } from "./LegalLinks";
import {
  LEGAL_ACK_LABELS,
  LEGAL_DOCUMENT_VERSION,
  REQUIRED_LEGAL_ACK_IDS,
  saveLegalConsent,
  type LegalAckId,
  type LegalDocId,
} from "../lib/legalConsent";
import { BETA_BUILD_LABEL } from "../lib/betaMode";

interface BetaConsentGateProps {
  appVersion: string | null;
  clerkUserId: string | null | undefined;
  onAccepted: () => void;
}

const ACK_DOC_LINKS: Partial<Record<LegalAckId, LegalDocId>> = {
  privacy_policy: "privacy",
  terms: "terms",
  beta_tester_agreement: "beta-tester-agreement",
  network_risk: "routing-risk",
  diagnostics: "diagnostics",
};

export function BetaConsentGate({
  appVersion,
  clerkUserId,
  onAccepted,
}: BetaConsentGateProps) {
  const [checked, setChecked] = useState<Record<LegalAckId, boolean>>(() =>
    Object.fromEntries(REQUIRED_LEGAL_ACK_IDS.map((id) => [id, false])) as Record<
      LegalAckId,
      boolean
    >,
  );
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allChecked = useMemo(
    () => REQUIRED_LEGAL_ACK_IDS.every((id) => checked[id]),
    [checked],
  );

  const toggle = (id: LegalAckId) => {
    setChecked((current) => ({ ...current, [id]: !current[id] }));
  };

  const accept = () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    try {
      saveLegalConsent({
        clerkUserId: clerkUserId ?? null,
        appVersion,
        acknowledgements: [...REQUIRED_LEGAL_ACK_IDS],
      });
      onAccepted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-view beta-consent-view">
      <div className="login-panel login-panel--wide beta-consent-panel">
        <div className="login-hero login-hero--center">
          <GlowLogo />
          <div className="login-copy">
            <small>{BETA_BUILD_LABEL}</small>
            <h1>Private beta consent</h1>
            <p>
              Before using Zer0, acknowledge the private-beta terms and network risks.
              Document version {LEGAL_DOCUMENT_VERSION}.
            </p>
          </div>
        </div>

        <div className="beta-consent-callout" role="note">
          <ShieldAlert size={18} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>Trusted testers only.</strong> This is a drafting pack for a tightly
            controlled private beta — not a claim of legal compliance. Placeholders such as
            company name and jurisdiction still require owner input and professional review.
          </div>
        </div>

        <ul className="beta-consent-list">
          {REQUIRED_LEGAL_ACK_IDS.map((id) => {
            const docId = ACK_DOC_LINKS[id];
            return (
              <li key={id}>
                <label className="beta-consent-item">
                  <input
                    type="checkbox"
                    checked={checked[id]}
                    onChange={() => toggle(id)}
                  />
                  <span>
                    {LEGAL_ACK_LABELS[id]}
                    {docId ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="beta-consent-doc-link"
                          onClick={(event) => {
                            event.preventDefault();
                            setOpenDoc(docId);
                          }}
                        >
                          Read
                        </button>
                      </>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="beta-consent-links-block">
          <p className="beta-consent-links-label">All legal documents</p>
          <LegalLinks
            ids={[
              "privacy",
              "terms",
              "acceptable-use",
              "beta-tester-agreement",
              "routing-risk",
              "diagnostics",
              "disclaimers",
            ]}
          />
        </div>

        <div className="beta-consent-accept">
          <GlowButton type="button" disabled={!allChecked || submitting} onClick={accept}>
            {submitting ? "Saving…" : "I agree — continue"}
          </GlowButton>
        </div>
      </div>

      <LegalDocModal docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}
