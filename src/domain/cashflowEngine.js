/**
 * Deterministic 36-Month Cashflow & 1,000-Scenario Batch Engine
 *
 * KRW Rounding & Conservation Convention:
 * - budgetRounded = Math.round(budget), depositRounded = Math.round(deposit), openingCostRounded = Math.round(openingCost)
 * - initialAvailableCash = budgetRounded - depositRounded - openingCostRounded
 * - monthlySales = Math.round(avgTicket * transactionsPerDay * tradingDaysPerMonth)
 * - monthlyVariableCost = Math.round(monthlySales * variableCostRatio)
 * - monthlyContribution = monthlySales - monthlyVariableCost  (strictly conserves sales = variableCost + contribution)
 * - monthlyFixedCostRounded = Math.round(monthlyFixedCost)
 * - monthlyOperatingCashChange = monthlyContribution - monthlyFixedCostRounded
 */

export const ENGINE_VERSION = "1.1.0";

export const INPUT_BOUNDS = Object.freeze({
  budget: { min: 1_000_000, max: 10_000_000_000 },
  deposit: { min: 0, max: 10_000_000_000 },
  openingCost: { min: 0, max: 10_000_000_000 },
  avgTicket: { min: 500, max: 200_000 },
  transactionsPerDay: { min: 0, max: 20_000 },
  tradingDaysPerMonth: { min: 1, max: 31 },
  variableCostRatio: { min: 0, max: 0.95 },
  monthlyFixedCost: { min: 0, max: 1_000_000_000 }
});

export function isMissingInput(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "boolean") return true;
  return false;
}

export function parseStrictNumber(value, fieldName) {
  if (isMissingInput(value)) {
    return {
      ok: false,
      code: "MISSING_INPUT",
      field: fieldName,
      message: `${fieldName} is required and cannot be blank or missing.`
    };
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return {
      ok: false,
      code: "INVALID_TYPE",
      field: fieldName,
      message: `${fieldName} must be a numeric scalar, not ${Array.isArray(value) ? "array" : typeof value}.`
    };
  }
  const num = typeof value === "number" ? value : Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(num)) {
    return {
      ok: false,
      code: "INVALID_NUMBER",
      field: fieldName,
      message: `${fieldName} must be a finite number.`
    };
  }
  return { ok: true, value: num };
}

export function validateSimulationInputs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [{ field: "inputs", code: "INVALID_OBJECT", message: "Simulation inputs must be a plain JSON object." }],
      inputs: null
    };
  }

  const errors = [];
  const parsed = {};

  const fields = [
    ["budget", raw.budget],
    ["deposit", raw.deposit],
    ["openingCost", raw.openingCost ?? raw.openingExpenditure],
    ["avgTicket", raw.avgTicket ?? raw.ticket],
    ["transactionsPerDay", raw.transactionsPerDay],
    ["tradingDaysPerMonth", raw.tradingDaysPerMonth ?? raw.daysPerMonth],
    ["variableCostRatio", raw.variableCostRatio ?? raw.variableRatio],
    ["monthlyFixedCost", raw.monthlyFixedCost ?? raw.monthlyFixed]
  ];

  for (const [name, rawVal] of fields) {
    const res = parseStrictNumber(rawVal, name);
    if (!res.ok) {
      errors.push({ field: name, code: res.code, message: res.message });
      continue;
    }
    const bounds = INPUT_BOUNDS[name];
    if (bounds && (res.value < bounds.min || res.value > bounds.max)) {
      errors.push({
        field: name,
        code: "OUT_OF_BOUNDS",
        message: `${name} (${res.value}) must be between ${bounds.min} and ${bounds.max}.`
      });
      continue;
    }
    parsed[name] = res.value;
  }

  return {
    valid: errors.length === 0,
    errors,
    inputs: errors.length === 0 ? parsed : null
  };
}

/**
 * Single-month conserved KRW calculation used by both 36m projection, break-even finder, and 1,000-scenario batch.
 */
