import { useState } from "react";

import { GlowButton } from "../components/GlowButton";
import { GlowLogo } from "../components/GlowLogo";
import { useToast } from "../components/Toast";

interface LoginPageProps {
  busy: boolean;
  onLogin: (inviteCode: string) => Promise<void>;
}

export function LoginPage({ busy, onLogin }: LoginPageProps) {
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
      <GlowLogo />
      <div className="login-copy">
        <h2>Welcome!</h2>
        <p>Enter your beta invite code</p>
        <small>RouteLag Beta</small>
      </div>
      <label className="field-label">
        <span>Invite code</span>
        <input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          type="text"
          autoComplete="one-time-code"
          placeholder="BETA-WRENCH-001"
        />
      </label>
      <GlowButton type="submit" disabled={busy}>
        {busy ? "Logging in..." : "Log in"}
      </GlowButton>
    </form>
  );
}
