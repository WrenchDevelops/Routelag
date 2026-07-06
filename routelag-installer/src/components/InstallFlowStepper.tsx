import { INSTALL_FLOW_STEPS } from "../lib/installProgress";

export function InstallFlowStepper({ currentStepId = "installing" }: { currentStepId?: string }) {
  const currentIndex = INSTALL_FLOW_STEPS.findIndex((step) => step.id === currentStepId);

  return (
    <nav className="install-flow-stepper" aria-label="Installation flow">
      <ol className="install-flow-stepper-list">
        {INSTALL_FLOW_STEPS.map((step, index) => {
          const state =
            index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <li key={step.id} className={`install-flow-step install-flow-step-${state}`}>
              <span className="install-flow-step-node" aria-hidden="true">
                {state === "done" ? "\u2713" : state === "active" ? <span className="install-flow-step-dot" /> : null}
              </span>
              <span className="install-flow-step-label step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
