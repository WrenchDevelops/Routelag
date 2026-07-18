import { openExternalUrl } from "../lib/openExternalUrl";
import {
  Cpu,
  ExternalLink,
  FileText,
  LifeBuoy,
  RotateCcw,
  ScrollText,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { SUPPORT_BASE_URL } from "../lib/supportUrls";
import { LegalLinks } from "../components/LegalLinks";

interface HelpCenterPageProps {
  busy: string | null;
  engineInstalled: boolean;
  onAdvancedRepair: () => void;
  onCheckEngine: () => Promise<boolean> | boolean;
  onExportReport: () => void;
  onOpenLogs: () => void;
  onRestoreInternet: () => void;
}

const supportArticles = [
  {
    title: "Getting Started",
    description:
      "Learn how to install Zer0, log in, and start your first Fortnite optimization.",
    button: "Open Guide",
    path: "/support/getting-started",
  },
  {
    title: "Fortnite Routing Help",
    description:
      "Learn how Auto Route works, why ping can change, and how to test servers correctly.",
    button: "Open Routing Help",
    path: "/support/routing",
  },
  {
    title: "South Africa Beta Guide",
    description:
      "Testing Zer0 for Fortnite Middle East from South Africa? Follow the beta test steps here.",
    button: "Open Beta Guide",
    path: "/support/south-africa-beta",
  },
  {
    title: "HUD Overlay Help",
    description: "Learn how to add, move, resize, and reset HUD overlay widgets.",
    button: "Open HUD Help",
    path: "/support/hud",
  },
  {
    title: "Replay Engine Help",
    description:
      "Learn how to import replays, view match stats, and fix replay parsing issues.",
    button: "Open Replay Help",
    path: "/support/replays",
  },
  {
    title: "Plans & Billing",
    description: "Compare Basic and Pro, weekly and monthly plans, and locked features.",
    button: "Open Plans Help",
    path: "/support/plans",
  },
];

export function HelpCenterPage({
  busy,
  engineInstalled,
  onAdvancedRepair,
  onCheckEngine,
  onExportReport,
  onOpenLogs,
  onRestoreInternet,
}: HelpCenterPageProps) {
  const [engineReady, setEngineReady] = useState(engineInstalled);

  const openSupportPath = async (path: string) => {
    await openExternalUrl(`${SUPPORT_BASE_URL}${path}`);
  };

  const checkEngine = async () => {
    try {
      const ready = await onCheckEngine();
      setEngineReady(ready);
    } catch {
      setEngineReady(false);
    }
  };

  return (
    <div className="help-center-view">
      <header className="help-center-header">
        <div>
          <h1>Help Center</h1>
          <p>Find quick fixes or open the full Zer0 support center.</p>
        </div>
      </header>

      <section className="help-emergency-card" aria-labelledby="help-emergency-title">
        <div className="help-emergency-copy">
          <span className="help-eyebrow">Emergency Fix</span>
          <h2 id="help-emergency-title">Internet not working?</h2>
          <p>Use Restore Internet to return your PC to its normal connection.</p>
        </div>
        <div className="help-emergency-actions">
          <button
            type="button"
            className="help-primary-action"
            disabled={busy === "cleanup"}
            onClick={onRestoreInternet}
          >
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
            Restore Internet
          </button>
          <button type="button" className="help-secondary-action" onClick={onAdvancedRepair}>
            <Wrench size={16} strokeWidth={2} aria-hidden="true" />
            Advanced Repair
          </button>
          <button
            type="button"
            className="help-secondary-action"
            disabled={busy === "export"}
            onClick={onExportReport}
          >
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
            Export Support Report
          </button>
        </div>
      </section>

      <section className="help-section">
        <div className="help-section-title">
          <h2>Quick Actions</h2>
          <span className={engineReady ? "success-label" : "muted-label"}>
            {engineReady ? "Engine ready" : "Engine needs attention"}
          </span>
        </div>
        <div className="help-quick-grid">
          <QuickAction
            icon={FileText}
            label="Export Support Report"
            onClick={onExportReport}
          />
          <QuickAction icon={ScrollText} label="Open Logs" onClick={onOpenLogs} />
          <QuickAction
            icon={Cpu}
            label="Check Zer0 Engine"
            onClick={() => void checkEngine()}
          />
          <QuickAction
            icon={RotateCcw}
            label="Restore Internet"
            onClick={onRestoreInternet}
          />
        </div>
      </section>

      <section className="help-section">
        <div className="help-section-title">
          <h2>Support Articles</h2>
          <span className="muted-label">Opens website</span>
        </div>
        <div className="help-article-grid">
          {supportArticles.map((article) => (
            <SupportArticle
              key={article.path}
              button={article.button}
              description={article.description}
              onOpen={() => void openSupportPath(article.path)}
              title={article.title}
            />
          ))}
          <article className="help-article-card help-contact-card">
            <div className="help-article-copy">
              <span className="help-article-icon" aria-hidden="true">
                <LifeBuoy size={18} strokeWidth={2} />
              </span>
              <h3>Contact Support</h3>
              <p>Need help? Send your issue with A Zer0 support report.</p>
            </div>
            <div className="help-contact-actions">
              <button type="button" className="help-secondary-action" onClick={onExportReport}>
                Export Report
              </button>
              <button
                type="button"
                className="help-primary-action"
                onClick={() => void openSupportPath("/support/contact")}
              >
                Contact Support
                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="help-section">
        <div className="help-section-title">
          <h2>Legal & disclosures</h2>
          <span className="muted-label">No subscription required</span>
        </div>
        <div className="help-legal-block">
          <p className="help-legal-copy">
            Privacy, Terms, beta tester agreement, routing risk, diagnostics, and third-party
            disclaimers for the Zer0 private beta.
          </p>
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
      </section>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="help-quick-action" onClick={onClick}>
      <span className="help-quick-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function SupportArticle({
  button,
  description,
  onOpen,
  title,
}: {
  button: string;
  description: string;
  onOpen: () => void;
  title: string;
}) {
  return (
    <article className="help-article-card">
      <div className="help-article-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button type="button" className="help-secondary-action" onClick={onOpen}>
        {button}
        <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </article>
  );
}
