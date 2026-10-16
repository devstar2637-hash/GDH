// loop/geminiClient.ts — Lane A2. Server-side Gemini API wrapper (@google/genai)
// with strict outbound host allowlist (AT-11), token usage logging (AT-14),
// and explicitly labelled offline replay. Provider failures never fabricate output or usage.

import { GoogleGenAI } from "@google/genai";
import type { TokenUsage } from "../shared/types.js";

export const ALLOWED_OUTBOUND_HOSTS: readonly string[] = [
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
  "data.seoul.go.kr",
  "openapi.seoul.go.kr",
  "localhost",
  "127.0.0.1",
];

export const FORBIDDEN_ACTION_KEYWORDS: readonly string[] = [
  "stripe.com",
  "paypal.com",
  "toss.im",
  "sendgrid.com",
  "mailgun.org",
  "docusign.com",
  "modusign.co.kr",
];

/**
 * Verify that an outbound URL targets only the permitted allowlist and never a payment/mail/contract endpoint (AT-11).
 */
export function verifyOutboundUrlAllowed(urlStr: string): {
  allowed: boolean;
  host: string;
  reason?: string;
} {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    for (const bad of FORBIDDEN_ACTION_KEYWORDS) {
      if (host.includes(bad)) {
        return {
          allowed: false,
          host,
          reason: `FORBIDDEN_EXTERNAL_ACTION_HOST: '${host}' matches '${bad}'`,
        };
      }
    }

    const ok = ALLOWED_OUTBOUND_HOSTS.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`)
    );
    if (!ok) {
      return {
        allowed: false,
        host,
        reason: `HOST_NOT_IN_ALLOWLIST: '${host}'`,
      };
    }

    return { allowed: true, host };
  } catch {
    return { allowed: false, host: "", reason: "INVALID_URL" };
  }
}

export interface GeminiJsonRequest<T> {
  model?: "gemini-2.5-flash" | "gemini-2.5-pro";
  callName: string;
  prompt: string;
  fallbackGenerator: () => T;
  offline?: boolean;
}

export interface GeminiJsonResponse<T> {
  data: T;
  usage: TokenUsage;
  liveApiUsed: boolean;
}

/**
 * Call Gemini structured JSON generation when `GEMINI_API_KEY` is configured on the server,
 * or return labelled deterministic replay only when offline was explicitly selected.
 */
export async function callGeminiStructured<T>(
  req: GeminiJsonRequest<T>
): Promise<GeminiJsonResponse<T>> {
  const model = req.model ?? "gemini-2.5-flash";
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  // Verify outbound endpoint against AT-11 allowlist before any network call
  const endpointCheck = verifyOutboundUrlAllowed(
    "https://generativelanguage.googleapis.com/v1beta/models"
  );
  if (!endpointCheck.allowed) {
    throw new Error(endpointCheck.reason);
  }

  if (req.offline) {
    const fallbackData = req.fallbackGenerator();
    return {
      data: fallbackData,
      usage: {
        model: "replay:deterministic",
        call: `${req.callName}:replay`,
        inputTokens: 0,
        outputTokens: 0,
      },
      liveApiUsed: false,
    };
  }
  if (!apiKey) throw new Error("GEMINI_UNCONFIGURED: live generation requires a server API key.");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: req.prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const rawText = response.text ?? "";
    const parsed = JSON.parse(rawText) as T;
    const inputTokens = response.usageMetadata?.promptTokenCount;
    const outputTokens = response.usageMetadata?.candidatesTokenCount;
    if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
        typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
      throw new Error("usage_unavailable");
    }

    return {
      data: parsed,
      usage: {
        model,
        call: req.callName,
        inputTokens,
        outputTokens,
      },
      liveApiUsed: true,
    };
  } catch {
    // Never expose provider error bodies, credentials, or synthetic token estimates.
    throw new Error("GEMINI_REQUEST_FAILED: live generation or measured usage is unavailable; no replay substituted.");
  }
}
