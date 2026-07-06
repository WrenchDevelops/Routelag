export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={className ? `${className} progress-track` : "progress-track"}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
