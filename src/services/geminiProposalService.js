import { validateSimulationInputs, computeCashflow36m } from "../domain/cashflowEngine.js";

/**
 * Server-Side Gemini Interactions Proposal Service
 *
 * Rules per docs/BUILD_CONTRACT.md & review:
 * - Official REST endpoint: https://generativelanguage.googleapis.com/v1beta/interactions
 * - API key read ONLY from server environment GEMINI_API_KEY (never exposed to client, logs, or responses).
 * - Configurable model via GEMINI_MODEL (default: "gemini-3.8-flash").
 * - Explicit "unconfigured" status when GEMINI_API_KEY is missing. Never fakes AI output.
 * - Per-instance global in-flight limit (max 1 concurrent call) and small call quota (max 10 calls/window).
 * - Request timeout and output budget.
 * - LLM proposes bounded numeric assumptions only; deterministic engine verifies and computes. No LLM financial verdict.
 */

export const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const PROPOSAL_BOUNDS = Object.freeze({
  avgTicket: { min: 1_500, max: 30_000 },
  transactionsPerDay: { min: 1, max: 2_000 },
  tradingDaysPerMonth: { min: 15, max: 31 },
  variableCostRatio: { min: 0.10, max: 0.85 },
  monthlyFixedCost: { min: 500_000, max: 100_000_000 }
});

export function sanitizeErrorMessage(err) {
  const raw = err instanceof Error ? err.message : String(err || "Unknown error");
  // Redact anything resembling an API key or query string key
  return raw
    .replace(/AIza[0-9A-Za-z\-_]{15,}/g, "[REDACTED_KEY]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .slice(0, 240);
}

export const GEMINI_PROPOSAL_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    avgTicket: { type: "integer" },
    transactionsPerDay: { type: "integer" },
    tradingDaysPerMonth: { type: "integer" },
    variableCostRatio: { type: "number" },
    monthlyFixedCost: { type: "integer" },
    rationaleNote: { type: "string" },
    measurementFocus: { type: "string" }
  },
  required: [
    "avgTicket",
    "transactionsPerDay",
    "tradingDaysPerMonth",
    "variableCostRatio",
    "monthlyFixedCost",
    "rationaleNote",
    "measurementFocus"
  ]
});

export function verifyAndValidateProposalPayload(rawCandidate, baseInputs) {
  if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) {
    return { valid: false, reason: "Proposal payload is not a JSON object." };
  }

  const integerFields = ["avgTicket", "transactionsPerDay", "tradingDaysPerMonth", "monthlyFixedCost"];
  for (const field of integerFields) {
    const val = rawCandidate[field];
    if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val)) {
      return {
        valid: false,
        reason: `Proposed ${field} must be a finite integer number.`
      };
    }
  }

  if (typeof rawCandidate.variableCostRatio !== "number" || !Number.isFinite(rawCandidate.variableCostRatio)) {
    return {
      valid: false,
      reason: "Proposed variableCostRatio must be a finite number."
    };
  }

  const proposedAssumptions = {
    budget: baseInputs.budget,
    deposit: baseInputs.deposit,
    openingCost: baseInputs.openingCost,
    avgTicket: rawCandidate.avgTicket,
    transactionsPerDay: rawCandidate.transactionsPerDay,
    tradingDaysPerMonth: rawCandidate.tradingDaysPerMonth,
    variableCostRatio: rawCandidate.variableCostRatio,
    monthlyFixedCost: rawCandidate.monthlyFixedCost
  };

  for (const [key, bounds] of Object.entries(PROPOSAL_BOUNDS)) {
    const v = proposedAssumptions[key];
    if (!Number.isFinite(v) || v < bounds.min || v > bounds.max) {
      return {
        valid: false,
        reason: `Proposed ${key} (${v}) is outside strict verification bounds [${bounds.min}, ${bounds.max}].`
      };
    }
  }

  const engineCheck = validateSimulationInputs(proposedAssumptions);
  if (!engineCheck.valid) {
    return {
      valid: false,
      reason: `Engine validation rejected proposed assumptions: ${engineCheck.errors.map((e) => e.message).join("; ")}`
    };
  }

  const verifiedCashflow = computeCashflow36m(proposedAssumptions);
  if (!verifiedCashflow.ok) {
    return { valid: false, reason: "Deterministic cashflow engine rejected proposed assumptions." };
  }

  return {
    valid: true,
    verifiedAssumptions: verifiedCashflow.inputs,
    verifiedCashflow,
    rationaleNote:
      typeof rawCandidate.rationaleNote === "string"
        ? rawCandidate.rationaleNote.slice(0, 320)
        : "Bounded assumption proposal verified by deterministic engine.",
    measurementFocus:
      typeof rawCandidate.measurementFocus === "string"
        ? rawCandidate.measurementFocus.slice(0, 240)
        : "Count daily foot traffic and verify supplier unit costs before lease commitment."
  };
}

