// A3 six-screen client connected to the validated server contract.
// Only an explicit AI button invokes a provider. Financial results come from the server.
import type { RunResult, TokenUsage } from "../../shared/types.js";

type Decision = "hold" | "measure" | "proceed";
interface MarketSummary {
  latestStoreCount: number | null;
  meanQuarterlyOpenRatePct: number | null;
  meanQuarterlyCloseRatePct: number | null;
  datasetName: string;
  asOf: string;
  sourceNote: string;
}
interface ApiContext {
  seoulSummary: MarketSummary | null;
  inputFiles?: string[];
  byteFingerprint?: string;
  rawReconciliationVerified?: boolean;
}
interface ServerEnvelope {
  runId: string;
  state: "DONE" | "FAIL" | "BLOCKED";
  reason: string | null;
  inputHash: string;
  engineSha: string;
  createdAt: string;
  replay: boolean;
  mode: "preview" | "ai";
  ai: { status: string; model: string | null; tokens: TokenUsage[]; reason: string | null; requestsCompleted?: number };
  calibrationStatus: string;
  calibrationNote: string;
  inputSnapshot: Record<string, unknown>;
  generation: {
    kind: string;
    requestedCandidates: number;
    calculatedCandidates: number;
    uniqueDesignIds: number;
    uniqueAssumptionSets: number;
    seedFamilies: number | null;
  };
  result: RunResult | null;
  [key: string]: unknown;
}
interface ApiRunEnvelope {
  run: RunResult;
  seoulSummary: MarketSummary | null;
  peakQueueSim: null;
  evidence: ServerEnvelope;
}
let currentEnvelope: ApiRunEnvelope | null = null;
let marketContext: ApiContext | null = null;
let selectedDecision: Decision | null = null;
let decisionAt: string | null = null;
let revision = 0;
let resultRevision: number | null = null;
let resultFingerprint: string | null = null;
let activeRequest: number | null = null;
let requestSerial = 0;

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing DOM element #${id}`);
  return el as T;
}
function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function fmtInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "미확인";
}
function fmtManwon(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value / 10000).toLocaleString("ko-KR")}만 원` : "미확인";
}
function diagnostic(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} pp (집계 참고값)` : "미확인";
}
function srcBadge(kind: string, label?: string): string {
  return `<span class="src-tag src-${escapeHtml(kind)}">${escapeHtml(kind)}${label ? `: ${escapeHtml(label)}` : ""}</span>`;
}
function rows(id: string, values: string[][]): void {
  byId(id).innerHTML = values.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
}
function announce(message: string, error = false): void {
  const el = document.getElementById("runMessage") ?? document.getElementById("patchAttackAlert");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("callout-rose", error);
  el.dataset.state = error ? "error" : "info";
}
function resetDecision(): void {
  selectedDecision = null;
  decisionAt = null;
  for (const id of ["decHold", "decMeasure", "decProceed"]) document.getElementById(id)?.classList.remove("active");
  text("selectedDecisionText", "미선택 — 현재 실행 결과를 확인한 뒤 직접 선택하세요.");
}
function fresh(): boolean {
  if (!currentEnvelope || resultRevision !== revision || activeRequest !== null) return false;
  if (currentEnvelope.evidence.state !== "DONE" || currentEnvelope.run.status.endState !== "DONE") return false;
  try { return resultFingerprint === JSON.stringify(collectPayload(currentEnvelope.evidence.mode)); }
  catch { return false; }
}
function updateControls(): void {
  const usable = fresh();
  document.getElementById("statusBar")?.setAttribute("data-fresh", String(usable));
  for (const id of ["btnSubmitRun", "btnRunDefault10k", "btnRunAi"]) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = activeRequest !== null;
  }
  for (const id of ["decHold", "decMeasure", "decProceed"]) {
    const el = document.getElementById(id);
    if (el) { el.setAttribute("aria-disabled", String(!usable)); el.classList.toggle("disabled", !usable); }
  }
  for (const id of ["btnExportCsv", "btnExportMd", "btnExportJson"]) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = !usable || selectedDecision === null;
  }
}
function clearCalculatedView(): void {
  byId("calibratedDistributionContainer").classList.add("hidden");
  byId("uncalibratedPanel").classList.remove("hidden");
  for (const id of ["landscapeCanvas", "saturationCanvas", "cashflowCanvas"]) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
  for (const id of ["uncalibratedTableBody", "roundsTableBody", "verificationTableBody"]) rows(id, []);
  for (const id of ["cliffHeadline", "cliffFlipDetail", "measureVariable", "measureAction", "measureReason", "kpiLeaderId", "kpiLeaderPnl"]) text(id, "현재 입력의 실행 결과 없음");
  text("peakQueuePanel", "대기열 모델 미실행 — 대기시간·이탈률 추정값 없음.");
  text("heroCalibrationBadge", "현금흐름 보정 미검증");
  text("sec2CalibBadge", "현금흐름 보정 미검증");
  text("heroBaselineBadge", "AI 개선 효과 미검증");
  text("sec5BaselineBadge", "AI 개선 효과 미검증");
}
function invalidate(message: string): void {
  currentEnvelope = null;
  resultRevision = null;
  resultFingerprint = null;
  resetDecision();
  clearCalculatedView();
  text("sbEndState", activeRequest === null ? "미실행 / 입력 변경" : "실행 중 · 입력 변경");
  text("sbRunId", "-");
  text("sbInputHash", "-");
  text("sbEngineSha", "-");
  text("sbComputeMs", "-");
  text("sbTokensTotal", "미실행");
  text("sbInputFiles", "현재 입력 결과 없음");
  text("sbGateLog", "검증 미실행");
  announce(message);
  updateControls();
}
function renderStatusBar(evidence: ServerEnvelope): void {
  const run = evidence.result;
  text("sbEndState", `${evidence.state}${evidence.reason ? ` · ${evidence.reason}` : ""}`);
  text("sbRunId", evidence.runId);
  text("sbInputHash", evidence.inputHash);
  text("sbEngineSha", evidence.engineSha);
  text("sbComputeMs", run?.computeMs === undefined ? "미확인" : `${run.computeMs.toFixed(1)} ms (계산 단계)`);
  text("sbInputFiles", run?.status.inputFiles.join(", ") || "결과 없음");
  text("sbReplayBadge", evidence.replay ? "저장 결과 재생" : evidence.mode === "ai" ? `모델 상태: ${evidence.ai.status}` : "로컬 가정 계산 · 모델 미호출");
  const tokens = evidence.ai.tokens;
  const input = tokens.reduce((sum, usage) => sum + usage.inputTokens, 0);
  const output = tokens.reduce((sum, usage) => sum + usage.outputTokens, 0);
  text("sbTokensTotal", `${input.toLocaleString()} in / ${output.toLocaleString()} out · ${tokens.length}개 사용량 기록${evidence.ai.model ? ` · ${evidence.ai.model}` : " · 모델 없음"}`);
  const strip = byId("sbGateLog");
  strip.replaceChildren();
  for (const gate of run?.status.gateLog ?? []) {
    const badge = document.createElement("span");
    badge.className = `badge ${gate.passed === true ? "badge-done" : gate.passed === false ? "badge-fail" : "badge-blocked"}`;
    badge.textContent = `${gate.gate}: ${gate.passed === true ? "통과" : gate.passed === false ? "미충족" : "미검증"}`;
    badge.title = gate.detail;
    strip.append(badge);
  }
}

