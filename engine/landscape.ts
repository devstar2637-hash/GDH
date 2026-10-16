// engine/landscape.ts — Lane A1. Survival landscape, Pareto non-dominated set,
// lexicographic #1 leader selection, and 10,000-mode (500 families x 20) saturation curve (AT-06, AT-09, AT-16).

import type {
  Constraints,
  DeathCause,
  RunResult,
  SaturationPoint,
  Scenario,
  StoreDesign,
  VariantResult,
} from "../shared/types.js";
import { checkStoreConstraints } from "./constraints.js";
import { createPrng, randRange } from "./prng.js";
import { simulateBatch, type SimulationOptions } from "./simulator.js";

/**
 * Lexicographic comparator for VariantResult (SPEC.md §5 & Q4):
 * 1. survivedMonths descending
 * 2. cumPnL descending (integer KRW)
 * 3. cashMin descending (integer KRW)
 * 4. designId ascending (deterministic string tie-breaker)
 */
export function compareVariantsLexicographic(a: VariantResult, b: VariantResult): number {
  if (a.constraintsOk !== b.constraintsOk) {
    return a.constraintsOk ? -1 : 1;
  }
  if (b.survivedMonths !== a.survivedMonths) {
    return b.survivedMonths - a.survivedMonths;
  }
  const pnlA = Math.round(a.cumPnL ?? 0);
  const pnlB = Math.round(b.cumPnL ?? 0);
  if (pnlB !== pnlA) {
    return pnlB - pnlA;
  }
  const minA = Math.round(a.cashMin);
  const minB = Math.round(b.cashMin);
  if (minB !== minA) {
    return minB - minA;
  }
  return a.designId.localeCompare(b.designId);
}

/**
 * Pick the deterministic #1 design from a batch of VariantResults.
 */
export function pickLeaderVariant(results: readonly VariantResult[]): VariantResult | null {
  let best: VariantResult | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.constraintsOk) continue;
    if (best === null || compareVariantsLexicographic(r, best) < 0) {
      best = r;
    }
  }
  return best;
}

/**
 * Compute Pareto non-dominated set on (survivedMonths UP, cumPnL UP, cashMin UP)
 * and mutate `nonDominated` flag in-place on `results`.
 */
export function markParetoNonDominated(results: VariantResult[]): number {
  const validIndices: number[] = [];
  for (let i = 0; i < results.length; i++) {
    results[i].nonDominated = false;
    if (results[i].constraintsOk) {
      validIndices.push(i);
    }
  }

  // Sort by survivedMonths desc, cumPnL desc, cashMin desc
  validIndices.sort((ia, ib) => compareVariantsLexicographic(results[ia], results[ib]));

  // In 3D (survivedMonths, cumPnL, cashMin), once sorted by survivedMonths desc & cumPnL desc,
  // a candidate is dominated iff an earlier candidate has >= survivedMonths, >= cumPnL, and >= cashMin
  // (with at least one strict >). Since survivedMonths only takes values 0..36, we can check against
  // the current Pareto front efficiently (front size is typically 10..80).
  const frontIndices: number[] = [];
  for (let k = 0; k < validIndices.length; k++) {
    const idx = validIndices[k];
    const cand = results[idx];
    const sC = cand.survivedMonths;
    const pC = Math.round(cand.cumPnL ?? 0);
    const mC = Math.round(cand.cashMin);

    let dominated = false;
    for (let f = 0; f < frontIndices.length; f++) {
      const dom = results[frontIndices[f]];
      const sD = dom.survivedMonths;
      const pD = Math.round(dom.cumPnL ?? 0);
      const mD = Math.round(dom.cashMin);
      if (sD >= sC && pD >= pC && mD >= mC && (sD > sC || pD > pC || mD > mC)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      cand.nonDominated = true;
      frontIndices.push(idx);
    }
  }

  return frontIndices.length;
}

/**
 * Count distinct failure families (excluding SURVIVED_36M and CONSTRAINT_REJECT).
 */
export function countDistinctFailureFamilies(results: readonly VariantResult[]): Set<string> {
  const families = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.constraintsOk || r.deathMonth === null) continue;
    if (r.failureFamily && r.failureFamily !== "SURVIVED_36M" && r.failureFamily !== "CONSTRAINT_REJECT") {
      families.add(r.failureFamily);
    }
  }
  return families;
}

