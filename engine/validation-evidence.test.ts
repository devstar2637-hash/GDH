import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import { checkStoreConstraints } from "./constraints.js";
import { verifyIndependentPnlSamples } from "./independentPnl.js";
import { runOrchestration } from "./orchestrator.js";
import { simulateSingleVariant } from "./simulator.js";

describe("Untrusted numeric inputs", () => {
  const designFields = [
    "cupsPerDayBase", "cogsRatio", "otherExpenseRatio", "ownerHoursPerWeek",
    "wagePerStaffKrw", "equipmentKrw", "openingMonth",
  ] as const;
  const invalidValues = ["0", null, NaN, Infinity, -Infinity];
  const label = (value: unknown) => typeof value === "string" ? JSON.stringify(value) : String(value);
  for (const field of designFields) {
    for (const value of invalidValues) {
      it(`rejects ${field}=${label(value)} before simulation`, () => {
        const design = structuredClone(DEFAULT_BASE_STORE_DESIGN);
        (design as unknown as Record<string, unknown>)[field] = value;
        const check = checkStoreConstraints(design, DEFAULT_CONSTRAINTS);
        assert.equal(check.ok, false);
        assert.ok(Number.isFinite(check.initialCashKrw));
        const result = simulateSingleVariant(design, { id: "invalid", shocks: [] }, DEFAULT_CONSTRAINTS);
        assert.equal(result.constraintsOk, false);
        assert.equal(result.deathMonth, null);
        assert.equal(result.months.length, 0);
      });
    }
  }
  for (const field of ["deposit", "fitoutCost", "monthlyRent"] as const) {
    for (const value of invalidValues) {
      it(`rejects ${field}.value=${label(value)} without numeric coercion`, () => {
        const design = structuredClone(DEFAULT_BASE_STORE_DESIGN);
        (design[field] as unknown as { value: unknown }).value = value;
        assert.equal(checkStoreConstraints(design, DEFAULT_CONSTRAINTS).ok, false);
      });
    }
  }
  for (const field of ["budgetKrw", "reserveRatioMin"] as const) {
    for (const value of invalidValues) {
      it(`rejects ${field}=${label(value)}`, () => {
        const constraints = { ...DEFAULT_CONSTRAINTS };
        (constraints as unknown as Record<string, unknown>)[field] = value;
        assert.equal(checkStoreConstraints(DEFAULT_BASE_STORE_DESIGN, constraints).ok, false);
      });
    }
  }
  it("rejects out-of-range ratios, demand, costs and reserve while allowing omitted optional fields", () => {
    for (const field of ["cogsRatio", "otherExpenseRatio"] as const) {
      for (const value of [-0.01, 1.01]) {
        assert.equal(checkStoreConstraints({ ...DEFAULT_BASE_STORE_DESIGN, [field]: value }, DEFAULT_CONSTRAINTS).ok, false);
      }
    }
    assert.equal(checkStoreConstraints({ ...DEFAULT_BASE_STORE_DESIGN, cupsPerDayBase: -1 }, DEFAULT_CONSTRAINTS).ok, false);
    for (const field of ["deposit", "fitoutCost", "monthlyRent"] as const) {
      const design = structuredClone(DEFAULT_BASE_STORE_DESIGN);
      design[field].value = -1;
      assert.equal(checkStoreConstraints(design, DEFAULT_CONSTRAINTS).ok, false);
    }
    for (const value of [0, -1]) {
      assert.equal(checkStoreConstraints(DEFAULT_BASE_STORE_DESIGN, { ...DEFAULT_CONSTRAINTS, budgetKrw: value }).ok, false);
    }
    for (const value of [0.09, 1.01]) {
      assert.equal(checkStoreConstraints(DEFAULT_BASE_STORE_DESIGN, { ...DEFAULT_CONSTRAINTS, reserveRatioMin: value }).ok, false);
    }
    const design = structuredClone(DEFAULT_BASE_STORE_DESIGN);
    for (const field of designFields) if (field !== "ownerHoursPerWeek") delete design[field];
    assert.equal(checkStoreConstraints(design, DEFAULT_CONSTRAINTS).ok, true);
  });
});

describe("Execution evidence", () => {
  it("does not report model calls, AI families, or independent validation for a local preset run", () => {
    const run = runOrchestration({ mode: 10000, runAdversarial: false, persistToDisk: false });
    assert.deepEqual(run.status.tokens, []);
    assert.deepEqual(run.status.tokenTotal, { input: 0, output: 0 });
    assert.equal(run.modeLabel, undefined);
    assert.equal(run.baseline?.label, "explorer");
    assert.match(run.status.gateLog.find((gate) => gate.gate === "baseline")!.detail, /deterministic presets.*모델 미호출/);
    assert.match(run.status.gateLog.find((gate) => gate.gate === "pnl_recompute")!.detail, /독립 오라클 검증 아님/);
  });
  it("does not let a NaN cash/P&L comparison pass the ledger check", () => {
    const design = structuredClone(DEFAULT_BASE_STORE_DESIGN);
    const scenario = { id: "cash-nan", shocks: [] };
    const result = simulateSingleVariant(design, scenario, DEFAULT_CONSTRAINTS);
    assert.ok(result.months.length > 0);
    result.months[0].cashEnd = NaN;
    result.months[0].cumPnL = NaN;
    const report = verifyIndependentPnlSamples([design], [result], scenario, DEFAULT_CONSTRAINTS);
    assert.equal(report.passed, false);
    assert.match(report.detail, /not an independent oracle/);
  });
});
