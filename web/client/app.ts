// web/client/app.ts — Lane A3 browser client.
// Renders all 6 screens exclusively from RunResult & server payload (never computes money on the client).
// Enforces AT-02 (hide distributions when uncalibrated), AT-07 (live cliff flip),
// AT-12 (source tag on every number, export), AT-14 (always-visible StatusBar), and AT-16 (10k scatter + saturation curve).

import type { RunResult } from "../../shared/types.js";

interface PeakQueueSimSummary {
  peakArrivalCupsPerHour: number;
  serviceCapacityCupsPerHour: number;
  utilizationPct: number;
  avgWaitSec: number;
  lostDemandPct: number;
  bottleneckNote: string;
}

interface ApiRunEnvelope {
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

let currentEnvelope: ApiRunEnvelope | null = null;
let selectedDecision: "proceed" | "hold" | "measure" = "hold";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing DOM element #${id}`);
  }
  return el as T;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtManwon(krw: number): string {
  const man = Math.round(krw / 10_000);
  return `${man.toLocaleString("ko-KR")}만 원`;
}

function srcBadge(kind: string, label?: string): string {
  const cls =
    kind === "public"
      ? "src-public"
      : kind === "onsite"
        ? "src-onsite"
        : kind === "assumed"
          ? "src-assumed"
          : kind === "synthetic"
            ? "src-synthetic"
            : "src-computed";
  return `<span class="src-tag ${cls}">${kind}${label ? `: ${label}` : ""}</span>`;
}

