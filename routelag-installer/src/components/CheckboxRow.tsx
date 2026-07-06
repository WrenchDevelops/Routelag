export function CheckboxRow({
  title,
  description,
  badge,
  checked,
  disabled,
  locked,
  onChange,
}: {
  title: string;
  description?: string;
  badge?: string;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`checkbox-row${disabled ? " checkbox-row-disabled" : ""}${checked ? " checkbox-row-checked" : ""}`}
      disabled={disabled || locked}
      onClick={() => {
        if (!disabled && !locked) onChange(!checked);
      }}
    >
      <span
        className={`checkbox-row-box${checked ? " checkbox-row-box-checked" : ""}${locked ? " checkbox-row-box-locked" : ""}`}
        aria-hidden="true"
      >
        {checked ? "\u2713" : ""}
      </span>
      <span className="checkbox-row-body">
        <span className="checkbox-row-title-line">
          <span className="checkbox-row-title">{title}</span>
          {badge ? <span className="checkbox-row-badge">{badge}</span> : null}
        </span>
        {description ? <span className="checkbox-row-description">{description}</span> : null}
      </span>
    </button>
  );
}
