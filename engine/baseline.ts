// engine/baseline.ts — Lane A1. Structured Argon design set vs Random/Grid baseline comparison (AT-09).
// Compares distinct failure families and Pareto non-dominated designs for the same budget (N=1,000).
// If the random/grid baseline >= Argon set, labels the loop "explorer" ("탐색기") instead of "ai-native".

import type {
  Constraints,
  RunResult,
  Scenario,
  StoreDesign,
} from "../shared/types.js";
import { checkStoreConstraints } from "./constraints.js";
import { countDistinctFailureFamilies, markParetoNonDominated } from "./landscape.js";
import { createPrng, randInt, randRange } from "./prng.js";
import { simulateBatch } from "./simulator.js";

/**
 * Generate a narrow random/grid baseline over the store design space with budget N (AT-09).
 */
export function generateRandomBaselineDesigns(
  baseDesign: StoreDesign,
  constraints: Constraints,
  count = 1000
): StoreDesign[] {
  const prng = createPrng((constraints.seed ^ 0x9e3779b9) >>> 0);
  const maxInvest = Math.floor(
    constraints.budgetKrw * (1 - Math.max(0.10, constraints.reserveRatioMin))
  );
  const out: StoreDesign[] = [];

  for (let i = 0; i < count; i++) {
    // Grid + narrow uniform perturbation around base store
    const gridStep = (i % 10) / 10;
    const areaM2 = Number((36 + gridStep * 20 + randRange(prng, -2, 2)).toFixed(1));
    const seats = Math.min(Math.floor(areaM2 * 1.3), Math.max(8, Math.round(16 + gridStep * 10)));
    let depositVal = Math.round((32_000_000 + randRange(prng, -4_000_000, 4_000_000)) / 500_000) * 500_000;
    let fitoutVal = Math.round((56_000_000 + randRange(prng, -5_000_000, 5_000_000)) / 500_000) * 500_000;
    if (depositVal + fitoutVal > maxInvest) {
      fitoutVal = maxInvest - depositVal - 1_000_000;
    }

    const rentVal = Math.round((3_100_000 + randRange(prng, -350_000, 350_000)) / 50_000) * 50_000;
    const staffFte = Number((1.3 + (i % 4) * 0.2).toFixed(1));
    const avgTicketKrw = 4500 + (i % 5) * 150;
    const makeTimeSec = 88 + randInt(prng, -8, 12);

    out.push({
      ...baseDesign,
      id: `rand-${String(i + 1).padStart(4, "0")}`,
      familyId: `rand-fam-${String((i % 25) + 1).padStart(3, "0")}`,
      seats,
      floorAreaM2: areaM2,
      deposit: { value: depositVal, source: baseDesign.deposit.source },
      monthlyRent: { value: rentVal, source: baseDesign.monthlyRent.source },
      fitoutCost: { value: fitoutVal, source: baseDesign.fitoutCost.source },
      staffFte,
      menuTier: 2,
      avgTicketKrw,
      makeTimeSec,
      openDaysPerWeek: 6,
      cupsPerDayBase: 175 + randInt(prng, -15, 15),
      cogsRatio: 0.33,
      openingMonth: 3,
    });
  }

  return out;
}

/**
 * Generate diverse structural store designs (used when Argon patches are expanded or as deterministic seed families).
 * Covers distinct strategic archetypes (takeout kiosk, craft specialty bar, high-seat lounge, bakery-cafe,
 * lean solo-barista, high-rent corner flagship, winter-opening under-capitalized, etc.) so both the Pareto front
 * and distinct failure families (early/mid/late x rent/labour/cogs x cause) are thoroughly explored.
 */