export function computeMonthlyKrwFlow({
  avgTicket,
  transactionsPerDay,
  tradingDaysPerMonth,
  variableCostRatio,
  monthlyFixedCost
}) {
  const monthlySales = Math.round(avgTicket * transactionsPerDay * tradingDaysPerMonth);
  const monthlyVariableCost = Math.round(monthlySales * variableCostRatio);
  const monthlyContribution = monthlySales - monthlyVariableCost;
  const monthlyFixedCostRounded = Math.round(monthlyFixedCost);
  const monthlyOperatingCashChange = monthlyContribution - monthlyFixedCostRounded;

  return {
    monthlySales,
    monthlyVariableCost,
    monthlyContribution,
    monthlyFixedCost: monthlyFixedCostRounded,
    monthlyOperatingCashChange
  };
}

/**
 * Finds the first integer daily transaction volume that produces >= 0 and > 0 monthlyOperatingCashChange
 * under the exact conserved KRW rounding convention.
 */
export function findIntegerBreakEvenDailyVolume({
  avgTicket,
  tradingDaysPerMonth,
  variableCostRatio,
  monthlyFixedCost
}) {
  const unitContributionPerDayPerMonth = avgTicket * tradingDaysPerMonth * (1 - variableCostRatio);
  const monthlyFixedCostRounded = Math.round(monthlyFixedCost);
  if (unitContributionPerDayPerMonth <= 0) {
    return {
      unitContributionPerDayPerMonth: 0,
      exactZeroBreakEvenDailyTransactions: null,
      minNonNegativeDailyTransactions: null,
      firstPositiveIntegerDailyTransactions: null
    };
  }

  const exactZeroBreakEvenDailyTransactions = monthlyFixedCostRounded / unitContributionPerDayPerMonth;
  const startCandidate = Math.max(0, Math.floor(exactZeroBreakEvenDailyTransactions) - 2);

  let minNonNegativeDailyTransactions = null;
  let firstPositiveIntegerDailyTransactions = null;

  for (let tx = startCandidate; tx <= startCandidate + 10000; tx += 1) {
    const flow = computeMonthlyKrwFlow({
      avgTicket,
      transactionsPerDay: tx,
      tradingDaysPerMonth,
      variableCostRatio,
      monthlyFixedCost: monthlyFixedCostRounded
    });
    if (minNonNegativeDailyTransactions === null && flow.monthlyOperatingCashChange >= 0) {
      minNonNegativeDailyTransactions = tx;
    }
    if (firstPositiveIntegerDailyTransactions === null && flow.monthlyOperatingCashChange > 0) {
      firstPositiveIntegerDailyTransactions = tx;
      break;
    }
  }

  return {
    unitContributionPerDayPerMonth,
    exactZeroBreakEvenDailyTransactions,
    minNonNegativeDailyTransactions,
    firstPositiveIntegerDailyTransactions
  };
}

