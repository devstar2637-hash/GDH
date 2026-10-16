import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QuarterMarketRow } from "../shared/types.js";
import { fitCalibrationParameters, runBacktestGate } from "./backtest.js";

// Synthetic evidence-shape fixtures, not observations or cashflow validation data.
function completeSeries(): QuarterMarketRow[] {
  return Array.from({ length: 22 }, (_, i) => ({
    quarter: `${2021 + Math.floor(i / 4)}${(i % 4) + 1}`,
    tradeAreas: 1,
    totalStores: 100,
    opens: 2,
    closes: 1,
    openRatePct: 2,
    closeRatePct: 1,
    estSalesKrw: 1_000_000,
    sourceFiles: ["synthetic-evidence-shape-only"],
  }));
}

describe("Backtest evidence gates", () => {
  it("never labels an aggregate heuristic as a calibrated cashflow engine", () => {
    const report = runBacktestGate({ quarters: completeSeries() });
    assert.equal(report.dataStatus, "complete");
    assert.equal(report.diagnosticWithinTolerance, true);
    assert.equal(report.label, "uncalibrated");
    assert.equal(report.koLabel, "미보정");
    assert.equal(report.evidenceScope, "aggregate_heuristic_only");
    assert.match(report.reason, /집계 휴리스틱/);
    assert.match(report.reason, /cashflow/);
    assert.equal(report.yearlyErrors?.length, 6);
  });

  it("fails closed on empty input instead of treating no evidence as zero error", () => {
    const report = runBacktestGate({ quarters: [] });
    assert.equal(report.label, "uncalibrated");
    assert.equal(report.dataStatus, "invalid");
    assert.equal(report.errorPp, null);
    assert.equal(report.holdoutErrorPp, null);
    assert.equal(report.diagnosticWithinTolerance, false);
    assert.equal(report.validationErrors.length, 22);
  });

  it("requires all six holdout quarters rather than reporting an absent holdout as passing", () => {
    const report = runBacktestGate({ quarters: completeSeries().slice(0, 16) });
    assert.equal(report.dataStatus, "invalid");
    assert.equal(report.holdoutErrorPp, null);
    assert.equal(report.validationErrors.length, 6);
    assert.match(report.reason, /20251/);
    assert.match(report.reason, /20262/);
  });

  it("rejects a duplicate replacing a missing quarter even when row count is 22", () => {
    const quarters = completeSeries();
    quarters[21] = { ...quarters[20] };
    const report = runBacktestGate({ quarters });
    assert.equal(report.dataStatus, "invalid");
    assert.ok(report.validationErrors.includes("Duplicate quarter: 20261."));
    assert.ok(report.validationErrors.includes("Missing quarter: 20262."));
  });

  it("rejects unexpected quarters outside the exact evaluation period", () => {
    const report = runBacktestGate({
      quarters: [...completeSeries(), { ...completeSeries()[0], quarter: "20263" }],
    });
    assert.equal(report.dataStatus, "invalid");
    assert.match(report.reason, /Unexpected quarter: 20263/);
  });

  it("recognizes Q-formatted quarters, sorts inputs, and detects alias duplicates", () => {
    const quarters = completeSeries();
    const expected = runBacktestGate({ quarters });
    const reverseQForm = [...quarters].reverse().map((q) => ({
      ...q,
      quarter: `${q.quarter.slice(0, 4)}Q${q.quarter.slice(-1)}`,
    }));
    assert.deepEqual(runBacktestGate({ quarters: reverseQForm }), expected);
    const duplicate = runBacktestGate({ quarters: [...reverseQForm, quarters[0]] });
    assert.equal(duplicate.dataStatus, "invalid");
    assert.match(duplicate.reason, /Duplicate quarter: 20211/);
  });

  it("rejects missing, negative, fractional-count and non-finite numeric evidence", () => {
    const invalidFields: Partial<QuarterMarketRow>[] = [
      { totalStores: 0 },
      { totalStores: Number.NaN },
      { tradeAreas: 1.5 },
      { opens: -1 },
      { closes: Number.POSITIVE_INFINITY },
      { openRatePct: Number.NaN },
      { closeRatePct: 101 },
      { estSalesKrw: undefined },
      { estSalesKrw: Number.POSITIVE_INFINITY },
      { estSalesKrw: -1 },
    ];
    for (const invalid of invalidFields) {
      const quarters = completeSeries();
      quarters[0] = { ...quarters[0], ...invalid };
      const report = runBacktestGate({ quarters });
      assert.equal(report.dataStatus, "invalid", Object.keys(invalid).join(","));
      assert.equal(report.errorPp, null);
      assert.equal(report.holdoutErrorPp, null);
      assert.equal(report.diagnosticWithinTolerance, false);
    }
  });

  it("preserves an explicit zero-sales observation and never manufactures missing sales", () => {
    const zeroSeries = completeSeries().map((q) => ({ ...q, estSalesKrw: 0 }));
    assert.equal(runBacktestGate({ quarters: zeroSeries }).dataStatus, "complete");
    assert.equal(fitCalibrationParameters(zeroSeries).demandLevelMultiplier, 0);
    const missing = completeSeries();
    delete missing[0].estSalesKrw;
    assert.throws(() => fitCalibrationParameters(missing), /missing or invalid estSalesKrw/);
    assert.throws(() => fitCalibrationParameters([]), /Invalid calibration evidence/);
  });

  it("fitting excludes holdout observations and rejects invalid diagnostic options", () => {
    const quarters = completeSeries();
    const changedHoldout = quarters.map((q, i) => i < 16 ? q : {
      ...q, estSalesKrw: 9_000_000_000, openRatePct: 80, closeRatePct: 70,
    });
    assert.deepEqual(fitCalibrationParameters(quarters), fitCalibrationParameters(changedHoldout));
    assert.equal(runBacktestGate({ quarters, tolerancePp: Number.NaN }).dataStatus, "invalid");
    assert.equal(runBacktestGate({ quarters, referenceOffsetPp: Number.POSITIVE_INFINITY }).dataStatus, "invalid");
  });
});
