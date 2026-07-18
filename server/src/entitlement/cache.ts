import type { EntitlementDecision } from "./types.js";

interface CacheEntry {
  decision: EntitlementDecision;
  /** When this cache entry becomes invalid (server-controlled). */
  expiresAtMs: number;
}

/**
 * Server-side entitlement cache. Clients cannot extend grace — only the server
 * writes entries, and each entry has a hard TTL.
 */
export class EntitlementCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get(clerkUserId: string, nowMs = Date.now()): EntitlementDecision | null {
    const entry = this.entries.get(clerkUserId);
    if (!entry) return null;
    if (entry.expiresAtMs <= nowMs) {
      this.entries.delete(clerkUserId);
      return null;
    }
    return entry.decision;
  }

  set(clerkUserId: string, decision: EntitlementDecision, nowMs = Date.now()): void {
    const periodCap =
      decision.periodEndsAtMs != null && Number.isFinite(decision.periodEndsAtMs)
        ? decision.periodEndsAtMs
        : Number.POSITIVE_INFINITY;
    const expiresAtMs = Math.min(nowMs + this.ttlMs, periodCap);
    this.entries.set(clerkUserId, { decision, expiresAtMs });
  }

  /** Test helper — clear all entries. */
  clear(): void {
    this.entries.clear();
  }

  /** Test helper — force-expire an entry by rewriting TTL to the past. */
  expireNow(clerkUserId: string, nowMs = Date.now()): void {
    const entry = this.entries.get(clerkUserId);
    if (!entry) return;
    this.entries.set(clerkUserId, { ...entry, expiresAtMs: nowMs - 1 });
  }
}
