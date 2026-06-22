interface PingCardProps {
  title: string;
  value: string;
  subtitle?: string;
  highlight?: "warning" | "success" | "default";
}

const highlightClasses = {
  default: "border-border",
  success: "border-success/30",
  warning: "border-warning/40",
};

export function PingCard({ title, value, subtitle, highlight = "default" }: PingCardProps) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 ${highlightClasses[highlight]}`}
    >
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 font-mono text-xl text-white">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
