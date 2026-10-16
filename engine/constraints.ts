// engine/constraints.ts — Lane A1. Hard constraint verification (AT-03).
// Rejects budget overruns, reserve < 10%, negative seats, or impossible floor area.
// Rejected variants are logged and NEVER counted as deaths.

import type { Constraints, StoreDesign } from "../shared/types.js";

export interface ConstraintCheckResult {
  ok: boolean;
  rejectedReason?: string;
  initialInvestmentKrw: number;
  initialCashKrw: number;
  reserveMinKrw: number;
}

export function getInitialInvestmentKrw(design: StoreDesign): number {
  const deposit = Math.round(design.deposit.value);
  const fitout = Math.round(design.fitoutCost.value);
  return deposit + fitout;
}

export function checkStoreConstraints(
  design: StoreDesign,
  constraints: Constraints
): ConstraintCheckResult {
  // Validate the original values before rounding/coercion. In particular, NaN
  // makes ordered comparisons false and strings/null must not become money.
  const invalidNumber = (field: string): ConstraintCheckResult => ({
    ok: false,
    rejectedReason: `invalid_numeric_input: ${field}`,
    initialInvestmentKrw: 0,
    initialCashKrw: 0,
    reserveMinKrw: 0,
  });
  const inRange = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  const requiredNumbers: [string, unknown, number, number?][] = [
    ["deposit.value", design.deposit?.value, 0],
    ["fitoutCost.value", design.fitoutCost?.value, 0],
    ["monthlyRent.value", design.monthlyRent?.value, 0],
    ["budgetKrw", constraints.budgetKrw, Number.MIN_VALUE],
    ["reserveRatioMin", constraints.reserveRatioMin, 0.10, 1],
    ["ownerHoursPerWeek", design.ownerHoursPerWeek, 0, 168],
  ];
  const optionalNumbers: [string, unknown, number, number?][] = [
    ["cupsPerDayBase", design.cupsPerDayBase, 0],
    ["cogsRatio", design.cogsRatio, 0, 1],
    ["otherExpenseRatio", design.otherExpenseRatio, 0, 1],
    ["wagePerStaffKrw", design.wagePerStaffKrw, 0],
    ["equipmentKrw", design.equipmentKrw, 0],
    ["openingMonth", design.openingMonth, 1, 12],
  ];
  for (const [field, value, min, max] of requiredNumbers) {
    if (!inRange(value, min, max)) return invalidNumber(field);
  }
  for (const [field, value, min, max] of optionalNumbers) {
    if (value !== undefined && !inRange(value, min, max)) return invalidNumber(field);
  }
  if (
    (design.openingMonth !== undefined && !Number.isInteger(design.openingMonth)) ||
    ![1, 2, 3].includes(design.menuTier) ||
    constraints.horizonMonths !== 36 ||
    !inRange(constraints.seed, 0) || !Number.isInteger(constraints.seed)
  ) return invalidNumber("openingMonth/menuTier/horizonMonths/seed");

  const deposit = Math.round(design.deposit.value);
  const fitout = Math.round(design.fitoutCost.value);
  const rent = Math.round(design.monthlyRent.value);
  const initialInvestmentKrw = deposit + fitout;
  const initialCashKrw = Math.round(constraints.budgetKrw) - initialInvestmentKrw;
  const reserveRatio = Math.max(0.10, constraints.reserveRatioMin);
  const reserveMinKrw = Math.round(constraints.budgetKrw * reserveRatio);

  if (!Number.isFinite(design.seats) || design.seats < 0 || design.seats > 500) {
    return {
      ok: false,
      rejectedReason: `invalid_seats: seats=${design.seats} must be in [0, 500]`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  if (
    !Number.isFinite(design.floorAreaM2) ||
    design.floorAreaM2 <= 0 ||
    design.floorAreaM2 > 2000 ||
    (design.seats > 0 && design.floorAreaM2 < design.seats * 0.5)
  ) {
    return {
      ok: false,
      rejectedReason: `impossible_floor_area: floorAreaM2=${design.floorAreaM2}, seats=${design.seats}`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  if (deposit < 0 || fitout < 0 || rent < 0) {
    return {
      ok: false,
      rejectedReason: `negative_cost_component: deposit=${deposit}, fitout=${fitout}, rent=${rent}`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  if (initialInvestmentKrw > constraints.budgetKrw) {
    return {
      ok: false,
      rejectedReason: `budget_exceeded: initialInvestment=${initialInvestmentKrw} > budget=${constraints.budgetKrw}`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  if (initialCashKrw < reserveMinKrw) {
    return {
      ok: false,
      rejectedReason: `reserve_below_min: initialCash=${initialCashKrw} < reserveMin=${reserveMinKrw} (10% of budget)`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  if (
    !inRange(design.avgTicketKrw, Number.MIN_VALUE) ||
    design.avgTicketKrw <= 0 ||
    !inRange(design.makeTimeSec, Number.MIN_VALUE) ||
    design.makeTimeSec <= 0 ||
    !Number.isFinite(design.openDaysPerWeek) ||
    design.openDaysPerWeek < 1 ||
    design.openDaysPerWeek > 7 ||
    !inRange(design.staffFte, 0) ||
    design.staffFte < 0
  ) {
    return {
      ok: false,
      rejectedReason: `invalid_operational_params: avgTicket=${design.avgTicketKrw}, makeTimeSec=${design.makeTimeSec}, openDays=${design.openDaysPerWeek}, staffFte=${design.staffFte}`,
      initialInvestmentKrw,
      initialCashKrw,
      reserveMinKrw,
    };
  }

  return {
    ok: true,
    initialInvestmentKrw,
    initialCashKrw,
    reserveMinKrw,
  };
}
