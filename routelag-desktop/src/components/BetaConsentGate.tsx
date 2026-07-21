import { useState } from "react";
import { FlaskConical, RotateCcw, Wifi } from "lucide-react";

import { GlowButton } from "./GlowButton";
import { GlowLogo } from "./GlowLogo";
import { LegalDocModal } from "./LegalDocModal";
import {
  LEGAL_DOCUMENT_VERSION,
  REQUIRED_LEGAL_ACK_IDS,
  saveLegalConsent,
  type LegalDocId,
} from "../lib/legalConsent";
import { BETA_BUILD_LABEL } from "../lib/betaMode";

interface BetaConsentGateProps {
  appVersion: string | null;
  clerkUserId: string | null | undefined;
  onAccepted: () => void;
}

const HIGHLIGHTS = [
  {
    icon: RotateCcw,
    title: "Everything is reversible",
    body: "Restore Internet puts your connection back to normal in one click.",
  },
  {
    icon: Wifi,
    title: "Your PC stays untouched",
    body: "No system files are modified — a restart clears everything.",
  },
  {
    icon: FlaskConical,
    title: "This is an early beta",
    body: "Results vary by ISP; lower ping isn't guaranteed.",
  },
] as const;

export function BetaConsentGate({
  appVersion,
  clerkUserId,
  onAccepted,
}: BetaConsentGateProps) {
  const [agreed, setAgreed] = useState(false);
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const docLink = (docId: LegalDocId, label: string) => (
    <button
      type="button"
      className="beta-consent-doc-link"
      onClick={(event) => {
        event.preventDefault();
        setOpenDoc(docId);
      }}
    >
      {label}
    </button>
  );

  const accept = () => {
    if (!agreed || submitting) return;
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
            <h1>Welcome to the Zer0 beta</h1>
          </div>
        </div>

        <ul className="beta-consent-highlights">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="beta-consent-highlight">
              <span className="beta-consent-highlight-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <label className="beta-consent-agree">
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed((current) => !current)}
          />
          <span>
            I agree to the {docLink("terms", "Terms of Service")},{" "}
            {docLink("privacy", "Privacy Policy")},{" "}
            {docLink("beta-tester-agreement", "Beta Tester Agreement")},{" "}
            {docLink("routing-risk", "routing risk")}, and{" "}
            {docLink("diagnostics", "diagnostics")} disclosures.
          </span>
        </label>

        <div className="beta-consent-accept">
          <GlowButton type="button" disabled={!agreed || submitting} onClick={accept}>
            {submitting ? "Saving…" : "Agree and continue"}
          </GlowButton>
        </div>

        <p className="beta-consent-version">
          {docLink("acceptable-use", "Acceptable Use")} ·{" "}
          {docLink("disclaimers", "Third-Party Disclaimer")} · Document version{" "}
          {LEGAL_DOCUMENT_VERSION}
        </p>
      </div>

      <LegalDocModal docId={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}