function renderStatusBar(run: RunResult): void {
  const sb = run.status;
  const endState = sb.endState ?? "DONE";
  const endEl = byId("sbEndState");
  endEl.textContent = sb.endReason ? `${endState} (${sb.endReason})` : endState;
  endEl.className =
    endState === "DONE"
      ? "badge badge-done"
      : endState === "FAIL"
        ? "badge badge-fail"
        : "badge badge-blocked";

  const replayEl = byId("sbReplayBadge");
  if (sb.replay) {
    replayEl.textContent = "재생 (REPLAY)";
    replayEl.className = "badge badge-replay";
  } else {
    replayEl.textContent = "실시간 (LIVE)";
    replayEl.className = "badge badge-live";
  }

  byId("sbRunId").textContent = sb.runId;
  byId("sbInputHash").textContent = (sb.inputHash ?? "-").slice(0, 8);
  byId("sbEngineSha").textContent = sb.engineSha ?? "-";
  byId("sbComputeMs").textContent = `${(run.computeMs ?? 0).toFixed(1)} ms`;
  byId("sbInputFiles").textContent = sb.inputFiles.join(", ");
  byId("sbTokensTotal").textContent = `${fmtInt(sb.tokenTotal.input)} in / ${fmtInt(sb.tokenTotal.output)} out (${sb.tokens.length} calls)`;

  const gateStrip = byId("sbGateLog");
  gateStrip.innerHTML = sb.gateLog
    .map((g) => {
      const cls =
        g.passed === true
          ? "badge-done"
          : g.passed === false
            ? "badge-fail"
            : "badge-blocked";
      const timeShort = g.at.split("T")[1]?.slice(0, 8) ?? g.at;
      return `<span class="badge ${cls}" title="${g.detail}">${g.gate}: ${g.passed ? "PASS" : "FAIL"} (${timeShort})</span>`;
    })
    .join("");
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
      `<strong>500 AI design families x 20 variations</strong> · N=1,000(${c1.failureFamilies}가족/${c1.nonDominated}비지배) → N=3,000(${c2.failureFamilies}가족/${c2.nonDominated}비지배) → N=10,000(${c3.failureFamilies}가족/${c3.nonDominated}비지배) · <strong>${statusText}</strong> ${srcBadge("computed")}`;
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
    run.results.find((r) => r.designId === run.leaderDesignId && r.months.length > 0) ??
    run.results.find((r) => r.months.length > 0);
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

function renderAllScreens(envelope: ApiRunEnvelope): void {
  currentEnvelope = envelope;
  const { run, seoulSummary, peakQueueSim } = envelope;

  // 0. Status Bar (AT-14)
  renderStatusBar(run);

  // Hero Badges
  const modeLabel =
    run.mode === 1000
      ? "1,000 variants (spike mode)"
      : "500 AI design families x 20 variations";
  byId("heroModeBadge").textContent = modeLabel;
  byId("landscapeModeLabel").textContent = modeLabel;

  const isCalibrated = run.calibration.label === "calibrated";
  const calibBadgeText = isCalibrated
    ? `보정됨 (calibrated · 오차 ${(run.calibration.errorPp ?? 0).toFixed(2)}pp)`
    : `미보정 (uncalibrated · 오차 ${(run.calibration.errorPp ?? 0).toFixed(2)}pp)`;
  const calibClass = isCalibrated ? "badge badge-done" : "badge badge-fail";

  byId("heroCalibrationBadge").textContent = calibBadgeText;
  byId("heroCalibrationBadge").className = calibClass;
  byId("sec2CalibBadge").textContent = calibBadgeText;
  byId("sec2CalibBadge").className = calibClass;

  const isAiNative = run.baseline?.label === "ai-native";
  const baseText = isAiNative ? "AI-native (기준선 우위)" : "탐색기 (explorer)";
  const baseClass = isAiNative ? "badge badge-done" : "badge badge-blocked";
  byId("heroBaselineBadge").textContent = baseText;
  byId("heroBaselineBadge").className = baseClass;
  byId("sec5BaselineBadge").textContent = baseText;
  byId("sec5BaselineBadge").className = baseClass;

  // Screen 1 public metrics
  byId("pubStoreCount").innerHTML = `${fmtInt(seoulSummary.latestStoreCount)}개 ${srcBadge("public", "OA-15577")}`;
  byId("pubOpenRate").innerHTML = `${seoulSummary.meanQuarterlyOpenRatePct.toFixed(2)}% ${srcBadge("public", "2021-2024")}`;
  byId("pubCloseRate").innerHTML = `${seoulSummary.meanQuarterlyCloseRatePct.toFixed(2)}% ${srcBadge("public", "2021-2024")}`;

  // Screen 2: AT-02 Uncalibrated Hiding Rule vs Calibrated Landscape
  const uncalibPanel = byId("uncalibratedPanel");
  const calibContainer = byId("calibratedDistributionContainer");

  if (!isCalibrated) {
    uncalibPanel.classList.remove("hidden");
    calibContainer.classList.add("hidden");

    const baseD = run.designs[0];
    byId("uncalibratedTableBody").innerHTML = `
      <tr>
        <td>2021~2024 백테스트 개·폐업률 오차</td>
        <td>허용 임계치 ±5.00 pp</td>
        <td>${(run.calibration.errorPp ?? 0).toFixed(2)} pp</td>
        <td>${(run.calibration.holdoutErrorPp ?? 0).toFixed(2)} pp</td>
        <td>${srcBadge("public", "OA-15577")}</td>
      </tr>
      <tr>
        <td>총 예산 및 최소 현금 유보율</td>
        <td>${fmtManwon(run.constraints.budgetKrw)} / ${(run.constraints.reserveRatioMin * 100).toFixed(0)}%</td>
        <td>-</td>
        <td>-</td>
        <td>${srcBadge("onsite", "예산제약")}</td>
      </tr>
      <tr>
        <td>기본 보증금 / 월 임대료 / 인테리어</td>
        <td>${fmtManwon(baseD?.deposit.value ?? 40_000_000)} / ${fmtManwon(baseD?.monthlyRent.value ?? 3_300_000)} / ${fmtManwon(baseD?.fitoutCost.value ?? 48_000_000)}</td>
        <td>-</td>
        <td>-</td>
        <td>${srcBadge("onsite", "중개호가")}</td>
      </tr>
    `;
  } else {
    uncalibPanel.classList.add("hidden");
    calibContainer.classList.remove("hidden");

    const totalN = run.results.length;
    const survivors = run.results.filter(
      (r) => r.deathMonth === null && r.survivedMonths >= 36 && r.constraintsOk
    ).length;
    const freqPct = totalN > 0 ? ((survivors / totalN) * 100).toFixed(1) : "0.0";
    const nonDomCount = run.results.filter((r) => r.nonDominated).length;
    const famSet = new Set(
      run.results
        .filter((r) => (r.deathMonth !== null || r.survivedMonths < 36) && r.failureFamily)
        .map((r) => r.failureFamily)
    );
    const leaderRes =
      run.results.find((r) => r.designId === run.leaderDesignId) ?? run.results[0];

    byId("kpiSurvivalFreq").innerHTML =
      `${fmtInt(survivors)} / ${fmtInt(totalN)} (${freqPct}%) ${srcBadge("computed", "시나리오빈도")}`;
    byId("kpiSurvivalSub").textContent =
      `시나리오 빈도(scenario frequency) 기준 · 사망 ${fmtInt(totalN - survivors)}건`;
    byId("kpiNonDominated").innerHTML =
      `${fmtInt(nonDomCount)}개 설계안 ${srcBadge("computed", "Pareto")}`;
    byId("kpiFailureFamilies").innerHTML =
      `${fmtInt(famSet.size)}개 실패 가족 ${srcBadge("computed", "Rule-key")}`;
    byId("kpiRejectedSub").innerHTML =
      `하드 제약 위반 기각(사망 미집계): ${fmtInt(run.rejectedCount ?? 0)}건 ${srcBadge("computed")}`;
    byId("kpiLeaderId").innerHTML =
      `${run.leaderDesignId ?? "-"} ${srcBadge("computed", "#1")}`;
    byId("kpiLeaderPnl").innerHTML =
      `36개월 생존 (${leaderRes?.survivedMonths ?? 36}M) · 누적손익 ${fmtManwon(leaderRes?.cumPnL ?? 0)} ${srcBadge("computed")}`;

    renderLandscapeCanvas(run);
    renderSaturationCanvas(run);
    renderCashflowCanvas(run);

    // Peak-Hour Queue Mini-Sim (P1)
    byId("peakQueuePanel").innerHTML = `
      <div>피크 시간 도착 수요: <strong>${peakQueueSim.peakArrivalCupsPerHour.toFixed(1)} 잔/시간</strong> ${srcBadge("computed", "피크계수")}</div>
      <div>바리스타 처리 용량: <strong>${peakQueueSim.serviceCapacityCupsPerHour.toFixed(1)} 잔/시간</strong> ${srcBadge("computed", "제조시간·인력")}</div>
      <div>피크 가동률 (Utilization): <strong>${peakQueueSim.utilizationPct.toFixed(1)}%</strong> ${srcBadge("computed")}</div>
      <div>예상 평균 대기 시간: <strong>${peakQueueSim.avgWaitSec.toFixed(0)}초</strong> · 대기 이탈 손실률: <strong>${peakQueueSim.lostDemandPct.toFixed(1)}%</strong> ${srcBadge("computed")}</div>
      <div style="color: var(--accent-blue); font-size: 12px;">진단: ${peakQueueSim.bottleneckNote}</div>
    `;
  }

  // Screen 3: Single Decision Cliff (AT-07)
  if (run.cliff) {
    const c = run.cliff;
    const deltaPct = (c.relativeDelta ?? 0) * 100;
    byId("cliffHeadline").innerHTML =
      `${String(c.variable)}: 경계 ${fmtInt(c.boundaryValue)} ${c.unit} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%) ${srcBadge("computed", "AT-07")}`;
    byId("cliffFlipDetail").innerHTML =
      `경계 전 #1 설계안 <strong>${c.leaderBelow}</strong> → 경계 돌파 시 #1 설계안 <strong>${c.leaderAbove}</strong> 로 교체됨`;
  } else {
    byId("cliffHeadline").textContent = "절벽 경계 없음 (전 구간 동일 #1 설계안 유지)";
    byId("cliffFlipDetail").textContent = "-30% ~ +30% 범위 내에서 #1 설계안이 유지됩니다.";
  }

  // Screen 4: Single Next Field Measurement (AT-08)
  if (run.nextMeasurement) {
    const m = run.nextMeasurement;
    byId("measureVariable").innerHTML =
      `대상 변수: ${m.variable} (우선순위 점수 ${(m.priorityScore ?? 1).toFixed(2)}) ${srcBadge("computed", "AT-08")}`;
    byId("measureAction").innerHTML =
      `7일 행동 지침: ${m.howToMeasureOnsite} ${srcBadge("onsite", "7일실측")}`;
    byId("measureReason").innerHTML =
      `선정 근거: ${m.why}`;
  }

  // Screen 5: Adversarial Rounds Table (AT-13) & Baseline/Backtest Table (AT-01, AT-09, AT-15)
  const roundsBody = byId("roundsTableBody");
  roundsBody.innerHTML = run.rounds
    .map(
      (r) => `
      <tr>
        <td>Round ${r.round}</td>
        <td><span class="badge badge-live">${r.changed}</span></td>
        <td>${fmtInt(r.shocksAdded)}건</td>
        <td>${fmtInt(r.deaths)}건</td>
        <td>+${fmtInt(r.newFailureFamilies)}개</td>
        <td>${fmtInt(r.nonDominatedSurvivors)}개</td>
        <td>${r.stopReason ?? "계속 진행"} (${(r.elapsedMs ?? 0).toFixed(1)}ms) ${srcBadge("computed")}</td>
      </tr>
    `
    )
    .join("");

  const b = run.baseline;
  const yrRows = (run.calibration.yearlyErrors ?? [])
    .map(
      (y) => `
      <tr>
        <td>백테스트 ${y.year}년 개·폐업 오차</td>
        <td>개업 ${y.simOpenRatePct.toFixed(1)}% / 폐업 ${y.simCloseRatePct.toFixed(1)}%</td>
        <td>개업 ${y.refOpenRatePct.toFixed(1)}% / 폐업 ${y.refCloseRatePct.toFixed(1)}%</td>
        <td>${Math.max(y.openErrorPp, y.closeErrorPp).toFixed(2)} pp ${srcBadge("public", "OA-15577")}</td>
        <td><span class="badge ${Math.max(y.openErrorPp, y.closeErrorPp) <= 5 ? "badge-done" : "badge-fail"}">${Math.max(y.openErrorPp, y.closeErrorPp) <= 5 ? "PASS" : "FAIL"}</span></td>
      </tr>
    `
    )
    .join("");

  byId("verificationTableBody").innerHTML = `
    <tr>
      <td>AT-09 실패 가족 탐색 수 (동일 예산)</td>
      <td>Argon: ${fmtInt(b?.argonNewFamilies ?? 0)}개</td>
      <td>Random: ${fmtInt(b?.randomNewFamilies ?? 0)}개</td>
      <td>+${fmtInt((b?.argonNewFamilies ?? 0) - (b?.randomNewFamilies ?? 0))}개 ${srcBadge("computed")}</td>
      <td><span class="badge ${isAiNative ? "badge-done" : "badge-blocked"}">${b?.koLabel ?? "AI-native"}</span></td>
    </tr>
    <tr>
      <td>AT-09 파레토 비지배 설계 수</td>
      <td>Argon: ${fmtInt(b?.argonNonDominated ?? 0)}개</td>
      <td>Random: ${fmtInt(b?.randomNonDominated ?? 0)}개</td>
      <td>+${fmtInt((b?.argonNonDominated ?? 0) - (b?.randomNonDominated ?? 0))}개 ${srcBadge("computed")}</td>
      <td><span class="badge ${isAiNative ? "badge-done" : "badge-blocked"}">${b?.koLabel ?? "AI-native"}</span></td>
    </tr>
    <tr>
      <td>AT-15 은닉 홀드아웃 (2025Q1~2026Q2)</td>
      <td>엔진 시뮬레이션</td>
      <td>서울시 2025~2026Q2 실측</td>
      <td>${(run.calibration.holdoutErrorPp ?? 0).toFixed(2)} pp ${srcBadge("public", "Holdout")}</td>
      <td><span class="badge ${(run.calibration.holdoutErrorPp ?? 99) <= 5 ? "badge-done" : "badge-fail"}">${(run.calibration.holdoutErrorPp ?? 99) <= 5 ? "PASS" : "FAIL"}</span></td>
    </tr>
    ${yrRows}
  `;
}

function collectOnsitePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    budgetKrw: Number((byId<HTMLInputElement>("inpBudgetKrw")).value),
    reserveRatioMin: Number((byId<HTMLInputElement>("inpReserveRatio")).value),
    depositKrw: Number((byId<HTMLInputElement>("inpDepositKrw")).value),
    monthlyRentKrw: Number((byId<HTMLInputElement>("inpMonthlyRentKrw")).value),
    fitoutCostKrw: Number((byId<HTMLInputElement>("inpFitoutCostKrw")).value),
    floorAreaM2: Number((byId<HTMLInputElement>("inpFloorAreaM2")).value),
    seats: Number((byId<HTMLInputElement>("inpSeats")).value),
    avgTicketKrw: Number((byId<HTMLInputElement>("inpAvgTicketKrw")).value),
    cupsPerDayBase: Number((byId<HTMLInputElement>("inpCupsPerDayBase")).value),
    makeTimeSec: Number((byId<HTMLInputElement>("inpMakeTimeSec")).value),
    staffFte: Number((byId<HTMLInputElement>("inpStaffFte")).value),
    cogsRatio: Number((byId<HTMLInputElement>("inpCogsRatio")).value),
    mode: Number((byId<HTMLSelectElement>("inpMode")).value) === 1000 ? 1000 : 10000,
    decisionChoice: selectedDecision,
    ...overrides,
  };
}

