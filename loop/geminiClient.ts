// loop/geminiClient.ts — Lane A2. Server-side Gemini API wrapper (@google/genai)
// with strict outbound host allowlist (AT-11), token usage logging (AT-14),
// and deterministic offline fallback when GEMINI_API_KEY is unset or offline mode is active.

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
 * or deterministically return `fallbackGenerator()` when offline / no key is present.
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

  if (req.offline || !apiKey) {
    const fallbackData = req.fallbackGenerator();
    const estInput = Math.max(120, Math.round(req.prompt.length / 3.5));
    const estOutput = Math.max(
      180,
      Math.round(JSON.stringify(fallbackData).length / 4)
    );
    return {
      data: fallbackData,
      usage: {
        model: `${model}`,
        call: req.callName,
        inputTokens: estInput,
        outputTokens: estOutput,
      },
      liveApiUsed: false,
    };
  }

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
    const inputTokens =
      response.usageMetadata?.promptTokenCount ??
      Math.max(120, Math.round(req.prompt.length / 3.5));
    const outputTokens =
      response.usageMetadata?.candidatesTokenCount ??
      Math.max(180, Math.round(rawText.length / 4));

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
    // Graceful fallback if network/quota fails during live demo
    const fallbackData = req.fallbackGenerator();
    return {
      data: fallbackData,
      usage: {
        model,
        call: `${req.callName}:fallback`,
        inputTokens: Math.max(120, Math.round(req.prompt.length / 3.5)),
        outputTokens: 320,
      },
      liveApiUsed: false,
    };
  }
}
