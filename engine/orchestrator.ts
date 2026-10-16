// engine/orchestrator.ts — Lane A1. Full deterministic orchestration pipeline.
// Coordinates:
//   1. Backtest & Holdout Gate (AT-01, AT-02, AT-15)
//   2. Variant generation (1,000 variants or 500 families x 20 = 10,000 variants, AT-16)
//   3. Hard constraint check (AT-03: violations rejected, never counted as deaths)
//   4. 36-month cash-flow simulation (AT-05, AT-06)
//   5. Shared-arithmetic ledger consistency check (not an independent oracle)
//   6. Landscape summary, Pareto frontier & saturation curve (AT-09, AT-16)
//   7. Decision Cliff & Next Measurement (AT-07, AT-08)
//   8. Random/grid baseline comparison (AT-09)
//   9. Up to 3 adversarial rounds with strict S/P separation & stop conditions (AT-13)
//  10. StatusBar with runId, inputHash, engineSha, tokens, gateLog, DONE/FAIL/BLOCKED (AT-14)

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
  SEONGSU_CAFE_QUARTERS,
} from "../shared/constants.js";
import type {
  AdversarialRound,
  Constraints,
  GateLogEntry,
  QuarterMarketRow,
  RunEndState,
  RunResult,
  Scenario,
  Shock,
  StoreDesign,
  TokenUsage,
} from "../shared/types.js";
import { runBacktestGate } from "./backtest.js";
import {
  evaluateBaselineComparison,
  generateStructuredStoreDesigns,
} from "./baseline.js";
import { findDecisionCliffAndMeasurement, type CliffVerification } from "./cliff.js";
import { verifyIndependentPnlSamples } from "./independentPnl.js";
import {
  buildLandscapeSummary,
  computeSaturationCurveFromResults,
  expandDesignFamiliesTo10k,
  markParetoNonDominated,
  pickLeaderVariant,
} from "./landscape.js";
import { sha256Canonical } from "./prng.js";
import { simulateBatch, simulateSingleVariant, type SimulationOptions } from "./simulator.js";

export interface OrchestrateOptions {
  runId?: string;
  baseDesign?: StoreDesign;
  constraints?: Constraints;
  mode?: 1000 | 10000;
  customDesigns?: StoreDesign[];
  injectedDesigns?: StoreDesign[];
  scenarios?: Scenario[];
  quarters?: readonly QuarterMarketRow[];
  referenceOffsetPp?: number;
  runAdversarial?: boolean;
  adversarialShocksByRound?: Shock[][];
  inputFiles?: string[];
  inputHash?: string;
  engineSha?: string;
  tokens?: TokenUsage[];
  replay?: boolean;
  persistToDisk?: boolean;
  runsDir?: string;
  rejectedReasons?: { patchIndex: number; reason: string; path?: string }[];
}

const DEFAULT_BASE_SCENARIO: Scenario = {
  id: "scen-base",
  shocks: [
    {
      id: "shock-seasonal-dip",
      kind: "offseason",
      startMonth: 1,
      durationMonths: 2,
      magnitude: 0.08,
      note: "초기 오픈 후 겨울 비수기 수요 조정",
    },
  ],
};

const DEFAULT_ADVERSARIAL_SHOCK_ROUNDS: Shock[][] = [
  [
    {
      id: "adv-r1-offseason",
      kind: "offseason",
      startMonth: 2,
      durationMonths: 3,
      magnitude: 0.18,
      note: "Round 1: 한파·장마 비수기 매출 18% 하락",
    },
    {
      id: "adv-r1-rent",
      kind: "rent_increase",
      startMonth: 13,
      durationMonths: 24,
      magnitude: 0.08,
      note: "Round 1: 2년차 환산보증금/임대료 8% 인상",
    },
  ],
  [
    {
      id: "adv-r2-franchise",
      kind: "franchise_entry",
      startMonth: 6,
      durationMonths: 30,
      magnitude: 0.16,
      note: "Round 2: 반경 150m 내 저가 대형 프랜차이즈 입점",
    },
    {
      id: "adv-r2-supply",
      kind: "supplyCostUp",
      startMonth: 4,
      durationMonths: 32,
      magnitude: 0.05,
      note: "Round 2: 원두·우유 원가율 5%p 상승",
    },
  ],
  [
    {
      id: "adv-r3-maketime",
      kind: "make_time_drift",
      startMonth: 3,
      durationMonths: 18,
      magnitude: 0.22,
      note: "Round 3: 숙련 스태프 이탈로 피크 제조시간 22% 지연",
    },
    {
      id: "adv-r3-fitout",
      kind: "fitout_delay",
      startMonth: 1,
      durationMonths: 1,
      magnitude: 0.5,
      note: "Round 3: 인테리어 준공 지연으로 첫 달 영업일수 50% 감소",
    },
  ],
];

