import { useEffect, useMemo, useRef, useState } from "react";
import { Show, useAuth, useClerk, useUser } from "@clerk/react";
import {
  usePlans,
  useSubscription,
} from "@clerk/react/experimental";
import { openExternalUrl } from "../lib/openExternalUrl";
import { Check, ExternalLink, LogOut, Moon, Sun, UserRound } from "lucide-react";

import {
  clearRouteAuth,
  ensurePathGenSession,
  routeApi,
  type DiscordConnectionStatus,
  type EpicConnectionStatus,
} from "../lib/api";
import { clerkAppearance, getClerkAppearance, getClerkUserProfileAppearance } from "../lib/clerkAppearance";
import { PRO_PLAN_SLUG, useEntitlements } from "../lib/billing";
import { ensureFreeHudFeature, filterHudOutOfProFeatures } from "../lib/hudAccess";
import {
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
  type AppTheme,
} from "../lib/appPreferences";
import { pushCloudPreferences, syncClerkIdentityToCloud } from "../lib/cloudUserSync";
import { LegalLinks } from "../components/LegalLinks";
import { useToast } from "../components/Toast";

type ConnectionId = "discord" | "epic" | "google";
type PlanTab = "free" | "pro";
type PlanPeriod = "month" | "annual";

export function AccountPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const pathGenAuth = {
    getClerkToken: () => getToken(),
    clerkUserId: user?.id,
  };
  const clerk = useClerk();
  const { showToast } = useToast();
  const { hasProPlan, isLoaded: entitlementsLoaded, planPeriod: entitlementPeriod } =
    useEntitlements();
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription({
    for: "user",
    enabled: entitlementsLoaded,
  });
  const { data: plans, isLoading: plansLoading } = usePlans({ for: "user" });
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const [epicStatus, setEpicStatus] = useState<EpicConnectionStatus | null>(null);
  const [epicBusy, setEpicBusy] = useState(false);
  const epicPollRef = useRef<number | null>(null);
  const [discordStatus, setDiscordStatus] = useState<DiscordConnectionStatus | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const discordPollRef = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setPreferences(loadAppPreferences());
    window.addEventListener("routelag:preferences", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("routelag:preferences", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!userLoaded || !user?.id) return;
    const email =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? undefined;
    void ensurePathGenSession({
      ...pathGenAuth,
      inviteCode: email,
      clerkEmail: email,
      clerkUserId: user.id,
    })
      .then((ok) => {
        if (!ok) return;
        return syncClerkIdentityToCloud({
          clerkUserId: user.id,
          clerkEmail: email,
          hasProPlan,
          planPeriod: entitlementPeriod,
          googleConnected: Boolean(
            user.externalAccounts?.some(
              (account) => account.provider === "google" && account.verification?.status === "verified",
            ) || email,
          ),
        });
      })
      .catch(() => undefined);
  }, [userLoaded, user?.id, hasProPlan, entitlementPeriod]);

  const refreshEpicStatus = async () => {
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      undefined;
    const ok = await ensurePathGenSession({
      ...pathGenAuth,
      inviteCode: email,
      clerkEmail: email,
      clerkUserId: user?.id,
    });
    if (!ok) {
      setEpicStatus(null);
      return null;
    }
    const status = await routeApi.getEpicStatus();
    setEpicStatus(status);
    return status;
  };

  const refreshDiscordStatus = async () => {
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      undefined;
    const ok = await ensurePathGenSession({
      ...pathGenAuth,
      inviteCode: email,
      clerkEmail: email,
      clerkUserId: user?.id,
    });
    if (!ok) {
      setDiscordStatus(null);
      return null;
    }
    const status = await routeApi.getDiscordStatus();
    setDiscordStatus(status);
    return status;
  };

  useEffect(() => {
    if (!userLoaded) return;
    void refreshEpicStatus().catch(() => setEpicStatus(null));
    void refreshDiscordStatus().catch(() => setDiscordStatus(null));
    return () => {
      if (epicPollRef.current != null) {
        window.clearInterval(epicPollRef.current);
        epicPollRef.current = null;
      }
      if (discordPollRef.current != null) {
        window.clearInterval(discordPollRef.current);
        discordPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when Clerk user becomes available
  }, [userLoaded, user?.id]);

  const stopEpicPoll = () => {
    if (epicPollRef.current != null) {
      window.clearInterval(epicPollRef.current);
      epicPollRef.current = null;
    }
  };

  const stopDiscordPoll = () => {
    if (discordPollRef.current != null) {
      window.clearInterval(discordPollRef.current);
      discordPollRef.current = null;
    }
  };

  const startEpicPoll = () => {
    stopEpicPoll();
    const startedAt = Date.now();
    epicPollRef.current = window.setInterval(() => {
      void refreshEpicStatus()
        .then((status) => {
          if (status?.connected) {
            stopEpicPoll();
            setEpicBusy(false);
            showToast(
              status.epicDisplayName
                ? `Epic Games linked as ${status.epicDisplayName}`
                : "Epic Games linked",
              "success",
            );
          } else if (Date.now() - startedAt > 120_000) {
            stopEpicPoll();
            setEpicBusy(false);
          }
        })
        .catch(() => undefined);
    }, 2500);
  };

  const startDiscordPoll = () => {
    stopDiscordPoll();
    const startedAt = Date.now();
    discordPollRef.current = window.setInterval(() => {
      void refreshDiscordStatus()
        .then((status) => {
          if (status?.connected) {
            stopDiscordPoll();
            setDiscordBusy(false);
            showToast(
              status.discordUsername
                ? `Discord linked as ${status.discordUsername}`
                : "Discord linked",
              "success",
            );
          } else if (Date.now() - startedAt > 120_000) {
            stopDiscordPoll();
            setDiscordBusy(false);
          }
        })
        .catch(() => undefined);
    }, 2500);
  };

  const setTheme = (theme: AppTheme) => {
    const next = { ...preferences, theme };
    const saved = saveAppPreferences(next);
    setPreferences(saved);
    void pushCloudPreferences(saved).catch(() => undefined);
  };
  const freePlan = useMemo(
    () => plans?.find((plan) => plan.isDefault || plan.slug === "free") ?? null,
    [plans],
  );
  const proPlan = useMemo(
    () =>
      plans?.find((plan) => plan.slug === PRO_PLAN_SLUG) ??
      plans?.find((plan) => !plan.isDefault && plan.hasBaseFee) ??
      null,
    [plans],
  );

  const activeItem =
    subscription?.subscriptionItems?.find(
      (item) =>
        (item.status === "active" || item.status === "past_due") &&
        (item.plan?.slug === PRO_PLAN_SLUG ||
          (!item.plan?.isDefault && Boolean(item.plan?.hasBaseFee))),
    ) ?? null;

  const planPeriod = activeItem?.planPeriod ?? entitlementPeriod;
  const [planTab, setPlanTab] = useState<PlanTab>(hasProPlan ? "pro" : "free");
  const [billedAnnually, setBilledAnnually] = useState(planPeriod === "annual");

  useEffect(() => {
    if (!entitlementsLoaded) return;
    setPlanTab(hasProPlan ? "pro" : "free");
  }, [entitlementsLoaded, hasProPlan]);

  useEffect(() => {
    if (planPeriod === "annual" || planPeriod === "month") {
      setBilledAnnually(planPeriod === "annual");
    }
  }, [planPeriod]);

  const selectedPeriod: PlanPeriod = billedAnnually ? "annual" : "month";
  const viewingPro = planTab === "pro";
  const onCurrentTab =
    (viewingPro && hasProPlan && (planPeriod ? planPeriod === selectedPeriod : true)) ||
    (!viewingPro && !hasProPlan);

  const planLabel = !entitlementsLoaded
    ? "…"
    : hasProPlan
      ? planPeriod === "annual"
        ? "Pro · Annual"
        : planPeriod === "month"
          ? "Pro · Monthly"
          : "Pro"
      : "Free";

  const nextBilling =
    subscription?.nextPayment?.date ?? activeItem?.periodEnd ?? activeItem?.nextPayment?.date;
  const nextAmount = formatUsdAmount(
    subscription?.nextPayment?.amount?.amountFormatted ??
      activeItem?.nextPayment?.amount?.amountFormatted ??
      activeItem?.amount?.amountFormatted,
  );

  const displayName =
    user?.fullName?.trim() ||
    user?.username?.trim() ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const imageUrl = user?.imageUrl;

  const googleAccount = user?.externalAccounts?.find(
    (account) => account.provider === "google" && account.verification?.status === "verified",
  );
  const googleConnected = Boolean(googleAccount || user?.primaryEmailAddress);

  const proPriceLabel = formatProPrice(proPlan, selectedPeriod);
  const features = (
    viewingPro
      ? filterHudOutOfProFeatures(proPlan?.features ?? [])
      : ensureFreeHudFeature(
          (freePlan?.features ?? []).map((feature) =>
            typeof feature === "string" ? feature : feature.name,
          ),
        )
  )
    .slice(0, 6)
    .map((feature) =>
      typeof feature === "string"
        ? formatPlanFeatureName(feature)
        : { ...feature, name: formatPlanFeatureName(feature.name) },
    );

  const onConnect = async (id: ConnectionId) => {
    if (id === "google") {
      clerk.openUserProfile?.({ appearance: getClerkUserProfileAppearance(preferences.theme) });
      return;
    }

    if (id === "discord") {
      if (discordBusy) return;
      setDiscordBusy(true);
      try {
        const emailHint =
          user?.primaryEmailAddress?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          undefined;
        const sessionOk = await ensurePathGenSession({
          ...pathGenAuth,
          inviteCode: emailHint,
          clerkEmail: emailHint,
          clerkUserId: user?.id,
        });
        if (!sessionOk) {
          showToast("Sign in with Clerk first, then try linking Discord again.", "error");
          setDiscordBusy(false);
          return;
        }

        const { url } = await routeApi.startDiscordConnect();
        try {
          await openExternalUrl(url);
        } catch {
          showToast("Could not open Discord sign-in (URL not allowlisted).", "error");
          setDiscordBusy(false);
          return;
        }
        showToast("Finish signing in with Discord in your browser.", "info");
        startDiscordPoll();
      } catch (error) {
        setDiscordBusy(false);
        const message = error instanceof Error ? error.message : String(error);
        showToast(
          /discord_unavailable|not configured/i.test(message)
            ? "Discord linking is not configured on the server yet."
            : `Could not start Discord linking: ${message}`,
          "error",
        );
      }
      return;
    }

    if (epicBusy) return;
    setEpicBusy(true);
    try {
      const emailHint =
        user?.primaryEmailAddress?.emailAddress ??
        user?.emailAddresses?.[0]?.emailAddress ??
        undefined;
      const sessionOk = await ensurePathGenSession({
        ...pathGenAuth,
        inviteCode: emailHint,
        clerkEmail: emailHint,
        clerkUserId: user?.id,
      });
      if (!sessionOk) {
        showToast("Sign in with Clerk first, then try linking Epic Games again.", "error");
        setEpicBusy(false);
        return;
      }

      const { url } = await routeApi.startEpicConnect();
      try {
        await openExternalUrl(url);
      } catch {
        showToast("Could not open Epic Games sign-in (URL not allowlisted).", "error");
        setEpicBusy(false);
        return;
      }
      showToast("Finish signing in with Epic Games in your browser.", "info");
      startEpicPoll();
    } catch (error) {
      setEpicBusy(false);
      const message = error instanceof Error ? error.message : String(error);
      showToast(
        /epic_unavailable|not configured/i.test(message)
          ? "Epic Games linking is not configured on the server yet."
          : `Could not start Epic linking: ${message}`,
        "error",
      );
    }
  };

  const onUnlinkEpic = async () => {
    if (epicBusy) return;
    setEpicBusy(true);
    try {
      await routeApi.unlinkEpic();
      setEpicStatus((prev) =>
        prev
          ? {
              ...prev,
              connected: false,
              epicAccountId: null,
              epicDisplayName: null,
              epicLinkedAt: null,
            }
          : prev,
      );
      showToast("Epic Games disconnected.", "success");
    } catch (error) {
      showToast(`Could not disconnect Epic: ${String(error)}`, "error");
    } finally {
      setEpicBusy(false);
    }
  };

  const onUnlinkDiscord = async () => {
    if (discordBusy) return;
    setDiscordBusy(true);
    try {
      await routeApi.unlinkDiscord();
      setDiscordStatus((prev) =>
        prev
          ? {
              ...prev,
              connected: false,
              discordUserId: null,
              discordUsername: null,
              discordLinkedAt: null,
            }
          : prev,
      );
      showToast("Discord disconnected.", "success");
    } catch (error) {
      showToast(`Could not disconnect Discord: ${String(error)}`, "error");
    } finally {
      setDiscordBusy(false);
    }
  };

  const openProCheckout = () => {
    if (!proPlan?.id) {
      showToast(
        plansLoading ? "Plans are still loading…" : "Pro plan is unavailable right now.",
        "info",
      );
      return;
    }

    if (!clerk.loaded) {
      showToast("Account is still loading. Try again in a moment.", "info");
      return;
    }

    const openCheckout = (
      clerk as typeof clerk & {
        __internal_openCheckout?: (props: {
          planId: string;
          planPeriod: PlanPeriod;
          for?: "user";
          appearance?: typeof clerkAppearance;
          portalRoot?: HTMLElement | null;
          onSubscriptionComplete?: () => void;
        }) => void;
      }
    ).__internal_openCheckout;

    if (typeof openCheckout !== "function") {
      showToast("Checkout is not available yet. Try again in a moment.", "error");
      return;
    }

    try {
      openCheckout({
        planId: proPlan.id,
        planPeriod: selectedPeriod,
        for: "user",
        appearance: getClerkAppearance(preferences.theme),
        portalRoot: document.body,
        onSubscriptionComplete: () => {
          void clerk.session?.reload().finally(() => {
            showToast("Welcome to Pro!", "success");
          });
        },
      });
    } catch (error) {
      showToast(`Could not open checkout: ${String(error)}`, "error");
    }
  };

  const openSubscriptionDetails = () => {
    if (!clerk.loaded) {
      showToast("Account is still loading. Try again in a moment.", "info");
      return;
    }

    const openDetails = (
      clerk as typeof clerk & {
        __internal_openSubscriptionDetails?: (props: {
          for?: "user";
          appearance?: typeof clerkAppearance;
          portalRoot?: HTMLElement | null;
        }) => void;
      }
    ).__internal_openSubscriptionDetails;

    if (typeof openDetails !== "function") {
      showToast("Subscription details are not available yet.", "error");
      return;
    }

    try {
      openDetails({
        for: "user",
        appearance: getClerkAppearance(preferences.theme),
        portalRoot: document.body,
      });
    } catch (error) {
      showToast(`Could not open subscription details: ${String(error)}`, "error");
    }
  };

  return (
    <main className="account-view">
      <header className="account-header">
        <div>
          <h1>Account</h1>
          <p>Plans, billing, and linked accounts.</p>
        </div>
      </header>

      <div className="account-layout">
        <section className="dashboard-card account-block account-plans" aria-label="Subscription plans">
          <div className="account-block-head">
            <h2>Plans</h2>
            <span className={`account-pill ${hasProPlan ? "tone-success" : "tone-muted"}`}>
              {planLabel}
            </span>
          </div>

          <div className="account-plan-toggle" role="tablist" aria-label="Plan">
            <button
              type="button"
              role="tab"
              aria-selected={planTab === "free"}
              className={planTab === "free" ? "is-active" : ""}
              onClick={() => setPlanTab("free")}
            >
              Free
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={planTab === "pro"}
              className={planTab === "pro" ? "is-active" : ""}
              onClick={() => setPlanTab("pro")}
            >
              Pro
            </button>
          </div>

          <Show
            when="signed-in"
            fallback={
              <p className="account-billing-fallback">
                Sign in to view plans and manage your subscription.
              </p>
            }
          >
            <div className="account-plan-panel">
              <div className="account-plan-price-row">
                <div className="account-plan-price">
                  <strong>
                    {plansLoading ? "…" : viewingPro ? proPriceLabel.amount : "$0"}
                  </strong>
                  <span>{viewingPro ? proPriceLabel.period : "Always free"}</span>
                </div>
                {viewingPro && (
                  <label className="account-annual-switch">
                    <input
                      type="checkbox"
                      checked={billedAnnually}
                      onChange={(event) => setBilledAnnually(event.target.checked)}
                    />
                    <span className="account-annual-track" aria-hidden="true" />
                    <span>Billed annually</span>
                  </label>
                )}
              </div>

              <ul className="account-feature-list">
                {(features.length
                  ? features
                  : viewingPro
                    ? fallbackProFeatures
                    : fallbackFreeFeatures
                ).map((feature) => (
                  <li key={typeof feature === "string" ? feature : feature.id}>
                    <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                    <span>{typeof feature === "string" ? feature : feature.name}</span>
                  </li>
                ))}
              </ul>

              <div className="account-plan-cta">
                {onCurrentTab ? (
                  hasProPlan && viewingPro ? (
                    <button
                      type="button"
                      className="account-secondary-btn account-cta-btn"
                      onClick={openSubscriptionDetails}
                    >
                      Manage subscription
                    </button>
                  ) : (
                    <button type="button" className="account-secondary-btn account-cta-btn" disabled>
                      Current plan
                    </button>
                  )
                ) : viewingPro && proPlan ? (
                  <button
                    type="button"
                    className="account-primary-btn account-cta-btn"
                    onClick={openProCheckout}
                  >
                    {hasProPlan
                      ? selectedPeriod === "annual"
                        ? "Switch to annual"
                        : "Switch to monthly"
                      : proPlan.freeTrialEnabled
                        ? "Start free trial"
                        : "Upgrade to Pro"}
                  </button>
                ) : hasProPlan ? (
                  <button
                    type="button"
                    className="account-secondary-btn account-cta-btn"
                    onClick={openSubscriptionDetails}
                  >
                    Switch to Free
                  </button>
                ) : (
                  <button type="button" className="account-secondary-btn account-cta-btn" disabled>
                    Current plan
                  </button>
                )}
              </div>
            </div>
          </Show>
        </section>

        <section className="dashboard-card account-block account-details" aria-label="Account and connections">
          <div className="account-block-head">
            <h2>Profile</h2>
            <button
              type="button"
              className="account-text-link"
              onClick={() =>
                clerk.openUserProfile?.({
                  appearance: getClerkUserProfileAppearance(preferences.theme),
                })
              }
              disabled={!userLoaded}
            >
              Edit
            </button>
          </div>

          <div className="account-profile-row">
            {imageUrl ? (
              <img className="account-avatar" src={imageUrl} alt="" decoding="async" />
            ) : (
              <span className="account-avatar account-avatar-fallback" aria-hidden="true">
                <UserRound size={18} strokeWidth={1.75} />
              </span>
            )}
            <div className="account-profile-copy">
              <strong>{userLoaded ? displayName : "…"}</strong>
              <span>{userLoaded ? email : "…"}</span>
            </div>
          </div>

          <dl className="account-meta-grid">
            <div>
              <dt>Plan</dt>
              <dd>{planLabel}</dd>
            </div>
            <div>
              <dt>Next billing</dt>
              <dd>
                {!entitlementsLoaded || subscriptionLoading
                  ? "…"
                  : hasProPlan && nextBilling
                    ? [formatBillingDate(nextBilling), nextAmount ?? null]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Sign-in</dt>
              <dd>{googleConnected ? "Google / Email" : "Email"}</dd>
            </div>
          </dl>

          <div className="account-block-head account-block-head-spaced">
            <h2>Connections</h2>
          </div>

          <ul className="account-connection-list">
            <li className="account-connection-row">
              <span className="account-card-icon discord" aria-hidden="true">
                <img src="/brands/discord.png" alt="" decoding="async" />
              </span>
              <div className="account-connection-copy">
                <h3>Discord</h3>
                <p>
                  {discordStatus?.connected && discordStatus.discordUsername
                    ? `Linked as ${discordStatus.discordUsername}`
                    : "Support, roles, and announcements."}
                </p>
              </div>
              {discordStatus?.connected ? (
                <div className="account-connection-actions is-linked">
                  <span className="account-status-pill" aria-hidden="true">
                    Connected
                  </span>
                  <button
                    type="button"
                    className="account-unlink-btn"
                    onClick={() => void onUnlinkDiscord()}
                    disabled={discordBusy}
                    aria-label={
                      discordStatus.discordUsername
                        ? `Disconnect Discord account ${discordStatus.discordUsername}`
                        : "Disconnect Discord"
                    }
                  >
                    {discordBusy ? "Working…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="account-secondary-btn"
                  onClick={() => void onConnect("discord")}
                  disabled={discordBusy}
                >
                  {discordBusy ? "Waiting…" : "Connect"}
                  {!discordBusy ? <ExternalLink size={13} strokeWidth={1.75} /> : null}
                </button>
              )}
            </li>

            <li className="account-connection-row">
              <span className="account-card-icon epic" aria-hidden="true">
                <img src="/brands/epic.png" alt="" decoding="async" />
              </span>
              <div className="account-connection-copy">
                <h3>Epic Games</h3>
                <p>
                  {epicStatus?.connected && epicStatus.epicDisplayName
                    ? `Linked as ${epicStatus.epicDisplayName}`
                    : "Fortnite account for PathGen replays."}
                </p>
              </div>
              {epicStatus?.connected ? (
                <div className="account-connection-actions is-linked">
                  <span className="account-status-pill" aria-hidden="true">
                    Connected
                  </span>
                  <button
                    type="button"
                    className="account-unlink-btn"
                    onClick={() => void onUnlinkEpic()}
                    disabled={epicBusy}
                    aria-label={
                      epicStatus.epicDisplayName
                        ? `Disconnect Epic account ${epicStatus.epicDisplayName}`
                        : "Disconnect Epic Games"
                    }
                  >
                    {epicBusy ? "Working…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="account-secondary-btn"
                  onClick={() => void onConnect("epic")}
                  disabled={epicBusy}
                >
                  {epicBusy ? "Waiting…" : "Connect"}
                  {!epicBusy ? <ExternalLink size={13} strokeWidth={1.75} /> : null}
                </button>
              )}
            </li>

            <li className="account-connection-row">
              <span className="account-card-icon google" aria-hidden="true">
                <img src="/brands/google.png" alt="" decoding="async" />
              </span>
              <div className="account-connection-copy">
                <h3>Google / Email</h3>
                <p>Used to sign in to Zer0.</p>
              </div>
              {googleConnected ? (
                <span className="account-status-pill">Connected</span>
              ) : (
                <button
                  type="button"
                  className="account-secondary-btn"
                  onClick={() => onConnect("google")}
                >
                  Manage
                </button>
              )}
            </li>
          </ul>

          <div className="account-footer-row">
            <button
              type="button"
              className="account-danger-btn"
              onClick={() => {
                clearRouteAuth();
                window.dispatchEvent(new CustomEvent("routelag:logout"));
                void clerk.signOut({ redirectUrl: "/" }).catch(() => undefined);
              }}
            >
              <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </button>
            <label
              className={`account-theme-switch account-theme-switch-compact is-${preferences.theme}`}
              title={preferences.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {preferences.theme === "dark" ? (
                <Moon size={14} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{preferences.theme === "dark" ? "Dark mode" : "Light mode"}</span>
              <input
                type="checkbox"
                checked={preferences.theme === "dark"}
                aria-label={
                  preferences.theme === "dark" ? "Disable dark mode" : "Enable dark mode"
                }
                onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
              />
              <span className="account-theme-track" aria-hidden="true" />
            </label>
          </div>
          <div className="account-legal-row">
            <p className="account-legal-label">Legal (free to view)</p>
            <LegalLinks compact ids={["privacy", "terms", "beta-tester-agreement", "disclaimers"]} />
          </div>
        </section>
      </div>
    </main>
  );
}

const fallbackFreeFeatures = ensureFreeHudFeature(["Basic Routing", "Community Support"]);
const fallbackProFeatures = filterHudOutOfProFeatures([
  "Priority Routing",
  "Pro Routing",
  "Replay Parsing",
  "Personal Support",
]);

/** Display names for Clerk Billing feature keys / labels. */
function formatPlanFeatureName(name: string): string {
  const key = name.trim().toLowerCase();
  const map: Record<string, string> = {
    "priority routing": "Priority Routing",
    "priotory routing": "Priority Routing",
    "pro routing": "Pro Routing",
    "routing pro": "Pro Routing",
    "basic routing": "Basic Routing",
    "routing basic": "Basic Routing",
    "core routing": "Basic Routing",
    replays: "Replay Parsing",
    "replay parsing": "Replay Parsing",
    hud: "Free HUD Overlay",
    "hud overlay": "Free HUD Overlay",
    "free hud": "Free HUD Overlay",
    "free hud overlay": "Free HUD Overlay",
    "community support": "Community Support",
    "personal support": "Personal Support",
    "direct support": "Personal Support",
    "priority support": "Personal Support",
  };
  return map[key] ?? name;
}

function formatUsdAmount(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const numeric = Number(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) {
    return raw.startsWith("$") ? raw : `$${raw}`;
  }
  return `$${numeric.toFixed(2)}`;
}

function formatProPrice(
  plan: { fee: { amountFormatted: string } | null; annualMonthlyFee: { amountFormatted: string } | null; annualFee: { amountFormatted: string } | null } | null,
  period: PlanPeriod,
) {
  if (!plan) return { amount: "—", period: "" };
  if (period === "annual") {
    const monthly = formatUsdAmount(plan.annualMonthlyFee?.amountFormatted);
    if (monthly) return { amount: monthly, period: "/ month" };
    const annual = formatUsdAmount(plan.annualFee?.amountFormatted);
    if (annual) return { amount: annual, period: "/ year" };
  }
  const monthly = formatUsdAmount(plan.fee?.amountFormatted);
  return { amount: monthly ?? "—", period: "/ month" };
}

function formatBillingDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
