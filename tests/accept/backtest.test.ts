// tests/accept/backtest.test.ts — verifier-owned. 13:40 backtest report: AT-01, AT-02, AT-15 (+ V-02 calibration integrity).
// Reference values come ONLY from tests/fixtures/backtest_reference_seongsu_cafe.csv and tests/holdout/ (hashed).

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fitCalibrationParameters, runBacktestGate, runOrchestration } from "../../engine/index.js";
import { SEONGSU_CAFE_QUARTERS } from "../../shared/constants.js";
import type { QuarterMarketRow } from "../../shared/types.js";
import { record } from "../lib/judge.js";
import { FIXED_BASE, FIXED_CONSTRAINTS, FIXED_SCENARIO, gitShortSha } from "../lib/fixed_input.js";

const SHA = gitShortSha();
const TOL = 5.0;

interface RefRow { quarter: string; total_stores: number; opens: number; closes: number; open_rate_pct: number; close_rate_pct: number }

function readReferenceCsv(): RefRow[] {
  const txt = readFileSync(resolve(process.cwd(), "tests/fixtures/backtest_reference_seongsu_cafe.csv"), "utf8").trim().split(/\r?\n/);
  const hdr = txt[0].split(",");
  return txt.slice(1).map((line) => {
    const c = line.split(",");
    const o: Record<string, string> = {};
    hdr.forEach((h, i) => (o[h] = c[i]));
    return { quarter: o.quarter, total_stores: +o.total_stores, opens: +o.opens, closes: +o.closes, open_rate_pct: +o.open_rate_pct, close_rate_pct: +o.close_rate_pct };
  });
}

/** Yearly reference = mean of the four quarterly rates (the engine's definition; the count-based annual rate is also reported). */
function yearlyReference(rows: RefRow[]) {
  const by = new Map<number, RefRow[]>();
  for (const r of rows) {
    const y = Number(r.quarter.slice(0, 4));
    by.set(y, [...(by.get(y) ?? []), r]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, qs]) => ({
    year,
    quarters: qs.length,
    refOpenMeanPct: +(qs.reduce((a, q) => a + q.open_rate_pct, 0) / qs.length).toFixed(3),
    refCloseMeanPct: +(qs.reduce((a, q) => a + q.close_rate_pct, 0) / qs.length).toFixed(3),
    refOpenCountPct: +((100 * qs.reduce((a, q) => a + q.opens, 0)) / qs.reduce((a, q) => a + q.total_stores, 0) * (4 / qs.length)).toFixed(3),
    refCloseCountPct: +((100 * qs.reduce((a, q) => a + q.closes, 0)) / qs.reduce((a, q) => a + q.total_stores, 0) * (4 / qs.length)).toFixed(3),
  }));
}

