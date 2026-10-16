// loop/storeDesigner.ts — Lane A2. Store Designer role (Argon P-mutation).
// Proposes store design patch bundles strictly within store_designer_allowed_prefixes,
// validates against forbidden-paths.json (AT-10) and hard constraints (AT-03),
// Legacy deterministic family expansion: this is NOT 500 independent AI designs.

import { generateStructuredStoreDesigns } from "../engine/baseline.js";
import { expandDesignFamiliesTo10k } from "../engine/landscape.js";
import type {
  Constraints,
  StoreDesign,
  TokenUsage,
  VariantPatchBundle,
} from "../shared/types.js";
import { callGeminiStructured } from "./geminiClient.js";
import { validateAndApplyPatchBundles } from "./validator.js";

export interface StoreDesignerResult {
  designs: StoreDesign[];
  bundles: VariantPatchBundle[];
  rejectedPatches: { patchIndex: number; reason: string; path: string }[];
  usage: TokenUsage;
  liveApiUsed: boolean;
}

export function buildDefaultPatchBundles(
  baseDesign: StoreDesign,
  count = 16
): VariantPatchBundle[] {
  const bundles: VariantPatchBundle[] = [];
  for (let i = 0; i < count; i++) {
    const id = `argon-bundle-${String(i + 1).padStart(3, "0")}`;
    const tier = ((i % 3) + 1) as 1 | 2 | 3;
    const rentDelta = (i % 5 === 0 ? -400_000 : i % 5 === 1 ? 350_000 : -150_000);
    const makeTime = 55 + (i % 6) * 14;
    const seats = Math.max(4, Math.min(36, baseDesign.seats + ((i % 7) - 3) * 4));

    bundles.push({
      id,
      parentId: baseDesign.id,
      patches: [
        { path: "/seats", op: "set", value: seats, by: "StoreDesigner" },
        { path: "/menuTier", op: "set", value: tier, by: "StoreDesigner" },
        { path: "/monthlyRent", op: "add", value: rentDelta, by: "StoreDesigner" },
        { path: "/makeTimeSec", op: "set", value: makeTime, by: "StoreDesigner" },
      ],
    });
  }
  return bundles;
}

export async function runStoreDesigner(options: {
  baseDesign: StoreDesign;
  constraints: Constraints;
  mode?: 1000 | 10000;
  injectedBundles?: VariantPatchBundle[];
  offline?: boolean;
}): Promise<StoreDesignerResult> {
  const mode = options.mode ?? 10000;
  const prompt = [
    "You are StoreDesigner in A Thousand Stores (Seongsu-dong cafe simulator).",
    "Propose JSON patch bundles modifying only allowed store design fields (/seats, /floorAreaM2, /deposit, /monthlyRent, /fitoutCost, /staffFte, /menuTier, /avgTicketKrw, /makeTimeSec, /openDaysPerWeek).",
    `Budget cap: ${options.constraints.budgetKrw} KRW, minimum reserve ratio: ${options.constraints.reserveRatioMin}.`,
    `Base design: seats=${options.baseDesign.seats}, area=${options.baseDesign.floorAreaM2}m2, rent=${options.baseDesign.monthlyRent.value} KRW.`,
  ].join("\n");

  const geminiRes = await callGeminiStructured<VariantPatchBundle[]>({
    model: "gemini-2.5-flash",
    callName: "StoreDesigner.proposePatchBundles",
    prompt,
    offline: options.offline ?? true,
    fallbackGenerator: () => buildDefaultPatchBundles(options.baseDesign, 16),
  });

  if (!Array.isArray(geminiRes.data)) throw new Error("INVALID_STORE_DESIGN_OUTPUT: no replay substituted.");
  const allBundles = [
    ...geminiRes.data,
    ...(options.injectedBundles ?? []),
  ];

  const validation = validateAndApplyPatchBundles(
    options.baseDesign,
    allBundles,
    options.constraints
  );

  // Build deterministic families; only accepted proposal overlays may come from a live model.
  const familyCount = mode === 10000 ? 500 : 1000;
  const baseFamilies = generateStructuredStoreDesigns(
    options.baseDesign,
    options.constraints,
    familyCount
  );

  // Overlay validated live/replay bundles; fixed seed leaders and other families remain deterministic.
  for (let i = 0; i < validation.acceptedDesigns.length && i + 2 < baseFamilies.length; i++) {
    const patched = validation.acceptedDesigns[i];
    const slotIdx = i + 2;
    baseFamilies[slotIdx] = {
      ...patched,
      id: baseFamilies[slotIdx].id,
      familyId: baseFamilies[slotIdx].familyId,
    };
  }

  const designs =
    mode === 10000
      ? expandDesignFamiliesTo10k(baseFamilies, options.constraints, 20)
      : baseFamilies;

  return {
    designs,
    bundles: allBundles,
    rejectedPatches: validation.rejectedPatches,
    usage: geminiRes.usage,
    liveApiUsed: geminiRes.liveApiUsed,
  };
}