export function computeCashflow36m(rawInputs) {
  const validation = validateSimulationInputs(rawInputs);
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors
    };
  }

  const {
    budget,
    deposit,
    openingCost,
    avgTicket,
    transactionsPerDay,
    tradingDaysPerMonth,
    variableCostRatio,
    monthlyFixedCost
  } = validation.inputs;

  const budgetRounded = Math.round(budget);
  const depositRounded = Math.round(deposit);
  const openingCostRounded = Math.round(openingCost);
  const initialAvailableCash = budgetRounded - depositRounded - openingCostRounded;

  const requiredReserveCash = Math.ceil(budgetRounded * 0.10);
  const reserveRatio = budgetRounded > 0 ? initialAvailableCash / budgetRounded : 0;
  const reserveGatePassed = initialAvailableCash * 10 >= budgetRounded;

  const flow = computeMonthlyKrwFlow({
    avgTicket,
    transactionsPerDay,
    tradingDaysPerMonth,
    variableCostRatio,
    monthlyFixedCost
  });

  const boundary = findIntegerBreakEvenDailyVolume({
    avgTicket,
    tradingDaysPerMonth,
    variableCostRatio,
    monthlyFixedCost: flow.monthlyFixedCost
  });

  const months = [];
  let zeroCashBoundaryMonth = null;
  let firstNegativeCashMonth = null;

  if (initialAvailableCash <= 0) {
    zeroCashBoundaryMonth = 0;
  }
  if (initialAvailableCash < 0) {
    firstNegativeCashMonth = 0;
  }

  for (let m = 1; m <= 36; m += 1) {
    const endingCash = initialAvailableCash + m * flow.monthlyOperatingCashChange;
    if (zeroCashBoundaryMonth === null && endingCash <= 0) {
      zeroCashBoundaryMonth = m;
    }
    if (firstNegativeCashMonth === null && endingCash < 0) {
      firstNegativeCashMonth = m;
    }
    months.push({
      month: m,
      monthlySales: flow.monthlySales,
      monthlyVariableCost: flow.monthlyVariableCost,
      monthlyContribution: flow.monthlyContribution,
      monthlyFixedCost: flow.monthlyFixedCost,
      monthlyOperatingCashChange: flow.monthlyOperatingCashChange,
      endingCash,
      isArithmeticOnlyAfterNegative: firstNegativeCashMonth !== null && m >= firstNegativeCashMonth
    });
  }

  return {
    ok: true,
    roundingConvention:
      "KRW integer conservation: monthlySales = round(ticket*tx*days), monthlyVariableCost = round(monthlySales*variableRatio), monthlyContribution = monthlySales - monthlyVariableCost, monthlyFixedCost = round(fixedCost), monthlyOperatingCashChange = monthlyContribution - monthlyFixedCost.",
    inputs: {
      budget,
      deposit,
      openingCost,
      avgTicket,
      transactionsPerDay,
      tradingDaysPerMonth,
      variableCostRatio,
      monthlyFixedCost,
      explicitZeroTransactions: transactionsPerDay === 0
    },
    reserveGate: {
      initialAvailableCash,
      requiredReserveCash,
      reserveRatio,
      passed: reserveGatePassed,
      depositLockedNotMonthlyExpense: true
    },
    monthlyMetrics: {
      monthlySales: flow.monthlySales,
      monthlyVariableCost: flow.monthlyVariableCost,
      monthlyContribution: flow.monthlyContribution,
      monthlyFixedCost: flow.monthlyFixedCost,
      monthlyOperatingCashChange: flow.monthlyOperatingCashChange,
      terminologyNote: "Operating cash change only; taxes, debt service, depreciation, and working capital are not modeled."
    },
    breakEvenBoundary: {
      ...boundary,
      dailyTransactionsGapToPositive:
        boundary.firstPositiveIntegerDailyTransactions !== null
          ? boundary.firstPositiveIntegerDailyTransactions - transactionsPerDay
          : null
    },
    cashBoundaries: {
      zeroCashBoundaryMonth,
      firstNegativeCashMonth,
      arithmeticOnlyAfterNegativeCash: firstNegativeCashMonth !== null,
      boundaryNote:
        "After negative cash, projection is arithmetic only; continued operation or external financing is not established."
    },
    checkpoints: {
      month0Cash: initialAvailableCash,
      month8Cash: months[7].endingCash,
      month12Cash: months[11].endingCash,
      month24Cash: months[23].endingCash,
      month36Cash: months[35].endingCash
    },
    months
  };
}

