// tests/accept/g1_engine.test.ts — verifier-owned. G1 (13:10): AT-03, AT-04, AT-05, AT-06, AT-07, AT-08.
// Judges ONLY from the fixed input (tests/lib/fixed_input.ts) and independent recomputation (tests/lib/ledger.ts).
// The build agent reads this file; it never edits it (AGENTS.md rule 2).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateLeaderAtAssumptionDelta,
  generateStructuredStoreDesigns,
  expandDesignFamiliesTo10k,
  markParetoNonDominated,
  buildLandscapeSummary,
  pickLeaderVariant,
  runOrchestration,
  simulateBatch,
} from "../../engine/index.js";
import type { StoreDesign, VariantResult } from "../../shared/types.js";
import { record } from "../lib/judge.js";
import { independentConstraintCheck, runLedger } from "../lib/ledger.js";
import {
  FIXED_BASE,
  FIXED_CONSTRAINTS,
  FIXED_SCENARIO,
  OTHER_SEED,
  expectedFixedInput,
  fixedInputHash,
  gitShortSha,
  sha256,
} from "../lib/fixed_input.js";

const SHA = gitShortSha();
const BUDGET = FIXED_CONSTRAINTS.budgetKrw;

// The five deliberate violations (AT-03): budget, reserve, seats, area, both.
const VIOLATIONS: StoreDesign[] = [
  { ...FIXED_BASE, id: "inj-budget", deposit: { value: 60_000_000, source: { kind: "onsite" } }, fitoutCost: { value: 61_000_000, source: { kind: "onsite" } } }, // 121M > 120M
  { ...FIXED_BASE, id: "inj-reserve", fitoutCost: { value: 74_000_000, source: { kind: "onsite" } } },  // cash0 = 11M < 12M
  { ...FIXED_BASE, id: "inj-seats", seats: -1 },
  { ...FIXED_BASE, id: "inj-area", floorAreaM2: 0 },
  { ...FIXED_BASE, id: "inj-both", seats: -4, floorAreaM2: -1 },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function resultDigest(run: ReturnType<typeof runOrchestration>): string {
  // Only engine outputs; no timestamps, no token rows.
  return sha256({
    results: run.results.map((r) => ({
      id: r.designId, ok: r.constraintsOk, sm: r.survivedMonths, dm: r.deathMonth, dc: r.deathCause,
      cm: Math.round(r.cashMin), pnl: Math.round(r.cumPnL ?? 0), ff: r.failureFamily, nd: r.nonDominated,
    })),
    cliff: run.cliff,
    leader: run.leaderDesignId,
    calibration: run.calibration.label,
    baseline: run.baseline?.label,
  });
}

describe("G1 · fixed input guard", () => {
  it("fixed input matches the pinned sha256 (shared/ unchanged since freeze)", () => {
    const expected = expectedFixedInput().sha256;
    const actual = fixedInputHash();
    assert.equal(actual, expected, `fixed input drifted: ${actual} != pinned ${expected}`);
  });
});

describe("AT-03 · constraints on 10,000 variants + 5 injected violations", () => {
  it("every accepted variant satisfies budget / reserve >= 10% / seats,area >= 0; exactly 5 rejected and not counted as deaths", () => {
    const run = runOrchestration({
      runId: "verify-at03", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS,
      scenarios: [FIXED_SCENARIO], injectedDesigns: VIOLATIONS, runAdversarial: false, persistToDisk: false,
    });
    const byId = new Map(run.designs.map((d) => [d.id, d]));
    let acceptedBad = 0, accepted = 0, rejected = 0, rejectedAsDeath = 0;
    const rejectedIds: string[] = [];
    for (const r of run.results) {
      const d = byId.get(r.designId)!;
      const mine = independentConstraintCheck(d, FIXED_CONSTRAINTS);
      if (r.constraintsOk) {
        accepted++;
        if (!mine.ok) acceptedBad++;
      } else {
        rejected++;
        rejectedIds.push(r.designId);
        if (r.deathMonth !== null || r.deathCause !== null) rejectedAsDeath++;
      }
    }
    const deathTotal = Object.values(run.deathCauses).reduce((a, b) => a + b, 0);
    const deadCount = run.results.filter((r) => r.constraintsOk && r.deathMonth !== null).length;
    // Distinctness: how many of the 10,000 are byte-identical to another design (apart from id/familyId)?
    const seen = new Map<string, number>();
    for (const d of run.designs.slice(0, 10000)) {
      const { id: _i, familyId: _f, ...rest } = d;
      const k = sha256(rest);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const distinct = seen.size;
    const dupes = 10000 - distinct;
    const uniqueIds = new Set(run.designs.map((d) => d.id)).size;

    const ok = accepted === 10000 && acceptedBad === 0 && rejected === 5 && rejectedAsDeath === 0 && deathTotal === deadCount
      && rejectedIds.sort().join(",") === VIOLATIONS.map((v) => v.id).sort().join(",");
    record({
      id: "AT-03", title: "제약(예산·예비비 10%·좌석/면적) + 위반 5건 주입", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `accepted=${accepted} (expected 10000), independent check failures among accepted=${acceptedBad}`,
        `rejected=${rejected} (expected 5): ${rejectedIds.join(", ")}`,
        `rejected counted as death=${rejectedAsDeath}; deathCauses total=${deathTotal} == dead results=${deadCount}`,
        `reserveMin=${Math.round(BUDGET * 0.1).toLocaleString()} KRW`,
      ],
      measured: { accepted, acceptedBad, rejected, rejectedAsDeath, distinctDesigns: distinct, duplicateDesigns: dupes, uniqueIds },
      findings: [
        `distinct designs among 10,000 = ${distinct} (${dupes} duplicates). Generator replaces constraint-failing candidates with a clone of design-0001 / the family base instead of rejecting+logging (engine/baseline.ts:308, engine/landscape.ts:275).`,
      ],
    });
    record({
      id: "V-01", title: "[검증자 추가] 변형 ID 유일성 (1만 개)", verdict: uniqueIds === run.designs.length ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [`unique ids=${uniqueIds} of ${run.designs.length} designs`],
      measured: { uniqueIds, total: run.designs.length },
      findings: uniqueIds === run.designs.length ? [] : [
        "engine/baseline.ts assigns familyId = fam-(floor(i/2)+1) to two consecutive designs and the two planted leaders also use fam-001/fam-002; engine/landscape.ts then names variants `${familyId}-var-NN`, so different families collide on the same id. Any lookup by designId (engine/independentPnl.ts designMap, cliff leaderBelow/leaderAbove, landscape points, the #1 id on screen) can point at the wrong store. Seen on seed 20261017: the engine's own pnl_recompute gate FAILs for this reason (AT-06 evidence).",
      ],
    });
    assert.equal(accepted, 10000);
    assert.equal(acceptedBad, 0);
    assert.equal(rejected, 5);
    assert.equal(rejectedAsDeath, 0);
  });
});

describe("V-05 · completeness: the default run on the fixed input must end DONE", () => {
  it("engine defaults (mode 10,000) end state and its own gate log", () => {
    const def = runOrchestration({ runId: "verify-v05-default", baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const k1 = runOrchestration({ runId: "verify-v05-1k", mode: 1000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const failedGates = def.status.gateLog.filter((g) => g.passed === false).map((g) => `${g.gate}: ${g.detail}`);
    record({
      id: "V-05", title: "[검증자 추가] 기본 1만 모드 실행의 끝 상태가 DONE인가 (완결성)", verdict: def.status.endState === "DONE" ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `mode ${def.mode}: endState=${def.status.endState} (${def.status.endReason}); failed gates: ${failedGates.join(" | ") || "none"}`,
        `mode 1000 (spike size): endState=${k1.status.endState}`,
      ],
      measured: { endState10k: def.status.endState, endState1k: k1.status.endState, failedGates },
      findings: def.status.endState === "DONE" ? [] : [
        "On the fixed input the engine's default 10,000 run ends FAIL: its pnl_recompute gate looks designs up by id (engine/independentPnl.ts designMap) and ids collide (V-01), so it recomputes the wrong store and reports a 239,893,148 KRW error. The arithmetic itself is correct (verifier AT-04 = 0 KRW by index). The demo would show FAIL on the status bar until the id scheme is fixed.",
      ],
    });
    assert.equal(def.status.endState, "DONE", def.status.endReason);
  });
});

describe("AT-04 · independent 36-month ledger, 25 alive + 25 dead", () => {
  it("month-by-month revenue/cogs/rent/labour/other/cashEnd/cumPnL within 1 KRW; deposit is locked cash returned at month 36", () => {
    const designs = expandDesignFamiliesTo10k(generateStructuredStoreDesigns(FIXED_BASE, FIXED_CONSTRAINTS, 500), FIXED_CONSTRAINTS, 20);
    const results = simulateBatch(designs, FIXED_SCENARIO, FIXED_CONSTRAINTS, { keepAllMonths: true });
    // Pair by INDEX (results[i] is designs[i]); design ids are not unique in 10,000 mode (see V-01).
    const indexed = results.map((r, i) => ({ r, d: designs[i] }));
    const alive = indexed.filter(({ r }) => r.constraintsOk && r.deathMonth === null).slice(0, 25);
    const dead = indexed.filter(({ r }) => r.constraintsOk && r.deathMonth !== null).slice(0, 25);
    let maxDiff = 0, worst = "", depositOk = true, deathMismatch = 0, rowCountMismatch = 0;
    const fields = ["revenue", "cogs", "rent", "labour", "other", "cashEnd", "cumPnL"] as const;
    for (const { r, d } of [...alive, ...dead]) {
      const L = runLedger(d, FIXED_SCENARIO.shocks, FIXED_CONSTRAINTS);
      if (L.rows.length !== r.months.length) { rowCountMismatch++; continue; }
      if ((L.deathMonth ?? null) !== (r.deathMonth ?? null)) deathMismatch++;
      for (let i = 0; i < L.rows.length; i++) {
        const mine = L.rows[i] as unknown as Record<string, number>;
        const eng = r.months[i] as unknown as Record<string, number>;
        for (const f of fields) {
          const diff = Math.abs((mine[f] ?? 0) - (eng[f] ?? 0));
          if (diff > maxDiff) { maxDiff = diff; worst = `${r.designId} m${i + 1} ${f}`; }
        }
      }
      if (r.deathMonth === null) {
        const last = r.months[35], prev = r.months[34];
        const net36 = last.revenue - last.cogs - last.rent - last.labour - last.other;
        // cashEnd[36] - cashEnd[35] must equal net36 + deposit, and cumPnL must exclude the deposit
        if (Math.abs(last.cashEnd - prev.cashEnd - net36 - Math.round(d.deposit.value)) > 1) depositOk = false;
        if (Math.abs((last.cumPnL ?? 0) - (prev.cumPnL ?? 0) - net36) > 1) depositOk = false;
      }
    }
    const ok = alive.length === 25 && dead.length === 25 && maxDiff <= 1 && depositOk && deathMismatch === 0 && rowCountMismatch === 0;
    record({
      id: "AT-04", title: "독립 월별 현금흐름 재계산 50개 (≤ 1원)", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `samples alive=${alive.length} dead=${dead.length}`,
        `max |engine - independent| = ${maxDiff} KRW at ${worst || "n/a"}`,
        `deposit locked-cash rule (returned at m36, excluded from cumPnL): ${depositOk}`,
        `death-month mismatches=${deathMismatch}, row-count mismatches=${rowCountMismatch}`,
      ],
      measured: { maxDiffKrw: maxDiff, aliveSampled: alive.length, deadSampled: dead.length },
      findings: [
        "engine/independentPnl.ts calls engine/simulator.ts computeMonthStep, so the engine's own AT-04 gate re-checks only the cash accumulation, not the month arithmetic. This verifier ledger (tests/lib/ledger.ts) does not import engine/.",
        "Declared SPEC §5 deviations: openDays = openDaysPerWeek/6*26 (not 30); demand capped by bar/seat capacity and scaled by price/menu factors; cash_0 = budget - deposit - fitout (equipment folded into fitout).",
      ],
    });
    assert.ok(maxDiff <= 1, `max diff ${maxDiff} at ${worst}`);
    assert.ok(depositOk);
    assert.equal(deathMismatch, 0);
  });
});

describe("AT-05 · 10,000 x 36 months <= 2.0 s (median of 5)", () => {
  it("simulate + landscape aggregation median <= 2000 ms on this machine", () => {
    const designs = expandDesignFamiliesTo10k(generateStructuredStoreDesigns(FIXED_BASE, FIXED_CONSTRAINTS, 500), FIXED_CONSTRAINTS, 20);
    const simMs: number[] = [], fullMs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = simulateBatch(designs, FIXED_SCENARIO, FIXED_CONSTRAINTS, { keepAllMonths: false, sampleMonthLimit: 60 });
      markParetoNonDominated(res);
      buildLandscapeSummary(designs, res);
      simMs.push(performance.now() - t0);
    }
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      runOrchestration({ runId: `verify-at05-${i}`, mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
      fullMs.push(performance.now() - t0);
    }
    const med = median(simMs), medFull = median(fullMs);
    record({
      id: "AT-05", title: "1만 × 36개월 ≤ 2.0초 (5회 중앙값)", verdict: med <= 2000 ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `simulate+landscape: median ${med.toFixed(0)} ms, runs ${simMs.map((x) => x.toFixed(0)).join("/")} ms`,
        `full orchestration (incl. backtest, cliff sweep, baseline): median ${medFull.toFixed(0)} ms (3 runs)`,
        `machine: ${process.platform} node ${process.version} (cloud verifier container, NOT the demo laptop or Cloud Run) — browser worker and Cloud Run timings still to be recorded at G2`,
      ],
      measured: { simLandscapeMedianMs: med, fullOrchestrationMedianMs: medFull },
    });
    assert.ok(med <= 2000, `median ${med} ms`);
  });
});

describe("AT-06 · determinism", () => {
  it("same seed twice -> identical digest; different seed -> constraints and labels still hold", () => {
    const opts = { mode: 10000 as const, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false };
    const a = runOrchestration({ ...opts, runId: "verify-at06-a" });
    const b = runOrchestration({ ...opts, runId: "verify-at06-b" });
    const da = resultDigest(a), db = resultDigest(b);
    const c = runOrchestration({ ...opts, runId: "verify-at06-c", constraints: { ...FIXED_CONSTRAINTS, seed: OTHER_SEED } });
    const dc = resultDigest(c);
    const byId = new Map(c.designs.map((d) => [d.id, d]));
    const badC = c.results.filter((r) => r.constraintsOk && !independentConstraintCheck(byId.get(r.designId)!, { ...FIXED_CONSTRAINTS, seed: OTHER_SEED }).ok).length;
    const labelsHold = c.calibration.label === a.calibration.label && !!c.baseline && !!c.status.endState;
    const ok = da === db && badC === 0 && labelsHold;
    record({
      id: "AT-06", title: "같은 seed 2회 해시 동일, 다른 seed도 제약·라벨 유지", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `seed ${FIXED_CONSTRAINTS.seed}: digest run1 ${da.slice(0, 16)} == run2 ${db.slice(0, 16)}: ${da === db}`,
        `seed ${OTHER_SEED}: digest ${dc.slice(0, 16)} (${dc === da ? "SAME as fixed seed — seed has no effect" : "differs"}), constraint failures=${badC}, labels calibration=${c.calibration.label} baseline=${c.baseline?.label} end=${c.status.endState}`,
      ],
      measured: { digestFixedSeed: da, digestOtherSeed: dc },
      findings: dc === da ? ["Different seed produced an identical result digest: the seed does not reach the design generator for this input."] : [],
    });
    assert.equal(da, db);
    assert.equal(badC, 0);
  });
});

describe("AT-07 / AT-08 · exactly one cliff that flips #1; next measurement points at it", () => {
  // A uniform perturbation: the SAME relative delta applied to every design's value of the variable (SPEC §5 sweep).
  function uniformly(designs: readonly StoreDesign[], variable: string, delta: number): StoreDesign[] {
    return designs.map((d) => {
      switch (variable) {
        case "makeTimeSec": return { ...d, makeTimeSec: Math.max(25, Math.round(d.makeTimeSec * (1 + delta))) };
        case "monthlyRent": return { ...d, monthlyRent: { ...d.monthlyRent, value: Math.round(d.monthlyRent.value * (1 + delta)) } };
        case "avgTicketKrw": return { ...d, avgTicketKrw: Math.round(d.avgTicketKrw * (1 + delta)) };
        case "cupsPerDayBase": return { ...d, cupsPerDayBase: Math.round((d.cupsPerDayBase ?? 185) * (1 + delta)) };
        case "cogsRatio": return { ...d, cogsRatio: Number(((d.cogsRatio ?? 0.32) * (1 + delta)).toFixed(4)) };
        case "staffFte": return { ...d, staffFte: Number((d.staffFte * (1 + delta)).toFixed(2)) };
        default: return d;
      }
    });
  }
  const leaderOf = (ds: StoreDesign[]) => pickLeaderVariant(simulateBatch(ds, FIXED_SCENARIO, FIXED_CONSTRAINTS, { keepAllMonths: false, sampleMonthLimit: 0 }))?.designId ?? null;

  it("AT-07: one cliff reported; engine re-run at boundary -1/+1 step gives different #1; uniform-perturbation cross-check", () => {
    const run = runOrchestration({ runId: "verify-at07", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const cliff = run.cliff;
    const pool = run.designs.filter((_, i) => run.results[i]?.constraintsOk).slice(0, 120); // the engine's own cliff pool
    let engineBelow: string | null = null, engineAbove: string | null = null;
    if (cliff && cliff.relativeDelta !== undefined) {
      const v = cliff.variable as "makeTimeSec";
      engineBelow = evaluateLeaderAtAssumptionDelta(v, cliff.relativeDelta - 0.03, pool, FIXED_BASE, FIXED_SCENARIO, FIXED_CONSTRAINTS);
      engineAbove = evaluateLeaderAtAssumptionDelta(v, cliff.relativeDelta + 0.03, pool, FIXED_BASE, FIXED_SCENARIO, FIXED_CONSTRAINTS);
    }
    const mechanicalFlip = !!cliff && !!engineBelow && !!engineAbove && engineBelow !== engineAbove;

    // Cross-check 1: does the engine's perturbation apply the same relative change to every design?
    let perturbationUniform = true;
    if (cliff) {
      const v = cliff.variable as "makeTimeSec";
      const two = pool.slice(0, 2);
      // Probe by running the engine's sweep on each design alone and comparing the implied multiplier via a 1-design pool is not exposed;
      // instead compare the engine's leader at +0.12 with the leader of a uniform +0.12 on the same pool.
      const engLeader = evaluateLeaderAtAssumptionDelta(v, 0.12, pool, FIXED_BASE, FIXED_SCENARIO, FIXED_CONSTRAINTS);
      const uniLeader = leaderOf(uniformly(pool, String(cliff.variable), 0.12));
      perturbationUniform = engLeader === uniLeader;
      void two;
    }
    // Cross-check 2: with a uniform sweep over -30%..+30% (11 steps) on the whole 10,000 pool, does #1 flip at all?
    let uniformFlipDelta: number | null = null;
    const base10k = run.designs.filter((_, i) => run.results[i]?.constraintsOk);
    const baseLeader = run.leaderDesignId ?? null;
    if (cliff) {
      for (const dlt of [-0.30, -0.24, -0.18, -0.12, -0.06, 0.06, 0.12, 0.18, 0.24, 0.30].sort((a, b) => Math.abs(a) - Math.abs(b))) {
        if (leaderOf(uniformly(base10k, String(cliff.variable), dlt)) !== baseLeader) { uniformFlipDelta = dlt; break; }
      }
    }
    const verdict = mechanicalFlip ? "DONE" : "FAIL";
    record({
      id: "AT-07", title: "절벽 정확히 1개, 경계 ±1단계 재실행 시 1위 바뀜", verdict, engineSha: SHA,
      evidence: [
        `cliff=${cliff ? `${cliff.variable} boundary ${cliff.boundaryValue} ${cliff.unit} (rel ${cliff.relativeDelta})` : "null"}`,
        `engine re-run: leader at boundary-1 step = ${engineBelow}, at +1 step = ${engineAbove} -> differ: ${mechanicalFlip}`,
        `cliff pool = first ${pool.length} valid designs of ${base10k.length} (engine/orchestrator.ts slice(0,120)); run leader = ${baseLeader}`,
        `uniform sweep of ${cliff?.variable} on all ${base10k.length} designs: #1 flips at delta ${uniformFlipDelta ?? "NONE within ±30%"}`,
        `engine perturbation equals a uniform relative perturbation on the pool at +12%: ${perturbationUniform}`,
      ],
      measured: { cliff, engineBelow, engineAbove, uniformFlipDelta, perturbationUniform, poolSize: pool.length },
      findings: [
        ...(perturbationUniform ? [] : ["engine/cliff.ts applyDelta scales the variable by a design-class-dependent factor (e.g. makeTimeSec x1.35 for craft designs vs x0.65 for others; rent x1.25/x0.75 by area). SPEC §5 sweeps one assumption uniformly. The reported cliff therefore depends on the perturbation rule, not only on the assumption."]),
        "engine/baseline.ts plants two hand-tuned leaders (design-0001 craft, design-0002 express) at the head of the design list with the stated purpose of flipping under the makeTimeSec/monthlyRent sweep (comment at engine/baseline.ts:86-89). The cliff pool is the first 120 designs, so these two always sit in it.",
        ...(uniformFlipDelta === null ? ["With a uniform perturbation over the full 10,000 set, #1 does not flip anywhere in ±30%: the cliff is an artifact of the 120-design pool and the asymmetric perturbation."] : []),
      ],
    });
    assert.ok(cliff, "cliff missing");
    assert.ok(mechanicalFlip, "engine's own boundary re-run does not flip #1");
  });

  it("AT-08: next measurement names the cliff variable; same-width uniform perturbation of the other assumptions", () => {
    const run = runOrchestration({ runId: "verify-at08", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const cliff = run.cliff, nm = run.nextMeasurement;
    const pool = run.designs.filter((_, i) => run.results[i]?.constraintsOk).slice(0, 120);
    const baseLeader = leaderOf(pool);
    const width = Math.abs(cliff?.relativeDelta ?? 0.06) || 0.06;
    const others = ["makeTimeSec", "monthlyRent", "avgTicketKrw", "cupsPerDayBase", "cogsRatio", "staffFte"].filter((v) => v !== String(cliff?.variable));
    const flips: string[] = [], holds: string[] = [];
    for (const v of others) {
      const sign = (cliff?.relativeDelta ?? 0) >= 0 ? 1 : -1;
      const l = leaderOf(uniformly(pool, v, sign * width));
      (l === baseLeader ? holds : flips).push(v);
    }
    const pointsAtCliff = !!nm && !!cliff && nm.variable === String(cliff.variable);
    const hasSevenDayAction = !!nm && /7일|7-day|seven/i.test(nm.howToMeasureOnsite ?? "");
    const ok = pointsAtCliff && holds.length >= 1;
    record({
      id: "AT-08", title: "다음 측정 1개 = 절벽 변수, 대조 가정 섭동 시 1위 유지", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `nextMeasurement.variable=${nm?.variable} == cliff.variable=${cliff?.variable}: ${pointsAtCliff}; 7-day action present: ${hasSevenDayAction}`,
        `same-width (${(width * 100).toFixed(0)}%) uniform perturbation on the 120-design pool: #1 holds for [${holds.join(", ")}], flips for [${flips.join(", ")}]`,
      ],
      measured: { width, holds, flips },
      findings: [
        "nextMeasurement.variable is assigned from the same object as cliff.variable (engine/cliff.ts:324), so equality is by construction. engine/cliff.ts computes a control variable but never surfaces it in RunResult and controlLeaderUnchanged can never become false (initialised true, only ever set true).",
        ...(flips.length ? [`Control assumptions that DO flip #1 at the same width: ${flips.join(", ")} — AT-08 as worded ('a same-width perturbation of another assumption does not flip #1') holds only for a chosen control, not for every other assumption.`] : []),
      ],
    });
    assert.ok(pointsAtCliff);
    assert.ok(holds.length >= 1, "no control assumption leaves #1 unchanged");
  });
});
