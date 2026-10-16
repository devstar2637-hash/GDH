// engine/prng.ts — Lane A1. Deterministic PRNG (mulberry32) and canonical SHA-256 hashing.
// No Math.random() or Date.now() allowed in engine calculations (AT-06).

import { createHash } from "node:crypto";

export type Prng = () => number;

/**
 * Mulberry32 deterministic 32-bit PRNG returning values in [0, 1).
 */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic integer in [min, max] inclusive.
 */
export function randInt(prng: Prng, min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

/**
 * Deterministic float in [min, max).
 */
export function randRange(prng: Prng, min: number, max: number): number {
  return min + prng() * (max - min);
}

/**
 * Deterministically serialize any JSON-compatible value with sorted object keys.
 */
export function canonicalJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJsonString(item)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJsonString(obj[k]))
      .join(",") +
    "}"
  );
}

/**
 * Compute SHA-256 hex digest of canonical JSON representation (AT-06, AT-14).
 */
export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJsonString(value)).digest("hex");
}
