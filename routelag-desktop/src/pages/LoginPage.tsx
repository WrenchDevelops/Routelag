import { useState } from "react";
import { KeyRound } from "lucide-react";

import { GlowButton } from "../components/GlowButton";
import { GlowLogo } from "../components/GlowLogo";
import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
import { useToast } from "../components/Toast";
import { BETA_BUILD_LABEL, IS_BETA_DALLAS } from "../lib/betaMode";
import type { InlineError } from "../types";

interface LoginPageProps {
  accepted: boolean;
  busy: boolean;
  error: InlineError | null;
  onLogin: (inviteCode: string) => Promise<void>;
}

export function LoginPage({
  accepted,
  busy,
  error,
  onLogin,
}: LoginPageProps) {
  const { showToast } = useToast();
  const [inviteCode, setInviteCode] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      showToast("Enter your beta access code to continue.", "warning");
      return;
    }
    await onLogin(inviteCode.trim());
  };

  return (
    <form className="login-view" onSubmit={submit}>
      <div className="login-panel">
        <div className="login-hero">
          <GlowLogo />
          <div className="login-copy">
            <small>{BETA_BUILD_LABEL}</small>
            <h1>{IS_BETA_DALLAS ? "Beta access" : "Welcome back"}</h1>
            <p>
              {IS_BETA_DALLAS
                ? "Enter your beta access code to continue."
                : "Sign in to start optimizing your connection."}
            </p>
          </div>
        </div>
        <div className="login-form-block code-active">
          {error && <SafetyErrorPanel error={error} />}
          <div className="login-code-panel">
            <div className="login-divider">
              <span />
              <strong>Beta access code</strong>
              <span />
            </div>
            <p className="login-code-hint">
              Use the invite code from your RouteLag beta invite. Example: ROUTELAG-BETA
            </p>
            <label className="field-label">
              <span className="sr-only">Beta access code</span>
              <div className="invite-input-wrap">
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  placeholder="ENTER YOUR CODE"
                />
                <span
                  className={[
                    "invite-status-icon",
                    accepted ? "invite-status-accepted" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                >
                  {accepted ? (
                    <svg viewBox="0 0 24 24" role="img">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <KeyRound size={18} />
                  )}
                </span>
              </div>
            </label>
            <GlowButton type="submit" disabled={busy}>
              {busy ? "Checking code..." : "Continue"}
            </GlowButton>
          </div>

          {!IS_BETA_DALLAS && (
            <div className="login-legal-card">
              <div className="login-legal-copy">
                <p>Private beta build. Invite code required.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
