import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import { RouteLagLogo } from "./RouteLagLogo";
import { StepProgress, type StepDef } from "./StepProgress";

function currentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function InstallerShell({
  steps,
  currentStepId,
  showLogo = true,
  showStepper = true,
  welcomeLayout = false,
  installTypeLayout = false,
  readyLayout = false,
  children,
  footer,
}: {
  steps?: StepDef[];
  currentStepId?: string;
  showLogo?: boolean;
  showStepper?: boolean;
  welcomeLayout?: boolean;
  installTypeLayout?: boolean;
  readyLayout?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const startDragging = async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    await currentWindow()?.startDragging();
  };

  return (
    <div
      className={`installer-shell${welcomeLayout ? " installer-shell-welcome" : ""}${installTypeLayout ? " installer-shell-install-type" : ""}${readyLayout ? " installer-shell-ready" : ""}`}
    >
      <div
        className="installer-shell-drag"
        data-tauri-drag-region
        onMouseDown={(e) => void startDragging(e)}
        aria-hidden="true"
      />

      {showLogo ? (
        <header className="installer-header">
          <RouteLagLogo size={welcomeLayout ? 88 : readyLayout ? 52 : 64} showWordmark={false} />
        </header>
      ) : null}

      <div className="installer-body">
        <main className={`installer-content${welcomeLayout ? " installer-content-welcome" : ""}`}>
          {children}
        </main>

        {showStepper && steps && currentStepId ? (
          <StepProgress steps={steps} currentStepId={currentStepId} />
        ) : null}
      </div>

      {footer ? <footer className="installer-footer">{footer}</footer> : null}
    </div>
  );
}

export function FooterButtons({
  onCancel,
  cancelLabel = "Cancel",
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel,
  nextDisabled,
  showBack = true,
  showNextArrow = false,
}: {
  onCancel?: () => void;
  cancelLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  showNextArrow?: boolean;
}) {
  return (
    <>
      <div className="installer-footer-left">
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="installer-footer-right">
        {showBack && onBack ? (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {backLabel}
          </button>
        ) : showBack && !onBack ? (
          <span className="btn btn-ghost btn-ghost-disabled">{backLabel}</span>
        ) : null}
        {onNext ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNext}
            disabled={nextDisabled}
          >
            <span className="btn-primary-content">
              <span>{nextLabel}</span>
              {showNextArrow ? (
                <svg className="btn-next-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
          </button>
        ) : null}
      </div>
    </>
  );
}
