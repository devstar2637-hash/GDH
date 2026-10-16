// loop/validator.ts — Lane A2. Enforces shared/forbidden-paths.json (AT-10) and hard constraints (AT-03)
// before any StoreDesigner or BankruptcyDesigner patch reaches the simulation engine.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkStoreConstraints } from "../engine/constraints.js";
import type {
  Constraints,
  Patch,
  Scenario,
  Shock,
  ShockKind,
  StoreDesign,
  VariantPatchBundle,
} from "../shared/types.js";

interface ForbiddenPathsConfig {
  description: string;
  forbidden_prefixes: string[];
  store_designer_allowed_prefixes: string[];
  bankruptcy_designer_allowed_prefixes: string[];
  rule: string;
}

const forbiddenConfig: ForbiddenPathsConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "shared/forbidden-paths.json"), "utf8")
);

export interface PatchValidationResult {
  ok: boolean;
  reason?: string;
  path: string;
}

export interface BundleApplicationReport {
  acceptedDesigns: StoreDesign[];
  rejectedPatches: { patchIndex: number; reason: string; path: string }[];
  rejectedBundles: { bundleId: string; reason: string; path?: string }[];
}

/**
 * Validate a single Patch against `shared/forbidden-paths.json` and role separation (AT-10).
 */
