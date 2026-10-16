import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import { generateStructuredStoreDesigns } from "./baseline.js";
import { verifyIndependentPnlSamples } from "./independentPnl.js";
import { expandDesignFamiliesTo10k } from "./landscape.js";
import { sha256Canonical } from "./prng.js";
import { simulateBatch } from "./simulator.js";

test("500 preset seed identities expand to 10,000 unique design IDs reproducibly", () => {
  const families = generateStructuredStoreDesigns(DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS, 500);
  assert.equal(families.length, 500);
  assert.equal(new Set(families.map((design) => design.familyId)).size, 500);
  const designs = expandDesignFamiliesTo10k(families, DEFAULT_CONSTRAINTS);
  const replay = expandDesignFamiliesTo10k(families, DEFAULT_CONSTRAINTS);
  assert.equal(designs.length, 10_000);
  assert.equal(new Set(designs.map((design) => design.id)).size, 10_000);
  assert.equal(sha256Canonical(designs), sha256Canonical(replay));
});

test("caller-supplied duplicate family and base IDs cannot collide after expansion", () => {
  const families = [0, 1, 2].map(() => ({
    ...structuredClone(DEFAULT_BASE_STORE_DESIGN), id: "same-base", familyId: "same-family",
  }));
  const designs = expandDesignFamiliesTo10k(families, DEFAULT_CONSTRAINTS);
  assert.equal(designs.length, 60);
  assert.equal(new Set(designs.map((design) => design.id)).size, 60);
  assert.ok(designs.every((design) => design.familyId === "same-family"));
});

test("all 20 relative variations preserve explicit zero demand and zero staff", () => {
  const base = { ...structuredClone(DEFAULT_BASE_STORE_DESIGN), cupsPerDayBase: 0, staffFte: 0 };
  const designs = expandDesignFamiliesTo10k([base], DEFAULT_CONSTRAINTS);
  assert.equal(designs.length, 20);
  assert.ok(designs.every((design) => design.cupsPerDayBase === 0));
  assert.ok(designs.every((design) => design.staffFte === 0));
  const results = simulateBatch(designs, { id: "zero-demand", shocks: [] }, DEFAULT_CONSTRAINTS, { keepAllMonths: true });
  assert.ok(results.every((result) => result.constraintsOk));
  for (const result of results) {
    assert.ok(result.months.length > 0);
    assert.ok(result.months.every((month) => month.revenue === 0 && month.labour === 0));
  }
});

test("10k result IDs join their actual design and sampled ledgers remain consistent", () => {
  const families = generateStructuredStoreDesigns(DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS, 500);
  const designs = expandDesignFamiliesTo10k(families, DEFAULT_CONSTRAINTS);
  const scenario = { id: "10k-identity-ledger", shocks: [] };
  const results = simulateBatch(designs, scenario, DEFAULT_CONSTRAINTS, {
    keepAllMonths: false, sampleMonthLimit: 120,
  });
  assert.equal(results.length, 10_000);
  assert.equal(new Set(results.map((result) => result.designId)).size, 10_000);
  assert.deepEqual(results.map((result) => result.designId), designs.map((design) => design.id));
  const check = verifyIndependentPnlSamples(designs, results, scenario, DEFAULT_CONSTRAINTS);
  assert.equal(check.sampledCount, 50);
  assert.equal(check.passed, true, check.detail);
  assert.equal(check.maxAbsDiffKrw, 0);
  assert.match(check.detail, /not an independent oracle/);
});