describe("AT-01 · backtest 2021-2024 within ±5 pp per year -> 보정됨", () => {
  it("engine yearly reference equals the verifier's recomputation from the CSV and every yearly error <= 5 pp", () => {
    const ref = yearlyReference(readReferenceCsv());
    const cal = runBacktestGate();
    const rows = (cal.yearlyErrors ?? []).map((e) => {
      const mine = ref.find((r) => r.year === e.year)!;
      return {
        year: e.year,
        simOpen: e.simOpenRatePct, refOpenEngine: e.refOpenRatePct, refOpenMine: mine.refOpenMeanPct,
        simClose: e.simCloseRatePct, refCloseEngine: e.refCloseRatePct, refCloseMine: mine.refCloseMeanPct,
        openErrMine: +Math.abs(e.simOpenRatePct - mine.refOpenMeanPct).toFixed(3),
        closeErrMine: +Math.abs(e.simCloseRatePct - mine.refCloseMeanPct).toFixed(3),
        openErrEngine: e.openErrorPp, closeErrEngine: e.closeErrorPp,
      };
    });
    const calRows = rows.filter((r) => r.year <= 2024);
    const refMatches = rows.every((r) => Math.abs(r.refOpenEngine - r.refOpenMine) <= 0.001 && Math.abs(r.refCloseEngine - r.refCloseMine) <= 0.001);
    const maxCalErrMine = Math.max(...calRows.flatMap((r) => [r.openErrMine, r.closeErrMine]));
    const errMatches = rows.every((r) => Math.abs(r.openErrEngine - r.openErrMine) <= 0.001 && Math.abs(r.closeErrEngine - r.closeErrMine) <= 0.001);
    let cliOut = "";
    try { cliOut = execSync("npx tsx engine/cli.ts backtest", { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch (e) { cliOut = String((e as { stdout?: Buffer }).stdout ?? e); }
    let cliErr: number | null = null;
    try { cliErr = JSON.parse(cliOut).errorPp; } catch { /* keep null */ }
    const ok = calRows.length === 4 && refMatches && errMatches && maxCalErrMine <= TOL && cal.label === "calibrated" && cal.koLabel === "보정됨" && cliErr !== null && Math.abs(cliErr - cal.errorPp!) < 1e-9;
    record({
      id: "AT-01", title: "백테스트 2021~2024 연도별 ±5pp → 보정됨", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        ...calRows.map((r) => `${r.year}: open sim ${r.simOpen} vs ref ${r.refOpenMine} (err ${r.openErrMine} pp) | close sim ${r.simClose} vs ref ${r.refCloseMine} (err ${r.closeErrMine} pp)`),
        `max 2021-2024 error (verifier) = ${maxCalErrMine} pp; engine errorPp = ${cal.errorPp}; npm run backtest errorPp = ${cliErr}; label = ${cal.label}/${cal.koLabel}`,
        `engine reference values equal CSV recomputation: ${refMatches}; engine per-year errors equal |sim-ref|: ${errMatches}`,
      ],
      measured: { rows, maxCalErrMine, engineErrorPp: cal.errorPp, cliErrorPp: cliErr },
      findings: [
        "Reference yearly rate = mean of 4 quarterly rates (closes/total_stores). The count-based annual rate (sum closes / sum stores x 4) is reported in measured.rows for comparison only.",
      ],
    });
    assert.ok(refMatches && errMatches);
    assert.ok(maxCalErrMine <= TOL, `max error ${maxCalErrMine}`);
    assert.equal(cal.label, "calibrated");
  });

  it("V-02: the backtest must run a calibrated simulation (two fitted parameters change the result)", () => {
    const base = runBacktestGate();
    const doubledSales: QuarterMarketRow[] = SEONGSU_CAFE_QUARTERS.map((q) => ({ ...q, estSalesKrw: (q.estSalesKrw ?? 0) * 2 }));
    const p0 = fitCalibrationParameters(SEONGSU_CAFE_QUARTERS);
    const p1 = fitCalibrationParameters(doubledSales);
    const alt = runBacktestGate({ quarters: doubledSales });
    const simChanged = JSON.stringify(alt.yearlyErrors?.map((e) => [e.simOpenRatePct, e.simCloseRatePct])) !== JSON.stringify(base.yearlyErrors?.map((e) => [e.simOpenRatePct, e.simCloseRatePct]));
    const paramChanged = p0.demandLevelMultiplier !== p1.demandLevelMultiplier;
    const src = readFileSync(resolve(process.cwd(), "engine/backtest.ts"), "utf8");
    const usesEngine = /simulateBatch|simulateSingleVariant|computeMonthStep/.test(src);
    record({
      id: "V-02", title: "[검증자 추가] 백테스트가 보정 파라미터 2개로 엔진을 돌리는가", verdict: simChanged && usesEngine ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `demandLevelMultiplier ${p0.demandLevelMultiplier} -> ${p1.demandLevelMultiplier} when estSalesKrw doubles (param changed: ${paramChanged}); simulated yearly rates changed: ${simChanged}`,
        `engine/backtest.ts calls the 36-month simulator: ${usesEngine}`,
      ],
      findings: [
        "engine/backtest.ts simulateQuarterRates uses only baselineQuarterlyOpenPct/ClosePct (the reference means) times fixed constants (0.68/0.72, quarter season factors, density^0.35). demandLevelMultiplier and closureSensitivity are computed but never read. The 'backtest' is a curve fitted on the reference series, not a replay of the 36-month engine; SPEC §5 asks for the latter. Thresholds (±5 pp) are therefore met by construction.",
      ],
    });
    // This is an integrity check; it is recorded, and also asserted so npm run test:accept shows it.
    assert.ok(simChanged, "calibration parameters have no effect on simulated rates");
  });
});

describe("AT-02 · deliberately wrong reference (+10 pp) -> 미보정, run still completes", () => {
  it("label flips to uncalibrated and the run ends in a declared end state", () => {
    const cal = runBacktestGate({ referenceOffsetPp: 10 });
    const run = runOrchestration({ runId: "verify-at02", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], referenceOffsetPp: 10, runAdversarial: false, persistToDisk: false });
    const engineOk = cal.label === "uncalibrated" && cal.koLabel === "미보정" && (cal.errorPp ?? 0) > TOL && run.calibration.label === "uncalibrated" && ["DONE", "FAIL", "BLOCKED"].includes(run.status.endState ?? "");
    record({
      id: "AT-02", title: "참조값 10pp 어긋남 → 미보정 라벨, 분포 숨김, 데모 끝까지", verdict: engineOk ? "BLOCKED" : "FAIL", engineSha: SHA,
      evidence: [
        `engine: label=${cal.label}/${cal.koLabel}, errorPp=${cal.errorPp}, run.endState=${run.status.endState} (${run.status.endReason})`,
        "screen part (distribution elements not rendered, assumption table shown, demo finishes) cannot be judged: web/ does not exist in this commit and no deployed URL yet -> BLOCKED until G2",
      ],
      measured: { errorPp: cal.errorPp, endState: run.status.endState },
    });
    assert.ok(engineOk);
  });
});

