import { useState } from "react";

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "https://routelag.com/legal/privacy" },
  { label: "Terms of Service", href: "https://routelag.com/legal/terms" },
  { label: "Beta Tester Agreement", href: "https://routelag.com/legal/beta-tester-agreement" },
  { label: "Routing Risk", href: "https://routelag.com/legal/routing-risk" },
];

interface WelcomePageProps {
  legalAcknowledged: boolean;
  onLegalAcknowledgedChange: (value: boolean) => void;
}

export function WelcomePage({
  legalAcknowledged,
  onLegalAcknowledgedChange,
}: WelcomePageProps) {
  const [openedLink, setOpenedLink] = useState<string | null>(null);

  const openLink = (href: string, label: string) => {
    setOpenedLink(label);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="welcome-copy">
      <h1 className="installer-title welcome-title-size">
        Welcome to <span className="text-accent">Zer0</span> Setup
      </h1>
      <p className="installer-subtitle">Install the base app and optional HUD runtime.</p>
      <div className="installer-callout installer-callout-warning" role="note">
        <strong>Unsigned private-beta build.</strong> Windows SmartScreen or Defender may warn
        that this installer is unrecognized. That is expected for internal and trusted private-beta
        builds that are not Authenticode-signed. Only run this EXE if you received it from the
        Zer0 team. Do not distribute it publicly.
      </div>

      <div className="installer-legal-block">
        <p className="installer-legal-intro">
          Review the private-beta legal documents before continuing. Hosted pages may still be
          drafts; the desktop app also ships in-app copies after install.
        </p>
        <ul className="installer-legal-links">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <button
                type="button"
                className="installer-legal-link"
                onClick={() => openLink(link.href, link.label)}
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>
        {openedLink ? (
          <p className="installer-legal-opened">Opened: {openedLink}</p>
        ) : null}
        <label className="installer-legal-check">
          <input
            type="checkbox"
            checked={legalAcknowledged}
            onChange={(event) => onLegalAcknowledgedChange(event.target.checked)}
          />
          <span>
            I acknowledge private-beta status, unsigned-build risk, network-routing risk, and that
            I can review Privacy, Terms, and the Beta Tester Agreement without paying.
          </span>
        </label>
      </div>
    </div>
  );
}
