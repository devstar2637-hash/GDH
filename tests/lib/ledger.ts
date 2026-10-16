// tests/lib/ledger.ts — verifier-owned INDEPENDENT spreadsheet-style 36-month ledger (AT-04).
// Written from docs/SPEC.md §5 plus the engine's declared month semantics as read at engine SHA d275e19.
// It imports nothing from engine/. Only shared/ (frozen contract) is used for the seasonality table.
// If engine arithmetic drifts, this ledger will disagree and AT-04 fails — that is the point.
//
// Declared deviations of the engine from SPEC §5 (recorded, not hidden):
//   D1 revenue uses openDays = openDaysPerWeek/6*26 instead of a flat 30 days.
//   D2 demand is capped by a bar/seat capacity and scaled by price/menu factors not in SPEC §5.
//   D3 cash_0 = budget - deposit - fitout (equipmentKrw is folded into fitoutCost per shared/types).

import { DEFAULT_SEASONALITY } from "../../shared/constants.js";
import type { Constraints, Shock, StoreDesign } from "../../shared/types.js";

export interface LedgerRow {
  month: number;
  revenue: number;
  cogs: number;
  rent: number;
  labour: number;
  other: number;
  net: number;
  cashEnd: number;
  cumPnL: number;
  depositReturned: number;
}

export interface LedgerResult {
  initialCash: number;
  depositLocked: number;
  reserveMin: number;
  rows: LedgerRow[];
  deathMonth: number | null;
  deathKind: "cashBelowZero" | "reserveBreach" | null;
}

function shockState(shocks: readonly Shock[], m: number, scale: number) {
  let demand = 1, rentMul = 1, cogsAdd = 0, labourMul = 1, makeMul = 1, capMul = 1, openDaysMul = 1;
  for (const s of shocks) {
    if (m < s.startMonth || m >= s.startMonth + s.durationMonths) continue;
    const mag = Math.max(0, s.magnitude * scale);
    switch (s.kind) {
      case "demand_drop": case "demandDown": case "offseason":
        demand *= Math.max(0.2, 1 - mag); break;
      case "franchise_entry": case "competitorOpen":
        demand *= Math.max(0.25, 1 - mag * 0.85); break;
      case "rent_increase": case "rentUp":
        rentMul *= 1 + mag; break;
      case "rate_hike": case "supplyCostUp":
        cogsAdd += mag * 0.5; break;
      case "make_time_drift":
        makeMul *= 1 + mag; break;
      case "staffLoss":
        labourMul *= 1 + mag * 0.25; capMul *= Math.max(0.5, 1 - mag * 0.2); break;
      case "fitout_delay":
        if (m === 1) openDaysMul *= Math.max(0.25, 1 - mag); break;
      case "closureWeek":
        openDaysMul *= Math.max(0.5, 1 - 0.25 * Math.min(2, mag)); break;
    }
  }
  return { demand, rentMul, cogsAdd, labourMul, makeMul, capMul, openDaysMul };
}