describe("AT-15 · hidden holdout 2025Q1-2026Q2 within ±5 pp, never read by calibration", () => {
  it("holdout file hash matches, equals shared rows, calibration is independent of holdout values, holdout error <= 5 pp", () => {
    const dir = resolve(process.cwd(), "tests/holdout");
    const json = readFileSync(resolve(dir, "seongsu_cafe_2025Q1_2026Q2.json"), "utf8");
    const want = readFileSync(resolve(dir, "seongsu_cafe_2025Q1_2026Q2.sha256"), "utf8").split(/\s+/)[0];
    const got = createHash("sha256").update(json).digest("hex");
    const hold = JSON.parse(json).quarters as { quarter: string; open_rate_pct: number; close_rate_pct: number; total_stores: number; opens: number; closes: number }[];
    const sharedHold = SEONGSU_CAFE_QUARTERS.filter((q) => q.quarter >= "20251");
    const rowsEqual = hold.length === 6 && sharedHold.length === 6 && hold.every((h, i) =>
      sharedHold[i].quarter === h.quarter && sharedHold[i].openRatePct === h.open_rate_pct && sharedHold[i].closeRatePct === h.close_rate_pct && sharedHold[i].totalStores === h.total_stores && sharedHold[i].opens === h.opens && sharedHold[i].closes === h.closes);

    // Independence: perturb holdout rows by +10 pp and check that calibration params and 2021-2024 errors are unchanged.
    const perturbed: QuarterMarketRow[] = SEONGSU_CAFE_QUARTERS.map((q) => q.quarter >= "20251" ? { ...q, openRatePct: q.openRatePct + 10, closeRatePct: q.closeRatePct + 10 } : q);
    const p0 = fitCalibrationParameters(SEONGSU_CAFE_QUARTERS), p1 = fitCalibrationParameters(perturbed);
    const c0 = runBacktestGate(), c1 = runBacktestGate({ quarters: perturbed });
    const calYears0 = c0.yearlyErrors?.filter((e) => e.year <= 2024), calYears1 = c1.yearlyErrors?.filter((e) => e.year <= 2024);
    const independent = JSON.stringify(p0) === JSON.stringify(p1) && JSON.stringify(calYears0) === JSON.stringify(calYears1);

    // Holdout error recomputed by the verifier from the hashed file (mean of quarterly rates per year).
    const byYear = new Map<number, typeof hold>();
    for (const h of hold) byYear.set(Number(h.quarter.slice(0, 4)), [...(byYear.get(Number(h.quarter.slice(0, 4))) ?? []), h]);
    let maxHold = 0;
    const detail: string[] = [];
    for (const [year, qs] of byYear) {
      const refO = qs.reduce((a, q) => a + q.open_rate_pct, 0) / qs.length, refC = qs.reduce((a, q) => a + q.close_rate_pct, 0) / qs.length;
      const e = c0.yearlyErrors?.find((x) => x.year === year);
      const eo = Math.abs((e?.simOpenRatePct ?? 99) - refO), ec = Math.abs((e?.simCloseRatePct ?? 99) - refC);
      maxHold = Math.max(maxHold, eo, ec);
      detail.push(`${year}: open err ${eo.toFixed(3)} pp, close err ${ec.toFixed(3)} pp (ref ${refO.toFixed(3)}/${refC.toFixed(3)}, sim ${e?.simOpenRatePct}/${e?.simCloseRatePct})`);
    }
    const yearlyOk = got === want && rowsEqual && independent && maxHold <= TOL && (c0.holdoutErrorPp ?? 99) <= TOL;
    // The agreed AT table (doc tab 'Claude 작전과 병행안') judges the holdout PER QUARTER. The engine exposes only yearly means,
    // so the quarterly criterion cannot be computed from its output yet -> BLOCKED (not DONE) even when the yearly check passes.
    const quarterlyExposed = false;
    record({
      id: "AT-15", title: "숨긴 홀드아웃 2025Q1~2026Q2 분기별 ±5pp, 보정 코드가 읽지 않음", verdict: !yearlyOk ? "FAIL" : quarterlyExposed ? "DONE" : "BLOCKED", engineSha: SHA,
      evidence: [
        `AT table criterion is per QUARTER; engine/backtest.ts returns only yearly means (yearlyErrors), so the 6 quarterly errors cannot be judged -> A1 must expose per-quarter sim open/close rates; yearly check below ${yearlyOk ? "passes" : "FAILS"}`,
        `tests/holdout sha256 ${got.slice(0, 16)}… matches .sha256: ${got === want}; shared/constants holdout rows equal hashed file: ${rowsEqual}`,
        `calibration params and 2021-2024 errors unchanged when holdout rows are shifted +10 pp: ${independent}`,
        ...detail,
        `max holdout error (verifier) ${maxHold.toFixed(3)} pp; engine holdoutErrorPp ${c0.holdoutErrorPp}; overfitSuspect=${c0.overfitSuspect}`,
      ],
      measured: { maxHoldoutErrPp: maxHold, engineHoldoutErrPp: c0.holdoutErrorPp },
      findings: [
        "The holdout rows are physically present in shared/constants.ts (readable by engine code). Calibration filters them by quarter < '20251'; independence is verified by perturbation here, not by access control. SPEC §5 wanted them only in tests/holdout.",
        "AT-15 wording 'after every merge to main' — this check is re-run by the verifier at each gate; no CI hook exists in the repo.",
      ],
    });
    assert.equal(got, want);
    assert.ok(rowsEqual && independent);
    assert.ok(maxHold <= TOL, `holdout error ${maxHold}`);
    assert.ok(quarterlyExposed, "engine does not expose per-quarter holdout rates (AT-15 is judged per quarter)");
  });
});