/**
 * Build landscape scatter payload and death cause counts for RunResult.
 */
export function buildLandscapeSummary(
  designs: readonly StoreDesign[],
  results: VariantResult[]
): {
  landscape: RunResult["landscape"];
  deathCauses: Record<DeathCause, number>;
  nonDominatedCount: number;
  failureFamilyCount: number;
  leader: VariantResult | null;
} {
  const nonDominatedCount = markParetoNonDominated(results);
  const failureFamilies = countDistinctFailureFamilies(results);
  const leader = pickLeaderVariant(results);

  const designById = new Map<string, StoreDesign>();
  for (let i = 0; i < designs.length; i++) {
    designById.set(designs[i].id, designs[i]);
  }

  const deathCauses: Record<DeathCause, number> = {
    rent: 0,
    capacity: 0,
    offseason: 0,
    fitout_overrun: 0,
    demand: 0,
    reserve_breach: 0,
    other: 0,
    cashBelowZero: 0,
    reserveBreach: 0,
    constraintReject: 0,
  };

  const points: RunResult["landscape"]["points"] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.constraintsOk) {
      continue;
    }
    if (r.deathCause) {
      deathCauses[r.deathCause] = (deathCauses[r.deathCause] ?? 0) + 1;
    }
    const d = designById.get(r.designId);
    points.push({
      designId: r.designId,
      survivedMonths: r.survivedMonths,
      x: r.survivedMonths,
      y: Math.round(r.cumPnL ?? 0),
      cashMin: Math.round(r.cashMin),
      cumPnL: Math.round(r.cumPnL ?? 0),
      failureFamily: r.failureFamily,
      nonDominated: r.nonDominated,
      familyId: d?.familyId ?? r.designId.split("-var-")[0],
    });
  }

  return {
    landscape: {
      axis: ["survivedMonths", "cumPnL"],
      points,
    },
    deathCauses,
    nonDominatedCount,
    failureFamilyCount: failureFamilies.size,
    leader,
  };
}

/**
 * Expand 500 AI design families into 10,000 variants (20 deterministic variations per family)
 * with seeded jitter within +/-15%, strictly respecting budget and reserve >= 10% (SPEC.md §7, AT-16).
 */
