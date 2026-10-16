// loop/loop.test.ts — Lane A2 unit & acceptance test suite.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
} from "../shared/constants.js";
import type { Patch } from "../shared/types.js";
import {
  evaluateIncomingPatches,
  loadSeoulMarketData,
  normalizeOnsiteInput,
  runFullAdversarialLoop,
  verifyOutboundUrlAllowed,
} from "./index.js";

describe("Lane A2 — Data Loaders, Validator, Store/Bankruptcy Designers & Security Gates", () => {
  it("loads Seoul public data (2021Q1..2026Q2) with calibration/holdout split and sourceTag", () => {
    const seoul = loadSeoulMarketData();
    assert.equal(seoul.quarters.length, 22);
    assert.equal(seoul.calibrationQuarters.length, 16);
    assert.equal(seoul.holdoutQuarters.length, 6);
    assert.equal(seoul.sourceTag.kind, "public");
    assert.equal(seoul.manifestHash.length, 16);
  });

  it("normalizes onsite input and defaults mode to 10,000 variants", () => {
    const norm = normalizeOnsiteInput({
      monthlyRentKrw: 3_500_000,
      depositKrw: 50_000_000,
    });
    assert.equal(norm.mode, 10000);
    assert.equal(norm.baseDesign.monthlyRent.value, 3_500_000);
    assert.equal(norm.baseDesign.monthlyRent.source.kind, "onsite");
    assert.equal(norm.baseDesign.deposit.value, 50_000_000);
  });

  it("AT-10: rejects all 5 forbidden-path patches and leaves engine output hash unchanged", async () => {
    const baselineRun = await runFullAdversarialLoop({
      onsite: { mode: 1000 },
      offline: true,
    });

    const forbiddenPatches: Patch[] = [
      { op: "replace", path: "/checks", value: 1, by: "StoreDesigner" },
      { op: "replace", path: "/budgetKrw", value: 999_999_999, by: "StoreDesigner" },
      { op: "replace", path: "/reserveRatioMin", value: 0.0, by: "StoreDesigner" },
      { op: "replace", path: "/oracle/pnlFormula", value: "always_positive", by: "StoreDesigner" },
      { op: "replace", path: "/backtest/referenceRates", value: 0, by: "BankruptcyDesigner" },
    ];

    const patchEval = evaluateIncomingPatches(
      DEFAULT_BASE_STORE_DESIGN,
      DEFAULT_CONSTRAINTS,
      forbiddenPatches
    );
    assert.equal(patchEval.acceptedDesigns.length, 0);
    assert.equal(patchEval.rejectedPatches.length, 5);

    const attackedRun = await runFullAdversarialLoop({
      onsite: { mode: 1000 },
      injectedPatches: forbiddenPatches,
      offline: true,
    });

    // Engine result hash (landscape summary & leader survival) must be strictly unchanged
    assert.deepEqual(attackedRun.landscape, baselineRun.landscape);
    assert.equal(attackedRun.leaderDesignId, baselineRun.leaderDesignId);
    assert.ok((attackedRun.rejectedReasons ?? []).length >= 5);
  });

  it("AT-11: enforces outbound network allowlist and blocks payment/mail/contract endpoints", () => {
    // Allowed endpoints
    assert.equal(
      verifyOutboundUrlAllowed("https://generativelanguage.googleapis.com/v1beta/models").allowed,
      true
    );
    assert.equal(
      verifyOutboundUrlAllowed("http://openapi.seoul.go.kr:8088/sample/json").allowed,
      true
    );

    // Blocked endpoints (payment, mail, contract, arbitrary external)
    assert.equal(
      verifyOutboundUrlAllowed("https://api.stripe.com/v1/charges").allowed,
      false
    );
    assert.equal(
      verifyOutboundUrlAllowed("https://api.sendgrid.com/v3/mail/send").allowed,
      false
    );
    assert.equal(
      verifyOutboundUrlAllowed("https://docusign.com/restapi/v2/accounts").allowed,
      false
    );
    assert.equal(
      verifyOutboundUrlAllowed("https://evil.example.com/exfil").allowed,
      false
    );
  });

  it("AT-13 & AT-16: runs full adversarial loop at default 10,000 mode with strict S/P separation", async () => {
    const res = await runFullAdversarialLoop({ offline: true });
    assert.equal(res.results.length, 10000);
    assert.equal(res.mode, 10000);
    assert.ok(res.rounds.length >= 1 && res.rounds.length <= 3);
    for (const r of res.rounds) {
      assert.ok(r.changed === "S" || r.changed === "P");
    }
    const lastRound = res.rounds[res.rounds.length - 1];
    assert.ok(Boolean(lastRound?.stopReason));
  });
});