/** One month of the ledger, recomputed from first principles. */
export function ledgerMonth(d: StoreDesign, shocks: readonly Shock[], m: number, seasonAmp = 1, shockScale = 1) {
  const st = shockState(shocks, m, shockScale);
  const openDays = (d.openDaysPerWeek / 6) * 26 * st.openDaysMul;
  const calIdx = ((((d.openingMonth ?? 3) - 1 + (m - 1)) % 12) + 12) % 12;
  const season = 1 + ((DEFAULT_SEASONALITY[calIdx] ?? 1) - 1) * seasonAmp;

  const baseCups = d.cupsPerDayBase ?? 185;
  const priceFactor = Math.pow(4800 / Math.max(1500, d.avgTicketKrw), 0.92);
  const menuFactor = d.menuTier === 1 ? 0.93 : d.menuTier === 2 ? 1.0 : 1.09;
  const demandCups = baseCups * priceFactor * menuFactor * season * st.demand;

  const makeTime = Math.max(25, d.makeTimeSec * st.makeMul);
  const baristas = Math.max(0.8, 0.65 + d.staffFte * 0.7 + (d.ownerHoursPerWeek / 54) * 0.45);
  const barCap = (4.2 * 3600 * baristas * st.capMul) / makeTime;
  const seatCap = 75 + d.seats * 5.4;
  const cups = Math.max(0, Math.min(demandCups, Math.min(barCap, seatCap)));

  const revenue = Math.round(cups * d.avgTicketKrw * openDays);
  const cogsRatio = d.cogsRatio ?? (d.menuTier === 1 ? 0.29 : d.menuTier === 2 ? 0.32 : 0.36);
  const cogs = Math.round(revenue * Math.min(0.85, cogsRatio + st.cogsAdd));
  const rent = Math.round(d.monthlyRent.value * st.rentMul);
  const labour = Math.round(d.staffFte * (d.wagePerStaffKrw ?? 2_400_000) * st.labourMul);
  const other = Math.round(revenue * (d.otherExpenseRatio ?? 0.06));
  return { revenue, cogs, rent, labour, other, net: revenue - cogs - rent - labour - other };
}

/** Full 36-month ledger with SPEC §5 death rules and deposit-as-locked-cash. */
export function runLedger(d: StoreDesign, shocks: readonly Shock[], c: Constraints, seasonAmp = 1, shockScale = 1): LedgerResult {
  const budget = Math.round(c.budgetKrw);
  const depositLocked = Math.round(d.deposit.value);
  const fitout = Math.round(d.fitoutCost.value);
  const initialCash = budget - depositLocked - fitout;              // D3
  const reserveMin = Math.round(budget * Math.max(0.10, c.reserveRatioMin));

  let cash = initialCash, cum = 0, breach = 0;
  const rows: LedgerRow[] = [];
  let deathMonth: number | null = null;
  let deathKind: LedgerResult["deathKind"] = null;

  for (let m = 1; m <= c.horizonMonths; m++) {
    const x = ledgerMonth(d, shocks, m, seasonAmp, shockScale);
    cum += x.net;
    cash += x.net;
    breach = cash < reserveMin ? breach + 1 : 0;
    const dead = cash < 0 || breach >= 3;
    const depositReturned = m === c.horizonMonths && !dead ? depositLocked : 0; // deposit is never an expense
    cash += depositReturned;
    rows.push({ month: m, ...x, cashEnd: cash, cumPnL: cum, depositReturned });
    if (dead) {
      deathMonth = m;
      deathKind = cash < 0 ? "cashBelowZero" : "reserveBreach";
      break;
    }
  }
  return { initialCash, depositLocked, reserveMin, rows, deathMonth, deathKind };
}

/** Independent AT-03 constraint check, written from SPEC §5 wording. */
export function independentConstraintCheck(d: StoreDesign, c: Constraints): { ok: boolean; why?: string } {
  const deposit = Math.round(d.deposit.value);
  const fitout = Math.round(d.fitoutCost.value);
  const budget = Math.round(c.budgetKrw);
  const reserveMin = Math.round(budget * Math.max(0.10, c.reserveRatioMin));
  if (!(d.seats >= 0)) return { ok: false, why: `seats ${d.seats} < 0` };
  if (!(d.floorAreaM2 > 0)) return { ok: false, why: `floorArea ${d.floorAreaM2} <= 0` };
  if (deposit < 0 || fitout < 0 || d.monthlyRent.value < 0) return { ok: false, why: "negative cost" };
  if (deposit + fitout > budget) return { ok: false, why: `initial ${deposit + fitout} > budget ${budget}` };
  if (budget - deposit - fitout < reserveMin) return { ok: false, why: `reserve ${budget - deposit - fitout} < ${reserveMin}` };
  return { ok: true };
}