export function expandDesignFamiliesTo10k(
  families: readonly StoreDesign[],
  constraints: Constraints,
  variationsPerFamily = 20
): StoreDesign[] {
  const out: StoreDesign[] = [];
  const maxInitialInvest = Math.floor(
    constraints.budgetKrw * (1 - Math.max(0.10, constraints.reserveRatioMin))
  );

  for (let f = 0; f < families.length; f++) {
    const base = families[f];
    const familyId = `fam-${String(f + 1).padStart(3, "0")}`;

    for (let v = 0; v < variationsPerFamily; v++) {
      if (v === 0) {
        out.push({
          ...base,
          id: `${familyId}-var-01`,
          familyId,
        });
        continue;
      }

      const subSeed = (constraints.seed ^ ((f + 1) * 7919 + v * 104729)) >>> 0;
      const prng = createPrng(subSeed);

      const areaM2 = Math.max(12, Math.round(base.floorAreaM2 * randRange(prng, 0.88, 1.12) * 10) / 10);
      const maxSeatsForArea = Math.floor(areaM2 * 1.8);
      const seats = Math.max(
        0,
        Math.min(maxSeatsForArea, Math.round(base.seats * randRange(prng, 0.85, 1.15)))
      );

      let depositVal = Math.max(5_000_000, Math.round(base.deposit.value * randRange(prng, 0.86, 1.14) / 100_000) * 100_000);
      let fitoutVal = Math.max(10_000_000, Math.round(base.fitoutCost.value * randRange(prng, 0.86, 1.14) / 100_000) * 100_000);
      if (depositVal + fitoutVal > maxInitialInvest) {
        const scale = (maxInitialInvest - 500_000) / (depositVal + fitoutVal);
        depositVal = Math.floor((depositVal * scale) / 100_000) * 100_000;
        fitoutVal = Math.floor((fitoutVal * scale) / 100_000) * 100_000;
      }

      const rentVal = Math.max(
        800_000,
        Math.round((base.monthlyRent.value * randRange(prng, 0.85, 1.15)) / 50_000) * 50_000
      );
      const staffFte = Math.max(0.5, Math.round(base.staffFte * randRange(prng, 0.85, 1.15) * 10) / 10);
      const avgTicketKrw = Math.max(
        2500,
        Math.round((base.avgTicketKrw * randRange(prng, 0.88, 1.12)) / 100) * 100
      );
      const makeTimeSec = Math.max(35, Math.round(base.makeTimeSec * randRange(prng, 0.85, 1.15)));
      const cupsPerDayBase = Math.max(
        60,
        Math.round((base.cupsPerDayBase ?? 185) * randRange(prng, 0.85, 1.15))
      );
      const cogsRatio = Math.min(
        0.55,
        Math.max(0.22, Number(((base.cogsRatio ?? 0.32) * randRange(prng, 0.90, 1.10)).toFixed(3)))
      );

      const candidate: StoreDesign = {
        ...base,
        id: `${familyId}-var-${String(v + 1).padStart(2, "0")}`,
        familyId,
        seats,
        floorAreaM2: areaM2,
        deposit: { value: depositVal, source: base.deposit.source },
        monthlyRent: { value: rentVal, source: base.monthlyRent.source },
        fitoutCost: { value: fitoutVal, source: base.fitoutCost.source },
        staffFte,
        avgTicketKrw,
        makeTimeSec,
        cupsPerDayBase,
        cogsRatio,
      };

      // Guarantee AT-03 compliance on deterministic expansion
      const check = checkStoreConstraints(candidate, constraints);
      out.push(check.ok ? candidate : { ...base, id: candidate.id, familyId });
    }
  }

  return out;
}

/**
 * Compute saturation curve at N = 1,000 / 3,000 / 10,000 from an already simulated VariantResult[] batch (AT-16).
 */
export function computeSaturationCurveFromResults(
  results: readonly VariantResult[]
): SaturationPoint[] {
  const valid = results.filter((r) => r.constraintsOk);
  const checkpoints: (1000 | 3000 | 10000)[] = [1000, 3000, 10000];
  const curve: SaturationPoint[] = [];

  for (const n of checkpoints) {
    const slice = valid.slice(0, Math.min(n, valid.length)).map((r) => ({ ...r }));
    const nonDom = markParetoNonDominated(slice);
    const fams = countDistinctFailureFamilies(slice).size;
    curve.push({
      n,
      failureFamilies: fams,
      nonDominated: nonDom,
    });
  }

  return curve;
}

/**
 * Compute saturation curve at N = 1,000 / 3,000 / 10,000 from a 10,000-variant batch (AT-16).
 */
export function computeSaturationCurve(
  designs10k: readonly StoreDesign[],
  scenario: Scenario,
  constraints: Constraints,
  options?: SimulationOptions
): {
  results10k: VariantResult[];
  curve: SaturationPoint[];
  elapsedMs: number;
} {
  const t0 = performance.now();
  const results10k = simulateBatch(designs10k, scenario, constraints, {
    ...options,
    keepAllMonths: false,
    sampleMonthLimit: 30,
  });

  const curve = computeSaturationCurveFromResults(results10k);
  markParetoNonDominated(results10k);
  const elapsedMs = performance.now() - t0;

  return {
    results10k,
    curve,
    elapsedMs,
  };
}
