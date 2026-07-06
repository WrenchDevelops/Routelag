import type { ReactNode } from "react";

export function OptionCard({
  title,
  description,
  selected,
  disabled,
  recommended,
  unavailable,
  icon,
  onSelect,
  variant = "tile",
}: {
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  recommended?: boolean;
  unavailable?: boolean;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: "tile" | "row";
}) {
  if (variant === "row") {
    return (
      <button
        type="button"
        className={`option-card${selected ? " option-card-selected" : ""}`}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="option-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="option-card-body">
          <span className="option-card-title-row">
            <span className="option-card-title">{title}</span>
            {recommended ? <span className="option-card-pill">Recommended</span> : null}
          </span>
          <span className="option-card-description">{description}</span>
        </span>
        <span className="option-card-radio" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`option-card-tile${selected ? " option-card-tile-selected" : ""}${unavailable ? " option-card-tile-unavailable" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="option-card-tile-radio" aria-hidden="true">
        {selected ? <span className="option-card-tile-radio-dot" /> : null}
      </span>
      <span className="option-card-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="option-card-tile-title card-title">{title}</span>
      {recommended ? <span className="option-card-pill">Recommended</span> : null}
      <span className="option-card-tile-description card-description">{description}</span>
    </button>
  );
}
