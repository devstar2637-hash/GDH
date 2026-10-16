import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BASE_STORE_DESIGN as base, DEFAULT_CONSTRAINTS as constraints } from "../shared/constants.js";
import { generateStructuredStoreDesigns } from "./baseline.js";
import { applyAssumptionDelta, evaluateLeaderAtAssumptionDelta, findDecisionCliffAndMeasurement, type CliffVariableKey } from "./cliff.js";

test("sensitivity perturbations preserve explicit zero and identity at delta zero", () => {
  const zero = { ...base, staffFte: 0, cupsPerDayBase: 0, cogsRatio: 0,
    monthlyRent: { ...base.monthlyRent, value: 0 }, avgTicketKrw: 1500, makeTimeSec: 10 };
  for (const variable of ["staffFte", "cupsPerDayBase", "cogsRatio", "monthlyRent"] as const) {
    for (const delta of [-.3, 0, .3]) {
      const changed = applyAssumptionDelta(variable, delta, [zero], zero)!.designs[0];
      assert.equal(changed.staffFte, 0); assert.equal(changed.cupsPerDayBase, 0);
      assert.equal(changed.cogsRatio, 0); assert.equal(changed.monthlyRent.value, 0);
    }
  }
  for (const variable of ["makeTimeSec", "monthlyRent", "avgTicketKrw", "cupsPerDayBase", "staffFte", "cogsRatio"] as const)
    assert.deepEqual(applyAssumptionDelta(variable, 0, [zero], zero)!.designs[0], zero);
});

test("a globally dominant late design prevents a first-subset cliff claim", () => {
  const designs = generateStructuredStoreDesigns(base, constraints, 1000);
  designs.push({ ...base, id: "outside-first-120", seats: 400, floorAreaM2: 500,
    staffFte: 10, cupsPerDayBase: 1000, avgTicketKrw: 20000, makeTimeSec: 25,
    cogsRatio: 0, otherExpenseRatio: 0, wagePerStaffKrw: 0,
    monthlyRent: { ...base.monthlyRent, value: 0 } });
  const analysis = findDecisionCliffAndMeasurement(designs, base, { id: "no-shock", shocks: [] }, constraints);
  assert.equal(analysis.cliff, null); assert.equal(analysis.nextMeasurement, null);
  assert.equal(analysis.verification.totalDesigns, 1001);
  assert.ok(analysis.verification.proposalDesigns <= 120);
  assert.equal(analysis.verification.globalMinimumVerified, false);
});

test("returned brackets reproduce full-population endpoints and an unchanged control", (t) => {
  const designs = generateStructuredStoreDesigns(base, constraints, 1000);
  const scenario = { id: "initial-seasonal-dip", shocks: [
    { kind: "offseason" as const, startMonth: 1, durationMonths: 2, magnitude: .08 },
  ] };
  const analysis = findDecisionCliffAndMeasurement(designs, base, scenario, constraints);
  assert.ok(analysis.verification.checkedBrackets <= 3);
  assert.ok(analysis.verification.fullBatchEvaluations <= 19);
  assert.ok(analysis.cliff, "this fixture has a full-population-confirmed bracket");
  if (analysis.cliff) {
    const lower = analysis.verification.lowerDelta!, upper = analysis.verification.upperDelta!;
    const variable = analysis.cliff.variable as CliffVariableKey;
    assert.equal(evaluateLeaderAtAssumptionDelta(variable, lower, designs, base, scenario, constraints), analysis.cliff.leaderBelow);
    assert.equal(evaluateLeaderAtAssumptionDelta(variable, upper, designs, base, scenario, constraints), analysis.cliff.leaderAbove);
    assert.notEqual(analysis.cliff.leaderBelow, analysis.cliff.leaderAbove);
    const baseline = evaluateLeaderAtAssumptionDelta(variable, 0, designs, base, scenario, constraints);
    assert.equal(evaluateLeaderAtAssumptionDelta(analysis.controlVariable as CliffVariableKey, lower, designs, base, scenario, constraints), baseline);
    assert.equal(evaluateLeaderAtAssumptionDelta(analysis.controlVariable as CliffVariableKey, upper, designs, base, scenario, constraints), baseline);
    assert.match(analysis.nextMeasurement!.why, /전역 최소.*미확인/);
  } else assert.equal(analysis.nextMeasurement, null);
  t.diagnostic(JSON.stringify(analysis.verification));
});
