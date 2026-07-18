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
      <h1 className="page-title">Uninstall Zer0</h1>
      <p className="page-subtitle">
        Zer0 and its components will be removed from <strong>{installPath}</strong>.
      </p>
      <div className="installer-callout" role="note">
        Uninstall disconnects Zer0/RouteLag owned tunnel services only, then removes Zer0 program
        files. It does <strong>not</strong> uninstall WireGuard for Windows or any other VPN
        product.
      </div>
      <div className="checkbox-list">
        <CheckboxRow
          title="Remove Zer0 user data, settings, and logs"
          description="Includes %LOCALAPPDATA%\Zer0 and legacy %LOCALAPPDATA%\RouteLag, plus matching Roaming folders. Unchecked by default — settings and logs are kept for reinstall."
          checked={removeUserData}
          onChange={onRemoveUserDataChange}
        />
      </div>
      <p className="page-note">
        Default uninstall removes the application, engine, HUD runtime, shortcuts, and ARP entry.
        User data is preserved unless you check the box above.
      </p>
    </div>
  );
}
