import { openExternalUrl } from "../lib/openExternalUrl";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  LayoutGrid,
  LogOut,
  Frown,
  Shield,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import defaultAvatar from "../assets/default-avatar.svg";
import { GlowButton } from "../components/GlowButton";
import { useToast } from "../components/Toast";
import { useEntitlements } from "../lib/billing";
import { readImageFileAsAvatar } from "../lib/profileAvatar";
import { PLANS_URL } from "../lib/supportUrls";
import type { TesterProfile } from "../types";

interface ProfilePageProps {
  busy: string | null;
  elevated: boolean;
  hasConfig: boolean;
  onBack: () => void;
  engineInstalled: boolean;
  testerProfile: TesterProfile;
  profileImageUrl: string | null;
  onProfileImageChange: (imageUrl: string | null) => void;
  onTesterProfileChange: (patch: Partial<TesterProfile>) => void;
  onImport: () => void;
  onLogout: () => void;
  onRemove: () => void;
  onShowQuickToolsChange: (enabled: boolean) => void;
  showQuickTools: boolean;
}

const NOT_PROVIDED = "Not provided";
const AFFILIATE_COMING_SOON = "Affiliate link coming soon";

export function ProfilePage({
  busy,
  elevated,
  hasConfig,
  onBack,
  onImport,
  onLogout,
  onRemove,
  onShowQuickToolsChange,
  onProfileImageChange,
  onTesterProfileChange,
  engineInstalled,
  testerProfile,
  profileImageUrl,
  showQuickTools,
}: ProfilePageProps) {
  const { showToast } = useToast();
  const { hasProPlan, isLoaded: entitlementsLoaded } = useEntitlements();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(testerProfile.tester_name);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    setNameDraft(testerProfile.tester_name);
  }, [testerProfile.tester_name]);

  const identity = useMemo(() => readAccountIdentity(), []);
  const displayName =
    firstFilled(nameDraft, testerProfile.tester_name) || "Beta tester";
  const email =
    firstFilled(window.localStorage.getItem("routelag.profileEmail") ?? "") ||
    NOT_PROVIDED;
  const country =
    firstFilled(testerProfile.state_country, testerProfile.country_city) || NOT_PROVIDED;
  const isp = firstFilled(testerProfile.isp) || NOT_PROVIDED;
  const affiliateLink: string | null = null;
  const hasSubscription = entitlementsLoaded && hasProPlan;

  const profileStatus = hasConfig ? "Ready" : "Created on Optimize";
  const adminStatus = elevated ? "Ready" : "Required";
  const engineStatus = engineInstalled ? "Ready" : "Missing";

  const openPlans = async () => {
    try {
      await openExternalUrl(PLANS_URL);
    } catch (error) {
      showToast(`Could not open plans page: ${String(error)}`, "error");
    }
  };

  const saveName = () => {
    const nextName = nameDraft.trim();
    if (nextName === testerProfile.tester_name.trim()) return;
    onTesterProfileChange({ tester_name: nextName });
    showToast(nextName ? "Display name updated." : "Display name cleared.", "success");
  };

  const onAvatarSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await readImageFileAsAvatar(file);
      onProfileImageChange(dataUrl);
      showToast("Profile picture updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = () => {
    onProfileImageChange(null);
    showToast("Profile picture removed.", "info");
  };

  return (
    <div className="profile-view">
      <header className="profile-header">
        <div className="profile-identity">
          <div className="profile-avatar-wrap">
            <img
              className="profile-avatar"
              src={profileImageUrl || defaultAvatar}
              alt=""
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => void onAvatarSelected(event)}
            />
            <button
              type="button"
              className="profile-avatar-edit"
              disabled={avatarBusy}
              aria-label="Upload profile picture"
              title="Upload profile picture"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div>
            <h1>Profile</h1>
            <p className="profile-subtitle">{displayName}</p>
            {profileImageUrl && (
              <button
                type="button"
                className="profile-avatar-remove"
                disabled={avatarBusy}
                onClick={removeAvatar}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                Remove photo
              </button>
            )}
          </div>
        </div>
        <div className="profile-header-actions">
          <button
            type="button"
            className="profile-link-button"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            More Details
            {detailsOpen ? (
              <ChevronUp size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
          <button type="button" className="profile-logout-button" onClick={onLogout}>
            Log Out
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="profile-grid">
        <section className="profile-panel profile-data-panel">
          <h2>My data</h2>
          <div className="profile-data-grid">
            <div className="profile-field profile-field-wide">
              <span>Display name</span>
              <div className="profile-name-edit">
                <input
                  type="text"
                  value={nameDraft}
                  maxLength={40}
                  placeholder="Enter your name"
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={nameDraft.trim() === testerProfile.tester_name.trim()}
                  onClick={saveName}
                >
                  Save
                </button>
              </div>
            </div>
            <ProfileField label="Email" value={email} missing={email === NOT_PROVIDED} />
            <ProfileField
              label="Country"
              value={country}
              missing={country === NOT_PROVIDED}
            />
            <ProfileField
              label="Internet Provider"
              value={isp}
              missing={isp === NOT_PROVIDED}
            />
            <ProfileField
              label="Beta invite"
              value={identity.inviteCode || NOT_PROVIDED}
              missing={!identity.inviteCode}
            />
            <div className="profile-field profile-field-wide">
              <span>My affiliate link</span>
              {affiliateLink ? (
                <div className="affiliate-copy">
                  <strong title={affiliateLink}>{affiliateLink}</strong>
                  <button
                    type="button"
                    aria-label="Copy affiliate link"
                    onClick={() => void copyText(affiliateLink, showToast)}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <strong className="profile-missing">{AFFILIATE_COMING_SOON}</strong>
              )}
            </div>
          </div>
        </section>

        <section className="profile-panel profile-account-panel">
          <h2>Account details</h2>
          <div className="profile-subscription">
            <span className="profile-empty-icon" aria-hidden="true">
              <Frown size={18} strokeWidth={1.75} />
            </span>
            {hasSubscription ? (
              <>
                <strong>Active plan</strong>
                <p>your Zer0 subscription is active.</p>
              </>
            ) : (
              <>
                <strong>No subscription</strong>
                <p>You don't have an active plan.</p>
                <button type="button" onClick={() => void openPlans()}>
                  Subscribe Now
                </button>
              </>
            )}
            {identity.testerId && (
              <small className="profile-account-meta">Tester ID: {identity.testerId}</small>
            )}
          </div>
        </section>
      </main>

      {detailsOpen && (
        <section className="profile-details-panel">
          <InfoTile
            description="Your optimized routing profile."
            icon={UserRound}
            title="Route Profile"
            tone={hasConfig ? "success" : "accent"}
            value={profileStatus}
          />
          <InfoTile
            description="Administrative access required."
            icon={Shield}
            title="Admin"
            tone={elevated ? "success" : "warning"}
            value={adminStatus}
          />
          <InfoTile
            description="Core routing engine status."
            icon={Cpu}
            title="Zer0 Engine"
            tone={engineInstalled ? "success" : "error"}
            value={engineStatus}
          />
          <label className="settings-toggle-row profile-toggle-row">
            <span className="settings-row-icon" aria-hidden="true">
              <LayoutGrid size={18} strokeWidth={1.75} />
            </span>
            <span className="settings-row-copy">
              <strong>Show quick tools bar</strong>
              <small>Diagnostics, export, logs, and restore buttons at the bottom.</small>
            </span>
            <input
              type="checkbox"
              checked={showQuickTools}
              onChange={(event) => onShowQuickToolsChange(event.target.checked)}
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>
          <div className="tester-actions profile-actions">
            <GlowButton onClick={onImport} disabled={busy === "import"}>
              {busy === "import" ? "Importing..." : "Import Legacy Profile"}
            </GlowButton>
            <button
              type="button"
              onClick={onRemove}
              disabled={!hasConfig || busy === "remove"}
            >
              {busy === "remove" ? "Clearing..." : "Clear Profile"}
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function readAccountIdentity() {
  return {
    testerId: window.localStorage.getItem("routelag.testerId")?.trim() || "",
    inviteCode: window.localStorage.getItem("routelag.inviteCode")?.trim() || "",
  };
}

function firstFilled(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim() ?? "").find(Boolean) ?? "";
}

async function copyText(
  value: string,
  showToast: (message: string, tone?: "success" | "error" | "info" | "warning") => void,
) {
  try {
    await navigator.clipboard.writeText(value);
    showToast("Copied to clipboard.", "success");
  } catch {
    showToast("Could not copy to clipboard.", "error");
  }
}

function ProfileField({
  label,
  missing = false,
  value,
}: {
  label: string;
  missing?: boolean;
  value: string;
}) {
  return (
    <div className="profile-field">
      <span>{label}</span>
      <strong className={missing ? "profile-missing" : undefined}>{value}</strong>
    </div>
  );
}

type SettingsTone = "accent" | "success" | "warning" | "error";

function InfoTile({
  description,
  icon: Icon,
  title,
  tone,
  value,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
  tone: SettingsTone;
  value: string;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className={`settings-status settings-status-${tone}`}>
        <Check size={14} strokeWidth={1.75} aria-hidden="true" />
        {value}
      </span>
    </div>
  );
}
