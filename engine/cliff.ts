// engine/cliff.ts — Lane A1. Decision Cliff (AT-07) and Next Field Measurement (AT-08).
// Proposes coarse brackets on a bounded subset, then checks both endpoints and
// a control against every valid design. This does not establish a global minimum
// or an exact continuous threshold; an unverified proposal returns null.

import type {
  Cliff,
  Constraints,
  NextMeasurement,
  Scenario,
  StoreDesign,
} from "../shared/types.js";
import { compareVariantsLexicographic, pickLeaderVariant } from "./landscape.js";
import { checkStoreConstraints } from "./constraints.js";
import { simulateBatch, type SimulationOptions } from "./simulator.js";

export type CliffVariableKey =
  | "makeTimeSec"
  | "monthlyRent"
  | "avgTicketKrw"
  | "cupsPerDayBase"
  | "staffFte"
  | "cogsRatio"
  | "seasonalityAmplitude";

interface AssumptionSpec {
  key: CliffVariableKey;
  unit: string;
  uncertaintyWidth: number; // SPEC §5: public range ~0.12, onsite ~0.05, assumed ~0.30
  whyKo: string;
  howToMeasureOnsiteKo: (boundaryVal: number) => string;
  getBaseValue: (baseDesign: StoreDesign) => number;
  applyDelta: (
    designs: readonly StoreDesign[],
    baseDesign: StoreDesign,
    delta: number
  ) => { designs: StoreDesign[]; options: SimulationOptions };
}

const SWEEP_STEPS: readonly number[] = [
  -0.30, -0.24, -0.18, -0.12, -0.06, 0.0, 0.06, 0.12, 0.18, 0.24, 0.30,
];

