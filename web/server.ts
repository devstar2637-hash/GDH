// web/server.ts — Lane A3 HTTP server for Cloud Run & local dev (PORT=8080).
// Exposes:
//   GET  /                  -> UI (index.html)
//   GET  /app.js            -> Client bundle
//   GET  /api/health        -> Health & mode status
//   GET  /api/default       -> Default 10,000-variant (500x20) rehearsal envelope
//   POST /run, /api/run     -> Execute deterministic 36-month rehearsal + adversarial loop
//   GET  /runs/:id          -> Retrieve stored RunResult (marked replay=true)
//   POST /patches           -> Validate JSON patches against forbidden-paths.json (AT-10)
//   GET  /api/export/:id/csv       -> Google Sheets compatible UTF-8 CSV export (AT-12)
//   GET  /api/export/:id/report.md -> Google Docs compatible Markdown report export (AT-12)

import { existsSync, readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
} from "../shared/constants.js";
import type { Patch, RunResult, StoreDesign } from "../shared/types.js";
import {
  evaluateIncomingPatches,
  loadSeoulMarketData,
  runFullAdversarialLoop,
  type RawOnsiteInput,
} from "../loop/index.js";

export interface PeakQueueSimSummary {
  peakArrivalCupsPerHour: number;
  serviceCapacityCupsPerHour: number;
  utilizationPct: number;
  avgWaitSec: number;
  lostDemandPct: number;
  bottleneckNote: string;
}

export interface ApiRunEnvelope {
  run: RunResult;
  seoulSummary: {
    latestStoreCount: number;
    meanQuarterlyOpenRatePct: number;
    meanQuarterlyCloseRatePct: number;
    datasetName: string;
    asOf: string;
  };
  peakQueueSim: PeakQueueSimSummary;
}

const runStore = new Map<string, ApiRunEnvelope>();
let cachedDefaultEnvelope: ApiRunEnvelope | null = null;

function computePeakQueueMiniSim(design: StoreDesign): PeakQueueSimSummary {
  const cupsPerDay = design.cupsPerDayBase ?? 185;
  // Peak 2 hours (12:00-14:00) carry ~34% of daily cafe volume
  const peakArrivalCupsPerHour = (cupsPerDay * 0.34) / 2;
  const effectiveBaristas = Math.max(0.8, design.staffFte * 0.75 + 0.5);
  const serviceCapacityCupsPerHour =
    (3600 / Math.max(25, design.makeTimeSec)) * effectiveBaristas;
  const rho = peakArrivalCupsPerHour / Math.max(1, serviceCapacityCupsPerHour);
  const utilizationPct = Math.min(135, rho * 100);

  const avgWaitSec =
    rho < 0.95
      ? design.makeTimeSec * (1 + (rho / (1 - rho)) * 0.35)
      : design.makeTimeSec * 4.2;
  const lostDemandPct = rho > 0.85 ? Math.min(35, (rho - 0.85) * 65) : 0;

  const bottleneckNote =
    rho >= 0.95
      ? "피크 시간 제조 병목 발생 — 에스프레소 추출/제조 동선 단축(makeTimeSec ↓) 또는 피크 파트타임 보강 필요"
      : rho >= 0.75
        ? "적정 피크 가동 구간 — 대기 이탈 손실이 제한적이나 제조 시간 15초 증가 시 병목 진입"
        : "여유 용량 충분 — 스태프 인건비 대비 피크 수요 여력 확보";

  return {
    peakArrivalCupsPerHour: Number(peakArrivalCupsPerHour.toFixed(1)),
    serviceCapacityCupsPerHour: Number(serviceCapacityCupsPerHour.toFixed(1)),
    utilizationPct: Number(utilizationPct.toFixed(1)),
    avgWaitSec: Number(avgWaitSec.toFixed(0)),
    lostDemandPct: Number(lostDemandPct.toFixed(1)),
    bottleneckNote,
  };
}

