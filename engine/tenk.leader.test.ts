import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import type { StoreDesign, Scenario } from "../shared/types.js";
import { runOrchestration } from "./orchestrator.js";
import { simulateBatch, simulateSingleVariant } from "./simulator.js";

test("10k retains and persists a late leader ledger beyond the 120-outcome sample", () => {
  const designs: StoreDesign[] = Array.from({ length: 10000 }, (_, i) => ({
    ...DEFAULT_BASE_STORE_DESIGN, id: `regular-${i}`, cupsPerDayBase: 185,
    monthlyRent: { ...DEFAULT_BASE_STORE_DESIGN.monthlyRent, value: 3200000 + i },
  }));
  const winner: StoreDesign = {
    ...DEFAULT_BASE_STORE_DESIGN, id: "late-leader", avgTicketKrw: 20000,
    cupsPerDayBase: 500, cogsRatio: 0, otherExpenseRatio: 0,
    monthlyRent: { ...DEFAULT_BASE_STORE_DESIGN.monthlyRent, value: 0 },
    wagePerStaffKrw: 0,
  };
  designs[9999] = winner;
  const scenario: Scenario = { id: "same-scenario", shocks: [] };
  const before = simulateBatch(designs, scenario, DEFAULT_CONSTRAINTS, {
    keepAllMonths: false, sampleMonthLimit: 120,
  });
  assert.equal(before[9999].months.length, 0, "fixture puts winner outside retained samples");
  const dir = mkdtempSync(join(tmpdir(), "gdh-late-leader-"));
  try {
    const run = runOrchestration({ mode: 10000, customDesigns: designs,
      scenarios: [scenario], runAdversarial: false, persistToDisk: true, runsDir: dir,
      runId: "late-leader-regression" });
    assert.equal(run.leaderDesignId, winner.id);
    const actual = run.results.find((r) => r.designId === winner.id)!;
    const replay = simulateSingleVariant(winner, scenario, DEFAULT_CONSTRAINTS, true,
      { keepAllMonths: false, sampleMonthLimit: 120 });
    assert.equal(actual.months.length, 36);
    assert.deepEqual(actual.months, replay.months);
    assert.equal(run.results.filter((r) => r.deathMonth === null && r.months.length > 0).length, 51);
    assert.equal(run.results[0].months.length, 36, "first eligible input stays in the exported sample");
    assert.ok(run.status.gateLog.find((g) => g.gate === "pnl_recompute")?.detail.includes(winner.id));
    const saved = JSON.parse(readFileSync(join(dir, run.runId, "result.json"), "utf8"));
    assert.deepEqual(saved.results.find((r: { designId: string }) => r.designId === winner.id).months, actual.months);
    assert.equal(saved.results.filter((r: { months: unknown[] }) => r.months.length > 0).length, 51);
    assert.ok(Number.isFinite(run.computeMs) && run.computeMs! >= 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("10k export balances real 25-alive/25-dead samples plus leader without fabricating ledgers", () => {
  const designs = Array.from({ length: 600 }, (_, i) => ({
    ...DEFAULT_BASE_STORE_DESIGN, id: `mixed-${i}`, cupsPerDayBase: i < 300 ? 0 : 185,
  }));
  const run = runOrchestration({ mode: 10000, customDesigns: designs,
    scenarios: [{ id: "mixed-outcomes", shocks: [] }], runAdversarial: false, persistToDisk: false });
  const retained = run.results.filter((r) => r.months.length > 0);
  const samples = retained.filter((r) => r.designId !== run.leaderDesignId);
  assert.equal(samples.filter((r) => r.deathMonth === null).length, 25);
  assert.equal(samples.filter((r) => r.deathMonth !== null).length, 25);
  assert.equal(retained.length, 51);
  assert.ok(run.results[0].months.length > 0);

  const sparse = runOrchestration({ mode: 10000, customDesigns: [designs[0]],
    scenarios: [{ id: "sparse", shocks: [] }], runAdversarial: false, persistToDisk: false });
  assert.equal(sparse.results.length, 20);
  assert.equal(sparse.results.filter((r) => r.months.length > 0).length, 20,
    "retain the twenty available real ledgers rather than padding to fifty");
});

test("duplicate caller design IDs are rejected before simulation or expansion", () => {
  const design = { ...DEFAULT_BASE_STORE_DESIGN, id: "duplicate" };
  for (const mode of [1000, 10000] as const) {
    assert.throws(() => runOrchestration({ mode, customDesigns: [design, { ...design }], persistToDisk: false }), /Duplicate designId.*duplicate/);
    assert.throws(() => runOrchestration({ mode, customDesigns: [design], injectedDesigns: [{ ...design }], persistToDisk: false }), /Duplicate designId.*duplicate/);
    assert.throws(() => runOrchestration({ mode, injectedDesigns: [design, { ...design }], persistToDisk: false }), /Duplicate designId.*duplicate/);
  }
});
