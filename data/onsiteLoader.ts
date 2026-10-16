// data/onsiteLoader.ts — Lane A2. Parses and normalizes onsite store inputs & constraints,
// attaches SourceTags ("onsite", "assumed", "public") to every number, and computes canonical inputHash.

import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
} from "../shared/constants.js";
import type { Constraints, StoreDesign } from "../shared/types.js";
import { sha256Canonical } from "../engine/prng.js";

export interface RawOnsiteInput {
  budgetKrw?: number;
  reserveRatioMin?: number;
  seed?: number;
  district?: string;
  seats?: number;
  floorAreaM2?: number;
  depositKrw?: number;
  monthlyRentKrw?: number;
  fitoutCostKrw?: number;
  staffFte?: number;
  ownerHoursPerWeek?: number;
  menuTier?: 1 | 2 | 3;
  avgTicketKrw?: number;
  makeTimeSec?: number;
  openDaysPerWeek?: number;
  cupsPerDayBase?: number;
  cogsRatio?: number;
  openingMonth?: number;
  mode?: 1000 | 10000;
}

export interface NormalizedOnsiteBundle {
  constraints: Constraints;
  baseDesign: StoreDesign;
  mode: 1000 | 10000;
  inputHash: string;
}

export function normalizeOnsiteInput(raw: RawOnsiteInput = {}): NormalizedOnsiteBundle {
  const constraints: Constraints = {
    budgetKrw: Number(raw.budgetKrw ?? DEFAULT_CONSTRAINTS.budgetKrw),
    reserveRatioMin: Math.max(
      0.10,
      Number(raw.reserveRatioMin ?? DEFAULT_CONSTRAINTS.reserveRatioMin)
    ),
    horizonMonths: 36,
    district: raw.district ?? DEFAULT_CONSTRAINTS.district,
    trade: "cafe",
    seed: Number(raw.seed ?? DEFAULT_CONSTRAINTS.seed),
  };

  const baseDesign: StoreDesign = {
    id: "onsite-base",
    familyId: "fam-000",
    seats: Number(raw.seats ?? DEFAULT_BASE_STORE_DESIGN.seats),
    floorAreaM2: Number(raw.floorAreaM2 ?? DEFAULT_BASE_STORE_DESIGN.floorAreaM2),
    deposit: {
      value: Number(raw.depositKrw ?? DEFAULT_BASE_STORE_DESIGN.deposit.value),
      source:
        raw.depositKrw !== undefined
          ? { kind: "onsite", field: "deposit", note: "현장 중개업소 보증금 호가" }
          : DEFAULT_BASE_STORE_DESIGN.deposit.source,
    },
    monthlyRent: {
      value: Number(
        raw.monthlyRentKrw ?? DEFAULT_BASE_STORE_DESIGN.monthlyRent.value
      ),
      source:
        raw.monthlyRentKrw !== undefined
          ? { kind: "onsite", field: "monthlyRent", note: "현장 중개업소 월 임대료 호가" }
          : DEFAULT_BASE_STORE_DESIGN.monthlyRent.source,
    },
    fitoutCost: {
      value: Number(
        raw.fitoutCostKrw ?? DEFAULT_BASE_STORE_DESIGN.fitoutCost.value
      ),
      source:
        raw.fitoutCostKrw !== undefined
          ? { kind: "onsite", field: "fitoutCost", note: "현장 인테리어·장비 견적" }
          : DEFAULT_BASE_STORE_DESIGN.fitoutCost.source,
    },
    staffFte: Number(raw.staffFte ?? DEFAULT_BASE_STORE_DESIGN.staffFte),
    ownerHoursPerWeek: Number(
      raw.ownerHoursPerWeek ?? DEFAULT_BASE_STORE_DESIGN.ownerHoursPerWeek
    ),
    menuTier: (raw.menuTier ?? DEFAULT_BASE_STORE_DESIGN.menuTier) as 1 | 2 | 3,
    avgTicketKrw: Number(
      raw.avgTicketKrw ?? DEFAULT_BASE_STORE_DESIGN.avgTicketKrw
    ),
    makeTimeSec: Number(
      raw.makeTimeSec ?? DEFAULT_BASE_STORE_DESIGN.makeTimeSec
    ),
    openDaysPerWeek: Number(
      raw.openDaysPerWeek ?? DEFAULT_BASE_STORE_DESIGN.openDaysPerWeek
    ),
    cupsPerDayBase: Number(
      raw.cupsPerDayBase ?? DEFAULT_BASE_STORE_DESIGN.cupsPerDayBase ?? 185
    ),
    cogsRatio: Number(
      raw.cogsRatio ?? DEFAULT_BASE_STORE_DESIGN.cogsRatio ?? 0.32
    ),
    openingMonth: Number(
      raw.openingMonth ?? DEFAULT_BASE_STORE_DESIGN.openingMonth ?? 3
    ),
    wagePerStaffKrw: DEFAULT_BASE_STORE_DESIGN.wagePerStaffKrw,
    otherExpenseRatio: DEFAULT_BASE_STORE_DESIGN.otherExpenseRatio,
  };

  const mode: 1000 | 10000 = raw.mode === 1000 ? 1000 : 10000;
  const inputHash = sha256Canonical({ constraints, baseDesign, mode }).slice(0, 16);

  return {
    constraints,
    baseDesign,
    mode,
    inputHash,
  };
}