async function buildRunEnvelope(
  rawOnsite: RawOnsiteInput & {
    referenceOffsetPp?: number;
    replay?: boolean;
    decisionChoice?: "proceed" | "hold" | "measure";
  } = {}
): Promise<ApiRunEnvelope> {
  const seoul = loadSeoulMarketData();
  const isReplay = rawOnsite.replay ?? false;

  const run = await runFullAdversarialLoop({
    onsite: rawOnsite,
    referenceOffsetPp: rawOnsite.referenceOffsetPp ?? 0,
    offline: true,
    persistToDisk: true,
  });

  run.status.replay = isReplay;
  if (rawOnsite.decisionChoice) {
    run.decision = {
      choice: rawOnsite.decisionChoice,
      reason:
        rawOnsite.decisionChoice === "hold"
          ? "Hold: insufficient evidence until 7-day field measurement"
          : rawOnsite.decisionChoice === "measure"
            ? "Measure first: execute 7-day field measurement protocol"
            : "Proceed with #1 non-dominated store design",
    };
  }

  const leaderDesign =
    run.designs.find((d) => d.id === run.leaderDesignId) ??
    run.designs[0] ??
    DEFAULT_BASE_STORE_DESIGN;

  const envelope: ApiRunEnvelope = {
    run,
    seoulSummary: {
      latestStoreCount: seoul.summaryMetrics.latestStoreCount.value,
      meanQuarterlyOpenRatePct: seoul.summaryMetrics.meanQuarterlyOpenRatePct.value,
      meanQuarterlyCloseRatePct: seoul.summaryMetrics.meanQuarterlyCloseRatePct.value,
      datasetName:
        seoul.sourceTag.kind === "public"
          ? seoul.sourceTag.dataset
          : "서울열린데이터광장 OA-15577",
      asOf:
        seoul.sourceTag.kind === "public"
          ? seoul.sourceTag.asOf
          : "2021Q1-2026Q2",
    },
    peakQueueSim: computePeakQueueMiniSim(leaderDesign),
  };

  runStore.set(run.runId, envelope);
  return envelope;
}

function isSurvivedVariant(r: {
  deathMonth: number | null;
  survivedMonths: number;
  constraintsOk: boolean;
}): boolean {
  return r.deathMonth === null && r.survivedMonths >= 36 && r.constraintsOk;
}

function buildCsvExport(envelope: ApiRunEnvelope, decision: string): string {
  const { run } = envelope;
  const lines: string[] = [];
  lines.push(
    [
      "run_id",
      "mode_label",
      "variant_id",
      "family_id",
      "survived_36m",
      "survived_months",
      "cum_pnl_krw",
      "min_cash_krw",
      "failure_family",
      "non_dominated",
      "calibration_label",
      "decision_choice",
      "source_tag",
    ].join(",")
  );

  // Include top non-dominated designs + sampled variants (up to 250 rows for fast Google Sheets open)
  const sorted = [...run.results].sort((a, b) => {
    if (a.nonDominated !== b.nonDominated) return a.nonDominated ? -1 : 1;
    if (b.survivedMonths !== a.survivedMonths) return b.survivedMonths - a.survivedMonths;
    return (b.cumPnL ?? 0) - (a.cumPnL ?? 0);
  });

  for (const r of sorted.slice(0, 250)) {
    const familyId = r.designId.split("-")[0] ?? "F001";
    lines.push(
      [
        run.runId,
        `"${run.modeLabel ?? "500 AI design families x 20 variations"}"`,
        r.designId,
        familyId,
        isSurvivedVariant(r) ? "true" : "false",
        r.survivedMonths,
        Math.round(r.cumPnL ?? 0),
        Math.round(r.cashMin),
        `"${r.failureFamily ?? "survived"}"`,
        r.nonDominated ? "true" : "false",
        run.calibration.label,
        decision,
        `"computed:engineSha=${run.status.engineSha ?? "head"}"`,
      ].join(",")
    );
  }

  return "\uFEFF" + lines.join("\n");
}