export function validatePatchPath(patch: Patch): PatchValidationResult {
  const rawPath = (patch.path ?? "").trim();
  if (!rawPath) {
    return { ok: false, reason: "EMPTY_PATH: patch path is empty", path: rawPath };
  }

  const lowerPath = rawPath.toLowerCase();

  // 1. Check explicit forbidden prefixes and substrings (AT-10: O is never writable)
  for (const fp of forbiddenConfig.forbidden_prefixes) {
    const fpLower = fp.toLowerCase();
    if (
      lowerPath === fpLower ||
      lowerPath.startsWith(fpLower) ||
      lowerPath.includes(fpLower)
    ) {
      return {
        ok: false,
        reason: `FORBIDDEN_ORACLE_PATH: '${rawPath}' matches forbidden prefix '${fp}'`,
        path: rawPath,
      };
    }
  }

  // Extra hard guard for oracle / constraint / backtest / test / result keywords
  const extraForbidden = [
    "constraints",
    "budget",
    "reserve",
    "seed",
    "oracle",
    "backtest",
    "holdout",
    "deaththreshold",
    "pnlformula",
    "referencerates",
  ];
  for (const kw of extraForbidden) {
    if (lowerPath.includes(kw)) {
      return {
        ok: false,
        reason: `FORBIDDEN_ORACLE_KEYWORD: '${rawPath}' attempts to touch protected '${kw}'`,
        path: rawPath,
      };
    }
  }

  // 2. Role boundary enforcement (S vs P separation)
  if (patch.by === "StoreDesigner") {
    const allowed = forbiddenConfig.store_designer_allowed_prefixes.some(
      (prefix) => rawPath.startsWith(prefix) || rawPath === prefix.replace(/^\//, "")
    );
    if (!allowed) {
      return {
        ok: false,
        reason: `ROLE_BOUNDARY_VIOLATION: StoreDesigner may not write '${rawPath}'`,
        path: rawPath,
      };
    }
  } else if (patch.by === "BankruptcyDesigner") {
    const allowed = forbiddenConfig.bankruptcy_designer_allowed_prefixes.some(
      (prefix) => rawPath.startsWith(prefix) || rawPath === prefix.replace(/^\//, "")
    );
    if (!allowed) {
      return {
        ok: false,
        reason: `ROLE_BOUNDARY_VIOLATION: BankruptcyDesigner may not write '${rawPath}'`,
        path: rawPath,
      };
    }
  }

  return { ok: true, path: rawPath };
}

function applyNumericOp(current: number, op: Patch["op"], val: number): number {
  if (op === "set" || op === "replace") return val;
  if (op === "add") return current + val;
  if (op === "mul") return current * val;
  return val;
}

/**
 * Apply a single validated StoreDesigner patch to a cloned StoreDesign.
 */
export function applyStorePatch(design: StoreDesign, patch: Patch): StoreDesign {
  const clone: StoreDesign = {
    ...design,
    deposit: { ...design.deposit },
    monthlyRent: { ...design.monthlyRent },
    fitoutCost: { ...design.fitoutCost },
  };

  const cleanKey = patch.path
    .replace(/^\/?(design|store)[./]?/, "")
    .replace(/^\//, "")
    .replace(/\.value$/, "");
  const numVal = Number(patch.value);
  if (!Number.isFinite(numVal)) return clone;

  switch (cleanKey) {
    case "seats":
      clone.seats = Math.round(applyNumericOp(clone.seats, patch.op, numVal));
      break;
    case "floorAreaM2":
      clone.floorAreaM2 = Number(applyNumericOp(clone.floorAreaM2, patch.op, numVal).toFixed(1));
      break;
    case "deposit":
      clone.deposit = {
        value: Math.round(applyNumericOp(clone.deposit.value, patch.op, numVal)),
        source: clone.deposit.source,
      };
      break;
    case "monthlyRent":
      clone.monthlyRent = {
        value: Math.round(applyNumericOp(clone.monthlyRent.value, patch.op, numVal)),
        source: clone.monthlyRent.source,
      };
      break;
    case "fitoutCost":
      clone.fitoutCost = {
        value: Math.round(applyNumericOp(clone.fitoutCost.value, patch.op, numVal)),
        source: clone.fitoutCost.source,
      };
      break;
    case "staffFte":
      clone.staffFte = Number(applyNumericOp(clone.staffFte, patch.op, numVal).toFixed(1));
      break;
    case "ownerHoursPerWeek":
      clone.ownerHoursPerWeek = Math.round(
        applyNumericOp(clone.ownerHoursPerWeek, patch.op, numVal)
      );
      break;
    case "menuTier": {
      const t = Math.round(applyNumericOp(clone.menuTier, patch.op, numVal));
      clone.menuTier = (t <= 1 ? 1 : t >= 3 ? 3 : 2) as 1 | 2 | 3;
      break;
    }
    case "avgTicketKrw":
      clone.avgTicketKrw = Math.round(applyNumericOp(clone.avgTicketKrw, patch.op, numVal));
      break;
    case "makeTimeSec":
      clone.makeTimeSec = Math.round(applyNumericOp(clone.makeTimeSec, patch.op, numVal));
      break;
    case "openDaysPerWeek":
      clone.openDaysPerWeek = Math.min(
        7,
        Math.max(1, Math.round(applyNumericOp(clone.openDaysPerWeek, patch.op, numVal)))
      );
      break;
    case "cupsPerDayBase":
      clone.cupsPerDayBase = Math.round(
        applyNumericOp(clone.cupsPerDayBase ?? 185, patch.op, numVal)
      );
      break;
    case "cogsRatio":
      clone.cogsRatio = Number(
        applyNumericOp(clone.cogsRatio ?? 0.32, patch.op, numVal).toFixed(3)
      );
      break;
    case "openingMonth":
      clone.openingMonth = Math.min(
        12,
        Math.max(1, Math.round(applyNumericOp(clone.openingMonth ?? 3, patch.op, numVal)))
      );
      break;
    default:
      break;
  }

  return clone;
}

/**
 * Validate a batch of `Patch[]` or `VariantPatchBundle[]`, reject any forbidden paths (AT-10)
 * or hard constraint violations (AT-03), and return accepted `StoreDesign[]` + rejection log.
 */
export function validateAndApplyPatchBundles(
  baseDesign: StoreDesign,
  bundles: readonly VariantPatchBundle[],
  constraints: Constraints
): BundleApplicationReport {
  const acceptedDesigns: StoreDesign[] = [];
  const rejectedPatches: { patchIndex: number; reason: string; path: string }[] = [];
  const rejectedBundles: { bundleId: string; reason: string; path?: string }[] = [];

  let globalPatchIdx = 0;

  for (const bundle of bundles) {
    let candidate: StoreDesign = {
      ...baseDesign,
      id: bundle.id,
      familyId: bundle.parentId ?? bundle.id,
    };
    let bundleRejected = false;

    for (const patch of bundle.patches) {
      const currentIdx = globalPatchIdx++;
      const pathCheck = validatePatchPath(patch);
      if (!pathCheck.ok) {
        const reason = pathCheck.reason ?? "Forbidden patch path";
        rejectedPatches.push({
          patchIndex: currentIdx,
          reason,
          path: patch.path,
        });
        if (!bundleRejected) {
          rejectedBundles.push({
            bundleId: bundle.id,
            reason,
            path: patch.path,
          });
        }
        bundleRejected = true;
        continue;
      }
      if (!bundleRejected) {
        candidate = applyStorePatch(candidate, patch);
      }
    }

    if (bundleRejected) {
      continue;
    }

    const constraintCheck = checkStoreConstraints(candidate, constraints);
    if (!constraintCheck.ok) {
      const reason = constraintCheck.rejectedReason ?? "Constraint violation";
      rejectedPatches.push({
        patchIndex: globalPatchIdx,
        reason,
        path: bundle.id,
      });
      rejectedBundles.push({
        bundleId: bundle.id,
        reason,
        path: bundle.id,
      });
      continue;
    }

    acceptedDesigns.push(candidate);
  }

  return {
    acceptedDesigns,
    rejectedPatches,
    rejectedBundles,
  };
}

/**
 * Validate BankruptcyDesigner shock proposals (AT-10 & AT-13).
 */
export function validateAdversarialShocks(
  shocks: readonly Shock[],
  patches: readonly Patch[] = []
): {
  acceptedShocks: Shock[];
  rejectedPatches: { patchIndex: number; reason: string; path: string }[];
} {
  const rejectedPatches: { patchIndex: number; reason: string; path: string }[] = [];
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const check = validatePatchPath(p);
    if (!check.ok) {
      rejectedPatches.push({
        patchIndex: i,
        reason: check.reason ?? "Forbidden path",
        path: p.path,
      });
    }
  }

  const validKinds = new Set<ShockKind>([
    "offseason",
    "franchise_entry",
    "rate_hike",
    "fitout_delay",
    "make_time_drift",
    "rent_increase",
    "demand_drop",
    "rentUp",
    "demandDown",
    "competitorOpen",
    "staffLoss",
    "supplyCostUp",
    "closureWeek",
  ]);

  const acceptedShocks: Shock[] = [];
  for (let i = 0; i < shocks.length; i++) {
    const s = shocks[i];
    if (!validKinds.has(s.kind)) {
      rejectedPatches.push({
        patchIndex: patches.length + i,
        reason: `INVALID_SHOCK_KIND: '${String(s.kind)}'`,
        path: "/shocks/kind",
      });
      continue;
    }
    acceptedShocks.push({
      ...s,
      startMonth: Math.min(36, Math.max(1, Math.round(s.startMonth))),
      durationMonths: Math.min(36, Math.max(1, Math.round(s.durationMonths))),
      magnitude: Math.min(0.60, Math.max(0.01, Number(s.magnitude))),
    });
  }

  return { acceptedShocks, rejectedPatches };
}
