import test from "node:test";
import assert from "node:assert/strict";

import {
  computeCashflow36m,
  runSeededScenarioBatch,
  validateSimulationInputs
} from "../src/domain/cashflowEngine.js";
import {
  SeoulContextRepository,
  evaluateObservedContextAndUserSimulation
} from "../src/data/seoulContextRepository.js";
import { GeminiProposalService } from "../src/services/geminiProposalService.js";
import { createAppServer } from "../src/server.js";

test("Acceptance Case 1: Baseline positive cashflow and first positive integer daily volume = 77", () => {
  const result = computeCashflow36m({
    budget: 120_000_000,
    deposit: 30_000_000,
    openingCost: 42_000_000,
    avgTicket: 5_000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6_000_000
  });

  assert.equal(result.ok, true);
  assert.equal(result.reserveGate.initialAvailableCash, 48_000_000);
  assert.equal(result.reserveGate.passed, true);
  assert.equal(result.monthlyMetrics.monthlySales, 12_000_000);
  assert.equal(result.monthlyMetrics.monthlyOperatingCashChange, 1_800_000);
  assert.equal(result.checkpoints.month36Cash, 112_800_000);
  assert.equal(result.breakEvenBoundary.firstPositiveIntegerDailyTransactions, 77);
  assert.equal(result.cashBoundaries.zeroCashBoundaryMonth, null);
  assert.equal(result.cashBoundaries.firstNegativeCashMonth, null);
});

test("Acceptance Case 2: Explicit transactions/day=0 vs missing/blank input", () => {
  const zeroResult = computeCashflow36m({
    budget: 120_000_000,
    deposit: 30_000_000,
    openingCost: 42_000_000,
    avgTicket: 5_000,
    transactionsPerDay: 0,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6_000_000
  });

  assert.equal(zeroResult.ok, true);
  assert.equal(zeroResult.inputs.explicitZeroTransactions, true);
  assert.equal(zeroResult.monthlyMetrics.monthlySales, 0);
  assert.equal(zeroResult.monthlyMetrics.monthlyOperatingCashChange, -6_000_000);
  assert.equal(zeroResult.checkpoints.month8Cash, 0);
  assert.equal(zeroResult.cashBoundaries.zeroCashBoundaryMonth, 8);
  assert.equal(zeroResult.cashBoundaries.firstNegativeCashMonth, 9);
  assert.equal(zeroResult.months[8].endingCash, -6_000_000);
  assert.equal(zeroResult.months[8].isArithmeticOnlyAfterNegative, true);

  // Blank or missing transactionsPerDay must NOT coerce to 0
  for (const missingVal of ["", "   ", null, undefined]) {
    const missingCheck = validateSimulationInputs({
      budget: 120_000_000,
      deposit: 30_000_000,
      openingCost: 42_000_000,
      avgTicket: 5_000,
      transactionsPerDay: missingVal,
      tradingDaysPerMonth: 24,
      variableCostRatio: 0.35,
      monthlyFixedCost: 6_000_000
    });
    assert.equal(missingCheck.valid, false);
    assert.ok(missingCheck.errors.some((e) => e.field === "transactionsPerDay" && e.code === "MISSING_INPUT"));
  }
});

test("Acceptance Case 3: 10% reserve gate boundary (D=108M passes, D=109M fails) and deposit is never monthly expense", () => {
  const passResult = computeCashflow36m({
    budget: 120_000_000,
    deposit: 108_000_000,
    openingCost: 0,
    avgTicket: 5_000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6_000_000
  });

  assert.equal(passResult.ok, true);
  assert.equal(passResult.reserveGate.initialAvailableCash, 12_000_000);
  assert.equal(passResult.reserveGate.passed, true);
  assert.equal(passResult.monthlyMetrics.monthlyOperatingCashChange, 1_800_000);

  const failResult = computeCashflow36m({
    budget: 120_000_000,
    deposit: 109_000_000,
    openingCost: 0,
    avgTicket: 5_000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6_000_000
  });

  assert.equal(failResult.ok, true);
  assert.equal(failResult.reserveGate.initialAvailableCash, 11_000_000);
  assert.equal(failResult.reserveGate.passed, false);
  // Deposit is locked, never deducted from monthly operating cash change
  assert.equal(failResult.monthlyMetrics.monthlyOperatingCashChange, 1_800_000);
});

