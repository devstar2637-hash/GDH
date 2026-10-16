// loop/bankruptcyDesigner.ts — Lane A2. Bankruptcy Designer role (Argon S-mutation).
// Proposes adversarial shocks strictly within bankruptcy_designer_allowed_prefixes (/shocks, /scenario),
// never touching StoreDesign or Oracle paths (AT-10, AT-13).

import type { Patch, Shock, TokenUsage } from "../shared/types.js";
import { callGeminiStructured } from "./geminiClient.js";
import { validateAdversarialShocks } from "./validator.js";

export interface BankruptcyRoundProposal {
  round: 1 | 2 | 3;
  shocks: Shock[];
  rejectedPatches: { patchIndex: number; reason: string; path: string }[];
  usage: TokenUsage;
}

const DEFAULT_ROUND_SHOCKS: Record<1 | 2 | 3, Shock[]> = {
  1: [
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
  2: [
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
  3: [
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
      magnitude: 0.50,
      note: "Round 3: 인테리어 준공 지연으로 첫 달 영업일수 50% 감소",
    },
  ],
};

export async function proposeBankruptcyShocksForRound(options: {
  round: 1 | 2 | 3;
  survivorSummary?: string;
  injectedPatches?: Patch[];
  offline?: boolean;
}): Promise<BankruptcyRoundProposal> {
  const prompt = [
    `You are BankruptcyDesigner in A Thousand Stores (Round ${options.round} of 3).`,
    "Propose realistic external shocks for Seongsu-dong cafes (/shocks only; never modify store design or oracle rules).",
    options.survivorSummary ?? "Target remaining non-dominated surviving cafe designs.",
  ].join("\n");

  const geminiRes = await callGeminiStructured<Shock[]>({
    model: "gemini-2.5-flash",
    callName: `BankruptcyDesigner.proposeShocks.r${options.round}`,
    prompt,
    offline: options.offline ?? true,
    fallbackGenerator: () => DEFAULT_ROUND_SHOCKS[options.round],
  });

  if (!Array.isArray(geminiRes.data)) throw new Error("INVALID_SHOCK_OUTPUT: no replay substituted.");
  const proposed = geminiRes.data;

  const validated = validateAdversarialShocks(
    proposed,
    options.injectedPatches ?? []
  );

  return {
    round: options.round,
    shocks: validated.acceptedShocks,
    rejectedPatches: validated.rejectedPatches,
    usage: geminiRes.usage,
  };
}
