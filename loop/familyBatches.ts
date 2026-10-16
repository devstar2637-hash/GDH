/** Server-only 5 x 100-family Gemini Interactions request path.
 * Live provider execution remains unverified. No retries, fallback, or synthetic usage.
 * Wire format: https://ai.google.dev/api/interactions-api
 */
import type { Constraints, StoreDesign, TokenUsage } from "../shared/types.js";
import {
  DEFAULT_GEMINI_MODEL, DesignGenerationError, GEMINI_ENDPOINT,
  STRUCTURAL_BOUNDS, validatePatchBundle,
} from "./boundedProposals.js";

export const FAMILY_BATCH_LIMITS = Object.freeze({
  requests: 5, familiesPerRequest: 100, families: 500, concurrency: 4,
  callTimeoutMs: 30_000, totalTimeoutMs: 75_000, responseBytes: 1_048_576,
});
export interface FamilyGenerationResult {
  designs: StoreDesign[];
  tokens: TokenUsage[];
  model: string;
  status: "generated" | "partial" | "failed";
  reason: string | null;
  /** Provider responses explicitly marked completed, not the number dispatched. */
  requestsCompleted: number;
}
export interface FamilyGenerationOptions { signal?: AbortSignal }
export interface FamilyGeneratorDependencies {
  fetchImpl?: typeof fetch;
  getApiKey?: () => string;
  getModel?: () => string;
  callTimeoutMs?: number;
  totalTimeoutMs?: number;
}
type Obj = Record<string, unknown>;
interface CallResult { designs: StoreDesign[]; tokens: TokenUsage | null; reason: string | null; completed: boolean }
function object(value: unknown): value is Obj {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function measuredUsage(data: Obj, model: string, index: number): TokenUsage | null {
  if (!object(data.usage)) return null;
  const input = data.usage.total_input_tokens;
  const output = data.usage.total_output_tokens;
  if (typeof input !== "number" || typeof output !== "number" ||
      !Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) return null;
  return { model, call: `family-batch-${index + 1}`, inputTokens: input, outputTokens: output };
}
function modelOutput(data: Obj): string | null {
  if (data.status !== "completed" || !Array.isArray(data.steps)) return null;
  const parts: string[] = [];
  for (const step of data.steps) {
    if (!object(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const part of step.content) {
      if (object(part) && part.type === "text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.length ? parts.join("") : null;
}
function aborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error("aborted"));
    signal.addEventListener("abort", stop, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
async function boundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error("empty_body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await aborted(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > FAMILY_BATCH_LIMITS.responseBytes) throw new Error("response_too_large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}
/** Compare complete design parameter sets, ignoring identifiers and provenance. */
function economicFingerprint(design: StoreDesign): string {
  function parameters(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(parameters);
    if (!object(value)) return value;
    if (Object.hasOwn(value, "value") && Object.hasOwn(value, "source")) return parameters(value.value);
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => !["id", "familyId", "source"].includes(key))
      .map((key) => [key, parameters(value[key])]));
  }
  return JSON.stringify(parameters(design));
}

/** DI factory for isolated tests. The production export below owns a single lifetime batch budget. */
export function createFamilyDesignGenerator(deps: FamilyGeneratorDependencies = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const getKey = deps.getApiKey ?? (() => process.env.GEMINI_API_KEY ?? "");
  const getModel = deps.getModel ?? (() => process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
  const callTimeoutMs = Math.min(30_000, Math.max(1, deps.callTimeoutMs ?? 30_000));
  const totalTimeoutMs = Math.min(75_000, Math.max(1, deps.totalTimeoutMs ?? 75_000));
  let busy = false;
  let consumed = false;
  return async function generateFamilyDesigns(base: StoreDesign, constraints: Constraints, options: FamilyGenerationOptions = {}): Promise<FamilyGenerationResult> {
    const key = getKey().trim();
    if (!key) throw new DesignGenerationError("UNCONFIGURED", "Server GEMINI_API_KEY is not configured. AI generation is unavailable.");
    if (busy) throw new DesignGenerationError("BUSY", "A family batch is already running.");
    if (consumed) throw new DesignGenerationError("CALL_LIMIT", "The server five-call family batch budget has been consumed.");
    if (options.signal?.aborted) throw new DesignGenerationError("CANCELLED", "Family generation cancelled before execution.");
    const model = getModel().trim();
    const probe = validatePatchBundle({ id: "preflight", patches: [{ path: "seats", op: "set", value: base?.seats }] }, base, constraints);
    if ((!probe.valid && probe.reason !== "unchanged_design") || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(model)) {
      throw new DesignGenerationError("INVALID_INPUT", "Valid base design, frozen constraints and model identifier are required.");
    }
    busy = true;
    consumed = true;
    const batch = new AbortController();
    let totalTimedOut = false;
    const timer = setTimeout(() => { totalTimedOut = true; batch.abort(); }, totalTimeoutMs);
    const cancel = () => batch.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const results: (CallResult | undefined)[] = Array(5);
    let next = 0;

    const request = async (index: number): Promise<CallResult> => {
      const controller = new AbortController();
      let callTimedOut = false;
      const callTimer = setTimeout(() => { callTimedOut = true; controller.abort(); }, callTimeoutMs);
      const cancelCall = () => controller.abort();
      batch.signal.addEventListener("abort", cancelCall, { once: true });
      let completed = false;
      let usage: TokenUsage | null = null;
      const failure = (reason: string): CallResult => ({ designs: [], tokens: usage, reason, completed });
      try {
        if (batch.signal.aborted) return failure(totalTimedOut ? "batch_timeout" : "cancelled");
        const schema = {
          type: "object", additionalProperties: false, required: ["designs"], properties: {
            designs: { type: "array", minItems: 100, maxItems: 100, items: {
              type: "object", additionalProperties: false, required: ["id", "patches"], properties: {
                id: { type: "string" }, patches: { type: "array", minItems: 1, maxItems: 4, items: {
                  type: "object", additionalProperties: false, required: ["path", "op", "value"], properties: {
                    path: { type: "string", enum: Object.keys(STRUCTURAL_BOUNDS) },
                    op: { type: "string", enum: ["set"] }, value: { type: "number" },
                  },
                } },
              },
            } },
          },
        };
        const response = await aborted(fetchImpl(GEMINI_ENDPOINT, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            model, store: false,
            input: [
              `Store Designer batch ${index + 1} of 5. Return exactly 100 unique cafe structural design families as strict JSON {designs:[{id,patches:[{path,op:'set',value}]}]}.`,
              `Use IDs batch${index + 1}-001 through batch${index + 1}-100. Use 1..4 patches per design.`,
              "Diversify combinations of operating structure, staffing, menu, space and preparation speed; do not merely rename the same parameter set.",
              `Allowed flat numeric fields and bounds: ${JSON.stringify(STRUCTURAL_BOUNDS)}.`,
              "Do not modify money, demand, cost ratios, budget, reserve, horizon, oracle, source tags, results or labels. No verdicts or probabilities.",
              `Base: ${JSON.stringify(base)}`, `Frozen constraints: ${JSON.stringify(constraints)}`,
            ].join("\n"),
            response_format: { type: "text", mime_type: "application/json", schema },
            generation_config: { max_output_tokens: 20_000, thinking_level: "medium" },
          }),
        }), controller.signal);
        if (!response.ok) return failure("provider_http_error");
        const data: unknown = JSON.parse(await boundedBody(response, controller.signal));
        if (!object(data)) return failure("invalid_provider_response");
        completed = data.status === "completed";
        usage = measuredUsage(data, model, index);
        if (typeof data.model === "string" && data.model !== model) return failure("provider_model_mismatch");
        if (!usage) return failure("provider_usage_unavailable");
        const text = modelOutput(data);
        if (!text) return failure("provider_output_incomplete");
        const parsed: unknown = JSON.parse(text);
        if (!object(parsed) || Object.keys(parsed).some((key) => key !== "designs") ||
            !Array.isArray(parsed.designs) || parsed.designs.length < 1 || parsed.designs.length > 100) return failure("invalid_output_shape");
        const designs: StoreDesign[] = [];
        for (const candidate of parsed.designs) {
          const checked = validatePatchBundle(candidate, base, constraints);
          if (checked.valid) designs.push(checked.design);
        }
        return { designs, tokens: usage, completed,
          reason: designs.length === 100 ? null : "fewer_than_100_valid_families" };
      } catch {
        return failure(totalTimedOut ? "batch_timeout" : callTimedOut ? "provider_timeout" : batch.signal.aborted ? "cancelled" : "provider_request_failed");
      } finally {
        clearTimeout(callTimer);
        batch.signal.removeEventListener("abort", cancelCall);
      }
    };
    const worker = async () => {
      while (!batch.signal.aborted) {
        const index = next++;
        if (index >= 5) return;
        results[index] = await request(index);
      }
    };
    try {
      await Promise.all(Array.from({ length: 4 }, () => worker()));
      const designs: StoreDesign[] = [];
      const tokens: TokenUsage[] = [];
      const ids = new Set<string>();
      const parameterSets = new Set<string>();
      const reasons = new Set<string>();
      let requestsCompleted = 0;
      for (const result of results) {
        if (!result) { reasons.add(totalTimedOut ? "batch_timeout" : "cancelled"); continue; }
        if (result.completed) requestsCompleted++;
        if (result.tokens) tokens.push(result.tokens);
        if (result.reason) reasons.add(result.reason);
        for (const design of result.designs) {
          const fingerprint = economicFingerprint(design);
          if (ids.has(design.id) || parameterSets.has(fingerprint)) { reasons.add("duplicate_families_rejected"); continue; }
          ids.add(design.id);
          parameterSets.add(fingerprint);
          designs.push(design);
        }
      }
      const complete = designs.length === 500 && requestsCompleted === 5 && tokens.length === 5 && reasons.size === 0;
      return { designs, tokens, model, requestsCompleted,
        status: complete ? "generated" : designs.length ? "partial" : "failed",
        reason: complete ? null : `valid_families=${designs.length}/500; ${[...reasons].sort().join(",") || "incomplete_batch"}` };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      busy = false;
    }
  };
}

export const generateFamilyDesigns = createFamilyDesignGenerator();
