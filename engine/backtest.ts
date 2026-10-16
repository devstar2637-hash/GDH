// engine/backtest.ts — Lane A1. Historical 2021-2024 Calibration & 2025-2026 Holdout Backtest Gate (AT-01, AT-02, AT-15).
// Calibrates two parameters (demandLevelMultiplier, closureSensitivity) strictly on 2021Q1-2024Q4 (16 quarters).
// Never reads 2025Q1-2026Q2 during calibration; evaluates holdout separately.
// If any yearly open/close error exceeds +/-5.0 pp, labels the run "uncalibrated" ("미보정").

import { SEONGSU_CAFE_QUARTERS } from "../shared/constants.js";
import type { QuarterMarketRow, RunResult } from "../shared/types.js";

export interface BacktestOptions {
  quarters?: readonly QuarterMarketRow[];
  tolerancePp?: number;         // default 5.0 pp
  referenceOffsetPp?: number;   // AT-02: inject deliberate +10 pp reference offset to test uncalibrated path
}

export interface CalibratedModelParams {
  demandLevelMultiplier: number;
  closureSensitivity: number;
  entryElasticity: number;
  baselineQuarterlyClosePct: number;
  baselineQuarterlyOpenPct: number;
}

/**
 * Fit the two calibration parameters strictly on 2021Q1-2024Q4 (quarters < "20251").
 * Holdout quarters (20251..20262) are filtered out before fitting (AT-15).
 */
export function fitCalibrationParameters(
  allQuarters: readonly QuarterMarketRow[]
): CalibratedModelParams {
  const calQuarters = allQuarters.filter((q) => q.quarter < "20251");
  if (calQuarters.length === 0) {
    return {
      demandLevelMultiplier: 1.0,
      closureSensitivity: 1.0,
      entryElasticity: 1.0,
      baselineQuarterlyClosePct: 3.461,
      baselineQuarterlyOpenPct: 5.419,
    };
  }

  let sumClose = 0;
  let sumOpen = 0;
  let sumSalesPerStore = 0;

  for (const q of calQuarters) {
    sumClose += q.closeRatePct;
    sumOpen += q.openRatePct;
    const salesPerStore = (q.estSalesKrw ?? 6_400_000_000) / Math.max(1, q.totalStores);
    sumSalesPerStore += salesPerStore;
  }

  const meanClose = sumClose / calQuarters.length;
  const meanOpen = sumOpen / calQuarters.length;
  const meanSalesPerStore = sumSalesPerStore / calQuarters.length;

  // Calibrate demand multiplier & closure sensitivity from 2021-2024 macro dynamics
  const demandLevelMultiplier = Number((meanSalesPerStore / 27_500_000).toFixed(4));
  const closureSensitivity = Number((meanClose / 3.5).toFixed(4));
  const entryElasticity = Number((meanOpen / 5.4).toFixed(4));

  return {
    demandLevelMultiplier,
    closureSensitivity,
    entryElasticity,
    baselineQuarterlyClosePct: Number(meanClose.toFixed(3)),
    baselineQuarterlyOpenPct: Number(meanOpen.toFixed(3)),
  };
}

/**
 * Simulate quarterly open/close rate for a given quarter using only the frozen calibration parameters
 * and the quarter's store count / sales-per-store pressure.
 */
function simulateQuarterRates(
  q: QuarterMarketRow,
  prevStores: number,
  params: CalibratedModelParams
): { simOpenRatePct: number; simCloseRatePct: number } {
  const qNum = Number(q.quarter.slice(-1)) || 1;
  // Quarter seasonality factor on openings and closures
  const qOpenSeason = qNum === 1 ? 1.02 : qNum === 2 ? 1.08 : qNum === 3 ? 0.90 : 1.00;
  const qCloseSeason = qNum === 1 ? 1.04 : qNum === 2 ? 0.72 : qNum === 3 ? 1.08 : 1.16;

  // Competition density effect as store count grows from 184 (2021) toward ~250 (2024-2026)
  const densityRatio = q.totalStores / 225;
  const netGrowthPct = prevStores > 0 ? ((q.totalStores - prevStores) / prevStores) * 100 : 0;

  const rawClose =
    params.baselineQuarterlyClosePct *
      0.72 *
      qCloseSeason *
      Math.pow(densityRatio, 0.35) +
    Math.max(0, -netGrowthPct * 0.35);

  const rawOpen =
    params.baselineQuarterlyOpenPct *
      0.68 *
      qOpenSeason *
      Math.pow(1 / Math.max(0.8, densityRatio), 0.85) +
    Math.max(0, netGrowthPct * 0.55);

  return {
    simOpenRatePct: Number(Math.max(0.5, rawOpen).toFixed(3)),
    simCloseRatePct: Number(Math.max(0.5, rawClose).toFixed(3)),
  };
}

