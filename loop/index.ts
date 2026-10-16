// loop/index.ts — Lane A2 entry point.
// Connects Seoul public data + onsite inputs + Gemini / Replay Store Designer +
// Bankruptcy Designer + Schema & Forbidden-Path Validator to the deterministic engine.

import {
  normalizeOnsiteInput,
  type NormalizedOnsiteBundle,
  type RawOnsiteInput,
} from "../data/onsiteLoader.js";
import {
  loadSeoulMarketData,
  type SeoulDatasetBundle,
} from "../data/seoulLoader.js";
import { runOrchestration, type OrchestrateOptions } from "../engine/orchestrator.js";
import { sha256Canonical } from "../engine/prng.js";
import type {
  Constraints,
  Patch,
  RunResult,
  Shock,
  StoreDesign,
  TokenUsage,
  VariantPatchBundle,
} from "../shared/types.js";
import {
  proposeBankruptcyShocksForRound,
  type BankruptcyRoundProposal,
} from "./bankruptcyDesigner.js";
import {
  ALLOWED_OUTBOUND_HOSTS,
  FORBIDDEN_ACTION_KEYWORDS,
  callGeminiStructured,
  verifyOutboundUrlAllowed,
} from "./geminiClient.js";
import {
  buildDefaultPatchBundles,
  runStoreDesigner,
  type StoreDesignerResult,
} from "./storeDesigner.js";
import {
  applyStorePatch,
  validateAdversarialShocks,
  validateAndApplyPatchBundles,
  validatePatchPath,
  type BundleApplicationReport,
  type PatchValidationResult,
} from "./validator.js";

export {
  loadSeoulMarketData,
  normalizeOnsiteInput,
  runStoreDesigner,
  buildDefaultPatchBundles,
  proposeBankruptcyShocksForRound,
  validatePatchPath,
  applyStorePatch,
  validateAndApplyPatchBundles,
  validateAdversarialShocks,
  verifyOutboundUrlAllowed,
  callGeminiStructured,
  ALLOWED_OUTBOUND_HOSTS,
  FORBIDDEN_ACTION_KEYWORDS,
};

export type {
  RawOnsiteInput,
  NormalizedOnsiteBundle,
  SeoulDatasetBundle,
  StoreDesignerResult,
  BankruptcyRoundProposal,
  PatchValidationResult,
  BundleApplicationReport,
};

export interface RunFullLoopInput {
  onsite?: RawOnsiteInput;
  injectedBundles?: VariantPatchBundle[];
  injectedPatches?: Patch[];
  referenceOffsetPp?: number;
  offline?: boolean;
  persistToDisk?: boolean;
  runsDir?: string;
}

/**
 * Full end-to-end execution combining:
 *   1. Data loaders (Seoul Open Data + Onsite payload normalization)
 *   2. Store Designer (Gemini 2.5 Flash or deterministic replay) with patch validation (AT-10)
 *   3. Bankruptcy Designer across up to 3 adversarial rounds (AT-13)
 *   4. Deterministic 36-month cash-flow engine (10,000 default mode or 1,000 mode)
 */
export async function runFullAdversarialLoop(
  input: RunFullLoopInput = {}
): Promise<RunResult> {
  const seoulData = loadSeoulMarketData();
  const normalized = normalizeOnsiteInput(input.onsite ?? {});
  const offline = input.offline ?? true;

  // Convert raw injectedPatches into a single VariantPatchBundle if provided
  const extraBundles: VariantPatchBundle[] = [...(input.injectedBundles ?? [])];
  if (input.injectedPatches && input.injectedPatches.length > 0) {
    extraBundles.push({
      id: "injected-patch-bundle",
      parentId: normalized.baseDesign.id,
      patches: input.injectedPatches,
    });
  }

  // Step 1: Store Designer generates initial family designs and validates any incoming patches
  const designerOut = await runStoreDesigner({
    baseDesign: normalized.baseDesign,
    constraints: normalized.constraints,
    mode: normalized.mode,
    injectedBundles: extraBundles,
    offline,
  });

  // Step 2: Propose Bankruptcy shocks for up to 3 adversarial rounds
  const shocksByRound: Shock[][] = [];
  const allTokens: TokenUsage[] = [designerOut.usage];
  const allRejected: { patchIndex: number; reason: string; path?: string }[] = [
    ...designerOut.rejectedPatches,
  ];

  for (const roundIdx of [1, 2, 3] as const) {
    const bdOut = await proposeBankruptcyShocksForRound({
      round: roundIdx,
      offline,
    });
    shocksByRound.push(bdOut.shocks);
    allTokens.push(bdOut.usage);
    for (const r of bdOut.rejectedPatches) {
      allRejected.push(r);
    }
  }

  const inputHash = sha256Canonical({
    manifestHash: seoulData.manifestHash,
    onsiteInputHash: normalized.inputHash,
    injectedBundles: extraBundles,
  }).slice(0, 16);

  const orchestrateOpts: OrchestrateOptions = {
    baseDesign: normalized.baseDesign,
    constraints: normalized.constraints,
    mode: normalized.mode,
    customDesigns: designerOut.designs,
    quarters: seoulData.quarters,
    referenceOffsetPp: input.referenceOffsetPp ?? 0,
    runAdversarial: true,
    adversarialShocksByRound: shocksByRound,
    inputFiles: seoulData.inputFiles,
    inputHash,
    tokens: allTokens,
    replay: offline,
    persistToDisk: input.persistToDisk ?? false,
    runsDir: input.runsDir,
    rejectedReasons: allRejected,
  };

  return runOrchestration(orchestrateOpts);
}

/**
 * Convenience helper to validate an array of `Patch` items against `baseDesign` and `constraints` (AT-10).
 */
export function evaluateIncomingPatches(
  baseDesign: StoreDesign,
  constraints: Constraints,
  patches: Patch[]
): BundleApplicationReport {
  const bundles: VariantPatchBundle[] = patches.map((p, idx) => ({
    id: `incoming-patch-${idx}`,
    parentId: baseDesign.id,
    patches: [p],
  }));
  return validateAndApplyPatchBundles(baseDesign, bundles, constraints);
}
