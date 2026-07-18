import type { ReactNode } from "react";
import { CheckboxRow } from "../components/CheckboxRow";

export function CompletePage({
  title,
  subtitle,
  children,
  launchOption,
  guideOption,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
  launchOption?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
  guideOption?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
}) {
  return (
    <div className="page page-wide">
      <div className="complete-badge" aria-hidden="true">
        &#10003;
      </div>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>

      {children ? <div className="complete-body">{children}</div> : null}

      <div className="checkbox-list complete-options">
        {launchOption ? (
          <CheckboxRow
            title="Launch Zer0 now"
            checked={launchOption.checked}
            onChange={launchOption.onChange}
          />
        ) : null}
        {guideOption ? (
          <CheckboxRow
            title="Open Getting Started Guide"
            checked={guideOption.checked}
            onChange={guideOption.onChange}
          />
        ) : null}
      </div>
    </div>
  );
}
