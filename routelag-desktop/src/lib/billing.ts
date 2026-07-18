import { useAuth, useClerk } from "@clerk/react";
import { useSubscription } from "@clerk/react/experimental";
import { useEffect, useMemo, useRef } from "react";

/** Clerk Billing feature keys (must match Dashboard plan features). */
export const BILLING_FEATURES = {
  unlimitedRouting: "unlimited_routing",
  replays: "replays",
} as const;

/**
 * Legacy Clerk Dashboard feature key. HUD is free and must never gate access.
 * Kept only for Dashboard compatibility / migration docs — do not check this for entitlements.
 */
export const LEGACY_CLERK_HUD_FEATURE_KEY = "hud" as const;

export const PRO_PLAN_SLUG = "pro" as const;

type PlanLike = {
  slug?: string | null;
  isDefault?: boolean;
  hasBaseFee?: boolean;
} | null;

type SubscriptionItemLike = {
  status?: string | null;
  planPeriod?: "month" | "annual" | null;
  plan?: PlanLike;
};

/** Paid / Pro-tier subscription item (not the free default plan). */
export function isPaidSubscriptionItem(item: SubscriptionItemLike | null | undefined) {
  if (!item) return false;
  if (item.status !== "active" && item.status !== "past_due") return false;
  const plan = item.plan;
  if (!plan) return false;
  if (plan.slug === PRO_PLAN_SLUG) return true;
  if (plan.isDefault) return false;
  return Boolean(plan.hasBaseFee);
}

export function useEntitlements() {
  const { has, isLoaded: authLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription({
    for: "user",
    enabled: Boolean(authLoaded && isSignedIn),
  });

  const activePaidItem = useMemo(
    () => subscription?.subscriptionItems?.find((item) => isPaidSubscriptionItem(item)) ?? null,
    [subscription],
  );

  const hasFromClaims = Boolean(
    authLoaded &&
      isSignedIn &&
      (has?.({ plan: PRO_PLAN_SLUG }) ||
        has?.({ feature: BILLING_FEATURES.unlimitedRouting }) ||
        has?.({ feature: BILLING_FEATURES.replays })),
  );

  const hasFromSubscription = Boolean(activePaidItem);
  const hasProPlan = hasFromClaims || hasFromSubscription;

  // Session JWT can lag behind Billing after checkout / renewals.
  const reloadedForSubRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authLoaded || !isSignedIn || subscriptionLoading) return;
    if (hasFromClaims || !hasFromSubscription) return;

    const subKey = activePaidItem?.plan?.slug ?? "paid";
    if (reloadedForSubRef.current === subKey) return;
    reloadedForSubRef.current = subKey;
    void clerk.session?.reload();
  }, [
    activePaidItem?.plan?.slug,
    authLoaded,
    clerk.session,
    hasFromClaims,
    hasFromSubscription,
    isSignedIn,
    subscriptionLoading,
  ]);

  const hasUnlimitedRouting = Boolean(
    hasProPlan ||
      (authLoaded && isSignedIn && has?.({ feature: BILLING_FEATURES.unlimitedRouting })),
  );
  const hasReplays = Boolean(
    hasProPlan ||
      (authLoaded && isSignedIn && has?.({ feature: BILLING_FEATURES.replays })),
  );

  const isLoaded = Boolean(authLoaded && (!isSignedIn || !subscriptionLoading));

  return {
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    hasProPlan,
    hasUnlimitedRouting,
    hasReplays,
    planPeriod: activePaidItem?.planPeriod ?? null,
    activePlanSlug: activePaidItem?.plan?.slug ?? (hasFromClaims ? PRO_PLAN_SLUG : null),
  };
}
