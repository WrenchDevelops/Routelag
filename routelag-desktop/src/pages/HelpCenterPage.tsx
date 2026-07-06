import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Cpu,
  ExternalLink,
  FileText,
  RotateCcw,
  ScrollText,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

interface HelpCenterPageProps {
  busy: string | null;
  engineInstalled: boolean;
  onAdvancedRepair: () => void;
  onCheckEngine: () => Promise<boolean> | boolean;
  onExportReport: () => void;
  onOpenLogs: () => void;
  onRestoreInternet: () => void;
}

const SUPPORT_BASE_URL = "https://routelag.com";

const supportArticles = [
  {
    title: "Getting Started",
    description:
      "Learn how to install RouteLag, log in, and start your first Fortnite optimization.",
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
      "Testing RouteLag for Fortnite Middle East from South Africa? Follow the beta test steps here.",
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
  const [engineStatus, setEngineStatus] = useState(
    engineInstalled ? "Engine ready" : "Engine needs attention",
  );

  const openSupportPath = async (path: string) => {
    await openUrl(`${SUPPORT_BASE_URL}${path}`);
  };

  const checkEngine = async () => {
    try {
      const ready = await onCheckEngine();
      setEngineStatus(ready ? "Engine ready" : "Engine needs attention");
    } catch {
      setEngineStatus("Engine needs attention");
    }
  };

  return (
    <div className="help-center-view">
      <header className="help-center-header">
        <h1>Help Center</h1>
        <p>Find quick fixes or open the full RouteLag support center.</p>
      </header>

      <section className="help-emergency-card">
        <div>
          <span>Emergency Fix</span>
          <h2>Internet not working?</h2>
          <p>Use Restore Internet to return your PC to its normal connection.</p>
        </div>
        <div className="help-emergency-actions">
          <button
            type="button"
            className="help-primary-action"
            disabled={busy === "cleanup"}
            onClick={onRestoreInternet}
          >
            <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
            Restore Internet
          </button>
          <button type="button" onClick={onAdvancedRepair}>
            <Wrench size={18} strokeWidth={2} aria-hidden="true" />
            Advanced Repair
          </button>
          <button type="button" disabled={busy === "export"} onClick={onExportReport}>
            <FileText size={18} strokeWidth={2} aria-hidden="true" />
            Export Support Report
          </button>
        </div>
      </section>

      <section className="help-section">
        <div className="help-section-title">
          <h2>Quick Actions</h2>
          <span>{engineStatus}</span>
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
            label="Check RouteLag Engine"
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
          <span>Opens website</span>
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
            <div>
              <h3>Contact Support</h3>
              <p>Need help? Send your issue with a RouteLag support report.</p>
            </div>
            <div className="help-contact-actions">
              <button type="button" onClick={onExportReport}>
                Export Report
              </button>
              <button type="button" onClick={() => void openSupportPath("/support/contact")}>
                Contact Support
                <ExternalLink size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </article>
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
      <Icon size={22} strokeWidth={2} aria-hidden="true" />
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
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button type="button" onClick={onOpen}>
        {button}
        <ExternalLink size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </article>
  );
}
