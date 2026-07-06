import { CheckboxRow } from "../components/CheckboxRow";

export function UninstallConfirmPage({
  installPath,
  removeUserData,
  onRemoveUserDataChange,
}: {
  installPath: string;
  removeUserData: boolean;
  onRemoveUserDataChange: (checked: boolean) => void;
}) {
  return (
    <div className="page">
      <h1 className="page-title">Uninstall RouteLag</h1>
      <p className="page-subtitle">
        RouteLag and its components will be removed from <strong>{installPath}</strong>.
      </p>
      <div className="checkbox-list">
        <CheckboxRow
          title="Remove RouteLag user data, settings, and logs"
          description="Includes data stored in %LOCALAPPDATA%\RouteLag. Unchecked by default — your data is kept."
          checked={removeUserData}
          onChange={onRemoveUserDataChange}
        />
      </div>
      <p className="page-note">Your route configurations and relay settings will not be affected unless selected above.</p>
    </div>
  );
}
