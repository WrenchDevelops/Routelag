export interface StepDef {
  id: string;
  label: string;
}

export function StepProgress({
  steps,
  currentStepId,
  variant = "horizontal",
}: {
  steps: StepDef[];
  currentStepId: string;
  variant?: "horizontal" | "vertical";
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <nav
      className={`step-progress step-progress-${variant}`}
      aria-label="Installation progress"
    >
      <ol className="step-progress-list">
        {steps.map((step, index) => {
          const state =
            index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <li key={step.id} className={`step-progress-item step-progress-item-${state}`}>
              <span className="step-progress-node" aria-hidden="true">
                {state === "done" ? "\u2713" : null}
                {state === "active" ? <span className="step-progress-node-dot" /> : null}
              </span>
              <span className="step-progress-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