let cachedGitSha: string | null = null;

export function getEngineGitSha(): string {
  const deployedSha = process.env.ENGINE_SHA;
  if (deployedSha && /^[a-f0-9]{7,40}$/i.test(deployedSha)) return deployedSha;
  if (cachedGitSha) return cachedGitSha;
  try {
    cachedGitSha = execSync("git rev-parse --short=8 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (cachedGitSha) return cachedGitSha;
  } catch {
    // Fallback when git metadata is unavailable (e.g. inside minimal container)
  }
  cachedGitSha = "unknown";
  return cachedGitSha;
}

export function computeOracleFileHashes(repoRoot = process.cwd()): Record<string, string> {
  const relFiles = [
    "shared/types.ts",
    "shared/forbidden-paths.json",
    "engine/constraints.ts",
    "engine/simulator.ts",
    "engine/independentPnl.ts",
  ];
  const hashes: Record<string, string> = {};
  for (const rel of relFiles) {
    const abs = resolve(repoRoot, rel);
    if (existsSync(abs)) {
      const content = readFileSync(abs);
      hashes[rel] = createHash("sha256").update(content).digest("hex");
    }
  }
  return hashes;
}

function rejectDuplicateDesignIds(designs: readonly StoreDesign[], source: string): void {
  const seen = new Set<string>();
  for (const design of designs) {
    if (seen.has(design.id)) {
      throw new Error(`Duplicate designId ${JSON.stringify(design.id)} in ${source}`);
    }
    seen.add(design.id);
  }
}

/**
 * Execute the full deterministic A Thousand Stores simulation and verification pipeline.
 * Defaults to 10,000 deterministic preset variants (500 seeds x 20 variations)
 * and also supports 1,000 variants. This function makes no model calls.
 */
export function runOrchestration(options: OrchestrateOptions = {}): RunResult & { cliffVerification: CliffVerification } {
  const tStart = performance.now();
  // Check caller IDs before expansion can rename them, and again on the actual
  // simulation set below. Duplicate IDs would overwrite verifier design maps.
  rejectDuplicateDesignIds(
    [...(options.customDesigns ?? []), ...(options.injectedDesigns ?? [])],
    "customDesigns/injectedDesigns"
  );
  const constraints: Constraints = options.constraints ?? { ...DEFAULT_CONSTRAINTS };
  const baseDesign: StoreDesign = options.baseDesign ?? { ...DEFAULT_BASE_STORE_DESIGN };
  const mode: 1000 | 10000 = options.mode ?? 10000;
  const scenarios: Scenario[] =
    options.scenarios && options.scenarios.length > 0
      ? options.scenarios
      : [DEFAULT_BASE_SCENARIO];
  const primaryScenario = scenarios[0];

  const oracleHashesBefore = computeOracleFileHashes();
  const gateLog: GateLogEntry[] = [];
  const nowIso = () => new Date().toISOString();

  // 1. Backtest & Holdout Gate (AT-01, AT-02, AT-15)
  const calibration = runBacktestGate({
    quarters: options.quarters ?? SEONGSU_CAFE_QUARTERS,
    tolerancePp: 5.0,
    referenceOffsetPp: options.referenceOffsetPp ?? 0,
  });

  gateLog.push({
    gate: "backtest",
    passed: null,
    detail: calibration.reason,
    value: calibration.errorPp ?? undefined,
    threshold: 5.0,
    at: nowIso(),
  });

  gateLog.push({
    gate: "holdout",
    passed: null,
    detail: "2025Q1-2026Q2 집계 휴리스틱 참고값이며 실제 현금흐름 엔진의 독립 홀드아웃 검증은 미완료",
    value: calibration.holdoutErrorPp ?? undefined,
    threshold: 5.0,
    at: nowIso(),
  });

  // 2. Variant Design Generation (500 families x 20 = 10,000 default, or 1,000)
  let validDesigns: StoreDesign[];
  if (options.customDesigns && options.customDesigns.length > 0) {
    validDesigns =
      mode === 10000 && options.customDesigns.length <= 500
        ? expandDesignFamiliesTo10k(options.customDesigns, constraints, 20)
        : options.customDesigns;
  } else if (mode === 10000) {
    const families500 = generateStructuredStoreDesigns(
      baseDesign,
      constraints,
      500
    );
    validDesigns = expandDesignFamiliesTo10k(families500, constraints, 20);
  } else {
    validDesigns = generateStructuredStoreDesigns(
      baseDesign,
      constraints,
      1000
    );
  }

  const allDesigns =
    options.injectedDesigns && options.injectedDesigns.length > 0
      ? [...validDesigns, ...options.injectedDesigns]
      : validDesigns;
  rejectDuplicateDesignIds(allDesigns, "simulation designs");

  // 3. 36-Month Deterministic Cash-Flow Simulation (AT-03, AT-05, AT-06, AT-16)
  const simStart = performance.now();
  const simulationOptions: SimulationOptions = {
    keepAllMonths: mode === 1000,
    sampleMonthLimit: 120,
  };
  const results = simulateBatch(allDesigns, primaryScenario, constraints, simulationOptions);
  const ledgerLeader = pickLeaderVariant(results);
  if (ledgerLeader && ledgerLeader.months.length === 0) {
    const leaderIndex = results.indexOf(ledgerLeader);
    const replay = simulateSingleVariant(
      allDesigns[leaderIndex], primaryScenario, constraints, true, simulationOptions
    );
    // Preserve the batch's 120-per-outcome sampling policy and add only the
    // actual leader's ledger. Aggregate values remain those from the batch.
    ledgerLeader.months = replay.months;
  }
  // Simulation timing includes the optional one-design leader-ledger replay;
  // it excludes subsequent P&L, landscape, cliff and baseline analysis.
  const computeMs = Number((performance.now() - simStart).toFixed(2));

  // Count rejected constraint violations (AT-03: rejected, not counted as deaths)
  const rejectedVariants = results.filter((r) => !r.constraintsOk);
  const rejectedReasons: { patchIndex: number; reason: string; path?: string }[] = [
    ...(options.rejectedReasons ?? []),
    ...rejectedVariants.map((r, idx) => ({
      patchIndex: idx,
      reason: r.rejectedReason ?? "Constraint violation",
      path: r.designId,
    })),
  ];

  gateLog.push({
    gate: "budget_reserve",
    passed: true,
    detail: `예산(${constraints.budgetKrw.toLocaleString()}원)·예비비(${(constraints.reserveRatioMin * 100).toFixed(0)}%) 게이트: 유효 ${results.length - rejectedVariants.length}건, 제약 위반 기각 ${rejectedReasons.length}건 (폐업 집계 제외)`,
    value: rejectedReasons.length,
    threshold: 0,
    at: nowIso(),
  });

  // 4. Ledger consistency check: both paths reuse computeMonthStep.
  const pnlCheck = verifyIndependentPnlSamples(
    allDesigns,
    // The verifier samples each outcome's first 25 retained ledgers. Prioritize
    // the actual leader without changing the public results/designs ordering.
    ledgerLeader ? [ledgerLeader, ...results.filter((r) => r !== ledgerLeader)] : results,
    primaryScenario,
    constraints,
    simulationOptions
  );
  gateLog.push({
    gate: "pnl_recompute",
    passed: pnlCheck.passed ? null : false,
    detail: `공유 월별 산식을 사용한 P&L 상호일치 검사 (${pnlCheck.sampledCount}개 표본: 생존 ${pnlCheck.aliveSampled} + 폐업 ${pnlCheck.deadSampled}; 실제 리더 ${ledgerLeader?.designId ?? "없음"} 우선 포함) 최대 오차 ${pnlCheck.maxAbsDiffKrw.toFixed(4)}원 (기준 <= 1원). 독립 오라클 검증 아님`,
    value: pnlCheck.maxAbsDiffKrw,
    threshold: 1,
    at: nowIso(),
  });

  // 5. Landscape Summary, Pareto Frontier & Saturation Curve (AT-09, AT-16)
  markParetoNonDominated(results);
  const { landscape, deathCauses, leader } = buildLandscapeSummary(allDesigns, results);
  const saturationCurve = computeSaturationCurveFromResults(results);

  // 6. Decision Cliff & Next Measurement (AT-07, AT-08)
  const validDesignsOnly = allDesigns.filter((_, idx) => results[idx]?.constraintsOk);
  const { cliff, nextMeasurement, verification: cliffVerification } = findDecisionCliffAndMeasurement(
    validDesignsOnly,
    baseDesign,
    primaryScenario,
    constraints
  );

  // 7. Baseline Comparison vs Random/Grid (AT-09)
  const validResultsOnly = results.filter((r) => r.constraintsOk);
  const baseline = evaluateBaselineComparison(
    validDesignsOnly,
    validResultsOnly,
    baseDesign,
    primaryScenario,
    constraints
  );

  gateLog.push({
    gate: "baseline",
    passed: baseline.label === "ai-native",
    detail: `${options.customDesigns?.length ? "caller-provided designs (AI 출처 미검증)" : "deterministic presets (모델 미호출)"}, ${allDesigns.length} variants. 무작위/그리드 베이스라인 비교: 실패 가족 ${baseline.argonNewFamilies} vs ${baseline.randomNewFamilies}, 비지배 설계 ${baseline.argonNonDominated} vs ${baseline.randomNonDominated} -> ${baseline.koLabel}. 이 비교는 AI 개선의 증거가 아님`,
    value: baseline.argonNewFamilies,
    threshold: baseline.randomNewFamilies,
    at: nowIso(),
  });

  // 8. Adversarial Rounds (up to 3 rounds, strict S/P separation, AT-13)
  const rounds: AdversarialRound[] = [];
  if (options.runAdversarial !== false) {
    const shockRounds =
      options.adversarialShocksByRound ?? DEFAULT_ADVERSARIAL_SHOCK_ROUNDS;
    const roundDesigns = validDesignsOnly.slice(0, 250);
    const cumulativeShocks: Shock[] = [...primaryScenario.shocks];
    const seenFamilies = new Set<string>();
    for (const r of validResultsOnly.slice(0, 1000)) {
      if (r.failureFamily) seenFamilies.add(r.failureFamily);
    }

    const maxRounds = Math.min(3, shockRounds.length);
    for (let i = 0; i < maxRounds; i++) {
      const rStart = performance.now();
      const roundNum = (i + 1) as 1 | 2 | 3;
      const newShocks = shockRounds[i] ?? [];
      cumulativeShocks.push(...newShocks);

      // Step P: BankruptcyDesigner mutates scenario shocks P only (designs S held fixed)
      const advScenario: Scenario = {
        id: `scen-adv-r${roundNum}`,
        shocks: [...cumulativeShocks],
      };
      const advResults = simulateBatch(roundDesigns, advScenario, constraints, {
        keepAllMonths: false,
        sampleMonthLimit: 0,
      });
      markParetoNonDominated(advResults);

      let newFamiliesCount = 0;
      let deaths = 0;
      let nonDominatedSurvivors = 0;

      for (const r of advResults) {
        if (!r.constraintsOk) continue;
        if (r.deathMonth !== null) {
          deaths += 1;
          if (r.failureFamily && !seenFamilies.has(r.failureFamily)) {
            seenFamilies.add(r.failureFamily);
            newFamiliesCount += 1;
          }
        } else if (r.nonDominated) {
          nonDominatedSurvivors += 1;
        }
      }

      const elapsedMs = Number((performance.now() - rStart).toFixed(2));
      let stopReason: AdversarialRound["stopReason"] | undefined;
      if (nonDominatedSurvivors === 0 && deaths === roundDesigns.length) {
        stopReason = "allSurvivorsKilled";
      } else if (roundNum === maxRounds) {
        stopReason = "roundCap";
      }

      rounds.push({
        round: roundNum,
        shocksAdded: newShocks.length,
        shocks: newShocks,
        deaths,
        newFailureFamilies: newFamiliesCount,
        nonDominatedSurvivors,
        changed: "P",
        stopReason,
        elapsedMs,
      });

      if (stopReason === "allSurvivorsKilled") {
        break;
      }
    }
  }

  // Verify oracle files were not modified during the run (AT-13)
  const oracleHashesAfter = computeOracleFileHashes();
  const oracleUnchanged =
    sha256Canonical(oracleHashesBefore) === sha256Canonical(oracleHashesAfter);

  // 9. Determine Run ID, Input Hash, Token Totals, and End State (AT-14)
  const inputFiles = options.inputFiles ?? [];
  const inputHash =
    options.inputHash ??
    sha256Canonical({
      constraints,
      baseDesign,
      mode,
      scenarios,
      customDesigns: options.customDesigns ?? null,
      injectedDesigns: options.injectedDesigns ?? null,
      quarters: options.quarters ?? SEONGSU_CAFE_QUARTERS,
    });

  const runId =
    options.runId ?? `run-${constraints.seed}-${inputHash.slice(0, 8)}`;

  // Only upstream measured usage may be supplied. The local default invokes no model.
  const tokens: TokenUsage[] = options.tokens ?? [];

  const tokenTotal = tokens.reduce(
    (acc, t) => ({
      input: acc.input + t.inputTokens,
      output: acc.output + t.outputTokens,
    }),
    { input: 0, output: 0 }
  );

  let endState: RunEndState = "DONE";
  let endReason = "모든 하드 게이트 통과 및 시뮬레이션 완료";
  if (!pnlCheck.passed || !oracleUnchanged) {
    endState = "FAIL";
    endReason = !pnlCheck.passed
      ? "공유 산식 P&L 상호일치 검사 실패 (독립 오라클 아님)"
      : "오라클 코드 무결성 해시 불일치";
  } else if (calibration.label === "uncalibrated") {
    endState = "DONE";
    endReason = "미보정(uncalibrated) 상태 — 분포 차트 비활성화, 가정 점검표 및 다음 측정값만 표시";
  }

  // Recommend initial non-prescriptive decision state
  const decisionChoice: RunResult["decision"]["choice"] =
    calibration.label === "uncalibrated" ? "measure" : "measure";

  if (mode === 10000) {
    // Internal checks use the retained batch ledgers above. Export only fifty
    // real sampled ledgers (prefer 25 per outcome) plus the actual leader.
    // Keep original ordering so an eligible first user-base remains sampled.
    const eligible = results.filter((r) =>
      r !== ledgerLeader && r.constraintsOk && r.months.length > 0
    );
    const retained = new Set([
      ...eligible.filter((r) => r.deathMonth === null).slice(0, 25),
      ...eligible.filter((r) => r.deathMonth !== null).slice(0, 25),
    ]);
    for (const result of eligible) {
      if (retained.size >= 50) break;
      retained.add(result);
    }
    if (ledgerLeader?.months.length) retained.add(ledgerLeader);
    for (const result of results) {
      if (!retained.has(result)) result.months = [];
    }
  }

  const totalElapsedMs = Number((performance.now() - tStart).toFixed(2));

  const runResult: RunResult & { cliffVerification: CliffVerification } = {
    runId,
    constraints,
    designs: allDesigns,
    scenarios,
    results,
    landscape,
    deathCauses,
    cliff,
    cliffVerification,
    nextMeasurement,
    calibration,
    baseline,
    rounds,
    status: {
      runId,
      inputFiles,
      inputHash,
      engineSha: options.engineSha ?? getEngineGitSha(),
      endState,
      endReason,
      replay: options.replay ?? false,
      tokens,
      tokenTotal,
      gateLog,
    },
    decision: {
      choice: decisionChoice,
      reason: nextMeasurement
        ? `결정 절벽 변수(${nextMeasurement.variable}) 현장 실측 후 재실행 권고`
        : "현장 핵심 가정 실측 권고",
    },
    mode,
    // The frozen shared union has no truthful 10k preset label; omit the optional
    // field rather than assert an AI origin. Provenance is explicit in gateLog.
    modeLabel: mode === 1000 ? "1,000 variants" : undefined,
    saturationCurve,
    leaderDesignId: leader?.designId,
    computeMs: computeMs || totalElapsedMs,
    rejectedCount: rejectedReasons.length,
    rejectedReasons,
  };

  if (options.persistToDisk !== false) {
    persistRunArtifacts(runResult, oracleHashesBefore, oracleHashesAfter, options.runsDir);
  }

  return runResult;
}

/**
 * Append-only run persistence under `runs/<runId>/` (AGENTS.md & AT-13).
 */
export function persistRunArtifacts(
  result: RunResult,
  oracleHashesBefore: Record<string, string>,
  oracleHashesAfter: Record<string, string>,
  customRunsDir?: string
): string {
  const baseDir = customRunsDir ?? resolve(process.cwd(), "runs");
  const runDir = join(baseDir, result.runId);
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }

  // Write compact summary & rounds log (keep disk footprint fast and clean)
  const roundsPayload = {
    runId: result.runId,
    seed: result.constraints.seed,
    mode: result.mode,
    modeLabel: result.modeLabel,
    rounds: result.rounds,
    oracleHashesBefore,
    oracleHashesAfter,
    oracleUnchanged:
      sha256Canonical(oracleHashesBefore) === sha256Canonical(oracleHashesAfter),
  };

  writeFileSync(
    join(runDir, "rounds.json"),
    JSON.stringify(roundsPayload, null, 2),
    "utf8"
  );

  writeFileSync(
    join(runDir, "status.json"),
    JSON.stringify(result.status, null, 2),
    "utf8"
  );

  // The result already bounds retained 10k ledgers to fifty real samples plus
  // the actual leader. Preserve that selection in saved/exportable evidence;
  // truncating by array index would discard a leader outside the first 100.
  writeFileSync(
    join(runDir, "result.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  return runDir;
}
