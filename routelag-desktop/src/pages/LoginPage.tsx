import { useState } from "react";

import { GlowButton } from "../components/GlowButton";
import { GlowLogo } from "../components/GlowLogo";
import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
import { useToast } from "../components/Toast";
import type { InlineError } from "../types";

interface LoginPageProps {
  busy: boolean;
  error: InlineError | null;
  onLogin: (inviteCode: string) => Promise<void>;
}

export function LoginPage({
  busy,
  error,
  onLogin,
}: LoginPageProps) {
  const { showToast } = useToast();
  const [inviteCode, setInviteCode] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      showToast("Enter your beta invite code to continue.", "warning");
      return;
    }
    await onLogin(inviteCode.trim());
  };

  return (
    <form className="login-view" onSubmit={submit}>
      <div className="login-hero">
        <GlowLogo />
        <div className="login-copy">
          <small>RouteLag Beta</small>
          <h1>Welcome back</h1>
          <p>Enter your invite to start optimizing.</p>
        </div>
      </div>
      <div className="login-form-block">
        {error && <SafetyErrorPanel error={error} />}
        <label className="field-label">
          <span>Invite code</span>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            type="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder="BETA-SA-001"
          />
        </label>
        <GlowButton type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </GlowButton>
      </div>
    </form>
  );
}
