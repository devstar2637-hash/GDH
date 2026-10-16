import assert from "node:assert/strict";
import { test } from "node:test";
import type { Constraints, StoreDesign, Tagged } from "../shared/types.js";
import { simulateSingleVariant } from "./simulator.js";
import { checkStoreConstraints } from "./constraints.js";

// Fixed external arithmetic expectations copied unchanged from
// deliverables/gdh-a1-independent-check.mjs. No production monthly calculation
// is imported to produce the expected values. This is a bounded ledger check,
// not empirical calibration or an independent oracle for arbitrary scenarios.
const onsite = (value: number): Tagged => ({ value, source: { kind: "onsite" } });
const constraints: Constraints = {
  budgetKrw: 120_000_000, reserveRatioMin: .1, horizonMonths: 36,
  district: "verification", trade: "cafe", seed: 20261016,
};
const base: StoreDesign = {
  id: "fixed-arithmetic", seats: 22, floorAreaM2: 49.5,
  deposit: onsite(30_000_000), fitoutCost: onsite(42_000_000), monthlyRent: onsite(2_000_000),
  staffFte: 1, ownerHoursPerWeek: 54, menuTier: 2, avgTicketKrw: 4800,
  makeTimeSec: 95, openDaysPerWeek: 6, cupsPerDayBase: 100,
  cogsRatio: .32, wagePerStaffKrw: 2_400_000, otherExpenseRatio: .06,
};
const run = (patch: Partial<StoreDesign>) => simulateSingleVariant(
  { ...base, ...patch }, { id: "no-shock", shocks: [] }, constraints, true,
  { seasonalityAmplitude: 0 }
);

test("fixed monthly ledger: 12,480,000 revenue; 3,337,600 net; deposit outside P&L", () => {
  const r = run({});
  assert.equal(r.constraintsOk, true);
  assert.equal(r.deathMonth, null);
  assert.deepEqual(r.months[0], { month: 1, revenue: 12_480_000, cogs: 3_993_600, rent: 2_000_000,
    labour: 2_400_000, other: 748_800, cashEnd: 51_337_600, cumPnL: 3_337_600 });
  assert.equal(r.months[35].cashEnd, 198_153_600);
  assert.equal(r.cumPnL, 120_153_600);
});
test("zero demand is retained: cash zero in month 8, first negative month 9", () => {
  const r = run({ cupsPerDayBase: 0, monthlyRent: onsite(6_000_000), staffFte: 0 });
  assert.equal(r.months[7].cashEnd, 0);
  assert.equal(r.months[8].cashEnd, -6_000_000);
  assert.equal(r.deathMonth, 9);
});
test("third consecutive reserve breach stops with positive cash", () => {
  const r = run({ cupsPerDayBase: 0, monthlyRent: onsite(3_000_000), staffFte: 0 });
  assert.equal(r.months[11].cashEnd, 12_000_000);
  assert.equal(r.deathMonth, 15);
  assert.equal(r.months[14].cashEnd, 3_000_000);
  assert.equal(r.deathCause, "reserve_breach");
});
test("deposit returns once in month 36 and never increases P&L", () => {
  const r = run({ cupsPerDayBase: 0, monthlyRent: onsite(0), staffFte: 0 });
  assert.equal(r.months[34].cashEnd, 48_000_000);
  assert.equal(r.months[35].cashEnd, 78_000_000);
  assert.equal(r.cumPnL, 0);
});
test("integer KRW conservation at a half-won cost boundary", () => {
  const r = run({ cupsPerDayBase: 501 / (4800 * 26), monthlyRent: onsite(0), staffFte: 0,
    cogsRatio: .5, otherExpenseRatio: 0 });
  assert.equal(r.months[0].revenue, 501);
  assert.equal(r.months[0].cogs, 251);
  assert.equal(r.months[0].cashEnd, 48_000_250);
  assert.equal(r.cumPnL, 9_000);
});
test("invalid numeric money is rejected before simulation, never a successful NaN ledger", () => {
  for (const bad of ["bad", "30000000", null, NaN, Infinity, -1]) {
    const design = { ...base, deposit: { value: bad, source: { kind: "onsite" } } } as unknown as StoreDesign;
    assert.equal(checkStoreConstraints(design, constraints).ok, false, `deposit=${String(bad)}`);
    const r = simulateSingleVariant(design, { id: "invalid", shocks: [] }, constraints);
    assert.equal(r.constraintsOk, false);
    assert.equal(r.deathMonth, null);
  }
});
test("invalid optional numeric assumptions cannot silently turn into valid scenarios", () => {
  for (const patch of [{ cupsPerDayBase: NaN }, { cupsPerDayBase: -1 }, { cogsRatio: 2 },
    { otherExpenseRatio: Infinity }, { wagePerStaffKrw: "2400000" }, { ownerHoursPerWeek: NaN }]) {
    assert.equal(checkStoreConstraints({ ...base, ...patch } as unknown as StoreDesign, constraints).ok, false, JSON.stringify(patch));
  }
});
