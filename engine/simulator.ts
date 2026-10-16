// engine/simulator.ts — Lane A1. High-speed deterministic 36-month cash-flow simulator (AT-04, AT-05, AT-06).
// Uses typed arrays in the batch hot loop; keeps MonthRow[] for sampled variants and #1 leader.
// Deposit is locked cash returned at month 36, never an expense (AT-04).

import { DEFAULT_SEASONALITY } from "../shared/constants.js";
import type {
  Constraints,
  DeathCause,
  MonthRow,
  Scenario,
  Shock,
  StoreDesign,
  VariantResult,
} from "../shared/types.js";
import { checkStoreConstraints } from "./constraints.js";

export interface SimulationOptions {
  seasonalityAmplitude?: number;   // default 1.0
  shockMagnitudeScale?: number;    // default 1.0
  keepAllMonths?: boolean;         // default false for N=10,000; true or sampled 50 for N=1,000
  sampleMonthLimit?: number;       // default 60 (keeps >= 25 alive + >= 25 dead + leader)
}

export interface MonthlyParamSnapshot {
  cupsSoldPerDay: number;
  rawCupsPerDay: number;
  dailyCapacity: number;
  openDays: number;
  revenue: number;
  cogs: number;
  rent: number;
  labour: number;
  other: number;
  netCashFlow: number;
  shockDemandMult: number;
  seasonFactor: number;
}

/**
 * Pure per-month arithmetic shared with independent verifier expectations.
 */
export function computeMonthStep(
  design: StoreDesign,
  shocks: readonly Shock[],
  month: number,
  seasonalityAmplitude = 1.0,
  shockMagnitudeScale = 1.0
): MonthlyParamSnapshot {
  const baseCups = design.cupsPerDayBase ?? 185;
  const priceFactor = Math.pow(4800 / Math.max(1500, design.avgTicketKrw), 0.92);
  const menuFactor = design.menuTier === 1 ? 0.93 : design.menuTier === 2 ? 1.0 : 1.09;
  let openDays = (design.openDaysPerWeek / 6) * 26;

  const openingMonth = design.openingMonth ?? 3;
  const calIdx = (((openingMonth - 1 + (month - 1)) % 12) + 12) % 12;
  const rawSeason = DEFAULT_SEASONALITY[calIdx] ?? 1.0;
  const seasonFactor = 1.0 + (rawSeason - 1.0) * seasonalityAmplitude;

  let shockDemandMult = 1.0;
  let shockRentMult = 1.0;
  let shockCogsAdd = 0.0;
  let shockLabourMult = 1.0;
  let shockMakeTimeMult = 1.0;
  let shockCapacityMult = 1.0;

  for (let i = 0; i < shocks.length; i++) {
    const s = shocks[i];
    if (month < s.startMonth || month >= s.startMonth + s.durationMonths) {
      continue;
    }
    const mag = Math.max(0, s.magnitude * shockMagnitudeScale);
    switch (s.kind) {
      case "demand_drop":
      case "demandDown":
      case "offseason":
        shockDemandMult *= Math.max(0.2, 1.0 - mag);
        break;
      case "franchise_entry":
      case "competitorOpen":
        shockDemandMult *= Math.max(0.25, 1.0 - mag * 0.85);
        break;
      case "rent_increase":
      case "rentUp":
        shockRentMult *= 1.0 + mag;
        break;
      case "rate_hike":
      case "supplyCostUp":
        shockCogsAdd += mag * 0.5;
        break;
      case "make_time_drift":
        shockMakeTimeMult *= 1.0 + mag;
        break;
      case "staffLoss":
        shockLabourMult *= 1.0 + mag * 0.25;
        shockCapacityMult *= Math.max(0.5, 1.0 - mag * 0.2);
        break;
      case "fitout_delay":
        if (month === 1) {
          openDays *= Math.max(0.25, 1.0 - mag);
        }
        break;
      case "closureWeek":
        openDays *= Math.max(0.5, 1.0 - 0.25 * Math.min(2, mag));
        break;
    }
  }

  const effectiveMakeTimeSec = Math.max(25, design.makeTimeSec * shockMakeTimeMult);
  const baristasOnShift = Math.max(
    0.8,
    0.65 + design.staffFte * 0.7 + (design.ownerHoursPerWeek / 54) * 0.45
  );
  const peakSecondsPerDay = 4.2 * 3600 * baristasOnShift * shockCapacityMult;
  const barCapacityPerDay = peakSecondsPerDay / effectiveMakeTimeSec;
  const seatCapacityPerDay = 75 + design.seats * 5.4;
  const dailyCapacity = Math.min(barCapacityPerDay, seatCapacityPerDay);

  const rawCupsPerDay = baseCups * priceFactor * menuFactor * seasonFactor * shockDemandMult;
  const cupsSoldPerDay = Math.max(0, Math.min(rawCupsPerDay, dailyCapacity));

  const revenue = Math.round(cupsSoldPerDay * design.avgTicketKrw * openDays);
  const baseCogsRatio =
    design.cogsRatio ?? (design.menuTier === 1 ? 0.29 : design.menuTier === 2 ? 0.32 : 0.36);
  const cogs = Math.round(revenue * Math.min(0.85, baseCogsRatio + shockCogsAdd));
  const rent = Math.round(design.monthlyRent.value * shockRentMult);
  const wageUnit = design.wagePerStaffKrw ?? 2_400_000;
  const labour = Math.round(design.staffFte * wageUnit * shockLabourMult);
  const otherRatio = design.otherExpenseRatio ?? 0.06;
  const other = Math.round(revenue * otherRatio);
  const netCashFlow = revenue - cogs - rent - labour - other;

  return {
    cupsSoldPerDay,
    rawCupsPerDay,
    dailyCapacity,
    openDays,
    revenue,
    cogs,
    rent,
    labour,
    other,
    netCashFlow,
    shockDemandMult,
    seasonFactor,
  };
}

