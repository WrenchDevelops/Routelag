import { InstallFlowStepper } from "../components/InstallFlowStepper";
import { ProgressBar } from "../components/ProgressBar";
import {
  INSTALL_TASKS,
  installSummaryRows,
  resolveInstallTaskStatus,
  type InstallTaskStatus,
} from "../lib/installProgress";
import type { ComponentSelection } from "../lib/installState";
import type { InstallType } from "../lib/installerApi";

function SummaryIcon({ type }: { type: string }) {
  switch (type) {
    case "cube":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 7.5 12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "components":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8.2 7.5 10.8 16M15.8 7.5 13.2 16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "folder":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v10m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

function TaskStatusLabel({ status }: { status: InstallTaskStatus }) {
  if (status === "completed") return <span className="install-task-status install-task-status-done">Completed</span>;
  if (status === "installing") return <span className="install-task-status install-task-status-active">Installing</span>;
  if (status === "skipped") return <span className="install-task-status install-task-status-pending">Skipped</span>;
  return <span className="install-task-status install-task-status-pending">Pending</span>;
}

export function InstallingPage({
  percent,
  message,
  currentStep,
  done,
  errorMessage,
  installType,
  selection,
  installDir,
  estimatedSizeBytes,
}: {
  percent: number;
  message: string;
  currentStep: string;
  done: boolean;
  errorMessage: string | null;
  installType: InstallType;
  selection: ComponentSelection;
  installDir: string;
  estimatedSizeBytes: number;
}) {
  const displayPercent = errorMessage ? 0 : percent;
  const visibleTasks = INSTALL_TASKS.filter((task) => !task.showWhen || task.showWhen(selection));
  const summaryRows = installSummaryRows({ installType, selection, installDir, estimatedSizeBytes });

  return (
    <div className="installing-page">
      <header className="installing-header">
        <h1 className="installer-title">
          Installing <span className="text-accent">Zer0</span>
        </h1>
        <p className="installer-subtitle">
          {errorMessage
            ? "Something went wrong while installing Zer0."
            : "Installing your selected components and preparing the app for launch."}
        </p>
      </header>

      <div className="installing-card">
        <div className="installing-overall">
          <div className="installing-overall-row">
            <span className="installing-overall-label step-label">Overall Progress</span>
            <span className="installing-overall-percent">{displayPercent}%</span>
          </div>
          <ProgressBar percent={displayPercent} className="installing-progress-bar" />
        </div>

        <div className="installing-details">
          <ul className="installing-task-list">
            {visibleTasks.map((task) => {
              const status = resolveInstallTaskStatus(task, currentStep, done && !errorMessage);
              return (
                <li key={task.id} className={`installing-task installing-task-${status}`}>
                  <span className="installing-task-marker" aria-hidden="true">
                    {status === "completed" ? "\u2713" : status === "installing" ? "\u25CF" : ""}
                  </span>
                  <div className="installing-task-body">
                    <span className="installing-task-label card-title">{task.label}</span>
                    <TaskStatusLabel status={status} />
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="installing-summary">
            {summaryRows.map((row) => (
              <div key={row.label} className="installing-summary-row">
                <span className="installing-summary-icon">
                  <SummaryIcon type={row.icon} />
                </span>
                <div className="installing-summary-copy">
                  <span className="installing-summary-label step-label">{row.label}</span>
                  <span className="installing-summary-value">{row.value}</span>
                </div>
              </div>
            ))}
          </aside>
        </div>

        {errorMessage ? <p className="page-error">{errorMessage}</p> : null}
        {!errorMessage && message ? <p className="installing-message card-description">{message}</p> : null}
      </div>

      <InstallFlowStepper currentStepId="installing" />
    </div>
  );
}