export function createSeededPrng(seedInput = "a-thousand-stores-2026") {
  const str = String(seedInput ?? "a-thousand-stores-2026");
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let state = (h ^= h >>> 16) >>> 0;

  return function nextUniform() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleBoundedRelative(prng, baseValue, relSpread, minBound, maxBound, integer = false) {
  const u = (prng() + prng()) / 2;
  if (relSpread === 0) {
    return baseValue;
  }
  const offset = (u - 0.5) * 2 * relSpread;
  const raw = baseValue * (1 + offset);
  const clamped = Math.min(maxBound, Math.max(minBound, raw));
  return integer ? Math.round(clamped) : clamped;
}

export function validateSpreadConfig(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return {
      valid: false,
      errors: [{ field: "spreadConfig", code: "INVALID_SPREAD_CONFIG", message: "spreadConfig must be a plain object." }]
    };
  }

  const defaults = {
    transactionsSpread: 0.35,
    ticketSpread: 0.15,
    variableRatioAbsSpread: 0.08,
    fixedCostSpread: 0.15,
    daysSpread: 0.08
  };

  const errors = [];
  const resolved = {};

  for (const [key, defaultVal] of Object.entries(defaults)) {
    const rawVal = options[key];
    if (rawVal === undefined) {
      resolved[key] = defaultVal;
      continue;
    }
    if (typeof rawVal !== "number" || !Number.isFinite(rawVal) || rawVal < 0 || rawVal > 1) {
      errors.push({
        field: key,
        code: "INVALID_SPREAD_VALUE",
        message: `${key} must be a finite number between 0 and 1.`
      });
      continue;
    }
    resolved[key] = rawVal;
  }

  return {
    valid: errors.length === 0,
    errors,
    spreadConfig: errors.length === 0 ? resolved : null
  };
}

