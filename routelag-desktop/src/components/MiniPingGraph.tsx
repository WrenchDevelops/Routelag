import { memo } from "react";

interface MiniPingGraphProps {
  samples: number[];
  emptyLabel?: string;
}

function MiniPingGraphComponent({ samples, emptyLabel = "Run ping test" }: MiniPingGraphProps) {
  const values = samples.filter((sample) => Number.isFinite(sample));
  const path = values.length >= 2 ? buildPath(values) : null;
  const latest = values[values.length - 1];

  return (
    <div className="mini-graph">
      <span className="graph-label top">Ping</span>
      <svg viewBox="0 0 280 120" role="img" aria-label="RouteLag ping graph">
        <path className="grid-line" d="M10 34 H270" />
        <path className="grid-line" d="M10 74 H270" />
        <path className="grid-line" d="M10 106 H270" />
        {path ? <path className="line-hot" d={path} /> : null}
      </svg>
      {path ? (
        <span className="graph-value">{Math.round(latest ?? 0)}ms</span>
      ) : (
        <span className="graph-empty">{emptyLabel}</span>
      )}
      <span className="graph-label bottom">Time</span>
    </div>
  );
}

function buildPath(samples: number[]): string {
  const width = 260;
  const height = 82;
  const left = 10;
  const top = 24;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(samples.length - 1, 1);

  return samples
    .map((sample, index) => {
      const x = left + index * step;
      const y = top + height - ((sample - min) / range) * height;
      const command = index === 0 ? "M" : "L";
      return `${command}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export const MiniPingGraph = memo(MiniPingGraphComponent);
