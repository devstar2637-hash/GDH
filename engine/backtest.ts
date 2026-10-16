// Aggregate-rate diagnostic only. This heuristic does not validate the cashflow engine.
// Fitting uses 2021Q1-2024Q4; 2025Q1-2026Q2 is scored separately but is not a hidden oracle.
// Missing or invalid evidence fails closed. Even a complete diagnostic remains uncalibrated.

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

export type BacktestEvidenceReport = RunResult["calibration"] & {
  reason: string;
  evidenceScope: "aggregate_heuristic_only";
  dataStatus: "complete" | "invalid";
  validationErrors: string[];
  diagnosticWithinTolerance: boolean;
};

const REQUIRED_QUARTERS = Array.from({ length: 22 }, (_, i) =>
  `${2021 + Math.floor(i / 4)}${(i % 4) + 1}`
);
const REQUIRED_CALIBRATION_QUARTERS = REQUIRED_QUARTERS.slice(0, 16);
const EVIDENCE_REASON =
  "집계 휴리스틱 참고용입니다. 실제 36개월 cashflow 엔진과 연결되지 않아 현금흐름 보정·검증을 입증하지 않습니다. 고정 시계열의 원자료 재대조와 독립적인 숨김 홀드아웃 검증도 완료되지 않았습니다.";

function canonicalQuarter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})(?:Q)?([1-4])$/.exec(value);
  return match ? `${match[1]}${match[2]}` : null;
}

function validateEvidence(
  quarters: readonly QuarterMarketRow[],
  requiredQuarters: readonly string[]
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const required = new Set(requiredQuarters);
  for (const row of quarters) {
    if (!row || typeof row !== "object") {
      errors.push("Invalid quarter row.");
      continue;
    }
    const q = canonicalQuarter(row.quarter);
    if (!q || !required.has(q)) {
      errors.push(`Unexpected quarter: ${String(row.quarter)}.`);
    } else {
      if (seen.has(q)) errors.push(`Duplicate quarter: ${q}.`);
      seen.add(q);
    }
    for (const field of ["tradeAreas", "totalStores", "opens", "closes"] as const) {
      const value = row[field];
      if (!Number.isSafeInteger(value) || value < 0 ||
          ((field === "tradeAreas" || field === "totalStores") && value === 0)) {
        errors.push(`${String(row.quarter)}: invalid ${field}.`);
      }
    }
    for (const field of ["openRatePct", "closeRatePct"] as const) {
      const value = row[field];
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        errors.push(`${String(row.quarter)}: invalid ${field}.`);
      }
    }
    // A missing sales observation is not a synthetic 6.4-billion-KRW observation.
    if (typeof row.estSalesKrw !== "number" ||
        !Number.isFinite(row.estSalesKrw) || row.estSalesKrw < 0) {
      errors.push(`${String(row.quarter)}: missing or invalid estSalesKrw.`);
    }
  }
  for (const q of requiredQuarters) {
    if (!seen.has(q)) errors.push(`Missing quarter: ${q}.`);
  }
  return errors;
}

/**
 * Fit the two calibration parameters strictly on 2021Q1-2024Q4 (quarters < "20251").
 * Holdout quarters (20251..20262) are filtered out before fitting (AT-15).
 */
export function fitCalibrationParameters(
  allQuarters: readonly QuarterMarketRow[]
): CalibratedModelParams {
  const calQuarters = allQuarters.filter((q) => {
    const canonical = canonicalQuarter(q?.quarter);
    return canonical !== null && canonical < "20251";
  });
  const errors = validateEvidence(calQuarters, REQUIRED_CALIBRATION_QUARTERS);
  if (errors.length > 0) throw new Error(`Invalid calibration evidence: ${errors.join(" ")}`);

  let sumClose = 0;
  let sumOpen = 0;
  let sumSalesPerStore = 0;

  for (const q of calQuarters) {
    sumClose += q.closeRatePct;
    sumOpen += q.openRatePct;
    const salesPerStore = q.estSalesKrw! / q.totalStores;
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
export function runBacktestGate(options?: BacktestOptions): BacktestEvidenceReport {
  const quarters = options?.quarters ?? SEONGSU_CAFE_QUARTERS;
  const tolerancePp = options?.tolerancePp ?? 5.0;
  const offsetPp = options?.referenceOffsetPp ?? 0.0;

  const validationErrors = validateEvidence(quarters, REQUIRED_QUARTERS);
  if (!Number.isFinite(tolerancePp) || tolerancePp < 0) {
    validationErrors.push("Invalid tolerancePp.");
  }
  if (!Number.isFinite(offsetPp)) validationErrors.push("Invalid referenceOffsetPp.");
  if (validationErrors.length > 0) {
    return {
      label: "uncalibrated",
      koLabel: "미보정",
      errorPp: null,
      holdoutErrorPp: null,
      overfitSuspect: false,
      yearlyErrors: [],
      reason: `검증자료 불완전 또는 유효하지 않음: ${validationErrors.join(" ")} ${EVIDENCE_REASON}`,
      evidenceScope: "aggregate_heuristic_only",
      dataStatus: "invalid",
      validationErrors,
      diagnosticWithinTolerance: false,
    };
  }

  // Normalize supported quarter spellings and sort before using previous-quarter counts.
  const orderedQuarters = quarters
    .map((q) => ({ ...q, quarter: canonicalQuarter(q.quarter)! }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  const params = fitCalibrationParameters(orderedQuarters);

  const byYear = new Map<
    number,
    {
      simOpen: number[];
      simClose: number[];
      refOpen: number[];
      refClose: number[];
    }
  >();

  let prevStores = orderedQuarters[0].totalStores;
  for (const q of orderedQuarters) {
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

  const diagnosticWithinTolerance = maxCalErrorPp <= tolerancePp && maxHoldoutErrorPp <= tolerancePp;
  const overfitSuspect = maxCalErrorPp <= tolerancePp && maxHoldoutErrorPp > tolerancePp;

  return {
    label: "uncalibrated",
    koLabel: "미보정",
    errorPp: Number(maxCalErrorPp.toFixed(3)),
    holdoutErrorPp: Number(maxHoldoutErrorPp.toFixed(3)),
    overfitSuspect,
    yearlyErrors,
    reason: EVIDENCE_REASON,
    evidenceScope: "aggregate_heuristic_only",
    dataStatus: "complete",
    validationErrors: [],
    diagnosticWithinTolerance,
  };
}
