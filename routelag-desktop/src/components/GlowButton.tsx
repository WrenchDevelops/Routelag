import type { ReactNode } from "react";

interface GlowButtonProps {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}

export function GlowButton({
  children,
  disabled,
  onClick,
  type = "button",
}: GlowButtonProps) {
  return (
    <button
      type={type}
      className="glow-button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
