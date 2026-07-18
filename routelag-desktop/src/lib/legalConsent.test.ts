/**
 * Legal consent storage tests.
 * Run: node --experimental-strip-types --test src/lib/legalConsent.test.ts
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

const memory = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    },
  },
  dispatchEvent() {
    return true;
  },
};

const {
  LEGAL_DOCUMENT_VERSION,
  REQUIRED_LEGAL_ACK_IDS,
  attachClerkUserIdToLegalConsent,
  hasAcceptedCurrentLegal,
  loadLegalConsent,
  saveLegalConsent,
} = await import("./legalConsent.ts");

describe("legalConsent", () => {
  beforeEach(() => {
    memory.clear();
  });

  it("starts without acceptance", () => {
    assert.equal(hasAcceptedCurrentLegal(), false);
    assert.equal(loadLegalConsent(), null);
  });

  it("stores minimal acceptance fields", () => {
    const record = saveLegalConsent({
      clerkUserId: "user_abc",
      appVersion: "0.2.1",
    });
    assert.equal(record.documentVersion, LEGAL_DOCUMENT_VERSION);
    assert.ok(record.acceptedAt);
    assert.equal(record.clerkUserId, "user_abc");
    assert.equal(record.appVersion, "0.2.1");
    assert.deepEqual(record.acknowledgements, [...REQUIRED_LEGAL_ACK_IDS]);
    assert.equal(hasAcceptedCurrentLegal(), true);
  });

  it("rejects stale document versions", () => {
    saveLegalConsent({ documentVersion: "old-version" });
    assert.equal(hasAcceptedCurrentLegal(), false);
  });

  it("attaches clerk user id without rewriting acceptance time", () => {
    const first = saveLegalConsent({ clerkUserId: null, appVersion: "0.2.1" });
    const next = attachClerkUserIdToLegalConsent("user_later");
    assert.ok(next);
    assert.equal(next!.clerkUserId, "user_later");
    assert.equal(next!.acceptedAt, first.acceptedAt);
    assert.equal(next!.documentVersion, first.documentVersion);
  });

  it("requires every acknowledgement id", () => {
    saveLegalConsent({
      acknowledgements: REQUIRED_LEGAL_ACK_IDS.slice(0, 3),
    });
    assert.equal(hasAcceptedCurrentLegal(), false);
  });
});