const ASSUMPTION_SPECS: readonly AssumptionSpec[] = [
  {
    key: "makeTimeSec",
    unit: "sec",
    uncertaintyWidth: 0.30,
    whyKo:
      "피크타임 음료 1잔 제조시간이 경계를 넘으면 바(Bar) 병목으로 일일 최대 판매잔수가 막혀 고마진 수제 메뉴 설계 대신 고속 추출 설계로 1위가 역전됩니다.",
    howToMeasureOnsiteKo: (boundaryVal: number) =>
      `7일간 오전 11:30~13:30 피크타임에 유사 성수동 카페 3곳에서 주문 후 픽업까지 실제 음료 제조시간(초)을 50잔 스톱워치로 실측하여 ${boundaryVal}초 이하인지 확인하세요.`,
    getBaseValue: (d) => d.makeTimeSec,
    applyDelta: (designs, baseDesign, delta) => {
      // Shift site-wide peak workflow complexity / make-time target:
      // Manual/craft designs (menuTier >= 2, lower staffFte) experience steeper bottleneck pressure when workflow time rises.
      const shifted = designs.map((d) => {
        const craftSensitivity = d.menuTier >= 2 && d.staffFte <= 1.6 ? 1.35 : 0.65;
        const effectiveMult = Math.max(0.4, 1 + delta * craftSensitivity);
        return {
          ...d,
          makeTimeSec: Math.max(1, Math.round(d.makeTimeSec * effectiveMult)),
        };
      });
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
  {
    key: "monthlyRent",
    unit: "KRW",
    uncertaintyWidth: 0.15,
    whyKo:
      "월 임대료 호가가 경계를 넘으면 고정비 레버리지로 인해 대형 홀 좌석 설계의 현금흐름이 급격히 악화되어 소형 테이크아웃 중심 설계로 1위가 뒤집힙니다.",
    howToMeasureOnsiteKo: (boundaryVal: number) =>
      `7일간 성수동 대상 블럭 공인중개소 3곳에서 관리비·부가세 포함 실계약 월세 호가를 받아 월 ${boundaryVal.toLocaleString()}원 이하로 특약 조율이 가능한지 확인하세요.`,
    getBaseValue: (d) => d.monthlyRent.value,
    applyDelta: (designs, _baseDesign, delta) => {
      const shifted = designs.map((d) => {
        const areaSensitivity = d.floorAreaM2 >= 45 ? 1.25 : 0.75;
        const nextRent = Math.max(
          0,
          Math.round(d.monthlyRent.value * (1 + delta * areaSensitivity))
        );
        return {
          ...d,
          monthlyRent: { ...d.monthlyRent, value: nextRent },
        };
      });
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
  {
    key: "cupsPerDayBase",
    unit: "cups/day",
    uncertaintyWidth: 0.25,
    whyKo:
      "상권 일평균 기본 수요(잔/일)가 경계 아래로 내려가면 다인력·고회전 설계가 인건비를 감당하지 못해 1인 바리스타 저비용 설계로 1위가 바뀝니다.",
    howToMeasureOnsiteKo: (boundaryVal: number) =>
      `7일간(평일 5일·주말 2일) 후보 점포 반경 100m 내 경쟁 카페 2곳의 시간대별 영수증 번호 차이(또는 테이크아웃 컵 출고 수)를 기록해 일평균 ${boundaryVal}잔 이상인지 실측하세요.`,
    getBaseValue: (d) => d.cupsPerDayBase ?? 185,
    applyDelta: (designs, _baseDesign, delta) => {
      const shifted = designs.map((d) => {
        const base = d.cupsPerDayBase ?? 185;
        return {
          ...d,
          cupsPerDayBase: Math.max(0, Math.round(base * (1 + delta))),
        };
      });
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
  {
    key: "avgTicketKrw",
    unit: "KRW",
    uncertaintyWidth: 0.20,
    whyKo:
      "평균 객단가가 경계를 기준으로 변하면 가격 탄력성과 원가율 구조 차이로 인해 디저트 결합형(Tier 3)과 음료 단품형(Tier 1/2) 간 1위 설계가 역전됩니다.",
    howToMeasureOnsiteKo: (boundaryVal: number) =>
      `7일간 인접 카페 5곳의 아메리카노·시그니처 음료·베이커리 세트의 실제 주문 비중을 관찰하여 평균 객단가 ${boundaryVal.toLocaleString()}원 달성 가능 여부를 실측하세요.`,
    getBaseValue: (d) => d.avgTicketKrw,
    applyDelta: (designs, _baseDesign, delta) => {
      const shifted = designs.map((d) => ({
        ...d,
        avgTicketKrw: Math.max(1, Math.round(d.avgTicketKrw * (1 + delta * 0.5))),
      }));
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
  {
    key: "cogsRatio",
    unit: "ratio",
    uncertaintyWidth: 0.15,
    whyKo:
      "원두·우유·부자재 원가율이 경계를 넘으면 마진 폭이 좁은 저가 다량 판매 설계보다 고단가 스페셜티 설계가 우위를 점합니다.",
    howToMeasureOnsiteKo: (boundaryVal: number) =>
      `7일간 원두 로스터리 및 우유·컵 도매상 3곳에서 실견적서를 받아 레시피 기준 잔당 원가율이 ${(boundaryVal * 100).toFixed(1)}% 이하인지 검증하세요.`,
    getBaseValue: (d) => d.cogsRatio ?? 0.32,
    applyDelta: (designs, _baseDesign, delta) => {
      const shifted = designs.map((d) => {
        const base = d.cogsRatio ?? 0.32;
        return {
          ...d,
          cogsRatio: Math.min(1, Math.max(0, Number((base * (1 + delta * 0.4)).toFixed(4)))),
        };
      });
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
  {
    key: "staffFte", unit: "FTE", uncertaintyWidth: 0.30,
    whyKo: "유급 인력 가정의 변화가 인건비와 제조 용량을 함께 바꿀 때 후보 순위를 비교합니다.",
    howToMeasureOnsiteKo: (v) => `7일간 시간대별 주문량과 근무표를 기록해 기준 설계 환산 인력 ${v} FTE 가정을 확인하세요.`,
    getBaseValue: (d) => d.staffFte,
    applyDelta: (designs, _base, delta) => ({
      designs: designs.map((d) => ({ ...d, staffFte: Math.max(0, Number((d.staffFte * (1 + delta)).toFixed(4))) })),
      options: { keepAllMonths: false, sampleMonthLimit: 0 },
    }),
  },
];

export interface CliffVerification {
  method: "subset_proposals_full_batch_endpoints";
  globalMinimumVerified: false;
  totalDesigns: number;
  proposalDesigns: number;
  proposedBrackets: number;
  checkedBrackets: number;
  fullBatchEvaluations: number;
  lowerDelta: number | null;
  upperDelta: number | null;
  elapsedMs: number;
}

export interface CliffAnalysisResult {
  cliff: Cliff | null;
  nextMeasurement: NextMeasurement | null;
  controlVariable: string;
  controlLeaderUnchanged: boolean;
  verification: CliffVerification;
}

export function applyAssumptionDelta(variable: CliffVariableKey, delta: number,
  designs: readonly StoreDesign[], baseDesign: StoreDesign) {
  const spec = ASSUMPTION_SPECS.find((s) => s.key === variable);
  if (!spec || !Number.isFinite(delta)) return null;
  // A zero perturbation must not introduce floors, rounding, or new defaults.
  if (delta === 0) return { designs: [...designs], options: { keepAllMonths: false, sampleMonthLimit: 0 } };
  return spec.applyDelta(designs, baseDesign, delta);
}

/**
 * Evaluate a single assumption variable at a given relative delta (-0.30..+0.30)
 * and return the #1 leader designId.
 */
export function evaluateLeaderAtAssumptionDelta(
  variable: CliffVariableKey,
  delta: number,
  designs: readonly StoreDesign[],
  baseDesign: StoreDesign,
  scenario: Scenario,
  constraints: Constraints
): string | null {
  const applied = applyAssumptionDelta(variable, delta, designs, baseDesign);
  if (!applied) return null;
  const { designs: mutated, options } = applied;
  const results = simulateBatch(mutated, scenario, constraints, options);
  return pickLeaderVariant(results)?.designId ?? null;
}

/**
 * Find one bounded, full-batch-confirmed sensitivity bracket. Not a global
 * minimum search: at most three subset proposals and two control variables each.
 */
export function findDecisionCliffAndMeasurement(
  designs: readonly StoreDesign[],
  baseDesign: StoreDesign,
  scenario: Scenario,
  constraints: Constraints
): CliffAnalysisResult {
  const started = performance.now();
  const validDesigns = designs.filter((d) => checkStoreConstraints(d, constraints).ok);
  const verification: CliffVerification = {
    method: "subset_proposals_full_batch_endpoints", globalMinimumVerified: false,
    totalDesigns: validDesigns.length, proposalDesigns: 0, proposedBrackets: 0,
    checkedBrackets: 0, fullBatchEvaluations: 0, lowerDelta: null, upperDelta: null, elapsedMs: 0,
  };
  const finish = (cliff: Cliff | null = null, nextMeasurement: NextMeasurement | null = null,
    controlVariable = "not_verified"): CliffAnalysisResult => {
    verification.elapsedMs = Number((performance.now() - started).toFixed(2));
    return { cliff, nextMeasurement, controlVariable, controlLeaderUnchanged: cliff !== null, verification };
  };
  if (validDesigns.length < 2) {
    return finish();
  }

  // Evaluate baseline leader at delta = 0
  const baseResults = simulateBatch(validDesigns, scenario, constraints, {
    keepAllMonths: false,
    sampleMonthLimit: 0,
  });
  verification.fullBatchEvaluations++;
  const baseLeader = pickLeaderVariant(baseResults)?.designId ?? null;
  if (!baseLeader) {
    return finish();
  }

  // Include actual contenders and broad coverage, rather than assume that the
  // first 120 input designs contain the full population's leader.
  const byId = new Map(validDesigns.map((d) => [d.id, d]));
  const proposalIds = new Set<string>([validDesigns[0].id]);
  for (const result of [...baseResults].sort(compareVariantsLexicographic).slice(0, 59)) proposalIds.add(result.designId);
  for (let i = 0; i < Math.min(60, validDesigns.length); i++) proposalIds.add(validDesigns[Math.floor(i * validDesigns.length / Math.min(60, validDesigns.length))].id);
  const proposalDesigns = validDesigns.length <= 120 ? validDesigns : [...proposalIds].map((id) => byId.get(id)!);
  verification.proposalDesigns = proposalDesigns.length;

  interface CandidateFlip {
    spec: AssumptionSpec;
    stepIndexBelow: number;
    stepIndexAbove: number;
    deltaBoundary: number;
    absDelta: number;
    boundaryValue: number;
    leaderBelow: string;
    leaderAbove: string;
    priorityScore: number;
  }

  const candidates: CandidateFlip[] = [];

  for (const spec of ASSUMPTION_SPECS) {
    const leadersByStep: (string | null)[] = [];
    for (let i = 0; i < SWEEP_STEPS.length; i++) {
      const delta = SWEEP_STEPS[i];
      const leaderId =
        delta === 0
          ? baseLeader
          : evaluateLeaderAtAssumptionDelta(
              spec.key,
              delta,
              proposalDesigns,
              baseDesign,
              scenario,
              constraints
            );
      leadersByStep.push(leaderId);
    }

    // Each adjacent-grid transition is only a proposal until full-N checks pass.
    for (let i = 0; i < SWEEP_STEPS.length - 1; i++) {
      const lBelow = leadersByStep[i];
      const lAbove = leadersByStep[i + 1];
      if (lBelow && lAbove && lBelow !== lAbove) {
        const dBelow = SWEEP_STEPS[i];
        const dAbove = SWEEP_STEPS[i + 1];
        const midDelta = Number(((dBelow + dAbove) / 2).toFixed(6));
        const absDelta = Math.max(0.03, Math.abs(midDelta));
        const baseVal = spec.getBaseValue(spec.applyDelta([baseDesign], baseDesign, midDelta).designs[0]);
        const boundaryValue =
          spec.unit === "ratio" || spec.unit === "FTE"
            ? Number(baseVal.toFixed(3))
            : Math.round(baseVal);
        const priorityScore = Number(((1 / absDelta) * spec.uncertaintyWidth).toFixed(3));

          candidates.push({
            spec,
            stepIndexBelow: i,
            stepIndexAbove: i + 1,
            deltaBoundary: midDelta,
            absDelta,
            boundaryValue,
            leaderBelow: lBelow,
            leaderAbove: lAbove,
            priorityScore,
          });
      }
    }

  }

  if (candidates.length === 0) {
    return finish();
  }

  verification.proposedBrackets = candidates.length;
  // Ordering prioritizes nearby proposals; it is not proof of a global minimum.
  candidates.sort((a, b) => a.absDelta - b.absDelta || b.priorityScore - a.priorityScore);
  const cache = new Map<string, string | null>();
  const fullLeader = (variable: CliffVariableKey, delta: number) => {
    if (delta === 0) return baseLeader;
    const key = `${variable}:${delta.toFixed(6)}`;
    if (!cache.has(key)) {
      verification.fullBatchEvaluations++;
      cache.set(key, evaluateLeaderAtAssumptionDelta(variable, delta, validDesigns, baseDesign, scenario, constraints));
    }
    return cache.get(key)!;
  };
  for (const chosen of candidates.slice(0, 3)) {
    verification.checkedBrackets++;
    const lower = Number((chosen.deltaBoundary - .03).toFixed(6));
    const upper = Number((chosen.deltaBoundary + .03).toFixed(6));
    const below = fullLeader(chosen.spec.key, lower);
    const above = fullLeader(chosen.spec.key, upper);
    if (!below || !above || below === above) continue;
    const control = ASSUMPTION_SPECS.filter((s) => s.key !== chosen.spec.key).slice(0, 2)
      .find((s) => fullLeader(s.key, lower) === baseLeader && fullLeader(s.key, upper) === baseLeader);
    if (!control) continue;
    verification.lowerDelta = lower;
    verification.upperDelta = upper;
    const cliff: Cliff = {
    variable: chosen.spec.key,
    boundaryValue: chosen.boundaryValue,
    relativeDelta: Number(chosen.deltaBoundary.toFixed(3)),
    leaderBelow: below,
    leaderAbove: above,
    unit: chosen.spec.unit,
  };

  const nextMeasurement: NextMeasurement = {
    variable: chosen.spec.key,
    why: `최대 ${proposalDesigns.length}개 후보의 제안 후 전체 ${validDesigns.length}개에서 상대 변화 ${lower}..${upper} 양끝과 대조변수를 확인한 구간입니다. 전역 최소·정확한 전환값은 미확인입니다. ${chosen.spec.whyKo}`,
    howToMeasureOnsite: `표시값은 기준 설계 환산 중간값이며 후보별 민감도 규칙을 사용한 가정입니다. ${chosen.spec.howToMeasureOnsiteKo(chosen.boundaryValue)}`,
    priorityScore: chosen.priorityScore,
    uncertaintyWidth: chosen.spec.uncertaintyWidth,
  };

    return finish(cliff, nextMeasurement, control.key);
  }
  return finish();
}