export class GeminiProposalService {
  constructor(options = {}) {
    this.getApiKey = options.getApiKey || (() => process.env.GEMINI_API_KEY || "");
    this.getModel = options.getModel || (() => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    this.endpoint = options.endpoint || GEMINI_INTERACTIONS_ENDPOINT;
    this.timeoutMs = options.timeoutMs || 10_000;
    this.maxInFlight = options.maxInFlight || 1;
    this.maxCallsPerInstance = options.maxCallsPerInstance || 10;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;

    this.inFlightCount = 0;
    this.callsUsed = 0;
  }

  getStatus() {
    const apiKey = this.getApiKey().trim();
    const configured = apiKey.length > 0;
    return {
      status: configured ? "configured" : "unconfigured",
      configured,
      model: this.getModel(),
      endpoint: this.endpoint,
      quota: {
        maxInFlight: this.maxInFlight,
        inFlightCount: this.inFlightCount,
        maxCallsPerInstance: this.maxCallsPerInstance,
        callsUsed: this.callsUsed,
        callsRemaining: Math.max(0, this.maxCallsPerInstance - this.callsUsed)
      },
      note: configured
        ? "Server-side Gemini Interactions key is present. One bounded call per user request."
        : "GEMINI_API_KEY is not configured on the server. AI proposal generation remains unavailable; deterministic engine is fully active."
    };
  }

  async proposeBoundedAssumptions({ baseInputs, areaContext }) {
    const apiKey = this.getApiKey().trim();
    const model = this.getModel();

    if (!apiKey) {
      return {
        ok: false,
        status: "unconfigured",
        httpStatus: 503,
        model,
        message: "GEMINI_API_KEY is not configured on the server. No fake AI output is generated."
      };
    }

    if (this.inFlightCount >= this.maxInFlight) {
      return {
        ok: false,
        status: "rate_limited_in_flight",
        httpStatus: 429,
        model,
        message: "A Gemini proposal request is already in flight on this server instance. Please wait for it to complete."
      };
    }

    if (this.callsUsed >= this.maxCallsPerInstance) {
      return {
        ok: false,
        status: "quota_exhausted",
        httpStatus: 429,
        model,
        message: `Server instance Gemini call quota (${this.maxCallsPerInstance}) reached.`
      };
    }

    const baseValidation = validateSimulationInputs(baseInputs);
    if (!baseValidation.valid) {
      return {
        ok: false,
        status: "invalid_base_inputs",
        httpStatus: 400,
        model,
        message: "Base inputs must be valid before requesting a bounded Gemini assumption proposal.",
        errors: baseValidation.errors
      };
    }

    this.inFlightCount += 1;
    this.callsUsed += 1;

    try {
      const promptText = [
        "You assist a prospective Seoul cafe owner in proposing bounded numeric stress-test assumptions.",
        "Do NOT issue a financial verdict or survival probability. Only return strict JSON with keys:",
        "avgTicket (integer 1500..30000), transactionsPerDay (integer 1..2000), tradingDaysPerMonth (integer 15..31),",
        "variableCostRatio (number 0.10..0.85), monthlyFixedCost (integer 500000..100000000),",
        "rationaleNote (short string <= 200 chars), measurementFocus (short string <= 160 chars).",
        `Current user assumptions: ${JSON.stringify(baseValidation.inputs)}`,
        areaContext
          ? `Observed area context (${areaContext.areaCode} ${areaContext.areaName}, stores=${areaContext.observedStores?.totalStores}): salesStatus=${areaContext.salesDataStatus}`
          : "Observed area context: none selected."
      ].join("\n");

      const requestBody = {
        model,
        input: promptText,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: GEMINI_PROPOSAL_RESPONSE_SCHEMA
        },
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 450
        }
      };

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        return {
          ok: false,
          status: "provider_error",
          httpStatus: 502,
          model,
          providerHttpStatus: response.status,
          message: `Gemini Interactions endpoint returned HTTP ${response.status}.`
        };
      }

      const data = await response.json();
      const rawText = extractInteractionText(data);
      if (!rawText) {
        return {
          ok: false,
          status: "unparseable_response",
          httpStatus: 502,
          model,
          message: "Gemini Interactions response did not contain a completed model_output text block."
        };
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        return {
          ok: false,
          status: "invalid_json_output",
          httpStatus: 502,
          model,
          message: "Gemini output was not valid JSON."
        };
      }

      const verification = verifyAndValidateProposalPayload(parsedJson, baseValidation.inputs);
      if (!verification.valid) {
        return {
          ok: false,
          status: "verification_failed",
          httpStatus: 422,
          model,
          message: verification.reason
        };
      }

      return {
        ok: true,
        status: "verified_ai_proposal",
        httpStatus: 200,
        model,
        interactionId: typeof data.id === "string" ? data.id : null,
        usage: data.usage && typeof data.usage === "object" && !Array.isArray(data.usage) ? data.usage : null,
        proposedAssumptions: verification.verifiedAssumptions,
        rationaleNote: verification.rationaleNote,
        measurementFocus: verification.measurementFocus,
        verifiedByEngine: {
          monthlySales: verification.verifiedCashflow.monthlyMetrics.monthlySales,
          monthlyOperatingCashChange: verification.verifiedCashflow.monthlyMetrics.monthlyOperatingCashChange,
          month36Cash: verification.verifiedCashflow.checkpoints.month36Cash,
          firstPositiveIntegerDailyTransactions:
            verification.verifiedCashflow.breakEvenBoundary.firstPositiveIntegerDailyTransactions
        }
      };
    } catch {
      return {
        ok: false,
        status: "request_failed",
        httpStatus: 504,
        model,
        message: "Gemini transport request failed or timed out."
      };
    } finally {
      this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    }
  }
}

export function extractInteractionText(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.status !== "completed") return null;
  if (!Array.isArray(data.steps)) return null;

  const textParts = [];
  for (const step of data.steps) {
    if (!step || typeof step !== "object" || step.type !== "model_output") {
      continue;
    }
    if (!Array.isArray(step.content)) {
      continue;
    }
    for (const part of step.content) {
      if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }

  const joined = textParts.join("").trim();
  return joined.length > 0 ? joined : null;
}
