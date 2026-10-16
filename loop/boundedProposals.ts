/** Server-only Gemini Interactions adapter. Live provider execution is not yet verified.
 * One request at a time, four requests per process, no retries or model fallback.
 * Official wire format: https://ai.google.dev/api/interactions-api
 */
import type { Constraints, StoreDesign, TokenUsage, VariantPatchBundle } from "../shared/types.js";
import { checkStoreConstraints } from "../engine/constraints.js";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_GEMINI_MODEL = "gemini-4-argon";
export const MAX_CALLS = 4;
export const CALL_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 65_536;

export const STRUCTURAL_BOUNDS = Object.freeze({
  seats: { min: 0, max: 500, integer: true },
  floorAreaM2: { min: 1, max: 2000, integer: false },
  staffFte: { min: 0, max: 20, integer: false },
  ownerHoursPerWeek: { min: 0, max: 112, integer: false },
  menuTier: { min: 1, max: 3, integer: true },
  makeTimeSec: { min: 10, max: 600, integer: false },
  openDaysPerWeek: { min: 1, max: 7, integer: true },
  openingMonth: { min: 1, max: 12, integer: true },
});
type StructuralField = keyof typeof STRUCTURAL_BOUNDS;
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function onlyKeys(value: RecordValue, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function validBase(base: StoreDesign, constraints: Constraints): boolean {
  if (!record(base) || !record(constraints)) return false;
  if (!Number.isFinite(constraints.budgetKrw) || constraints.budgetKrw <= 0 ||
      !Number.isFinite(constraints.reserveRatioMin) || constraints.reserveRatioMin < 0.10 ||
      constraints.reserveRatioMin > 1 || constraints.horizonMonths !== 36) return false;
  for (const value of Object.values(base)) {
    if (typeof value === "number" && !Number.isFinite(value)) return false;
  }
  for (const key of ["deposit", "monthlyRent", "fitoutCost"] as const) {
    if (!record(base[key]) || typeof base[key].value !== "number" || !Number.isFinite(base[key].value)) return false;
  }
  return checkStoreConstraints(base, constraints).ok;
}

export type PatchValidation =
  | { valid: true; design: StoreDesign; bundle: VariantPatchBundle }
  | { valid: false; reason: string };

/** Flat structural allowlist: never resolves arbitrary object paths or prototypes. */
export function validatePatchBundle(raw: unknown, base: StoreDesign, constraints: Constraints): PatchValidation {
  if (!validBase(base, constraints)) return { valid: false, reason: "invalid_base" };
  if (!record(raw) || !onlyKeys(raw, ["id", "parentId", "patches"]) ||
      typeof raw.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(raw.id) ||
      (raw.parentId !== undefined && raw.parentId !== base.id) ||
      !Array.isArray(raw.patches) || raw.patches.length < 1 || raw.patches.length > 4) {
    return { valid: false, reason: "invalid_bundle" };
  }
  const design = structuredClone(base);
  const patches: VariantPatchBundle["patches"] = [];
  const seen = new Set<string>();
  for (const patch of raw.patches) {
    if (!record(patch) || !onlyKeys(patch, ["path", "op", "value", "by"]) ||
        typeof patch.path !== "string" || !Object.hasOwn(STRUCTURAL_BOUNDS, patch.path) ||
        seen.has(patch.path) || (patch.op !== "set" && patch.op !== "replace") ||
        (patch.by !== undefined && patch.by !== "StoreDesigner") ||
        typeof patch.value !== "number" || !Number.isFinite(patch.value)) {
      return { valid: false, reason: "forbidden_or_invalid_patch" };
    }
    const field = patch.path as StructuralField;
    const bounds = STRUCTURAL_BOUNDS[field];
    if (patch.value < bounds.min || patch.value > bounds.max ||
        (bounds.integer && !Number.isInteger(patch.value))) return { valid: false, reason: "patch_out_of_bounds" };
    design[field] = patch.value as never;
    seen.add(field);
    patches.push({ path: field, op: patch.op, value: patch.value, by: "StoreDesigner" });
  }
  if (!checkStoreConstraints(design, constraints).ok) return { valid: false, reason: "engine_constraint_rejected" };
  if (!patches.some((patch) => base[patch.path as StructuralField] !== patch.value)) {
    return { valid: false, reason: "unchanged_design" };
  }
  design.id = raw.id;
  design.familyId = raw.id;
  return { valid: true, design, bundle: { id: raw.id, parentId: base.id, patches } };
}

export class DesignGenerationError extends Error {
  constructor(public readonly code: "UNCONFIGURED" | "BUSY" | "CALL_LIMIT" | "CANCELLED" | "INVALID_INPUT", message: string) {
    super(message);
    this.name = "DesignGenerationError";
  }
}
export interface GenerationOptions { maxDesigns?: number; signal?: AbortSignal }
export interface GenerationResult {
  designs: StoreDesign[];
  tokens: TokenUsage[];
  model: string;
  status: "generated" | "partial" | "failed";
  reason: string | null;
}
interface GeneratorDependencies {
  fetchImpl?: typeof fetch;
  getApiKey?: () => string;
  getModel?: () => string;
  timeoutMs?: number;
}

function outputText(data: RecordValue): string | null {
  if (data.status !== "completed" || !Array.isArray(data.steps)) return null;
  const parts: string[] = [];
  for (const step of data.steps) {
    if (!record(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const item of step.content) {
      if (record(item) && item.type === "text" && typeof item.text === "string") parts.push(item.text);
    }
  }
  return parts.length ? parts.join("") : null;
}
function tokenRow(data: RecordValue, model: string, call: string): TokenUsage | null {
  if (!record(data.usage)) return null;
  const input = data.usage.total_input_tokens;
  const output = data.usage.total_output_tokens;
  if (typeof input !== "number" || typeof output !== "number" ||
      !Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) return null;
  return { model, call, inputTokens: input, outputTokens: output };
}
async function boundedText(response: Response): Promise<string> {
  if (!response.body) throw new Error("empty_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("response_too_large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

/** Factory is for isolated I/O tests; production uses the single module instance below. */
export function createDesignGenerator(deps: GeneratorDependencies = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const getApiKey = deps.getApiKey ?? (() => process.env.GEMINI_API_KEY ?? "");
  const getModel = deps.getModel ?? (() => process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
  const timeoutMs = Math.min(CALL_TIMEOUT_MS, Math.max(1, deps.timeoutMs ?? CALL_TIMEOUT_MS));
  let busy = false;
  let calls = 0;
  return async function generate(base: StoreDesign, constraints: Constraints, options: GenerationOptions = {}): Promise<GenerationResult> {
    const key = getApiKey().trim();
    if (!key) throw new DesignGenerationError("UNCONFIGURED", "Server GEMINI_API_KEY is not configured. AI generation is unavailable.");
    if (busy) throw new DesignGenerationError("BUSY", "A model request is already running. Wait for its result.");
    if (calls >= MAX_CALLS) throw new DesignGenerationError("CALL_LIMIT", "The server model-call budget of four has been reached.");
    if (options.signal?.aborted) throw new DesignGenerationError("CANCELLED", "Model request cancelled before execution.");
    const count = options.maxDesigns ?? 4;
    const model = getModel().trim();
    if (!validBase(base, constraints) || !Number.isInteger(count) || count < 1 || count > 4 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(model)) {
      throw new DesignGenerationError("INVALID_INPUT", "Valid base inputs and maxDesigns between one and four are required.");
    }
    busy = true;
    const call = `gemini-call-${++calls}`;
    const tokens: TokenUsage[] = [];
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const fail = (reason: string): GenerationResult => ({ designs: [], tokens, model, status: "failed", reason });
    try {
      const schema = {
        type: "object", additionalProperties: false,
        properties: { designs: { type: "array", minItems: 1, maxItems: count, items: {
          type: "object", additionalProperties: false, required: ["id", "patches"],
          properties: { id: { type: "string" }, patches: { type: "array", minItems: 1, maxItems: 4, items: {
            type: "object", additionalProperties: false, required: ["path", "op", "value"],
            properties: { path: { type: "string", enum: Object.keys(STRUCTURAL_BOUNDS) }, op: { type: "string", enum: ["set"] }, value: { type: "number" } },
          } } },
        } } }, required: ["designs"],
      };
      const response = await fetchImpl(GEMINI_ENDPOINT, {
        method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: controller.signal,
        body: JSON.stringify({
          model, store: false,
          input: ["Propose cafe structural alternatives, not financial outcomes or recommendations.",
            `Return strict JSON {designs:[{id,patches:[{path,op:'set',value}]}]} with 1..${count} unique alternatives and 1..4 numeric patches each.`,
            `Only these flat paths and bounds are allowed: ${JSON.stringify(STRUCTURAL_BOUNDS)}.`,
            "All money, demand, cost ratios, constraints, budget, reserve, horizon, evidence and results are immutable. Never output verdicts, probabilities or source claims.",
            `Base design: ${JSON.stringify(base)}`, `Frozen constraints: ${JSON.stringify(constraints)}`].join("\n"),
          response_format: { type: "text", mime_type: "application/json", schema },
          generation_config: { max_output_tokens: 1200, thinking_level: "low" },
        }),
      });
      if (!response.ok) return fail("provider_http_error");
      const data: unknown = JSON.parse(await boundedText(response));
      if (!record(data)) return fail("invalid_provider_response");
      const usage = tokenRow(data, model, call);
      if (usage) tokens.push(usage);
      if (typeof data.model === "string" && data.model !== model) return fail("provider_model_mismatch");
      if (!usage) return fail("provider_usage_unavailable");
      const text = outputText(data);
      if (!text) return fail("provider_output_incomplete");
      const parsed: unknown = JSON.parse(text);
      if (!record(parsed) || !onlyKeys(parsed, ["designs"]) || !Array.isArray(parsed.designs) ||
          parsed.designs.length < 1 || parsed.designs.length > count) return fail("invalid_output_shape");
      const designs: StoreDesign[] = [];
      const ids = new Set<string>();
      const fingerprints = new Set<string>();
      for (const raw of parsed.designs) {
        const validated = validatePatchBundle(raw, base, constraints);
        if (!validated.valid || ids.has(validated.design.id)) continue;
        const fingerprint = JSON.stringify(Object.keys(STRUCTURAL_BOUNDS).map((field) => validated.design[field as StructuralField]));
        if (fingerprints.has(fingerprint)) continue;
        ids.add(validated.design.id);
        fingerprints.add(fingerprint);
        designs.push(validated.design);
      }
      if (!designs.length) return fail("no_valid_designs");
      return { designs, tokens, model, status: designs.length === parsed.designs.length ? "generated" : "partial",
        reason: designs.length === parsed.designs.length ? null : "invalid_or_duplicate_designs_rejected" };
    } catch {
      return fail(timedOut ? "provider_timeout" : controller.signal.aborted ? "cancelled" : "provider_request_failed");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      busy = false;
    }
  };
}

export const generateDesigns = createDesignGenerator();