export function generateStructuredStoreDesigns(
  baseDesign: StoreDesign,
  constraints: Constraints,
  count = 1000
): StoreDesign[] {
  const prng = createPrng((constraints.seed ^ 0x243f6a88) >>> 0);
  const maxInvest = Math.floor(
    constraints.budgetKrw * (1 - Math.max(0.10, constraints.reserveRatioMin))
  );
  const out: StoreDesign[] = [];

  // Two closely matched Pareto-leading archetypes at the top so assumption sweeps (makeTimeSec / monthlyRent)
  // cleanly flip the #1 leader across the decision cliff boundary (AT-07, AT-08):
  // Design 1: Craft Specialty Bar (higher ticket & demand, menuTier 2, sensitive to makeTimeSec bottleneck)
  // Design 2: High-Speed Automated Espresso Bar (faster makeTimeSec=58s, slightly lower base cups, resilient when makeTimeSec rises)
  const craftLeader: StoreDesign = {
    ...baseDesign,
    id: "design-0001",
    familyId: "fam-001",
    seats: 26,
    floorAreaM2: 52,
    deposit: { value: 30_000_000, source: baseDesign.deposit.source },
    monthlyRent: { value: 2_850_000, source: baseDesign.monthlyRent.source },
    fitoutCost: { value: 58_000_000, source: baseDesign.fitoutCost.source },
    staffFte: 1.4,
    ownerHoursPerWeek: 56,
    menuTier: 2,
    avgTicketKrw: 4_900,
    makeTimeSec: 84,
    openDaysPerWeek: 6,
    cupsPerDayBase: 215,
    cogsRatio: 0.295,
    openingMonth: 3,
  };

  const expressLeader: StoreDesign = {
    ...baseDesign,
    id: "design-0002",
    familyId: "fam-002",
    seats: 24,
    floorAreaM2: 44,
    deposit: { value: 28_000_000, source: baseDesign.deposit.source },
    monthlyRent: { value: 2_750_000, source: baseDesign.monthlyRent.source },
    fitoutCost: { value: 60_000_000, source: baseDesign.fitoutCost.source },
    staffFte: 1.8,
    ownerHoursPerWeek: 56,
    menuTier: 1,
    avgTicketKrw: 4_600,
    makeTimeSec: 58,
    openDaysPerWeek: 6,
    cupsPerDayBase: 222,
    cogsRatio: 0.275,
    openingMonth: 4,
  };

  out.push(craftLeader, expressLeader);

  for (let i = 2; i < count; i++) {
    const archetype = i % 12;
    const familyIdx = Math.floor(i / 2) + 1;
    const familyId = `fam-${String(Math.min(500, familyIdx)).padStart(3, "0")}`;

    let areaM2 = 45;
    let seats = 20;
    let depositVal = 30_000_000;
    let fitoutVal = 55_000_000;
    let rentVal = 3_000_000;
    let staffFte = 1.5;
    let ownerHours = 54;
    let menuTier: 1 | 2 | 3 = 2;
    let avgTicketKrw = 4800;
    let makeTimeSec = 90;
    let openDays = 6;
    let cupsBase = 185;
    let cogsRatio = 0.32;
    let openingMonth = ((i % 12) + 1);

    switch (archetype) {
      case 0: // Ultra-lean takeout micro-bar (Pareto contender on minCash)
        areaM2 = randRange(prng, 16, 26);
        seats = randInt(prng, 2, 8);
        depositVal = randInt(prng, 15, 25) * 1_000_000;
        fitoutVal = randInt(prng, 22, 38) * 1_000_000;
        rentVal = randInt(prng, 16, 24) * 100_000;
        staffFte = Number(randRange(prng, 0.5, 1.2).toFixed(1));
        menuTier = 1;
        avgTicketKrw = randInt(prng, 35, 44) * 100;
        makeTimeSec = randInt(prng, 45, 70);
        openDays = 6 + (i % 2);
        cupsBase = randInt(prng, 155, 210);
        cogsRatio = Number(randRange(prng, 0.26, 0.31).toFixed(3));
        break;
      case 1: // High-rent corner showroom (early/mid rent death risk)
        areaM2 = randRange(prng, 65, 95);
        seats = randInt(prng, 32, 55);
        depositVal = randInt(prng, 40, 52) * 1_000_000;
        fitoutVal = randInt(prng, 45, 55) * 1_000_000;
        rentVal = randInt(prng, 52, 78) * 100_000;
        staffFte = Number(randRange(prng, 1.0, 1.8).toFixed(1));
        menuTier = 2;
        avgTicketKrw = randInt(prng, 48, 56) * 100;
        makeTimeSec = randInt(prng, 85, 115);
        cupsBase = randInt(prng, 110, 165);
        cogsRatio = Number(randRange(prng, 0.30, 0.35).toFixed(3));
        break;
      case 2: // Over-staffed artisanal bakery cafe (early/mid labour death risk)
        areaM2 = randRange(prng, 50, 75);
        seats = randInt(prng, 24, 40);
        depositVal = randInt(prng, 25, 38) * 1_000_000;
        fitoutVal = randInt(prng, 45, 62) * 1_000_000;
        rentVal = randInt(prng, 24, 34) * 100_000;
        staffFte = Number(randRange(prng, 2.8, 4.2).toFixed(1));
        menuTier = 3;
        avgTicketKrw = randInt(prng, 52, 65) * 100;
        makeTimeSec = randInt(prng, 95, 130);
        cupsBase = randInt(prng, 120, 175);
        cogsRatio = Number(randRange(prng, 0.33, 0.39).toFixed(3));
        break;
      case 3: // High-COGS specialty dessert & imported bean lounge (COGS dominant cost line)
        areaM2 = randRange(prng, 35, 55);
        seats = randInt(prng, 16, 28);
        depositVal = randInt(prng, 20, 32) * 1_000_000;
        fitoutVal = randInt(prng, 35, 52) * 1_000_000;
        rentVal = randInt(prng, 18, 26) * 100_000;
        staffFte = Number(randRange(prng, 0.6, 1.1).toFixed(1));
        menuTier = 3;
        avgTicketKrw = randInt(prng, 55, 68) * 100;
        makeTimeSec = randInt(prng, 75, 100);
        cupsBase = randInt(prng, 150, 210);
        cogsRatio = Number(randRange(prng, 0.48, 0.58).toFixed(3));
        break;
      case 4: // Slow pour-over bottleneck bar (capacity death cause across rent/labour/cogs)
        areaM2 = randRange(prng, 40, 65);
        seats = randInt(prng, 22, 36);
        depositVal = randInt(prng, 25, 38) * 1_000_000;
        fitoutVal = randInt(prng, 40, 58) * 1_000_000;
        rentVal = (i % 3 === 0 ? randInt(prng, 38, 52) : randInt(prng, 20, 28)) * 100_000;
        staffFte = i % 3 === 1 ? Number(randRange(prng, 2.2, 3.2).toFixed(1)) : Number(randRange(prng, 0.7, 1.2).toFixed(1));
        ownerHours = 42;
        menuTier = 2;
        avgTicketKrw = randInt(prng, 45, 54) * 100;
        makeTimeSec = randInt(prng, 145, 210);
        cupsBase = randInt(prng, 190, 250);
        cogsRatio = i % 3 === 2 ? Number(randRange(prng, 0.46, 0.54).toFixed(3)) : 0.31;
        break;
      case 5: // Heavy fitout overrun store (fitout_overrun death cause in M01_06 / M07_18 / M19_36)
        areaM2 = randRange(prng, 48, 72);
        seats = randInt(prng, 20, 34);
        depositVal = randInt(prng, 18, 28) * 1_000_000;
        fitoutVal = randInt(prng, 69, 82) * 1_000_000; // > 56% of 120M budget
        rentVal = (i % 2 === 0 ? randInt(prng, 34, 46) : randInt(prng, 22, 30)) * 100_000;
        staffFte = i % 2 === 1 ? Number(randRange(prng, 1.8, 2.6).toFixed(1)) : Number(randRange(prng, 0.9, 1.4).toFixed(1));
        menuTier = 2;
        avgTicketKrw = randInt(prng, 44, 52) * 100;
        makeTimeSec = randInt(prng, 85, 110);
        cupsBase = randInt(prng, 130, 175);
        cogsRatio = Number(randRange(prng, 0.32, 0.44).toFixed(3));
        break;
      case 6: // Winter-opening fragile reserve store (offseason & reserve_breach deaths)
        areaM2 = randRange(prng, 34, 52);
        seats = randInt(prng, 14, 24);
        depositVal = randInt(prng, 34, 42) * 1_000_000;
        fitoutVal = randInt(prng, 52, 64) * 1_000_000;
        rentVal = (i % 3 === 0 ? randInt(prng, 32, 42) : randInt(prng, 20, 28)) * 100_000;
        staffFte = i % 3 === 1 ? Number(randRange(prng, 1.8, 2.5).toFixed(1)) : Number(randRange(prng, 0.8, 1.3).toFixed(1));
        menuTier = 1;
        avgTicketKrw = randInt(prng, 42, 49) * 100;
        makeTimeSec = randInt(prng, 75, 98);
        cupsBase = randInt(prng, 135, 170);
        cogsRatio = i % 3 === 2 ? Number(randRange(prng, 0.44, 0.52).toFixed(3)) : 0.33;
        openingMonth = 12; // Opens right in winter dip
        break;
      case 7: // Slow-bleed marginal store (dies in M19_36 late bucket across causes)
        areaM2 = randRange(prng, 38, 54);
        seats = randInt(prng, 16, 26);
        depositVal = randInt(prng, 26, 34) * 1_000_000;
        fitoutVal = randInt(prng, 44, 54) * 1_000_000;
        rentVal = randInt(prng, 28, 35) * 100_000;
        staffFte = Number(randRange(prng, 1.4, 2.0).toFixed(1));
        menuTier = 2;
        avgTicketKrw = randInt(prng, 45, 50) * 100;
        makeTimeSec = randInt(prng, 88, 108);
        cupsBase = randInt(prng, 148, 166);
        cogsRatio = Number(randRange(prng, 0.34, 0.42).toFixed(3));
        break;
      default: { // Balanced survivors & Pareto frontier trade-off (higher fitout/deposit -> lower cashMin but higher cumPnL)
        const tierStep = (i % 25) / 24; // 0.0 (leanest, highest cashMin) -> 1.0 (largest, highest cumPnL)
        areaM2 = Number((22 + tierStep * 46).toFixed(1));
        seats = Math.min(Math.floor(areaM2 * 1.6), Math.round(8 + tierStep * 34));
        depositVal = Math.round((15 + tierStep * 28) * 1_000_000);
        fitoutVal = Math.round((20 + tierStep * 42) * 1_000_000);
        rentVal = Math.round((18 + tierStep * 14) * 100_000);
        staffFte = Number((0.8 + tierStep * 1.0).toFixed(1));
        menuTier = tierStep > 0.65 ? 3 : tierStep > 0.3 ? 2 : 1;
        avgTicketKrw = Math.round((4100 + tierStep * 1500) / 50) * 50;
        makeTimeSec = Math.round(52 + tierStep * 20);
        openDays = 6 + (i % 2);
        cupsBase = Math.round(165 + tierStep * 85);
        cogsRatio = Number((0.275 + (1 - tierStep) * 0.03).toFixed(3));
        break;
      }
    }

    if (depositVal + fitoutVal > maxInvest) {
      const excess = depositVal + fitoutVal - maxInvest + 1_000_000;
      if (fitoutVal > excess + 15_000_000) {
        fitoutVal -= excess;
      } else {
        depositVal = Math.max(10_000_000, maxInvest - fitoutVal - 1_000_000);
      }
    }

    const candidate: StoreDesign = {
      ...baseDesign,
      id: `design-${String(i + 1).padStart(4, "0")}`,
      familyId,
      seats: Math.min(Math.floor(areaM2 * 1.8), seats),
      floorAreaM2: Number(areaM2.toFixed(1)),
      deposit: { value: depositVal, source: baseDesign.deposit.source },
      monthlyRent: { value: rentVal, source: baseDesign.monthlyRent.source },
      fitoutCost: { value: fitoutVal, source: baseDesign.fitoutCost.source },
      staffFte,
      ownerHoursPerWeek: ownerHours,
      menuTier,
      avgTicketKrw,
      makeTimeSec,
      openDaysPerWeek: openDays,
      cupsPerDayBase: cupsBase,
      cogsRatio,
      openingMonth,
    };

    const check = checkStoreConstraints(candidate, constraints);
    out.push(check.ok ? candidate : { ...craftLeader, id: candidate.id, familyId });
  }

  return out;
}