test("Acceptance Case 4 & Review Fix 3: Missing sales row stays null, preserves raw area names, and blocks data-derived rank/cashflow", () => {
  const repo = new SeoulContextRepository();
  const ctx = repo.loadContext();
  assert.equal(ctx.status, "ready");

  // Check literal raw name preservation for 3001494
  const jongno = repo.getAreaByCode("3001494");
  assert.ok(jongno);
  assert.equal(jongno.areaName, "종로?청계 관광특구");
  assert.equal(jongno.observedSales.rawReportedSalesKrw, 8013430388);
  assert.equal(jongno.observedSales.periodSemanticsStatus, "unconfirmed_raw_dangwol_in_quarterly_table");

  // Store row exists (3110001 이북5도청사) with no corresponding sales row in OA-15572
  const missingSalesArea = repo.getAreaByCode("3110001");
  assert.ok(missingSalesArea);
  assert.equal(missingSalesArea.observedStores.totalStores, 2);
  assert.equal(missingSalesArea.observedSales, null);
  assert.equal(missingSalesArea.salesDataStatus, "missing_in_source");
  assert.equal(missingSalesArea.canProduceDataDerivedCashflow, false);
  assert.equal(missingSalesArea.canProduceDataDerivedSalesRank, false);

  const evalWithoutUserTx = evaluateObservedContextAndUserSimulation({
    areaRecord: missingSalesArea,
    userSimulationInputs: null
  });
  assert.equal(evalWithoutUserTx.observedSalesMissing, true);
  assert.equal(evalWithoutUserTx.observedSalesValue, null);
  assert.equal(evalWithoutUserTx.dataDerivedRankAvailable, false);
  assert.equal(evalWithoutUserTx.dataDerivedCashflowAvailable, false);
});

test("Review Fix 1 & 2: KRW rounding conservation and zero-spread exact base preservation", () => {
  // ticket=501, tx=1, days=1, v=0.5, fixed=0 -> sales=501, variable=251, contribution=250, change=250
  const conserved = computeCashflow36m({
    budget: 10_000_000,
    deposit: 1_000_000,
    openingCost: 1_000_000,
    avgTicket: 501,
    transactionsPerDay: 1,
    tradingDaysPerMonth: 1,
    variableCostRatio: 0.5,
    monthlyFixedCost: 0
  });
  assert.equal(conserved.ok, true);
  assert.equal(conserved.monthlyMetrics.monthlySales, 501);
  assert.equal(conserved.monthlyMetrics.monthlyVariableCost, 251);
  assert.equal(conserved.monthlyMetrics.monthlyContribution, 250);
  assert.equal(
    conserved.monthlyMetrics.monthlyVariableCost + conserved.monthlyMetrics.monthlyContribution,
    conserved.monthlyMetrics.monthlySales
  );
  assert.equal(conserved.monthlyMetrics.monthlyOperatingCashChange, 250);

  // Zero spread preserves exact base values (including v=0 or v=0.95 and tx=0) and reports distinctScenarioCount = 1
  const zeroSpreadBatch = runSeededScenarioBatch(
    {
      budget: 120_000_000,
      deposit: 30_000_000,
      openingCost: 42_000_000,
      avgTicket: 5_000,
      transactionsPerDay: 0,
      tradingDaysPerMonth: 24,
      variableCostRatio: 0.95,
      monthlyFixedCost: 6_000_000
    },
    {
      seed: "zero-spread-check",
      transactionsSpread: 0,
      ticketSpread: 0,
      variableRatioAbsSpread: 0,
      fixedCostSpread: 0,
      daysSpread: 0
    }
  );
  assert.equal(zeroSpreadBatch.ok, true);
  assert.equal(zeroSpreadBatch.distinctScenarioCount, 1);
  assert.equal(zeroSpreadBatch.sampleScenarios[0].transactionsPerDay, 0);
  assert.equal(zeroSpreadBatch.sampleScenarios[0].variableCostRatio, 0.95);
});