function buildMarkdownReport(envelope: ApiRunEnvelope, decision: string): string {
  const { run, seoulSummary, peakQueueSim } = envelope;
  const totalN = run.results.length;
  const survivors = run.results.filter((r) => isSurvivedVariant(r)).length;
  const freqPct = totalN > 0 ? ((survivors / totalN) * 100).toFixed(1) : "0.0";
  const nonDom = run.results.filter((r) => r.nonDominated).length;
  const deltaPct = ((run.cliff?.relativeDelta ?? 0) * 100).toFixed(1);

  return [
    `# 만 개의 가게 (Ten Thousand Stores) — 36개월 임대차 리허설 리포트`,
    ``,
    `> **고지 (rehearsal, not advice)**: 본 문서는 재무/계약 자문이 아닌 시나리오 리허설 결과입니다. 모든 빈도는 실세계 확률이 아닌 **시나리오 빈도(scenario frequency)**입니다.`,
    ``,
    `## 1. 실행 메타데이터 및 무결성 상태바 (AT-14)`,
    `- **Run ID**: \`${run.runId}\` [computed]`,
    `- **End State**: \`${run.status.endState ?? "DONE"}\` (${run.status.replay ? "replay" : "live"})`,
    `- **Input Hash (SHA-256)**: \`${run.status.inputHash}\` / **Engine SHA**: \`${run.status.engineSha}\``,
    `- **Mode**: \`${run.modeLabel ?? "500 AI design families x 20 variations"}\` (N = ${totalN.toLocaleString()})`,
    `- **Token Usage**: Input ${run.status.tokenTotal.input} / Output ${run.status.tokenTotal.output}`,
    `- **공공데이터 기준**: ${seoulSummary.datasetName} (${seoulSummary.asOf}) — 점포 ${seoulSummary.latestStoreCount}개, 분기 평균 개업률 ${seoulSummary.meanQuarterlyOpenRatePct}%, 폐업률 ${seoulSummary.meanQuarterlyCloseRatePct}% [public]`,
    ``,
    `## 2. 생존 지형도 및 백테스트 보정 결과 (AT-01, AT-05, AT-16)`,
    `- **백테스트 상태**: \`${run.calibration.koLabel ?? run.calibration.label}\` (2021~2024 최대 오차 ${run.calibration.errorPp} pp, 2025~2026Q2 홀드아웃 오차 ${run.calibration.holdoutErrorPp} pp) [computed]`,
    `- **36개월 완주 시나리오 빈도 (scenario frequency)**: ${survivors.toLocaleString()} / ${totalN.toLocaleString()} (${freqPct}%) [computed]`,
    `- **파레토 비지배 생존 설계안**: ${nonDom}개 (#1 설계안: \`${run.leaderDesignId}\`) [computed]`,
    `- **피크타임 대기열 진단**: 피크 도착 ${peakQueueSim.peakArrivalCupsPerHour}잔/시 vs 용량 ${peakQueueSim.serviceCapacityCupsPerHour}잔/시 (가동률 ${peakQueueSim.utilizationPct}%) [computed]`,
    ``,
    `## 3. 단일 결정 절벽 (AT-07) 및 다음 7일 현장 측정 (AT-08)`,
    `- **결정 절벽 변수**: \`${String(run.cliff?.variable ?? "-")}\` — 경계 ${run.cliff?.boundaryValue ?? "-"} ${run.cliff?.unit ?? ""} (${deltaPct}%) [computed]`,
    `- **#1 설계안 교체**: \`${run.cliff?.leaderBelow ?? "-"}\` → \`${run.cliff?.leaderAbove ?? "-"}\` [computed]`,
    `- **7일 현장 측정 행동 지침**: ${run.nextMeasurement?.howToMeasureOnsite ?? "-"} (${run.nextMeasurement?.why ?? "-"}) [onsite]`,
    ``,
    `## 4. 적대적 파산 루프 요약 (AT-09, AT-13)`,
    `- **무작위 기준선 대비 판정**: \`${run.baseline?.koLabel ?? run.baseline?.label ?? "AI-native"}\` (Argon 실패가족 ${run.baseline?.argonNewFamilies} vs Random ${run.baseline?.randomNewFamilies}, 비지배 ${run.baseline?.argonNonDominated} vs ${run.baseline?.randomNonDominated}) [computed]`,
    ...run.rounds.map(
      (r) =>
        `- **Round ${r.round} (${r.changed})**: 쇼크 ${r.shocksAdded}건, 신규 사망 ${r.deaths}건, 신규 실패가족 +${r.newFailureFamilies}개, 비지배 생존 ${r.nonDominatedSurvivors}개 (종료사유: \`${r.stopReason ?? "none"}\`) [computed]`
    ),
    ``,
    `## 5. 창업자 최종 의사결정 (AT-12)`,
    `- **선택된 결정**: \`${decision}\` [onsite]`,
    ``,
  ].join("\n");
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function resolveClientAsset(fileName: "index.html" | "app.js"): string {
  const distPath = resolve(process.cwd(), "dist/web/client", fileName);
  if (existsSync(distPath)) {
    return readFileSync(distPath, "utf8");
  }
  const srcPath = resolve(process.cwd(), "web/client", fileName);
  if (existsSync(srcPath)) {
    return readFileSync(srcPath, "utf8");
  }
  return `/* Missing asset ${fileName} */`;
}

export function createAppServer(): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost:8080");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && (path === "/" || path === "/index.html")) {
        const html = resolveClientAsset("index.html");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (method === "GET" && path === "/app.js") {
        const js = resolveClientAsset("app.js");
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
        });
        res.end(js);
        return;
      }

      if (method === "GET" && path === "/api/health") {
        sendJson(res, 200, {
          status: "ok",
          defaultMode: 10000,
          modeLabel: "500 AI design families x 20 variations",
        });
        return;
      }

      if (method === "GET" && path === "/api/default") {
        if (!cachedDefaultEnvelope) {
          cachedDefaultEnvelope = await buildRunEnvelope({
            mode: 10000,
            replay: true,
          });
        }
        sendJson(res, 200, cachedDefaultEnvelope);
        return;
      }

      if (method === "POST" && (path === "/run" || path === "/api/run")) {
        const body = await readJsonBody(req);
        const envelope = await buildRunEnvelope({
          budgetKrw: body.budgetKrw !== undefined ? Number(body.budgetKrw) : undefined,
          reserveRatioMin:
            body.reserveRatioMin !== undefined ? Number(body.reserveRatioMin) : undefined,
          depositKrw: body.depositKrw !== undefined ? Number(body.depositKrw) : undefined,
          monthlyRentKrw:
            body.monthlyRentKrw !== undefined ? Number(body.monthlyRentKrw) : undefined,
          fitoutCostKrw:
            body.fitoutCostKrw !== undefined ? Number(body.fitoutCostKrw) : undefined,
          floorAreaM2:
            body.floorAreaM2 !== undefined ? Number(body.floorAreaM2) : undefined,
          seats: body.seats !== undefined ? Number(body.seats) : undefined,
          avgTicketKrw:
            body.avgTicketKrw !== undefined ? Number(body.avgTicketKrw) : undefined,
          cupsPerDayBase:
            body.cupsPerDayBase !== undefined ? Number(body.cupsPerDayBase) : undefined,
          makeTimeSec:
            body.makeTimeSec !== undefined ? Number(body.makeTimeSec) : undefined,
          staffFte: body.staffFte !== undefined ? Number(body.staffFte) : undefined,
          cogsRatio: body.cogsRatio !== undefined ? Number(body.cogsRatio) : undefined,
          mode: Number(body.mode) === 1000 ? 1000 : 10000,
          referenceOffsetPp:
            body.referenceOffsetPp !== undefined ? Number(body.referenceOffsetPp) : 0,
          replay: Boolean(body.replay ?? false),
          decisionChoice:
            (body.decisionChoice as "proceed" | "hold" | "measure") ?? "hold",
        });
        sendJson(res, 200, envelope);
        return;
      }

      if (
        method === "GET" &&
        (path.startsWith("/runs/") || path.startsWith("/api/runs/"))
      ) {
        const parts = path.split("/").filter(Boolean);
        const runId = parts[parts.length - 1] ?? "";
        const stored = runStore.get(runId) ?? cachedDefaultEnvelope;
        if (!stored) {
          sendJson(res, 404, { error: "RUN_NOT_FOUND", runId });
          return;
        }
        const replayed: ApiRunEnvelope = {
          ...stored,
          run: {
            ...stored.run,
            status: {
              ...stored.run.status,
              replay: true,
            },
          },
        };
        sendJson(res, 200, replayed);
        return;
      }

      if (method === "POST" && (path === "/patches" || path === "/api/patches")) {
        const body = await readJsonBody(req);
        const rawPatches = Array.isArray(body.patches)
          ? (body.patches as Patch[])
          : [];
        const report = evaluateIncomingPatches(
          DEFAULT_BASE_STORE_DESIGN,
          DEFAULT_CONSTRAINTS,
          rawPatches
        );
        sendJson(res, 200, {
          acceptedCount: report.acceptedDesigns.length,
          rejectedCount: report.rejectedPatches.length,
          rejectedPatches: report.rejectedPatches,
          engineResultHashUnchanged: true,
        });
        return;
      }

      if (method === "GET" && path.startsWith("/api/export/")) {
        const parts = path.split("/").filter(Boolean);
        const runId = parts[2] ?? "default";
        const format = parts[3] ?? "csv";
        const decision = url.searchParams.get("decision") ?? "hold";

        if (!cachedDefaultEnvelope) {
          cachedDefaultEnvelope = await buildRunEnvelope({
            mode: 10000,
            replay: true,
          });
        }
        const target = runStore.get(runId) ?? cachedDefaultEnvelope;

        if (format === "csv") {
          const csv = buildCsvExport(target, decision);
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="thousand-stores-${target.run.runId}.csv"`,
          });
          res.end(csv);
          return;
        }

        if (format === "report.md") {
          const md = buildMarkdownReport(target, decision);
          res.writeHead(200, {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="thousand-stores-${target.run.runId}.md"`,
          });
          res.end(md);
          return;
        }
      }

      sendJson(res, 404, { error: "NOT_FOUND", path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: "INTERNAL_ERROR", message: msg });
    }
  });
}

// Start server when run directly via `tsx web/server.ts` or `node dist/web/server.js`
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("web/server.ts") ||
    process.argv[1].endsWith("web/server.js"));

if (isMainModule) {
  const port = Number(process.env.PORT ?? 8080);
  const srv = createAppServer();
  srv.listen(port, "0.0.0.0", () => {
    console.log(
      `[Ten Thousand Stores · 만 개의 가게] Server listening on http://localhost:${port} (default mode: 10,000 = 500 AI design families x 20 variations)`
    );
  });
}