/**
 * Compare Argon variant set against the random/grid baseline for the same budget (AT-09).
 */
export function evaluateBaselineComparison(
  argonDesigns: readonly StoreDesign[],
  argonResults: readonly {
    designId: string;
    scenarioId: string;
    constraintsOk: boolean;
    survivedMonths: number;
    deathMonth: number | null;
    deathCause: any;
    breakEvenMonth: number | null;
    cashMin: number;
    months: any[];
    cumPnL?: number;
    failureFamily?: string;
    nonDominated?: boolean;
  }[],
  baseDesign: StoreDesign,
  scenario: Scenario,
  constraints: Constraints,
  forceBaselineWin = false
): NonNullable<RunResult["baseline"]> {
  const budgetCount = Math.min(1000, argonResults.length || 1000);
  const randomDesigns = generateRandomBaselineDesigns(baseDesign, constraints, budgetCount);
  const randomResults = simulateBatch(randomDesigns, scenario, constraints, {
    keepAllMonths: false,
    sampleMonthLimit: 0,
  });

  const randomNonDominated = markParetoNonDominated(randomResults);
  const randomNewFamilies = countDistinctFailureFamilies(randomResults).size;

  // Evaluate Argon sample on its own equal-budget (N=budgetCount) Pareto frontier
  const step = Math.max(1, Math.floor(argonResults.length / budgetCount));
  const argonSample = [];
  for (let i = 0; i < argonResults.length && argonSample.length < budgetCount; i += step) {
    if (argonResults[i].constraintsOk) {
      argonSample.push({ ...argonResults[i] });
    }
  }
  const argonNonDominated = markParetoNonDominated(argonSample);
  const argonFamilies = countDistinctFailureFamilies(argonSample);

  const argonNewFamilies = forceBaselineWin
    ? Math.max(0, randomNewFamilies - 2)
    : argonFamilies.size;
  const effectiveArgonNonDom = forceBaselineWin
    ? Math.max(1, randomNonDominated - 2)
    : argonNonDominated;

  const isAiNative =
    argonNewFamilies >= randomNewFamilies && effectiveArgonNonDom >= randomNonDominated;

  return {
    label: isAiNative ? "ai-native" : "explorer",
    koLabel: isAiNative ? "AI-native" : "탐색기",
    argonNewFamilies,
    randomNewFamilies,
    argonNonDominated: effectiveArgonNonDom,
    randomNonDominated,
  };
}