export function runSeededScenarioBatch(rawInputs, options = {}) {
  const baseResult = computeCashflow36m(rawInputs);
  if (!baseResult.ok) {
    return baseResult;
  }

  const spreadValidation = validateSpreadConfig(options);
  if (!spreadValidation.valid) {
    return {
      ok: false,
      errors: spreadValidation.errors
    };
  }

  const seed = String(options.seed ?? "seoul-cafe-2026-v1");
  const scenarioCount = 1000;
  const prng = createSeededPrng(seed);
  const base = baseResult.inputs;
  const spreadConfig = spreadValidation.spreadConfig;

  const month36Values = [];
  const monthlyChangeValues = [];
  const distinctSignatures = new Set();
  let positiveMonthlyChangeCount = 0;
  let nonNegative36mCount = 0;
  let negativeCashAnyMonthCount = 0;
  let reserveGatePassCount = 0;

  const sampleScenarios = [];

  for (let i = 0; i < scenarioCount; i += 1) {
    // Relative perturbation of txBase=0 stays 0 (no fabricated positive volume)
    const txSampled = sampleBoundedRelative(
      prng,
      base.transactionsPerDay,
      spreadConfig.transactionsSpread,
      INPUT_BOUNDS.transactionsPerDay.min,
      INPUT_BOUNDS.transactionsPerDay.max,
      true
    );

    const ticketSampled = sampleBoundedRelative(
      prng,
      base.avgTicket,
      spreadConfig.ticketSpread,
      INPUT_BOUNDS.avgTicket.min,
      INPUT_BOUNDS.avgTicket.max,
      true
    );

    const uVar = (prng() + prng()) / 2;
    const varSpread = spreadConfig.variableRatioAbsSpread;
    const varRatioSampled =
      varSpread === 0
        ? base.variableCostRatio
        : Number(
            Math.min(
              INPUT_BOUNDS.variableCostRatio.max,
              Math.max(
                INPUT_BOUNDS.variableCostRatio.min,
                base.variableCostRatio + (uVar - 0.5) * 2 * varSpread
              )
            ).toFixed(4)
          );

    const fixedSampled = sampleBoundedRelative(
      prng,
      base.monthlyFixedCost,
      spreadConfig.fixedCostSpread,
      INPUT_BOUNDS.monthlyFixedCost.min,
      INPUT_BOUNDS.monthlyFixedCost.max,
      true
    );

    const daysSampled = sampleBoundedRelative(
      prng,
      base.tradingDaysPerMonth,
      spreadConfig.daysSpread,
      INPUT_BOUNDS.tradingDaysPerMonth.min,
      INPUT_BOUNDS.tradingDaysPerMonth.max,
      true
    );

    distinctSignatures.add(`${txSampled}|${ticketSampled}|${varRatioSampled}|${fixedSampled}|${daysSampled}`);

    const initialCash = baseResult.reserveGate.initialAvailableCash;
    if (baseResult.reserveGate.passed) {
      reserveGatePassCount += 1;
    }

    const flow = computeMonthlyKrwFlow({
      avgTicket: ticketSampled,
      transactionsPerDay: txSampled,
      tradingDaysPerMonth: daysSampled,
      variableCostRatio: varRatioSampled,
      monthlyFixedCost: fixedSampled
    });

    const operatingChange = flow.monthlyOperatingCashChange;
    const m36Cash = initialCash + 36 * operatingChange;

    const hitsNegative = initialCash < 0 || m36Cash < 0;
    if (operatingChange > 0) positiveMonthlyChangeCount += 1;
    if (!hitsNegative) nonNegative36mCount += 1;
    if (hitsNegative) negativeCashAnyMonthCount += 1;

    month36Values.push(m36Cash);
    monthlyChangeValues.push(operatingChange);

    if (i < 5) {
      sampleScenarios.push({
        index: i + 1,
        transactionsPerDay: txSampled,
        avgTicket: ticketSampled,
        tradingDaysPerMonth: daysSampled,
        variableCostRatio: varRatioSampled,
        monthlyFixedCost: fixedSampled,
        monthlyOperatingCashChange: operatingChange,
        month36Cash: m36Cash
      });
    }
  }

  const sortedM36 = [...month36Values].sort((a, b) => a - b);
  const sortedChange = [...monthlyChangeValues].sort((a, b) => a - b);

  const percentile = (sortedArr, p) => {
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(p * (sortedArr.length - 1))));
    return sortedArr[idx];
  };

  const minVal = sortedM36[0];
  const maxVal = sortedM36[sortedM36.length - 1];
  const binCount = 12;
  const span = Math.max(1, maxVal - minVal);
  const binWidth = span / binCount;
  const histogramBins = Array.from({ length: binCount }, (_, idx) => ({
    binIndex: idx,
    lowKrw: Math.round(minVal + idx * binWidth),
    highKrw: Math.round(minVal + (idx + 1) * binWidth),
    count: 0
  }));

  for (const v of month36Values) {
    const rawIdx = span === 1 && maxVal === minVal ? 0 : Math.floor((v - minVal) / binWidth);
    const idx = Math.min(binCount - 1, Math.max(0, rawIdx));
    histogramBins[idx].count += 1;
  }

  return {
    ok: true,
    kind: "assumed_scenario_batch",
    isProbabilityEstimate: false,
    isGeminiOutput: false,
    seed,
    scenarioCount,
    distinctScenarioCount: distinctSignatures.size,
    spreadConfig,
    disclaimer:
      "Batch counts describe 1,000 deterministic seeded assumption runs around the user's inputs (not survival probabilities or Gemini output). In zero-spread or narrow integer ranges, distinctScenarioCount reflects actual unique parameter combinations.",
    counts: {
      totalScenarios: scenarioCount,
      distinctParameterCombinations: distinctSignatures.size,
      positiveMonthlyCashChangeScenarios: positiveMonthlyChangeCount,
      nonNegativeMonth36CashScenarios: nonNegative36mCount,
      negativeCashWithin36mScenarios: negativeCashAnyMonthCount,
      reserveGatePassScenarios: reserveGatePassCount
    },
    percentiles: {
      month36Cash: {
        min: sortedM36[0],
        p10: percentile(sortedM36, 0.10),
        p25: percentile(sortedM36, 0.25),
        p50: percentile(sortedM36, 0.50),
        p75: percentile(sortedM36, 0.75),
        p90: percentile(sortedM36, 0.90),
        max: sortedM36[sortedM36.length - 1]
      },
      monthlyOperatingCashChange: {
        p10: percentile(sortedChange, 0.10),
        p50: percentile(sortedChange, 0.50),
        p90: percentile(sortedChange, 0.90)
      }
    },
    histogramBins,
    sampleScenarios
  };
}