async function triggerRun(overrides: Record<string, unknown> = {}): Promise<void> {
  byId("patchAttackAlert").classList.add("hidden");
  const payload = collectOnsitePayload(overrides);
  const res = await fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as ApiRunEnvelope;
  renderAllScreens(data);
}

async function runCliffSide(side: "left" | "right"): Promise<void> {
  if (!currentEnvelope?.run.cliff) {
    await triggerRun();
    return;
  }
  const cliff = currentEnvelope.run.cliff;
  const factor = side === "left" ? 0.92 : 1.18;
  const targetVal = Math.round(cliff.boundaryValue * factor);

  const overrideMap: Record<string, unknown> = {};
  const v = String(cliff.variable);
  if (v === "monthlyRent" || v === "rentKRW") {
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = String(targetVal);
    overrideMap.monthlyRentKrw = targetVal;
  } else if (v === "avgTicketKrw" || v === "pricePerCupKRW") {
    (byId<HTMLInputElement>("inpAvgTicketKrw")).value = String(targetVal);
    overrideMap.avgTicketKrw = targetVal;
  } else if (v === "makeTimeSec") {
    (byId<HTMLInputElement>("inpMakeTimeSec")).value = String(targetVal);
    overrideMap.makeTimeSec = targetVal;
  } else if (v === "cupsPerDayBase") {
    (byId<HTMLInputElement>("inpCupsPerDayBase")).value = String(targetVal);
    overrideMap.cupsPerDayBase = targetVal;
  } else {
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = String(
      side === "left" ? 3_100_000 : 4_200_000
    );
    overrideMap.monthlyRentKrw = side === "left" ? 3_100_000 : 4_200_000;
  }

  await triggerRun(overrideMap);
}