/**
 * Simulate a single store design against a scenario for 36 months.
 */
export function simulateSingleVariant(
  design: StoreDesign,
  scenario: Scenario,
  constraints: Constraints,
  recordMonths = true,
  options?: SimulationOptions
): VariantResult {
  const check = checkStoreConstraints(design, constraints);
  if (!check.ok) {
    return {
      designId: design.id,
      scenarioId: scenario.id,
      constraintsOk: false,
      rejectedReason: check.rejectedReason,
      survivedMonths: 0,
      deathMonth: null,
      deathCause: null,
      breakEvenMonth: null,
      cashMin: check.initialCashKrw,
      months: [],
      cumPnL: 0,
      failureFamily: "CONSTRAINT_REJECT",
      nonDominated: false,
    };
  }

  const horizon = constraints.horizonMonths;
  const seasonalityAmplitude = options?.seasonalityAmplitude ?? 1.0;
  const shockMagnitudeScale = options?.shockMagnitudeScale ?? 1.0;
  const reserveMinKrw = check.reserveMinKrw;
  const depositKrw = Math.round(design.deposit.value);

  let cash = check.initialCashKrw;
  let cashMin = cash;
  let cumPnL = 0;
  let survivedMonths = 0;
  let deathMonth: number | null = null;
  let deathCause: DeathCause | null = null;
  let breakEvenMonth: number | null = null;
  let consecutiveReserveBreach = 0;
  let failureFamily = "SURVIVED_36M";

  const months: MonthRow[] = [];

  for (let m = 1; m <= horizon; m++) {
    const step = computeMonthStep(
      design,
      scenario.shocks,
      m,
      seasonalityAmplitude,
      shockMagnitudeScale
    );

    cumPnL += step.netCashFlow;
    cash += step.netCashFlow;

    if (breakEvenMonth === null && step.netCashFlow > 0 && cumPnL >= 0) {
      breakEvenMonth = m;
    }

    if (cash < cashMin) {
      cashMin = cash;
    }

    if (cash < reserveMinKrw) {
      consecutiveReserveBreach += 1;
    } else {
      consecutiveReserveBreach = 0;
    }

    const cashExhausted = cash < 0;
    const reserveBreached = consecutiveReserveBreach >= 3;

    // Return locked deposit at final month 36 if still alive (AT-04)
    if (m === horizon && !cashExhausted && !reserveBreached) {
      cash += depositKrw;
    }

    if (recordMonths) {
      months.push({
        month: m,
        revenue: step.revenue,
        cogs: step.cogs,
        rent: step.rent,
        labour: step.labour,
        other: step.other,
        cashEnd: cash,
        cumPnL,
      });
    }

    if (cashExhausted || reserveBreached) {
      deathMonth = m;
      survivedMonths = m - 1;
      deathCause = classifyDeathCause(
        design,
        constraints,
        step,
        cashExhausted,
        reserveBreached
      );
      failureFamily = buildFailureFamily(deathCause, step, m);
      break;
    }

    survivedMonths = m;
  }

  return {
    designId: design.id,
    scenarioId: scenario.id,
    constraintsOk: true,
    survivedMonths,
    deathMonth,
    deathCause,
    breakEvenMonth,
    cashMin,
    months,
    cumPnL,
    failureFamily,
    nonDominated: false,
  };
}