function renderLandscapeCanvas(run: RunResult): void {
  const canvas = byId<HTMLCanvasElement>("landscapeCanvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = "rgba(59, 78, 117, 0.28)";
  ctx.lineWidth = 1;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  for (let i = 0; i <= 6; i++) {
    const x = padL + (plotW * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px monospace";
    ctx.fillText(`${i * 6}M`, x - 10, h - 10);
  }

  const pts = run.landscape.points;
  if (pts.length === 0) return;

  let minPnl = Infinity;
  let maxPnl = -Infinity;
  for (const p of pts) {
    const val = p.cumPnL ?? p.y;
    if (val < minPnl) minPnl = val;
    if (val > maxPnl) maxPnl = val;
  }
  if (minPnl === maxPnl) {
    minPnl -= 10_000_000;
    maxPnl += 10_000_000;
  }

  for (let j = 0; j <= 4; j++) {
    const y = padT + (plotH * j) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();

    const pnlAtY = maxPnl - ((maxPnl - minPnl) * j) / 4;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10.5px monospace";
    ctx.fillText(`${Math.round(pnlAtY / 1_000_000)}백만`, 4, y + 4);
  }

  // Zero PnL line
  if (minPnl < 0 && maxPnl > 0) {
    const zeroY = padT + ((maxPnl - 0) / (maxPnl - minPnl)) * plotH;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Plot all 10,000 points first (non-Pareto)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.nonDominated) continue;
    const px = padL + (Math.min(36, Math.max(0, p.survivedMonths)) / 36) * plotW;
    const pnl = p.cumPnL ?? p.y;
    const py = padT + ((maxPnl - pnl) / (maxPnl - minPnl)) * plotH;

    if (p.survivedMonths >= 36) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.42)";
    } else if ((p.failureFamily ?? "").includes("reserve")) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.42)";
    } else {
      ctx.fillStyle = "rgba(244, 63, 94, 0.38)";
    }
    ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
  }

  // Highlight Pareto non-dominated points on top
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p.nonDominated) continue;
    const px = padL + (Math.min(36, Math.max(0, p.survivedMonths)) / 36) * plotW;
    const pnl = p.cumPnL ?? p.y;
    const py = padT + ((maxPnl - pnl) / (maxPnl - minPnl)) * plotH;

    ctx.beginPath();
    ctx.arc(px, py, p.designId === run.leaderDesignId ? 5.5 : 3.8, 0, Math.PI * 2);
    ctx.fillStyle = p.designId === run.leaderDesignId ? "#fbbf24" : "#10b981";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function renderSaturationCanvas(run: RunResult): void {
  const canvas = byId<HTMLCanvasElement>("saturationCanvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const curve = run.saturationCurve ?? [];
  if (curve.length === 0) return;

  const padL = 48;
  const padR = 24;
  const padT = 26;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxVal = Math.max(
    10,
    ...curve.map((c) => Math.max(c.failureFamilies, c.nonDominated))
  );

  ctx.strokeStyle = "rgba(59, 78, 117, 0.3)";
  for (let j = 0; j <= 4; j++) {
    const y = padT + (plotH * j) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();

    const v = Math.round(maxVal * (1 - j / 4));
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10.5px monospace";
    ctx.fillText(String(v), 12, y + 4);
  }

  const xCoords = curve.map((_, idx) =>
    curve.length === 1 ? padL + plotW / 2 : padL + (plotW * idx) / (curve.length - 1)
  );

  // Draw failureFamilies line (rose/amber)
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  curve.forEach((pt, idx) => {
    const x = xCoords[idx];
    const y = padT + (1 - pt.failureFamilies / maxVal) * plotH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw nonDominated line (emerald)
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  curve.forEach((pt, idx) => {
    const x = xCoords[idx];
    const y = padT + (1 - pt.nonDominated / maxVal) * plotH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points & labels
  curve.forEach((pt, idx) => {
    const x = xCoords[idx];
    const yFam = padT + (1 - pt.failureFamilies / maxVal) * plotH;
    const yNd = padT + (1 - pt.nonDominated / maxVal) * plotH;

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(x, yFam, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`실패가족:${pt.failureFamilies}`, x - 26, yFam - 8);

    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(x, yNd, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`비지배:${pt.nonDominated}`, x - 22, yNd + 16);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px monospace";
    ctx.fillText(`N=${pt.n.toLocaleString()}`, x - 24, h - 10);
  });

  // Update saturation diagnosis text
  if (curve.length >= 3) {
    const c1 = curve[0];
    const c2 = curve[1];
    const c3 = curve[2];
    const saturated = c3.failureFamilies <= c2.failureFamilies;
    const statusText = saturated
      ? `saturated at N = 3,000 (실패 가족 ${c2.failureFamilies}개 수렴)`
      : `still growing at 10,000 (실패 가족 ${c1.failureFamilies} → ${c2.failureFamilies} → ${c3.failureFamilies})`;
    byId("saturationStatusBadge").textContent = `computed: ${statusText}`;
    byId("saturationSummaryText").innerHTML =
      `<strong>계산된 후보 집합</strong> · N=1,000(${c1.failureFamilies}가족/${c1.nonDominated}비지배) → N=3,000(${c2.failureFamilies}가족/${c2.nonDominated}비지배) → N=10,000(${c3.failureFamilies}가족/${c3.nonDominated}비지배) · <strong>${statusText}</strong> ${srcBadge("computed")}`;
  }
}

function renderCashflowCanvas(run: RunResult): void {
  const canvas = byId<HTMLCanvasElement>("cashflowCanvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const leader =
    run.results.find((r) => r.designId === run.leaderDesignId && r.constraintsOk && r.months.length > 0);
  const deadSample = run.results.find(
    (r) => (r.deathMonth !== null || r.survivedMonths < 36) && r.months.length > 0
  );

  if (!leader) return;

  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allCash = [
    ...leader.months.map((m) => m.cashEnd),
    ...(deadSample ? deadSample.months.map((m) => m.cashEnd) : []),
    0,
  ];
  const minCash = Math.min(...allCash);
  const maxCash = Math.max(...allCash, run.constraints.budgetKrw * 0.5);

  ctx.strokeStyle = "rgba(59, 78, 117, 0.3)";
  for (let j = 0; j <= 3; j++) {
    const y = padT + (plotH * j) / 3;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();

    const cVal = maxCash - ((maxCash - minCash) * j) / 3;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10.5px monospace";
    ctx.fillText(`${Math.round(cVal / 1_000_000)}백만`, 4, y + 4);
  }

  // Reserve floor line
  const reserveFloor = run.constraints.budgetKrw * run.constraints.reserveRatioMin;
  const resY = padT + ((maxCash - reserveFloor) / (maxCash - minCash)) * plotH;
  ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, resY);
  ctx.lineTo(padL + plotW, resY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw leader cash line (emerald)
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  leader.months.forEach((m, idx) => {
    const x = padL + ((m.month - 1) / 35) * plotW;
    const y = padT + ((maxCash - m.cashEnd) / (maxCash - minCash)) * plotH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw dead sample line (rose)
  if (deadSample) {
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    deadSample.months.forEach((m, idx) => {
      const x = padL + ((m.month - 1) / 35) * plotW;
      const y = padT + ((maxCash - m.cashEnd) / (maxCash - minCash)) * plotH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function renderContext(): void {
  const summary = marketContext?.seoulSummary;
  text("pubStoreCount", summary?.latestStoreCount == null ? "미확인" : `${fmtInt(summary.latestStoreCount)}개 · 보관 요약`);
  text("pubOpenRate", summary?.meanQuarterlyOpenRatePct == null ? "미확인" : `${summary.meanQuarterlyOpenRatePct.toFixed(2)}% · 집계 참고`);
  text("pubCloseRate", summary?.meanQuarterlyCloseRatePct == null ? "미확인" : `${summary.meanQuarterlyCloseRatePct.toFixed(2)}% · 집계 참고`);
  text("contextSourceNote", summary ? `${summary.datasetName} · ${summary.asOf} · ${summary.sourceNote || "원자료 재대조 미확인"}` : "상권 맥락 미확인. 입력한 가정의 계산만 실행할 수 있습니다.");
}
function renderAllScreens(envelope: ApiRunEnvelope): void {
  currentEnvelope = envelope;
  const { run, evidence } = envelope;
  renderStatusBar(evidence);
  renderContext();
  const generation = evidence.generation;
  const origin = generation.kind === "live_model_proposals" ? "모델 제안 기반" : "결정적 가정 후보 · 모델 미호출";
  text("heroModeBadge", `${origin} · 계산 ${fmtInt(generation.calculatedCandidates)}개`);
  text("landscapeModeLabel", `보정 미검증 · ${fmtInt(generation.calculatedCandidates)}개 계산`);
  text("heroCalibrationBadge", "현금흐름 보정 미검증");
  text("sec2CalibBadge", "현금흐름 보정 미검증");
  text("heroBaselineBadge", "탐색기 · AI 개선 효과 미검증");
  text("sec5BaselineBadge", "탐색기 · AI 개선 효과 미검증");

  // No aggregate diagnostic can unlock a population distribution in this UI.
  byId("calibratedDistributionContainer").classList.add("hidden");
  byId("uncalibratedPanel").classList.remove("hidden");
  rows("uncalibratedTableBody", [
    ["현금흐름 보정", "미검증", evidence.calibrationNote, "집계 참고값은 개별 점포 예측 검증이 아님", "근거 범위"],
    ["집계 휴리스틱 비교", "진단 참고용", diagnostic(run.calibration.errorPp), diagnostic(run.calibration.holdoutErrorPp), "숨김 홀드아웃 검증 아님"],
    ["생성/계산 개수", `${fmtInt(generation.requestedCandidates)}개 요청`, `${fmtInt(generation.calculatedCandidates)}개 계산`, `${fmtInt(generation.uniqueDesignIds)}개 ID / ${fmtInt(generation.uniqueAssumptionSets)}개 가정 조합`, origin],
    ["예산 / 예비비", fmtManwon(run.constraints.budgetKrw), `${(run.constraints.reserveRatioMin * 100).toFixed(0)}%`, "사용자가 입력한 가정", "현장 실측 미확인"],
  ]);
  text("peakQueuePanel", "대기열 모델 미실행 — 대기시간·이탈률 추정값 없음.");
  const leader = run.results.find((result) => result.designId === run.leaderDesignId && result.constraintsOk);
  if (leader?.months.length) renderCashflowCanvas(run);
  text("kpiLeaderId", run.leaderDesignId || "없음");
  text("kpiLeaderPnl", leader ? `개별 계산 예시 · ${leader.months.length}개월 원장 · 손익 ${fmtManwon(leader.cumPnL)}` : "선두 후보 원장 미확인");

  if (run.cliff) {
    text("cliffHeadline", `확인된 반전 구간: ${String(run.cliff.variable)} · 참고 경계 ${fmtInt(run.cliff.boundaryValue)} ${run.cliff.unit}`);
    text("cliffFlipDetail", `${run.cliff.leaderBelow} ↔ ${run.cliff.leaderAbove}. 제한된 탐색에서 확인한 구간이며 전역 최소 경계·정확한 전환점은 미검증입니다.`);
  } else {
    text("cliffHeadline", "현재 탐색에서 확인된 반전 구간 없음");
    text("cliffFlipDetail", "전체 범위에 역전이 없다는 결론은 아닙니다. 입력을 바꾸면 새 후보 집합의 별도 실행이 됩니다.");
  }
  if (run.nextMeasurement) {
    text("measureVariable", `다음 측정 제안: ${run.nextMeasurement.variable}`);
    text("measureAction", run.nextMeasurement.howToMeasureOnsite);
    text("measureReason", `제안 근거: ${run.nextMeasurement.why} · 현장 측정 미실시`);
  } else {
    text("measureVariable", "반전 구간에 연결된 측정값 미확정");
    text("measureAction", "임대료·수요·제조시간 등 현재 가정을 현장에서 확인하세요.");
    text("measureReason", "별도의 측정 완료나 우선순위 검증을 주장하지 않습니다.");
  }
  rows("roundsTableBody", run.rounds.length ? run.rounds.map((round) => [
    `계산 기록 ${round.round}`, round.changed, String(round.shocksAdded), String(round.deaths),
    String(round.newFailureFamilies), String(round.nonDominatedSurvivors), `${round.stopReason || "미확인"} · 실모델 적대 실행 여부 미검증`,
  ]) : [["적대적 루프 미실행", "-", "-", "-", "-", "-", "이번 서버 실행은 고정 루프를 자동 실행하지 않음"]]);
  const baseline = run.baseline;
  rows("verificationTableBody", [
    ["실패 유형 탐색 수", baseline ? String(baseline.argonNewFamilies) : "미확인", baseline ? String(baseline.randomNewFamilies) : "미확인", "계산된 후보 집합 비교", "AI 개선 효과 미검증"],
    ["비지배 후보 수", baseline ? String(baseline.argonNonDominated) : "미확인", baseline ? String(baseline.randomNonDominated) : "미확인", "후보 집합에 종속", "독립 성능 검증 아님"],
    ["2025Q1~2026Q2 집계 비교", diagnostic(run.calibration.holdoutErrorPp), "보관 요약", "집계 휴리스틱 참고", "숨김 홀드아웃 검증 미완료"],
    ...(run.calibration.yearlyErrors ?? []).map((year) => [String(year.year), `${year.simOpenRatePct} / ${year.simCloseRatePct}`, `${year.refOpenRatePct} / ${year.refCloseRatePct}`, diagnostic(Math.max(year.openErrorPp, year.closeErrorPp)), "집계 참고 · 보정 미검증"]),
  ]);
  announce(`${evidence.state} · ${origin}. 요청 ${fmtInt(generation.requestedCandidates)}, 계산 ${fmtInt(generation.calculatedCandidates)}, ID ${fmtInt(generation.uniqueDesignIds)}, 고유 가정 조합 ${fmtInt(generation.uniqueAssumptionSets)}. 현재 결과를 확인한 뒤 인간 결정을 선택하세요.`);
}
function inputValue(id: string): string {
  const value = byId<HTMLInputElement | HTMLSelectElement>(id).value.trim();
  if (!value) throw new Error("빈 입력을 숫자 0으로 바꿀 수 없습니다. 모든 가정 값을 입력하세요.");
  if (!Number.isFinite(Number(value))) throw new Error("유효한 숫자 값을 입력하세요.");
  return value;
}
function collectPayload(mode: "preview" | "ai") {
  return {
    mode,
    variantCount: Number(inputValue("inpMode")),
    seed: Number(inputValue("inpSeed")),
    inputs: {
      budgetKrw: inputValue("inpBudgetKrw"), depositKrw: inputValue("inpDepositKrw"),
      fitoutKrw: inputValue("inpFitoutCostKrw"), rentKrw: inputValue("inpMonthlyRentKrw"),
      seats: inputValue("inpSeats"), floorAreaM2: inputValue("inpFloorAreaM2"),
      staffFte: inputValue("inpStaffFte"), ownerHoursPerWeek: inputValue("inpOwnerHoursPerWeek"),
      avgTicketKrw: inputValue("inpAvgTicketKrw"), cupsPerDayBase: inputValue("inpCupsPerDayBase"),
      makeTimeSec: inputValue("inpMakeTimeSec"), openDaysPerWeek: inputValue("inpOpenDaysPerWeek"),
      cogsRatio: inputValue("inpCogsRatio"),
    },
  };
}
async function triggerRun(mode: "preview" | "ai", default10k = false): Promise<void> {
  if (activeRequest !== null) { announce("현재 요청의 응답을 기다리는 중입니다."); return; }
  if (default10k) byId<HTMLSelectElement>("inpMode").value = "10000";
  const modeInput = document.getElementById("inpExecutionMode") as HTMLSelectElement | null;
  if (modeInput) modeInput.value = mode;
  invalidate("입력 확인 중 — 이전 결정과 내보내기를 해제했습니다.");
  let payload: ReturnType<typeof collectPayload>;
  try { payload = collectPayload(mode); }
  catch (error) { announce(error instanceof Error ? error.message : "입력을 확인하세요.", true); return; }
  const submittedRevision = revision;
  const fingerprint = JSON.stringify(payload);
  const serial = ++requestSerial;
  activeRequest = serial;
  updateControls();
  text("sbEndState", "실행 중");
  announce(mode === "ai" ? "명시적으로 요청한 모델 실행 중입니다. 입력을 바꾸면 이 응답은 현재 결과에 적용되지 않습니다." : "서버에서 가정 후보를 계산 중입니다. 모델은 호출하지 않습니다.");
  try {
    const response = await fetch("/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: fingerprint });
    const payloadOut = await response.json().catch(() => null);
    if (activeRequest !== serial) return;
    let unchanged = submittedRevision === revision;
    try { unchanged = unchanged && fingerprint === JSON.stringify(collectPayload(mode)); } catch { unchanged = false; }
    if (!unchanged) {
      announce("실행 중 입력이 변경되어 응답을 현재 결과로 사용하지 않았습니다. 변경된 입력으로 다시 실행하세요.", true);
      text("sbEndState", "입력 변경 · 결과 미적용");
      return;
    }
    if (!response.ok) throw new Error(payloadOut?.error ? String(payloadOut.error) : `HTTP ${response.status}`);
    if (!payloadOut || typeof payloadOut !== "object" || !["DONE", "FAIL", "BLOCKED"].includes(payloadOut.state)) throw new Error("서버 응답 형식을 확인할 수 없습니다.");
    const evidence = payloadOut as ServerEnvelope;
    renderStatusBar(evidence);
    if (evidence.state !== "DONE" || !evidence.result || evidence.result.status.endState !== "DONE") {
      announce(`${evidence.state} · ${evidence.reason || evidence.ai?.reason || "완료된 계산 결과 없음"}. 결정과 내보내기를 활성화하지 않았습니다.`, true);
      return;
    }
    resultRevision = submittedRevision;
    resultFingerprint = fingerprint;
    renderAllScreens({ run: evidence.result, seoulSummary: marketContext?.seoulSummary ?? null, peakQueueSim: null, evidence });
  } catch (error) {
    currentEnvelope = null;
    resultRevision = null;
    resultFingerprint = null;
    resetDecision();
    text("sbEndState", "요청 실패 / 결과 미확인");
    announce(`실행 결과를 확인하지 못했습니다: ${error instanceof Error ? error.message : "통신 오류"}. 자동 재실행하지 않습니다.`, true);
  } finally {
    if (activeRequest === serial) activeRequest = null;
    updateControls();
  }
}
function chooseDecision(choice: Decision): void {
  if (!fresh()) { announce("현재 입력의 완료된 결과를 먼저 실행하세요. 이전 결과에 결정을 붙일 수 없습니다.", true); updateControls(); return; }
  selectedDecision = choice;
  decisionAt = new Date().toISOString();
  for (const [id, value] of [["decHold", "hold"], ["decMeasure", "measure"], ["decProceed", "proceed"]]) byId(id).classList.toggle("active", value === choice);
  text("selectedDecisionText", `${choice} · 사용자가 현재 실행에 직접 선택 · ${decisionAt}`);
  updateControls();
}
function exportEvidence(): Record<string, unknown> | null {
  if (!fresh() || selectedDecision === null || !currentEnvelope) {
    resetDecision();
    updateControls();
    announce("입력이 바뀌었거나 인간 결정이 없습니다. 새 결과에 직접 결정을 선택한 뒤 내보내세요.", true);
    return null;
  }
  return { ...currentEnvelope.evidence, humanDecision: { choice: selectedDecision, selectedAt: decisionAt, runId: currentEnvelope.evidence.runId, inputHash: currentEnvelope.evidence.inputHash }, marketContext };
}
function download(format: "json" | "csv" | "md"): void {
  const documentEvidence = exportEvidence();
  if (!documentEvidence || !currentEnvelope) return;
  const evidence = currentEnvelope.evidence;
  let content: string;
  let mime: string;
  if (format === "json") {
    content = JSON.stringify(documentEvidence, null, 2);
    mime = "application/json";
  } else if (format === "md") {
    const run = currentEnvelope.run;
    const md = (value: unknown, limit = 500) => String(value ?? "미확인")
      .replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, limit);
    const numberText = (value: unknown) => typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString("ko-KR") : "미확인";
    const inputLabels: [string, string][] = [
      ["variantCount", "요청 후보 수"], ["seed", "Seed"],
      ["budgetKrw", "예산 (원)"], ["depositKrw", "보증금 (원)"],
      ["fitoutKrw", "인테리어·장비비 (원)"], ["rentKrw", "월세 (원)"],
      ["seats", "좌석"], ["floorAreaM2", "면적 (㎡)"],
      ["staffFte", "직원 FTE"], ["ownerHoursPerWeek", "점주 시간/주"],
      ["avgTicketKrw", "객단가 (원)"], ["cupsPerDayBase", "일 수요 가정"],
      ["makeTimeSec", "제조시간 (초)"], ["openDaysPerWeek", "영업일/주"],
      ["cogsRatio", "원가 비율"],
    ];
    const leader = run.results.find((result) => result.designId === run.leaderDesignId && result.constraintsOk);
    const columns = [
      ["month", "월"], ["revenue", "매출"], ["cogs", "원가"],
      ["rent", "월세"], ["labour", "인건비"], ["other", "기타비"],
      ["cashEnd", "월말 현금"], ["cumPnL", "누적손익"],
    ] as const;
    const recordedColumns = columns.filter(([key]) => leader?.months.some((row) => typeof row[key] === "number"));
    const ledger = leader?.months.length ? [
      `선두 ID: ${md(leader.designId)} · 서버 원장 ${leader.months.length}행 · 금액 단위: 원`,
      "",
      `| ${recordedColumns.map(([, label]) => label).join(" | ")} |`,
      `| ${recordedColumns.map(() => "---:").join(" | ")} |`,
      ...leader.months.slice(0, 36).map((row) => `| ${recordedColumns.map(([key]) => numberText(row[key])).join(" | ")} |`),
    ] : ["실제 선두 후보의 월별 원장이 없어 표를 만들지 않았습니다."];
    const usage = evidence.ai.tokens.length ? [
      "| 모델 | 호출 기록 | 입력 토큰 | 출력 토큰 |",
      "| --- | --- | ---: | ---: |",
      ...evidence.ai.tokens.map((item) => `| ${md(item.model, 100)} | ${md(item.call, 120)} | ${numberText(item.inputTokens)} | ${numberText(item.outputTokens)} |`),
    ] : ["모델 사용량 기록 0건. 기본 미리보기는 모델을 호출하지 않습니다."];
    const cliff = run.cliff ? [
      `변수: ${md(run.cliff.variable)} · 참고 경계: ${numberText(run.cliff.boundaryValue)} ${md(run.cliff.unit)}`,
      `확인된 후보: ${md(run.cliff.leaderBelow)} ↔ ${md(run.cliff.leaderAbove)}`,
      "제한된 탐색에서 확인한 반전 구간입니다. 전역 최소 경계와 정확한 전환점은 미검증입니다.",
    ] : ["현재 탐색에서 확인된 반전 구간 없음. 전체 범위에 역전이 없음을 입증하지 않습니다."];
    content = [
      "# 천 개의 가게 — 가정 기반 계산 보고서", "",
      `- Run ID: ${md(evidence.runId)}`,
      `- Input SHA-256: ${md(evidence.inputHash)}`,
      `- Engine SHA: ${md(evidence.engineSha)}`,
      `- 종료 상태: ${md(evidence.state)} · ${md(evidence.reason)}`,
      `- 실행: ${md(evidence.mode)} · ${evidence.replay ? "저장 결과 재생" : "이번 실행"}`,
      `- 모델 상태: ${md(evidence.ai.status)} · 모델: ${md(evidence.ai.model)}`,
      "", "## 근거와 한계", "",
      md(evidence.calibrationNote, 1000),
      "모든 입력은 명시한 가정입니다. 개별 계산은 실세계 확률·AI 개선 효과·현장 측정 완료를 입증하지 않습니다.",
      marketContext?.seoulSummary ? md(`${marketContext.seoulSummary.datasetName} · ${marketContext.seoulSummary.asOf} · ${marketContext.seoulSummary.sourceNote}`, 800) : "상권 맥락 미확인.",
      "", "## 핵심 입력 가정", "", "| 항목 | 서버에 기록된 값 |", "| --- | ---: |",
      ...inputLabels.map(([key, label]) => `| ${label} | ${numberText(evidence.inputSnapshot[key])} |`),
      `| 최소 예비비 비율 | ${numberText(run.constraints.reserveRatioMin)} |`,
      "", "## 실제 모델 사용량", "", ...usage,
      "", "## 선두 후보 월별 원장 — 개별 계산 예시", "", ...ledger,
      "", "## 반전 구간의 범위", "", ...cliff,
      "", "## 다음 측정 제안 — 미실시", "",
      run.nextMeasurement ? `${md(run.nextMeasurement.variable)}: ${md(run.nextMeasurement.howToMeasureOnsite, 700)}` : "반전 구간에 연결된 측정값 미확정.",
      ...(run.nextMeasurement ? [md(run.nextMeasurement.why, 500)] : []),
      "", "## 검사 기록", "", "| 검사 | 상태 | 근거·검사 범위 |", "| --- | --- | --- |",
      ...run.status.gateLog.map((gate) => `| ${md(gate.gate, 80)} | ${gate.passed === true ? "통과" : gate.passed === false ? "미충족" : "미검증"} | ${md(gate.detail, 320)} |`),
      "", "## 인간의 결정", "",
      `- 선택: ${selectedDecision}`,
      `- 실제 선택 시각: ${md(decisionAt)}`,
      `- 연결된 실행: ${md(evidence.runId)} / ${md(evidence.inputHash)}`,
      "", "## 전체 근거 보관", "",
      `전체 후보·월별 원장·입력·모델 기록은 별도 JSON 버튼으로 thousand-stores-${md(evidence.runId)}.json을 저장하세요. 이 보고서는 전체 JSON의 대체본이 아닙니다.`,
      "",
    ].join("\n");
    mime = "text/markdown";
  } else {
    const csv: unknown[][] = [["recordType", "runId", "inputHash", "humanDecision", "designId", "month", "key", "value"]];
    const append = (kind: string, key: string, value: unknown, designId = "", month: number | string = "") => csv.push([kind, evidence.runId, evidence.inputHash, selectedDecision, designId, month, key, JSON.stringify(value)]);
    for (const [key, value] of Object.entries(documentEvidence)) if (key !== "result") append("metadata", key, value);
    for (const [key, value] of Object.entries(currentEnvelope.run)) if (key !== "designs" && key !== "results") append("engine", key, value);
    for (const design of currentEnvelope.run.designs) append("design", "design", design, design.id);
    for (const result of currentEnvelope.run.results) {
      append("candidate", "result", result, result.designId);
      for (const month of result.months) append("ledger", "month", month, result.designId, month.month);
    }
    content = "\uFEFF" + csv.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    mime = "text/csv";
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `thousand-stores-${evidence.runId}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setupEventListeners(): void {
  byId("btnSubmitRun").addEventListener("click", () => { void triggerRun("preview"); });
  byId("btnRunDefault10k").addEventListener("click", () => { void triggerRun("preview", true); });
  document.getElementById("btnRunAi")?.addEventListener("click", () => { void triggerRun("ai"); });
  for (const id of ["btnFlipLeft", "btnFlipRight", "btnCliffMinus", "btnCliffPlus", "btnDemoForbiddenPatch"]) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) { button.disabled = true; button.title = "현재 실행과 다른 후보 집합을 동일 후보 역전이나 검증 완료로 시연하지 않습니다."; }
  }
  byId("btnDemoUncalibrated").addEventListener("click", () => announce("현재 시스템은 현금흐름 보정 미검증입니다. 집계 휴리스틱의 작은 오차로 분포나 숨김 홀드아웃 검증을 통과시키지 않습니다."));
  for (const id of ["decHold", "decMeasure", "decProceed"]) {
    const element = byId(id);
    const choose = () => chooseDecision(element.dataset.choice as Decision);
    element.addEventListener("click", choose);
    element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); } });
  }
  byId("btnExportJson").addEventListener("click", () => download("json"));
  byId("btnExportCsv").addEventListener("click", () => download("csv"));
  byId("btnExportMd").addEventListener("click", () => download("md"));
  for (const element of document.querySelectorAll("#screen1 input, #screen1 select")) {
    const changed = () => { revision += 1; invalidate("입력이 변경되었습니다. 기존 결정과 결과는 현재 입력에 사용할 수 없습니다. 다시 실행하세요."); };
    element.addEventListener("input", changed);
    element.addEventListener("change", changed);
  }
}
async function boot(): Promise<void> {
  setupEventListeners();
  invalidate("실행 전입니다. 입력 가정을 확인한 뒤 미리보기 계산 또는 명시적 AI 실행을 선택하세요.");
  text("heroModeBadge", "실행 전 · 기본 10,000개 후보 요청");
  text("sbReplayBadge", "미실행");
  renderContext();
  await Promise.allSettled([
    fetch("/api/context").then(async (response) => {
      if (!response.ok) throw new Error("context unavailable");
      marketContext = await response.json() as ApiContext;
      renderContext();
    }).catch(() => { marketContext = null; renderContext(); }),
    fetch("/api/health").then(async (response) => {
      if (!response.ok) throw new Error("health unavailable");
      const health = await response.json();
      text("sbKeyStatus", health.aiConfigured ? "서버 AI 설정 감지 · 실호출 미검증" : "서버 AI 미설정 · 미리보기 가능");
    }).catch(() => text("sbKeyStatus", "서버 AI 설정 미확인")),
  ]);
}
void boot().catch((error) => announce(`화면 초기화 실패: ${error instanceof Error ? error.message : "미확인"}`, true));
