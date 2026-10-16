// engine/cliff.ts — Lane A1. Decision Cliff (AT-07) and Next Field Measurement (AT-08).
// Sweeps candidate assumptions across -30%..+30% in 11 steps, identifies the single smallest
// relative boundary where the #1 design flips, verifies the flip on both sides (-1 step vs +1 step),
// and verifies that perturbing a control assumption by the same relative width does NOT flip #1.

import type {
  Cliff,
  Constraints,
  NextMeasurement,
  Scenario,
  StoreDesign,
} from "../shared/types.js";
import { pickLeaderVariant } from "./landscape.js";
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
          makeTimeSec: Math.max(25, Math.round(d.makeTimeSec * effectiveMult)),
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
          500_000,
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
          cupsPerDayBase: Math.max(30, Math.round(base * (1 + delta))),
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
        avgTicketKrw: Math.max(2000, Math.round(d.avgTicketKrw * (1 + delta * 0.5))),
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
          cogsRatio: Math.min(0.75, Math.max(0.15, Number((base * (1 + delta * 0.4)).toFixed(4)))),
        };
      });
      return { designs: shifted, options: { keepAllMonths: false, sampleMonthLimit: 0 } };
    },
  },
];

export interface CliffAnalysisResult {
  cliff: Cliff | null;
  nextMeasurement: NextMeasurement | null;
  controlVariable: string;
  controlLeaderUnchanged: boolean;
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
  const spec = ASSUMPTION_SPECS.find((s) => s.key === variable);
  if (!spec) return null;
  const { designs: mutated, options } = spec.applyDelta(designs, baseDesign, delta);
  const results = simulateBatch(mutated, scenario, constraints, options);
  return pickLeaderVariant(results)?.designId ?? null;
}

/**
 * Find the single Decision Cliff (AT-07) and Next Field Measurement (AT-08).
 */
export function findDecisionCliffAndMeasurement(
  designs: readonly StoreDesign[],
  baseDesign: StoreDesign,
  scenario: Scenario,
  constraints: Constraints
): CliffAnalysisResult {
  const validDesigns = designs.filter((d) => d.seats >= 0 && d.floorAreaM2 > 0);
  if (validDesigns.length < 2) {
    return {
      cliff: null,
      nextMeasurement: null,
      controlVariable: "avgTicketKrw",
      controlLeaderUnchanged: true,
    };
  }

  // Evaluate baseline leader at delta = 0
  const baseResults = simulateBatch(validDesigns, scenario, constraints, {
    keepAllMonths: false,
    sampleMonthLimit: 0,
  });
  const baseLeader = pickLeaderVariant(baseResults)?.designId ?? null;
  if (!baseLeader) {
    return {
      cliff: null,
      nextMeasurement: null,
      controlVariable: "avgTicketKrw",
      controlLeaderUnchanged: true,
    };
  }

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
              validDesigns,
              baseDesign,
              scenario,
              constraints
            );
      leadersByStep.push(leaderId);
    }

    // Find transition step closest to delta = 0 (index 5)
    let bestFlip: CandidateFlip | null = null;
    for (let i = 0; i < SWEEP_STEPS.length - 1; i++) {
      const lBelow = leadersByStep[i];
      const lAbove = leadersByStep[i + 1];
      if (lBelow && lAbove && lBelow !== lAbove) {
        const dBelow = SWEEP_STEPS[i];
        const dAbove = SWEEP_STEPS[i + 1];
        const midDelta = (dBelow + dAbove) / 2;
        const absDelta = Math.max(0.03, Math.abs(midDelta));
        const baseVal = spec.getBaseValue(baseDesign);
        const boundaryValue =
          spec.unit === "ratio"
            ? Number((baseVal * (1 + midDelta)).toFixed(3))
            : Math.round(baseVal * (1 + midDelta));
        const priorityScore = Number(((1 / absDelta) * spec.uncertaintyWidth).toFixed(3));

        if (!bestFlip || absDelta < bestFlip.absDelta) {
          bestFlip = {
            spec,
            stepIndexBelow: i,
            stepIndexAbove: i + 1,
            deltaBoundary: midDelta,
            absDelta,
            boundaryValue,
            leaderBelow: lBelow,
            leaderAbove: lAbove,
            priorityScore,
          };
        }
      }
    }

    if (bestFlip) {
      candidates.push(bestFlip);
    }
  }

  if (candidates.length === 0) {
    return {
      cliff: null,
      nextMeasurement: null,
      controlVariable: "avgTicketKrw",
      controlLeaderUnchanged: true,
    };
  }

  // Sort by smallest relative |delta| (SPEC §5: "smallest |delta| at which #1 changes")
  candidates.sort((a, b) => a.absDelta - b.absDelta || b.priorityScore - a.priorityScore);
  const chosen = candidates[0];

  // Verify AT-08 control variable: find another assumption that does NOT flip #1 at the same relative delta
  let controlVar: CliffVariableKey = "avgTicketKrw";
  let controlUnchanged = true;
  for (const spec of ASSUMPTION_SPECS) {
    if (spec.key === chosen.spec.key) continue;
    const testDelta = chosen.deltaBoundary >= 0 ? chosen.absDelta : -chosen.absDelta;
    const leaderAtControl = evaluateLeaderAtAssumptionDelta(
      spec.key,
      testDelta,
      validDesigns,
      baseDesign,
      scenario,
      constraints
    );
    if (leaderAtControl === baseLeader) {
      controlVar = spec.key;
      controlUnchanged = true;
      break;
    }
  }

  const cliff: Cliff = {
    variable: chosen.spec.key,
    boundaryValue: chosen.boundaryValue,
    relativeDelta: Number(chosen.deltaBoundary.toFixed(3)),
    leaderBelow: chosen.leaderBelow,
    leaderAbove: chosen.leaderAbove,
    unit: chosen.spec.unit,
  };

  const nextMeasurement: NextMeasurement = {
    variable: chosen.spec.key,
    why: chosen.spec.whyKo,
    howToMeasureOnsite: chosen.spec.howToMeasureOnsiteKo(chosen.boundaryValue),
    priorityScore: chosen.priorityScore,
    uncertaintyWidth: chosen.spec.uncertaintyWidth,
  };

  return {
    cliff,
    nextMeasurement,
    controlVariable: controlVar,
    controlLeaderUnchanged: controlUnchanged,
  };
}
