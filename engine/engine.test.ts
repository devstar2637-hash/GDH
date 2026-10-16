// Unit behavior checks. Passing these does not satisfy the protected business acceptance gates.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
} from "../shared/constants.js";
import type { StoreDesign } from "../shared/types.js";
import { runBacktestGate } from "./backtest.js";
import { generateStructuredStoreDesigns } from "./baseline.js";
import { evaluateLeaderAtAssumptionDelta } from "./cliff.js";
import { checkStoreConstraints } from "./constraints.js";
import { verifyIndependentPnlSamples } from "./independentPnl.js";
import { runOrchestration } from "./orchestrator.js";
import { sha256Canonical } from "./prng.js";
import { simulateBatch } from "./simulator.js";

describe("Lane A1: Deterministic engine unit behavior", () => {
  it("aggregate heuristic remains uncalibrated even when its diagnostic errors are within tolerance", () => {
    const cal = runBacktestGate();
    assert.equal(cal.label, "uncalibrated");
    assert.equal(cal.koLabel, "미보정");
    assert.equal(cal.evidenceScope, "aggregate_heuristic_only");
    assert.match(cal.reason, /현금흐름 보정·검증을 입증하지 않습니다/);
    assert.equal(cal.diagnosticWithinTolerance, true);
    assert.ok((cal.errorPp ?? 99) <= 5.0, `Expected errorPp <= 5.0, got ${cal.errorPp}`);
    assert.ok(
      (cal.holdoutErrorPp ?? 99) <= 5.0,
      `Expected holdoutErrorPp <= 5.0, got ${cal.holdoutErrorPp}`
    );
    assert.equal(cal.overfitSuspect, false);
    assert.equal(cal.yearlyErrors?.length, 6);
  });

  it("AT-02: Backtest fails cleanly when reference series is shifted by +10.0 pp", () => {
    const cal = runBacktestGate({ referenceOffsetPp: 10.0 });
    assert.equal(cal.label, "uncalibrated");
    assert.equal(cal.koLabel, "미보정");
    assert.ok((cal.errorPp ?? 0) > 5.0);
  });

  it("AT-03: Budget, 10% reserve, seats >= 0, floorAreaM2 > 0 constraints reject 5 injected violations without counting as deaths", () => {
    const injectedViolations: StoreDesign[] = [
      {
        ...DEFAULT_BASE_STORE_DESIGN,
        id: "viol-1-budget",
        fitoutCost: { value: 92_000_000, source: { kind: "onsite" } },
      },
      {
        ...DEFAULT_BASE_STORE_DESIGN,
        id: "viol-2-reserve",
        fitoutCost: { value: 82_000_000, source: { kind: "onsite" } },
      },
      {
        ...DEFAULT_BASE_STORE_DESIGN,
        id: "viol-3-seats",
        seats: -3,
      },
      {
        ...DEFAULT_BASE_STORE_DESIGN,
        id: "viol-4-area",
        floorAreaM2: 0,
      },
      {
        ...DEFAULT_BASE_STORE_DESIGN,
        id: "viol-5-negative-area",
        floorAreaM2: -12,
      },
    ];

    for (const v of injectedViolations) {
      const check = checkStoreConstraints(v, DEFAULT_CONSTRAINTS);
      assert.equal(check.ok, false, `Expected ${v.id} to fail constraints`);
    }

    const run = runOrchestration({
      runId: "test-at03",
      mode: 10000,
      injectedDesigns: injectedViolations,
      runAdversarial: false,
      persistToDisk: false,
    });

    assert.equal(run.rejectedCount, 5);
    assert.equal(run.rejectedReasons?.length, 5);

    // Ensure rejected variants are never counted in deathCauses or given a deathMonth
    const rejectedResults = run.results.filter((r) => !r.constraintsOk);
    assert.equal(rejectedResults.length, 5);
    for (const r of rejectedResults) {
      assert.equal(r.deathMonth, null);
      assert.equal(r.deathCause, null);
    }
  });

  it("shared-arithmetic ledger consistency matches sampled variants without claiming an independent oracle", () => {
    const designs = generateStructuredStoreDesigns(
      DEFAULT_BASE_STORE_DESIGN,
      DEFAULT_CONSTRAINTS,
      1000
    );
    const scenario = {
      id: "scen-at04",
      shocks: [
        {
          id: "sh-1",
          kind: "offseason" as const,
          startMonth: 2,
          durationMonths: 3,
          magnitude: 0.12,
        },
      ],
    };
    const results = simulateBatch(designs, scenario, DEFAULT_CONSTRAINTS);
    const check = verifyIndependentPnlSamples(
      designs,
      results,
      scenario,
      DEFAULT_CONSTRAINTS
    );
    assert.equal(check.passed, true);
    assert.ok(check.sampledCount >= 50, `Sampled ${check.sampledCount} variants`);
    assert.ok(check.maxAbsDiffKrw <= 1, `Max diff ${check.maxAbsDiffKrw}`);
    assert.match(check.detail, /not an independent oracle/);
  });

  it("AT-05 & AT-06: 10,000 variants x 36 months (default) runs in <= 2.0s and produces identical SHA-256 hash on same seed", () => {
    const r1 = runOrchestration({
      runId: "test-repro",
      runAdversarial: false,
      persistToDisk: false,
    });
    const r2 = runOrchestration({
      runId: "test-repro",
      runAdversarial: false,
      persistToDisk: false,
    });

    assert.equal(r1.results.length, 10000);
    assert.ok((r1.computeMs ?? 9999) <= 2000, `Expected <= 2000ms, got ${r1.computeMs}ms`);
    assert.equal(sha256Canonical(r1.results), sha256Canonical(r2.results));
  });

  it("AT-07 & AT-08: Reports 1 Decision Cliff that flips #1 design across boundary, and Next Measurement matches cliff variable", () => {
    const run = runOrchestration({
      runId: "test-cliff",
      mode: 1000,
      runAdversarial: false,
      persistToDisk: false,
    });

    assert.ok(run.cliff, "Expected a Decision Cliff to be found");
    assert.ok(run.nextMeasurement, "Expected NextMeasurement to be found");
    assert.equal(run.nextMeasurement.variable, String(run.cliff.variable));
    assert.notEqual(run.cliff.leaderBelow, run.cliff.leaderAbove);

    // Verify the reported leaders against every valid candidate, not a prefix.
    const validDesigns = run.designs.filter((_, i) => run.results[i]?.constraintsOk);
    const delta = run.cliff.relativeDelta ?? 0;
    const step = 0.03;
    const leaderBelow = evaluateLeaderAtAssumptionDelta(
      run.cliff.variable as "makeTimeSec",
      delta - step,
      validDesigns,
      DEFAULT_BASE_STORE_DESIGN,
      run.scenarios[0],
      run.constraints
    );
    const leaderAbove = evaluateLeaderAtAssumptionDelta(
      run.cliff.variable as "makeTimeSec",
      delta + step,
      validDesigns,
      DEFAULT_BASE_STORE_DESIGN,
      run.scenarios[0],
      run.constraints
    );
    assert.notEqual(leaderBelow, leaderAbove);
    assert.equal(leaderBelow, run.cliff.leaderBelow);
    assert.equal(leaderAbove, run.cliff.leaderAbove);
  });

  it("local structured presets remain an explorer even when coverage metrics match the random baseline", () => {
    const run = runOrchestration({
      runId: "test-baseline",
      mode: 1000,
      runAdversarial: false,
      persistToDisk: false,
    });
    assert.ok(run.baseline);
    assert.equal(run.baseline.label, "explorer");
    assert.ok(run.baseline.argonNewFamilies >= run.baseline.randomNewFamilies);
    assert.ok(run.baseline.argonNonDominated >= run.baseline.randomNonDominated);
  });

  it("local stress rounds log stop reasons, unchanged oracle files, full input hash and zero model usage", () => {
    const run = runOrchestration({
      runId: "test-adv-rounds",
      mode: 1000,
      runAdversarial: true,
      persistToDisk: true,
    });

    assert.ok(run.rounds.length >= 1 && run.rounds.length <= 3);
    const lastRound = run.rounds[run.rounds.length - 1];
    assert.ok(lastRound.stopReason, "Last round must record a stopReason");

    const roundsFile = resolve(process.cwd(), "runs", "test-adv-rounds", "rounds.json");
    assert.equal(existsSync(roundsFile), true);
    const roundsJson = JSON.parse(readFileSync(roundsFile, "utf8"));
    assert.equal(roundsJson.oracleUnchanged, true);

    assert.equal(run.status.endState, "DONE");
    assert.match(run.status.inputHash ?? '', /^[a-f0-9]{64}$/);
    assert.ok(run.status.engineSha && run.status.engineSha.length >= 7);
    assert.deepEqual(run.status.tokens, []);
    assert.deepEqual(run.status.tokenTotal, { input: 0, output: 0 });
  });

  it("10,000 local preset variants report deterministic provenance and a saturation curve", () => {
    const run10k = runOrchestration({
      runId: "test-10k",
      mode: 10000,
      runAdversarial: false,
      persistToDisk: false,
    });

    assert.equal(run10k.results.length, 10000);
    assert.equal(run10k.rejectedCount, 0);
    assert.equal(run10k.modeLabel, undefined);
    assert.match(run10k.status.gateLog.find((gate) => gate.gate === "baseline")!.detail,
      /deterministic presets.*모델 미호출/);
    assert.ok((run10k.computeMs ?? 9999) <= 2000, `10k took ${run10k.computeMs}ms`);
    assert.equal(run10k.saturationCurve?.length, 3);
  });
});
