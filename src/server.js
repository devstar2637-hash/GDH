import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ENGINE_VERSION,
  computeCashflow36m,
  runSeededScenarioBatch,
  deriveNextMeasurement
} from "./domain/cashflowEngine.js";
import {
  SeoulContextRepository,
  evaluateObservedContextAndUserSimulation
} from "./data/seoulContextRepository.js";
import { GeminiProposalService } from "./services/geminiProposalService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body exceeds maximum allowed size."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("Request body must be a JSON object."));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error("Request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

export function createAppServer(options = {}) {
  const contextRepo = options.contextRepo || new SeoulContextRepository();
  const geminiService = options.geminiService || new GeminiProposalService();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/api/health") {
        const ctx = contextRepo.loadContext();
        const aiStatus = geminiService.getStatus();
        return sendJson(res, 200, {
          ok: true,
          appTitle: "A Thousand Stores",
          engineVersion: ENGINE_VERSION,
          contextStatus: ctx.status,
          contextSchemaVersion: ctx.schemaVersion,
          areaCount: ctx.areas.length,
          gemini: aiStatus
        });
      }

      if (req.method === "GET" && pathname === "/api/context") {
        const ctx = contextRepo.loadContext();
        const aiStatus = geminiService.getStatus();
        return sendJson(res, 200, {
          ok: true,
          context: ctx,
          gemini: aiStatus,
          deterministicPresets: [
            {
              id: "contract_case_1",
              label: "Deterministic Preset 1 · Baseline Positive Volume (tx=100)",
              isDeterministicPreset: true,
              isGeminiOutput: false,
              inputs: {
                budget: 120_000_000,
                deposit: 30_000_000,
                openingCost: 42_000_000,
                avgTicket: 5_000,
                transactionsPerDay: 100,
                tradingDaysPerMonth: 24,
                variableCostRatio: 0.35,
                monthlyFixedCost: 6_000_000
              }
            },
            {
              id: "contract_case_2",
              label: "Deterministic Preset 2 · Explicit Zero Volume Boundary (tx=0)",
              isDeterministicPreset: true,
              isGeminiOutput: false,
              inputs: {
                budget: 120_000_000,
                deposit: 30_000_000,
                openingCost: 42_000_000,
                avgTicket: 5_000,
                transactionsPerDay: 0,
                tradingDaysPerMonth: 24,
                variableCostRatio: 0.35,
                monthlyFixedCost: 6_000_000
              }
            },
            {
              id: "contract_case_3_fail",
              label: "Deterministic Preset 3 · Reserve Gate Shortfall (D=109M)",
              isDeterministicPreset: true,
              isGeminiOutput: false,
              inputs: {
                budget: 120_000_000,
                deposit: 109_000_000,
                openingCost: 0,
                avgTicket: 5_000,
                transactionsPerDay: 100,
                tradingDaysPerMonth: 24,
                variableCostRatio: 0.35,
                monthlyFixedCost: 6_000_000
              }
            }
          ]
        });
      }

      if (req.method === "POST" && pathname === "/api/simulate") {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message });
        }

        if (body.areaCode !== undefined && body.areaCode !== null && typeof body.areaCode !== "string" && typeof body.areaCode !== "number") {
          return sendJson(res, 400, { ok: false, error: "areaCode must be a string or number." });
        }
        if (body.seed !== undefined && body.seed !== null && (typeof body.seed !== "string" && typeof body.seed !== "number")) {
          return sendJson(res, 400, { ok: false, error: "seed must be a string or number." });
        }
        if (body.spreadConfig !== undefined && (!body.spreadConfig || typeof body.spreadConfig !== "object" || Array.isArray(body.spreadConfig))) {
          return sendJson(res, 400, { ok: false, error: "spreadConfig must be a plain object." });
        }

        const areaCode = body.areaCode ? String(body.areaCode) : null;
        const seed = String(body.seed || "seoul-cafe-2026-v1");
        // Never trust client-claimed verified Gemini origin; simulation always evaluates explicit user/preset assumptions
        const inputOrigin = "user_assumption";

        const ctx = contextRepo.loadContext();
        const areaRecord = areaCode ? contextRepo.getAreaByCode(areaCode) : null;
        const contextEval = evaluateObservedContextAndUserSimulation({
          areaRecord,
          userSimulationInputs: body.inputs
        });

        const cashflow = computeCashflow36m(body.inputs);
        if (!cashflow.ok) {
          return sendJson(res, 400, {
            ok: false,
            code: "INVALID_SIMULATION_INPUTS",
            errors: cashflow.errors,
            observedContextEvaluation: contextEval
          });
        }

        const batch = runSeededScenarioBatch(cashflow.inputs, {
          ...(body.spreadConfig || {}),
          seed
        });
        if (!batch.ok) {
          return sendJson(res, 400, {
            ok: false,
            code: "INVALID_SPREAD_CONFIG",
            errors: batch.errors
          });
        }

        const nextMeasurement = deriveNextMeasurement(cashflow);

        const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const executedAtUtc = new Date().toISOString();

        return sendJson(res, 200, {
          ok: true,
          runId,
          executedAtUtc,
          engineVersion: ENGINE_VERSION,
          inputOrigin,
          isGeminiRun: false,
          sourceSnapshot: {
            contextSchemaVersion: ctx.schemaVersion,
            quarterCode: ctx.quarterCode,
            attribution: ctx.attribution,
            selectedAreaCode: areaRecord ? areaRecord.areaCode : null,
            selectedAreaRawName: areaRecord ? areaRecord.areaName : null,
            selectedAreaSalesStatus: areaRecord ? areaRecord.salesDataStatus : "no_area_selected",
            observedSalesValue: areaRecord ? areaRecord.observedSales : null
          },
          observedContextEvaluation: contextEval,
          cashflow,
          scenarioBatch: batch,
          nextMeasurement
        });
      }

      if (req.method === "POST" && pathname === "/api/gemini/propose") {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message });
        }

        if (body.areaCode !== undefined && body.areaCode !== null && typeof body.areaCode !== "string" && typeof body.areaCode !== "number") {
          return sendJson(res, 400, { ok: false, error: "areaCode must be a string or number." });
        }

        const areaRecord = body.areaCode ? contextRepo.getAreaByCode(String(body.areaCode)) : null;
        const result = await geminiService.proposeBoundedAssumptions({
          baseInputs: body.inputs,
          areaContext: areaRecord
        });

        return sendJson(res, result.httpStatus || 200, result);
      }

      if (req.method === "GET") {
        const safePath = pathname === "/" ? "/index.html" : pathname;
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${safePath}`);
        if (!resolvedPath.startsWith(PUBLIC_DIR)) {
          return sendJson(res, 403, { ok: false, error: "Forbidden" });
        }
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          const ext = path.extname(resolvedPath);
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          });
          res.end(fs.readFileSync(resolvedPath));
          return;
        }
      }

      return sendJson(res, 404, { ok: false, error: "Not found" });
    } catch {
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT || 8080);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`A Thousand Stores server listening on http://0.0.0.0:${port}`);
  });
}
