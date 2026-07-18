import { useState } from "react";
import { Show, useClerk, useUser, UserButton } from "@clerk/react";
import { ArrowLeft, KeyRound, LogIn } from "lucide-react";

import { GlowButton } from "../components/GlowButton";
import { GlowLogo } from "../components/GlowLogo";
import { LegalLinks } from "../components/LegalLinks";
import { useToast } from "../components/Toast";
import { BETA_BUILD_LABEL } from "../lib/betaMode";
import { getClerkAppearance } from "../lib/clerkAppearance";

type LoginMode = "choose" | "beta";

interface LoginPageProps {
  accepted: boolean;
  busy: boolean;
  onLogin: (inviteCode: string) => Promise<void>;
}

export function LoginPage({ accepted, busy, onLogin }: LoginPageProps) {
  const { showToast } = useToast();
  const clerk = useClerk();
  const { user } = useUser();
  const [mode, setMode] = useState<LoginMode>("choose");
  const [inviteCode, setInviteCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const openSignIn = () => {
    if (!clerk.loaded) {
      showToast("Auth is still loading. Try again in a moment.", "info");
      return;
    }
    setSigningIn(true);
    try {
      clerk.openSignIn({ appearance: getClerkAppearance("dark") });
    } catch (error) {
      showToast(`Could not open sign-in: ${String(error)}`, "error");
    } finally {
      window.setTimeout(() => setSigningIn(false), 400);
    }
  };

  const handleClerkSignOut = async () => {
    try {
      await clerk.signOut({ redirectUrl: "/" });
      setMode("choose");
      showToast("Signed out.", "info");
    } catch (error) {
      showToast(`Could not sign out: ${String(error)}`, "error");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      showToast("Enter your beta access code to continue.", "warning");
      return;
    }
    await onLogin(inviteCode.trim());
  };

  return (
    <div className="login-view">
      <div className="login-panel login-panel--wide">
        <div className="login-hero login-hero--center">
          <GlowLogo />
          <div className="login-copy">
            <small>{BETA_BUILD_LABEL}</small>
            <h1>{mode === "beta" ? "Enter beta code" : "Welcome back"}</h1>
            <p>
              {mode === "beta"
                ? "Unlock this private build with the invite from your Zer0 beta email."
                : "Sign in to your account, or continue with a beta invite code."}
            </p>
          </div>
        </div>

        <div className="login-form-block">
          <Show when="signed-in">
            <div className="login-signed-in-row">
              <div className="login-signed-in-meta">
                <UserButton />
                <div>
                  <strong>Signed in</strong>
                  <p>{user?.primaryEmailAddress?.emailAddress ?? "Account ready"}</p>
                </div>
                <button
                  type="button"
                  className="login-sign-out-btn"
                  onClick={() => void handleClerkSignOut()}
                >
                  Sign out
                </button>
              </div>
            </div>
          </Show>

          {mode === "choose" ? (
            <>
              <Show when="signed-out">
                <div className="login-choice-stack">
                  <button
                    type="button"
                    className="login-choice-btn login-choice-btn--primary"
                    disabled={signingIn}
                    onClick={openSignIn}
                  >
                    <LogIn size={18} strokeWidth={2.25} aria-hidden="true" />
                    {signingIn ? "Opening..." : "Sign in"}
                  </button>

                  <div className="login-choice-or" aria-hidden="true">
                    <span />
                    <strong>or</strong>
                    <span />
                  </div>

                  <button
                    type="button"
                    className="login-choice-btn login-choice-btn--secondary"
                    onClick={() => setMode("beta")}
                  >
                    <KeyRound size={18} strokeWidth={2.25} aria-hidden="true" />
                    Use beta code
                  </button>
                </div>
              </Show>

              <Show when="signed-in">
                <div className="login-choice-stack">
                  <button
                    type="button"
                    className="login-choice-btn login-choice-btn--primary"
                    onClick={() => setMode("beta")}
                  >
                    <KeyRound size={18} strokeWidth={2.25} aria-hidden="true" />
                    Continue with beta code
                  </button>
                </div>
              </Show>
            </>
          ) : (
            <form className="login-code-panel login-code-panel--reveal" onSubmit={submit}>
              <button
                type="button"
                className="login-back-btn"
                onClick={() => setMode("choose")}
              >
                <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                Back
              </button>

              <label className="field-label">
                <span className="sr-only">Beta access code</span>
                <div className="invite-input-wrap">
                  <input
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    type="text"
                    autoFocus
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

              <p className="login-code-hint">
                Example invite format
                <span>ZER0-BETA</span>
              </p>
            </form>
          )}

          <div className="login-legal-row">
            <LegalLinks compact ids={["privacy", "terms", "beta-tester-agreement"]} />
          </div>
        </div>
      </div>
    </div>
  );
}
