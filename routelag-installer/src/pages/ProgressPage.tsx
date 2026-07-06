import { StepProgress } from "../components/StepProgress";
import { ProgressBar } from "../components/ProgressBar";
import { INSTALLING_STEPS } from "../lib/installState";

export function ProgressPage({
  title,
  subtitle,
  message,
  percent,
  errorMessage,
}: {
  title: string;
  subtitle?: string;
  message: string;
  percent: number;
  errorMessage: string | null;
}) {
  const displayPercent = errorMessage ? 0 : percent;

  return (
    <div className="page page-progress">
      <div className="progress-layout">
        <StepProgress steps={[...INSTALLING_STEPS]} currentStepId="installing" variant="vertical" />

        <div className="progress-main">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            {errorMessage ? "Something went wrong." : subtitle ?? "Please wait while RouteLag is being installed."}
          </p>

          <div className="progress-ring-wrap" aria-hidden="true">
            <svg className="progress-ring" viewBox="0 0 120 120">
              <circle className="progress-ring-track" cx="60" cy="60" r="52" />
              <circle
                className="progress-ring-fill"
                cx="60"
                cy="60"
                r="52"
                style={{
                  strokeDasharray: `${2 * Math.PI * 52}`,
                  strokeDashoffset: `${2 * Math.PI * 52 * (1 - displayPercent / 100)}`,
                }}
              />
            </svg>
            <span className="progress-ring-label">{displayPercent}%</span>
          </div>

          <p className="progress-status">{errorMessage ? errorMessage : message}</p>
          <ProgressBar percent={displayPercent} />

          {errorMessage ? <p className="page-error">{errorMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
