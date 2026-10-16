// loop/storeDesigner.ts — Lane A2. Store Designer role (Argon P-mutation).
// Proposes store design patch bundles strictly within store_designer_allowed_prefixes,
// validates against forbidden-paths.json (AT-10) and hard constraints (AT-03),
// and expands 500 AI design families x 20 variations = 10,000 variants (AT-16).

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

  const allBundles = [
    ...(Array.isArray(geminiRes.data) ? geminiRes.data : buildDefaultPatchBundles(options.baseDesign, 16)),
    ...(options.injectedBundles ?? []),
  ];

  const validation = validateAndApplyPatchBundles(
    options.baseDesign,
    allBundles,
    options.constraints
  );

  // Build full 500 families (expanded x 20 = 10,000 variants) or 1,000 variants
  const familyCount = mode === 10000 ? 500 : 1000;
  const baseFamilies = generateStructuredStoreDesigns(
    options.baseDesign,
    options.constraints,
    familyCount
  );

  // Overlay validated Argon patch bundles into family slots 2..N while preserving Pareto leaders 0..1
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