async function triggerForbiddenPatchAttack(): Promise<void> {
  const res = await fetch("/patches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patches: [
        { op: "replace", path: "/checks", value: 1, by: "StoreDesigner" },
        { op: "replace", path: "/budgetKrw", value: 999999999, by: "StoreDesigner" },
        { op: "replace", path: "/reserveRatioMin", value: 0, by: "StoreDesigner" },
        { op: "replace", path: "/oracle/pnlFormula", value: "hack", by: "StoreDesigner" },
        { op: "replace", path: "/backtest/referenceRates", value: 0, by: "BankruptcyDesigner" },
      ],
    }),
  });
  const out = (await res.json()) as {
    acceptedCount: number;
    rejectedCount: number;
    rejectedPatches: { patchIndex: number; path: string; reason: string }[];
    engineResultHashUnchanged: boolean;
  };
  const alertEl = byId("patchAttackAlert");
  alertEl.classList.remove("hidden");
  alertEl.innerHTML = `
    <div style="font-weight: 800; color: #fda4af;">
      🛡️ [AT-10 판정기(Oracle) 보호 검증 완료] 금지 경로 패치 ${out.rejectedCount}/5건 전량 기각 · 엔진 결과 해시 불변(${out.engineResultHashUnchanged ? "VERIFIED" : "FAIL"})
    </div>
    <ul style="margin-left: 18px; font-size: 12px; color: var(--text-secondary);">
      ${out.rejectedPatches.map((p) => `<li><code>${p.path}</code> → ${p.reason}</li>`).join("")}
    </ul>
  `;
}