test("Review Fix 5 & HTTP Smoke Suite: Unconfigured Gemini state, mocked provider verification, and HTTP routes", async () => {
  const unconfiguredGemini = new GeminiProposalService({
    getApiKey: () => ""
  });
  const unconfRes = await unconfiguredGemini.proposeBoundedAssumptions({
    baseInputs: {
      budget: 120_000_000,
      deposit: 30_000_000,
      openingCost: 42_000_000,
      avgTicket: 5_000,
      transactionsPerDay: 100,
      tradingDaysPerMonth: 24,
      variableCostRatio: 0.35,
      monthlyFixedCost: 6_000_000
    }
  });
  assert.equal(unconfRes.ok, false);
  assert.equal(unconfRes.status, "unconfigured");
  assert.equal(unconfRes.httpStatus, 503);

  // Explicitly labeled MOCKED test of GeminiProposalService verifier using official Interactions REST shape
  let capturedRequestBody = null;
  const mockedProposalPayload = {
    avgTicket: 5200,
    transactionsPerDay: 90,
    tradingDaysPerMonth: 25,
    variableCostRatio: 0.36,
    monthlyFixedCost: 5800000,
    rationaleNote: "[MOCKED TEST] Conservative weekday volume check.",
    measurementFocus: "Count weekday morning cups."
  };

  const mockedGemini = new GeminiProposalService({
    getApiKey: () => "test-only-mock-key-never-logged",
    fetchImpl: async (_url, options) => {
      capturedRequestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "mock_interaction_01",
          status: "completed",
          steps: [
            {
              type: "thought",
              content: [{ type: "text", text: "ignored internal thought" }]
            },
            {
              type: "model_output",
              content: [{ type: "text", text: JSON.stringify(mockedProposalPayload) }]
            }
          ]
        })
      };
    }
  });

  const mockRes = await mockedGemini.proposeBoundedAssumptions({
    baseInputs: {
      budget: 120_000_000,
      deposit: 30_000_000,
      openingCost: 42_000_000,
      avgTicket: 5_000,
      transactionsPerDay: 100,
      tradingDaysPerMonth: 24,
      variableCostRatio: 0.35,
      monthlyFixedCost: 6_000_000
    }
  });
  assert.equal(mockRes.ok, true);
  assert.equal(mockRes.status, "verified_ai_proposal");
  assert.equal(mockRes.verifiedByEngine.monthlySales, 5200 * 90 * 25);
  assert.ok(capturedRequestBody);
  assert.equal(capturedRequestBody.response_format?.mime_type, "application/json");
  assert.equal(capturedRequestBody.generation_config?.response_mime_type, undefined);

  // HTTP server smoke test
  const server = createAppServer({ geminiService: unconfiguredGemini });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.appTitle, "A Thousand Stores");
    assert.equal(healthJson.gemini.status, "unconfigured");

    const simRes = await fetch(`${baseUrl}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        areaCode: "3001496",
        seed: "test-seed",
        inputs: {
          budget: 120_000_000,
          deposit: 30_000_000,
          openingCost: 42_000_000,
          avgTicket: 5_000,
          transactionsPerDay: 100,
          tradingDaysPerMonth: 24,
          variableCostRatio: 0.35,
          monthlyFixedCost: 6_000_000
        }
      })
    });
    assert.equal(simRes.status, 200);
    const simJson = await simRes.json();
    assert.equal(simJson.ok, true);
    assert.equal(simJson.cashflow.checkpoints.month36Cash, 112_800_000);
    assert.equal(simJson.scenarioBatch.scenarioCount, 1000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
