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

/**
 * Outlay is deposit + fitoutCost only.
 * Equipment, rent, labour, and other operating costs are excluded.
 */
export function outlayKrw(design: StoreDesign): number {
  const deposit = Math.round(design.deposit.value);
  const fitout = Math.round(design.fitoutCost.value);
  return deposit + fitout;
}

export function getInitialInvestmentKrw(design: StoreDesign): number {
  return outlayKrw(design);
}

export function checkStoreConstraints(
  design: StoreDesign,
  constraints: Constraints
): ConstraintCheckResult {
  const deposit = Math.round(design.deposit.value);
  const fitout = Math.round(design.fitoutCost.value);
  const rent = Math.round(design.monthlyRent.value);
  const initialInvestmentKrw = outlayKrw(design);
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
    !Number.isFinite(design.avgTicketKrw) ||
    design.avgTicketKrw <= 0 ||
    !Number.isFinite(design.makeTimeSec) ||
    design.makeTimeSec <= 0 ||
    !Number.isFinite(design.openDaysPerWeek) ||
    design.openDaysPerWeek < 1 ||
    design.openDaysPerWeek > 7 ||
    !Number.isFinite(design.staffFte) ||
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