function setupEventListeners(): void {
  byId("btnSubmitRun").addEventListener("click", () => {
    void triggerRun({ replay: false });
  });

  byId("btnRunDefault10k").addEventListener("click", () => {
    (byId<HTMLSelectElement>("inpMode")).value = "10000";
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = "3300000";
    void triggerRun({ mode: 10000, referenceOffsetPp: 0, replay: false });
  });

  byId("btnFlipLeft").addEventListener("click", () => {
    void runCliffSide("left");
  });

  byId("btnFlipRight").addEventListener("click", () => {
    void runCliffSide("right");
  });

  byId("btnCliffMinus").addEventListener("click", () => {
    void runCliffSide("left");
  });

  byId("btnCliffPlus").addEventListener("click", () => {
    void runCliffSide("right");
  });

  byId("btnDemoUncalibrated").addEventListener("click", () => {
    void triggerRun({ referenceOffsetPp: 10.0, replay: false });
  });

  byId("btnDemoForbiddenPatch").addEventListener("click", () => {
    void triggerForbiddenPatchAttack();
  });

  // Decision cards (Screen 6)
  const decisionCards = [byId("decMeasure"), byId("decHold"), byId("decProceed")];
  const decisionLabels: Record<string, string> = {
    measure: "7일 현장 실측 우선 수행 (Measure first)",
    hold: "보류: 측정 전까지 근거 부족 (Hold: insufficient evidence)",
    proceed: "#1 비지배 생존 설계안 조건으로 협상 진행 (Proceed)",
  };
  for (const card of decisionCards) {
    card.addEventListener("click", () => {
      for (const c of decisionCards) c.classList.remove("active");
      card.classList.add("active");
      const choice = (card.getAttribute("data-choice") ?? "hold") as "proceed" | "hold" | "measure";
      selectedDecision = choice;
      byId("selectedDecisionText").textContent = decisionLabels[choice] ?? choice;
    });
  }

  // Export buttons (Screen 6, AT-12)
  byId("btnExportCsv").addEventListener("click", () => {
    const runId = currentEnvelope?.run.runId ?? "default";
    window.location.href = `/api/export/${encodeURIComponent(runId)}/csv?decision=${encodeURIComponent(selectedDecision)}`;
  });

  byId("btnExportMd").addEventListener("click", () => {
    const runId = currentEnvelope?.run.runId ?? "default";
    window.location.href = `/api/export/${encodeURIComponent(runId)}/report.md?decision=${encodeURIComponent(selectedDecision)}`;
  });

  byId("btnExportJson").addEventListener("click", () => {
    if (!currentEnvelope) return;
    const blob = new Blob([JSON.stringify(currentEnvelope.run, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thousand-stores-${currentEnvelope.run.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

async function boot(): Promise<void> {
  setupEventListeners();
  const res = await fetch("/api/default");
  if (res.ok) {
    const data = (await res.json()) as ApiRunEnvelope;
    renderAllScreens(data);
  }
}

void boot();