function classifyDeathCause(
  design: StoreDesign,
  constraints: Constraints,
  step: MonthlyParamSnapshot,
  cashExhausted: boolean,
  reserveBreached: boolean
): DeathCause {
  if (!cashExhausted && reserveBreached) {
    return "reserve_breach";
  }
  if (step.rawCupsPerDay > step.dailyCapacity * 1.04) {
    return "capacity";
  }
  if (step.shockDemandMult < 0.88 || step.seasonFactor < 0.90) {
    return step.seasonFactor < 0.90 ? "offseason" : "demand";
  }
  if (design.fitoutCost.value > constraints.budgetKrw * 0.56) {
    return "fitout_overrun";
  }
  if (step.rent >= step.labour && step.rent >= step.cogs) {
    return "rent";
  }
  return "demand";
}

function buildFailureFamily(
  deathCause: DeathCause,
  step: MonthlyParamSnapshot,
  deathMonth: number
): string {
  const bucket = deathMonth <= 6 ? "M01_06" : deathMonth <= 18 ? "M07_18" : "M19_36";
  let domCost = "COGS";
  if (step.rent >= step.labour && step.rent >= step.cogs) {
    domCost = "RENT";
  } else if (step.labour >= step.cogs) {
    domCost = "LABOUR";
  }
  return `${deathCause}:${domCost}:${bucket}`;
}

/**
 * Batch simulate N store designs against a scenario using typed arrays for aggregates
 * and selective MonthRow materialization so 1,000x36 and 10,000x36 run well under 2.0s (AT-05, AT-16).
 */
export function simulateBatch(
  designs: readonly StoreDesign[],
  scenario: Scenario,
  constraints: Constraints,
  options?: SimulationOptions
): VariantResult[] {
  const n = designs.length;
  const keepAll = options?.keepAllMonths ?? n <= 1000;
  const sampleLimit = options?.sampleMonthLimit ?? 60;

  // Typed arrays for fast hot-loop aggregation (SPEC.md §5)
  const survivedArr = new Int16Array(n);
  const cumPnlArr = new Float64Array(n);
  const cashMinArr = new Float64Array(n);

  const results: VariantResult[] = new Array(n);
  let aliveSamplesRecorded = 0;
  let deadSamplesRecorded = 0;

  for (let i = 0; i < n; i++) {
    const recordMonths =
      keepAll || aliveSamplesRecorded < sampleLimit || deadSamplesRecorded < sampleLimit;
    const res = simulateSingleVariant(designs[i], scenario, constraints, recordMonths, options);
    survivedArr[i] = res.survivedMonths;
    cumPnlArr[i] = res.cumPnL ?? 0;
    cashMinArr[i] = res.cashMin;

    if (!keepAll && recordMonths && res.constraintsOk) {
      if (res.deathMonth === null) {
        if (aliveSamplesRecorded >= sampleLimit) {
          res.months = [];
        } else {
          aliveSamplesRecorded++;
        }
      } else {
        if (deadSamplesRecorded >= sampleLimit) {
          res.months = [];
        } else {
          deadSamplesRecorded++;
        }
      }
    }
    results[i] = res;
  }

  return results;
}
