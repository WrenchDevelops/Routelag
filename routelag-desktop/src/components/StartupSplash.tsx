import { useEffect, useState } from "react";

import logoUrl from "../assets/routelag-logo-mark.png";

interface StartupSplashProps {
  onDone: () => void;
}

const SHOW_MS = 2200;
const EXIT_MS = 520;

export function StartupSplash({ onDone }: StartupSplashProps) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showFor = reduced ? 400 : SHOW_MS;
    const exitFor = reduced ? 120 : EXIT_MS;

    const exitTimer = window.setTimeout(() => setPhase("exit"), showFor);
    const doneTimer = window.setTimeout(() => onDone(), showFor + exitFor);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`zer0-splash zer0-splash--${phase}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="zer0-splash__glow" />
      <div className="zer0-splash__grid" />
      <div className="zer0-splash__stage">
        <div className="zer0-splash__mark">
          <img src={logoUrl} alt="" />
        </div>
        <div className="zer0-splash__word">
          <span className="zer0-splash__brand">Zer0</span>
          <span className="zer0-splash__rule" />
        </div>
      </div>
    </div>
  );
}