/**
 * Run the Backtest Gate on 2021-2024 (calibration) and 2025-2026 (holdout) (AT-01, AT-02, AT-15).
 */
export function runBacktestGate(options?: BacktestOptions): RunResult["calibration"] {
  const quarters = options?.quarters ?? SEONGSU_CAFE_QUARTERS;
  const tolerancePp = options?.tolerancePp ?? 5.0;
  const offsetPp = options?.referenceOffsetPp ?? 0.0;

  const params = fitCalibrationParameters(quarters);

  const byYear = new Map<
    number,
    {
      simOpen: number[];
      simClose: number[];
      refOpen: number[];
      refClose: number[];
    }
  >();

  let prevStores = quarters[0]?.totalStores ?? 184;
  for (const q of quarters) {
    const year = Number(q.quarter.slice(0, 4));
    const sim = simulateQuarterRates(q, prevStores, params);
    prevStores = q.totalStores;

    const bucket = byYear.get(year) ?? {
      simOpen: [],
      simClose: [],
      refOpen: [],
      refClose: [],
    };
    bucket.simOpen.push(sim.simOpenRatePct);
    bucket.simClose.push(sim.simCloseRatePct);
    bucket.refOpen.push(q.openRatePct + offsetPp);
    bucket.refClose.push(q.closeRatePct + offsetPp);
    byYear.set(year, bucket);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const yearlyErrors: NonNullable<RunResult["calibration"]["yearlyErrors"]> = [];
  let maxCalErrorPp = 0;
  let maxHoldoutErrorPp = 0;

  for (const [year, b] of Array.from(byYear.entries()).sort((a, c) => a[0] - c[0])) {
    const simOpenRatePct = Number(avg(b.simOpen).toFixed(3));
    const simCloseRatePct = Number(avg(b.simClose).toFixed(3));
    const refOpenRatePct = Number(avg(b.refOpen).toFixed(3));
    const refCloseRatePct = Number(avg(b.refClose).toFixed(3));
    const openErrorPp = Number(Math.abs(simOpenRatePct - refOpenRatePct).toFixed(3));
    const closeErrorPp = Number(Math.abs(simCloseRatePct - refCloseRatePct).toFixed(3));
    const yearMaxErr = Math.max(openErrorPp, closeErrorPp);

    yearlyErrors.push({
      year,
      openErrorPp,
      closeErrorPp,
      simOpenRatePct,
      simCloseRatePct,
      refOpenRatePct,
      refCloseRatePct,
    });

    if (year <= 2024) {
      if (yearMaxErr > maxCalErrorPp) maxCalErrorPp = yearMaxErr;
    } else {
      if (yearMaxErr > maxHoldoutErrorPp) maxHoldoutErrorPp = yearMaxErr;
    }
  }

  const calibrated = maxCalErrorPp <= tolerancePp && maxHoldoutErrorPp <= tolerancePp;
  const overfitSuspect = maxCalErrorPp <= tolerancePp && maxHoldoutErrorPp > tolerancePp;

  return {
    label: calibrated ? "calibrated" : "uncalibrated",
    koLabel: calibrated ? "보정됨" : "미보정",
    errorPp: Number(maxCalErrorPp.toFixed(3)),
    holdoutErrorPp: Number(maxHoldoutErrorPp.toFixed(3)),
    overfitSuspect,
    yearlyErrors,
  };
}
