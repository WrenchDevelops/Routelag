/**
 * Automated policy tests for free HUD vs paid routing separation.
 * Run: node --experimental-strip-types --test src/lib/hudAccess.test.ts
 * (or transpile via the helper script in package.json)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canLaunchInstalledHud,
  canOpenHudPage,
  canUsePaidRouting,
  canUseReplays,
  ensureFreeHudFeature,
  filterHudOutOfProFeatures,
  formatHudLaunchError,
  isHudPlanFeatureLabel,
} from "./hudAccess.ts";

describe("free HUD access", () => {
  it("lets a free signed-in account open the HUD page when enabled", () => {
    assert.equal(
      canOpenHudPage({ hudFeatureEnabled: true, isSignedIn: true }),
      true,
    );
  });

  it("blocks HUD page when feature flag is off", () => {
    assert.equal(
      canOpenHudPage({ hudFeatureEnabled: false, isSignedIn: true }),
      false,
    );
  });

  it("lets free and paid accounts launch an installed HUD equally", () => {
    assert.equal(
      canLaunchInstalledHud({
        hudFeatureEnabled: true,
        hudInstalled: true,
        hasProPlan: false,
      }),
      true,
    );
    assert.equal(
      canLaunchInstalledHud({
        hudFeatureEnabled: true,
        hudInstalled: true,
        hasProPlan: true,
      }),
      true,
    );
  });

  it("does not launch when HUD is missing", () => {
    assert.equal(
      canLaunchInstalledHud({
        hudFeatureEnabled: true,
        hudInstalled: false,
        hasProPlan: true,
      }),
      false,
    );
  });
});

describe("paid routing isolation", () => {
  it("does not unlock routing for free / HUD-only state", () => {
    assert.equal(
      canUsePaidRouting({ hasProPlan: false, hasUnlimitedRouting: false }),
      false,
    );
  });

  it("allows routing for Pro / unlimited_routing", () => {
    assert.equal(
      canUsePaidRouting({ hasProPlan: true, hasUnlimitedRouting: false }),
      true,
    );
    assert.equal(
      canUsePaidRouting({ hasProPlan: false, hasUnlimitedRouting: true }),
      true,
    );
  });

  it("keeps replays Pro-gated", () => {
    assert.equal(canUseReplays({ hasProPlan: false, hasReplays: false }), false);
    assert.equal(canUseReplays({ hasProPlan: true, hasReplays: false }), true);
  });
});

describe("plan marketing", () => {
  it("filters HUD out of Pro feature lists", () => {
    assert.deepEqual(
      filterHudOutOfProFeatures(["Priority Routing", "HUD", "Replay Parsing"]),
      ["Priority Routing", "Replay Parsing"],
    );
    assert.equal(isHudPlanFeatureLabel("hud overlay"), true);
  });

  it("ensures Free plan lists Free HUD Overlay", () => {
    assert.deepEqual(ensureFreeHudFeature(["Basic Routing"]), [
      "Free HUD Overlay",
      "Basic Routing",
    ]);
    assert.deepEqual(ensureFreeHudFeature(["HUD", "Basic Routing"]), [
      "Free HUD Overlay",
      "Basic Routing",
    ]);
  });
});

describe("launch errors", () => {
  it("maps missing install and timeout into useful messages", () => {
    assert.match(
      formatHudLaunchError(new Error("HUD Runtime not found")),
      /not installed/i,
    );
    assert.match(
      formatHudLaunchError(new Error("HUD launch timed out")),
      /Overwolf/i,
    );
  });
});
