// tests/lib/fixed_input.ts — the ONE fixed input every acceptance test judges against.
// Seongsu-dong cafe, budget 120,000,000 KRW, 36 months, seed 20261016, default N = 10,000 (500 x 20).
// Values are copied from shared/constants.ts (frozen 12:15) and pinned here so a later change in shared/
// is detected (see tests/fixtures/expected/fixed_input.json).

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../../shared/constants.js";
import type { Constraints, Scenario, StoreDesign } from "../../shared/types.js";

export const FIXED_CONSTRAINTS: Constraints = { ...DEFAULT_CONSTRAINTS };
export const FIXED_BASE: StoreDesign = JSON.parse(JSON.stringify(DEFAULT_BASE_STORE_DESIGN));
export const FIXED_SCENARIO: Scenario = {
  id: "verifier-fixed",
  shocks: [{ id: "fx-offseason", kind: "offseason", startMonth: 1, durationMonths: 2, magnitude: 0.08 }],
};
export const OTHER_SEED = 20261017;

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const o = value as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
export function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

export function fixedInputHash(): string {
  return sha256({ constraints: FIXED_CONSTRAINTS, base: FIXED_BASE, scenario: FIXED_SCENARIO });
}

export function expectedFixedInput(): { sha256: string } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/expected/fixed_input.json"), "utf8"));
}

export function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short=8 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}
