export function MiniPingGraph() {
  return (
    <div className="mini-graph">
      <span className="graph-label top">Ping</span>
      <svg viewBox="0 0 280 120" role="img" aria-label="RouteLag ping graph">
        <path className="grid-line" d="M10 34 H270" />
        <path className="grid-line" d="M10 74 H270" />
        <path className="grid-line" d="M10 106 H270" />
        <path
          className="line-dim"
          d="M10 78 C30 72 35 92 52 84 C70 74 79 91 96 82 C113 72 126 88 145 80 C166 70 178 90 198 79 C218 69 235 92 270 84"
        />
        <path
          className="line-hot"
          d="M10 48 C27 42 35 62 52 56 C70 45 82 62 98 50 C116 38 134 49 150 42 C172 31 189 26 205 45 C220 64 232 78 250 67 C260 61 265 65 270 60"
        />
      </svg>
      <span className="graph-label bottom">Time</span>
    </div>
  );
}
