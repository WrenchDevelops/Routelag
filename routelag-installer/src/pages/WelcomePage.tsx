const LEGAL_LINKS = {
  privacy: { label: "Privacy Policy", href: "https://routelag.com/legal/privacy" },
  terms: { label: "Terms of Service", href: "https://routelag.com/legal/terms" },
  beta: {
    label: "Beta Tester Agreement",
    href: "https://routelag.com/legal/beta-tester-agreement",
  },
  risk: { label: "routing risk disclosure", href: "https://routelag.com/legal/routing-risk" },
} as const;

interface WelcomePageProps {
  legalAcknowledged: boolean;
  onLegalAcknowledgedChange: (value: boolean) => void;
}

export function WelcomePage({
  legalAcknowledged,
  onLegalAcknowledgedChange,
}: WelcomePageProps) {
  const link = ({ label, href }: { label: string; href: string }) => (
    <button
      type="button"
      className="installer-legal-link"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
    >
      {label}
    </button>
  );

  return (
    <div className="welcome-copy">
      <h1 className="installer-title welcome-title-size">
        Welcome to <span className="text-accent">Zer0</span> Setup
      </h1>
      <p className="installer-subtitle">Install the base app and optional HUD runtime.</p>

      <label className="installer-legal-check">
        <input
          type="checkbox"
          checked={legalAcknowledged}
          onChange={(event) => onLegalAcknowledgedChange(event.target.checked)}
        />
        <span>
          I agree to the {link(LEGAL_LINKS.privacy)}, {link(LEGAL_LINKS.terms)},{" "}
          {link(LEGAL_LINKS.beta)}, and {link(LEGAL_LINKS.risk)}.
        </span>
      </label>

      <p className="installer-beta-note">
        Private beta — Windows SmartScreen may show a warning because this build isn’t signed
        yet. That’s expected; only run installers you received from the Zer0 team.
      </p>
    </div>
  );
}