export function deriveNextMeasurement(cashflowResult) {
  if (!cashflowResult || !cashflowResult.ok) {
    return null;
  }

  const { inputs, reserveGate, monthlyMetrics, breakEvenBoundary, cashBoundaries } = cashflowResult;
  const firstPosTx = breakEvenBoundary.firstPositiveIntegerDailyTransactions;
  const txGap = breakEvenBoundary.dailyTransactionsGapToPositive;

  const measurements = [];

  if (!reserveGate.passed) {
    const shortfall = reserveGate.requiredReserveCash - reserveGate.initialAvailableCash;
    measurements.push({
      priority: 1,
      category: "reserve_gate_shortfall",
      title: "Verify Deposit & Opening Capex Quotes to Restore 10% Cash Reserve",
      metricToMeasure: "Initial Available Cash (C0) vs 10% Reserve Gate",
      thresholdText: `Initial cash (${reserveGate.initialAvailableCash.toLocaleString("en-US")} KRW) is below 10% of budget (${reserveGate.requiredReserveCash.toLocaleString("en-US")} KRW) by ${shortfall.toLocaleString("en-US")} KRW.`,
      fieldProtocol:
        "Before signing a lease, collect two written interior/equipment quotes and negotiate deposit/fit-out scope until post-opening cash reserve is at least 10% of total budget."
    });
  }

  if (firstPosTx !== null) {
    measurements.push({
      priority: reserveGate.passed ? 1 : 2,
      category: "daily_transaction_boundary",
      title: "On-Site Foot-Traffic & Order-Count Tally Against Break-Even Boundary",
      metricToMeasure: "Daily Transactions (Cup/Order Volume per Day)",
      thresholdText:
        txGap > 0
          ? `Assumed ${inputs.transactionsPerDay} tx/day is ${txGap} tx/day below the first positive-cash integer boundary (${firstPosTx} tx/day).`
          : `Assumed ${inputs.transactionsPerDay} tx/day clears the first positive-cash integer boundary (${firstPosTx} tx/day) by ${Math.abs(txGap)} tx/day.`,
      fieldProtocol: `Conduct 3 weekday + 2 weekend tally sessions (08:00-10:00, 11:30-14:00, 15:00-18:00) at 2 comparable storefront blocks to verify whether >= ${firstPosTx} transactions/day is realistic at ${inputs.avgTicket.toLocaleString("en-US")} KRW average ticket.`
    });
  }

  measurements.push({
    priority: measurements.length + 1,
    category: "fixed_and_variable_cost_check",
    title: "Verify Fixed Lease Outflows & Recipe Variable-Cost Ratio",
    metricToMeasure: "Monthly Fixed Outflows & Ingredient/Packaging Ratio",
    thresholdText: `Current monthly fixed cost is ${monthlyMetrics.monthlyFixedCost.toLocaleString("en-US")} KRW and variable-cost ratio is ${(inputs.variableCostRatio * 100).toFixed(1)}%.`,
    fieldProtocol:
      "Confirm common-area maintenance fees, utility base charges, and espresso/milk/cup unit costs from actual supplier price sheets."
  });

  return {
    primaryMeasurement: measurements[0],
    checklist: measurements,
    humanDecisionOptions: [
      {
        code: "hold",
        label: "Hold Lease Signing",
        whenAppropriate:
          !reserveGate.passed || cashBoundaries.firstNegativeCashMonth !== null
            ? "Recommended for review when reserve gate (<10% budget) fails or cash turns negative within 36 months."
            : "Use if lease terms or capex quotes are still unverified."
      },
      {
        code: "measure",
        label: "Measure Before Signing",
        whenAppropriate: `Use while conducting on-site transaction counts against the ${firstPosTx ?? "N/A"} tx/day positive-cash boundary.`
      },
      {
        code: "proceed",
        label: "Proceed to Lease Review",
        whenAppropriate:
          "Human owner choice only after independent field measurements confirm reserve gate and daily volume boundary."
      }
    ],
    decisionAuthorityNote:
      "Human owner decision only. Neither the deterministic engine nor Gemini issues a financial or lease-signing verdict."
  };
}
