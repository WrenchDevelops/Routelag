import type { ReactNode } from "react";
import { Sidebar, type SidebarStep } from "./Sidebar";

export function WizardLayout({
  steps,
  currentStepId,
  version,
  children,
  footer,
}: {
  steps: SidebarStep[];
  currentStepId: string;
  version: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="wizard-body">
      <Sidebar steps={steps} currentStepId={currentStepId} version={version} />
      <div className="wizard-content">
        <div className="wizard-page">{children}</div>
        <div className="wizard-footer">{footer}</div>
      </div>
    </div>
  );
}

export function FooterButtons({
  onCancel,
  cancelLabel = "Exit",
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onCancel?: () => void;
  cancelLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        {cancelLabel}
      </button>
      <div className="wizard-footer-right">
        {onBack ? (
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
        {onNext ? (
          <button type="button" className="btn btn-primary" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </button>
        ) : null}
      </div>
    </>
  );
}
