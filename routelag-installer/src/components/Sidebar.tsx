export interface SidebarStep {
  id: string;
  label: string;
}

export function Sidebar({
  steps,
  currentStepId,
  version,
}: {
  steps: SidebarStep[];
  currentStepId: string;
  version: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <nav className="sidebar" aria-label="Installation steps">
      <div className="sidebar-brand">RouteLag</div>
      <ol className="sidebar-steps">
        {steps.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "upcoming";
          return (
            <li key={step.id} className={`sidebar-step sidebar-step-${state}`}>
              <span className="sidebar-step-marker" aria-hidden="true">
                {state === "done" ? "\u2713" : index + 1}
              </span>
              <span className="sidebar-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      <div className="sidebar-footer">RouteLag Beta v{version}</div>
    </nav>
  );
}
