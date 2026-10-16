/**
 * A Thousand Stores — Browser Dashboard Controller
 *
 * Strictly enforces:
 * - Separation of Observed Public Data, Explicit User Assumptions, Bounded AI Proposals, and Verified Deterministic Outputs.
 * - Missing sales in OA-15572 remain null (never coerced to 0) and never produce a data-derived rank or cashflow.
 * - Blank/missing transaction input is rejected; explicit 0 is preserved and evaluated.
 * - Stale input edits immediately mark the current run/evidence as stale until re-executed, and evidence download snapshots the exact verified run inputs & source metadata.
 */

const state = {
  contextData: null,
  geminiStatus: null,
  selectedAreaCode: "3001496",
  lastVerifiedRun: null,
  lastGeminiProposal: null,
  selectedDecision: null,
  isStaleSinceLastRun: false,
  simRequestSeq: 0,
  isSimInFlight: false
};

const PRESETS = {
  case1: {
    budget: 120000000,
    deposit: 30000000,
    openingCost: 42000000,
    avgTicket: 5000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6000000,
    seed: "seoul-cafe-2026-v1"
  },
  case2: {
    budget: 120000000,
    deposit: 30000000,
    openingCost: 42000000,
    avgTicket: 5000,
    transactionsPerDay: 0,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6000000,
    seed: "seoul-cafe-2026-v1"
  },
  case3Pass: {
    budget: 120000000,
    deposit: 108000000,
    openingCost: 0,
    avgTicket: 5000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6000000,
    seed: "seoul-cafe-2026-v1"
  },
  case3Fail: {
    budget: 120000000,
    deposit: 109000000,
    openingCost: 0,
    avgTicket: 5000,
    transactionsPerDay: 100,
    tradingDaysPerMonth: 24,
    variableCostRatio: 0.35,
    monthlyFixedCost: 6000000,
    seed: "seoul-cafe-2026-v1"
  }
};

function fmtKrw(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "Missing (null)";
  return `${Math.round(n).toLocaleString("en-US")} KRW`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readFormInputsRaw() {
  return {
    budget: document.getElementById("budgetInput").value,
    deposit: document.getElementById("depositInput").value,
    openingCost: document.getElementById("openingCostInput").value,
    avgTicket: document.getElementById("avgTicketInput").value,
    transactionsPerDay: document.getElementById("transactionsPerDayInput").value,
    tradingDaysPerMonth: document.getElementById("tradingDaysInput").value,
    variableCostRatio: document.getElementById("variableRatioInput").value,
    monthlyFixedCost: document.getElementById("monthlyFixedInput").value
  };
}

function getEffectiveSeed() {
  return document.getElementById("seedInput").value.trim() || "seoul-cafe-2026-v1";
}

function captureCurrentSnapshotKey() {
  return JSON.stringify({
    areaCode: state.selectedAreaCode,
    seed: getEffectiveSeed(),
    inputs: readFormInputsRaw()
  });
}

function resetHumanDecision() {
  state.selectedDecision = null;
  document.querySelectorAll(".btn-decision").forEach((b) => b.classList.remove("active"));
  updateDecisionAndExportControls();
}

function invalidatePendingProposalApply() {
  state.lastGeminiProposal = null;
  const applyBtn = document.getElementById("applyGeminiProposalBtn");
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = "Proposal Expired (Inputs/Context Changed)";
  }
}

function updateDecisionAndExportControls() {
  const canDecide = Boolean(state.lastVerifiedRun) && !state.isStaleSinceLastRun && !state.isSimInFlight;
  document.querySelectorAll(".btn-decision").forEach((b) => {
    b.disabled = !canDecide;
  });

  const exportBtn = document.getElementById("downloadEvidenceBtn");
  const canExport = canDecide && Boolean(state.selectedDecision);
  exportBtn.disabled = !canExport;
  exportBtn.title = canExport
    ? ""
    : "Run a fresh simulation and explicitly select a human decision (Hold / Measure / Proceed) to enable export.";
}

function setFormInputs(vals) {
  document.getElementById("budgetInput").value = String(vals.budget);
  document.getElementById("depositInput").value = String(vals.deposit);
  document.getElementById("openingCostInput").value = String(vals.openingCost);
  document.getElementById("avgTicketInput").value = String(vals.avgTicket);
  document.getElementById("transactionsPerDayInput").value = String(vals.transactionsPerDay);
  document.getElementById("tradingDaysInput").value = String(vals.tradingDaysPerMonth);
  document.getElementById("variableRatioInput").value = String(vals.variableCostRatio);
  document.getElementById("monthlyFixedInput").value = String(vals.monthlyFixedCost);
  if (vals.seed) {
    document.getElementById("seedInput").value = String(vals.seed);
  }
}

function markStaleState(isStale) {
  state.isStaleSinceLastRun = isStale;
  const staleBox = document.getElementById("staleWarningBox");
  const freshnessBadge = document.getElementById("runFreshnessBadge");

  if (isStale) {
    resetHumanDecision();
    staleBox.classList.remove("hidden");
    freshnessBadge.className = "badge badge-warn";
    freshnessBadge.textContent = "Run Status: Stale (Inputs Edited — Re-run Required)";
  } else {
    staleBox.classList.add("hidden");
    freshnessBadge.className = "badge badge-ok";
    freshnessBadge.textContent = state.lastVerifiedRun
      ? `Verified Run: ${state.lastVerifiedRun.runId}`
      : "Run Status: Ready";
  }
  updateDecisionAndExportControls();
}

function renderGeminiStatusBadge(gemini) {
  const badge = document.getElementById("geminiBadge");
  if (!gemini || !gemini.configured) {
    badge.className = "badge badge-warn";
    badge.textContent = `Gemini (${gemini?.model || "gemini-3.8-flash"}): Unconfigured (No Key)`;
  } else {
    badge.className = "badge badge-ok";
    badge.textContent = `Gemini (${gemini.model}): Configured (${gemini.quota?.callsRemaining ?? "?"} calls left)`;
  }
}

function renderAreaContextCard() {
  const card = document.getElementById("observedContextCard");
  const areas = state.contextData?.areas || [];
  const area = areas.find((a) => a.areaCode === state.selectedAreaCode);

  if (!area) {
    card.innerHTML = `<strong>Context selection pending</strong>: Select an attributed Seoul commercial area.`;
    return;
  }

  const s = area.observedStores;
  const sales = area.observedSales;
  const normNote = area.normalizationNote
    ? `<div class="helper-note" style="margin-top:0.35rem;"><strong>Raw Name Note:</strong> ${escapeHtml(area.normalizationNote)}</div>`
    : "";

  const salesHtml = sales
    ? `
      <div class="context-stat">
        <div class="k">Raw Reported Area Sales (당월_매출_금액 · Period Unconfirmed)</div>
        <div class="v">${fmtKrw(sales.rawReportedSalesKrw)}</div>
      </div>
      <div class="context-stat">
        <div class="k">Raw Reported Area Tx (당월_매출_건수 · Period Unconfirmed)</div>
        <div class="v">${sales.rawReportedTransactions.toLocaleString("en-US")} tx</div>
      </div>
      <div class="context-stat">
        <div class="k">Observed Area Weekday / Weekend Sales Share</div>
        <div class="v">${sales.weekdaySalesSharePct}% / ${(100 - sales.weekdaySalesSharePct).toFixed(1)}%</div>
      </div>
      <div class="context-stat">
        <div class="k">Data-Derived Individual Store Cashflow</div>
        <div class="v">Not available from area totals</div>
      </div>
    `
    : `
      <div class="context-stat" style="grid-column: span 2; border-color: #f59e0b; background: #fffbeb;">
        <div class="k">OA-15572 Estimated Sales Row Status</div>
        <div class="v" style="color:#b45309;">MISSING IN SOURCE (null — Never replaced with 0)</div>
        <div class="helper-note">
          Store row exists in OA-15577 (line ${area.sourceTrace.storeRowLine}), but no corresponding sales row exists in OA-15572.
          Cannot produce a data-derived cashflow or sales rank. Simulation uses your explicit user transaction assumption only.
        </div>
      </div>
    `;

  card.innerHTML = `
    <div>
      <strong>${escapeHtml(area.displayName)}</strong>
      <span class="helper-note">[Code: <code>${escapeHtml(area.areaCode)}</code> · Raw Name: <code>${escapeHtml(area.areaName)}</code> · Type: ${escapeHtml(area.areaTypeName)}]</span>
    </div>
    ${normNote}
    <div class="context-grid">
      <div class="context-stat">
        <div class="k">Observed Cafe Stores (전체 / 일반 / 프랜차이즈)</div>
        <div class="v">${s.totalStores} total (${s.ordinaryStores} ind / ${s.franchiseStores} fran)</div>
      </div>
      <div class="context-stat">
        <div class="k">Observed Area Opening / Closure Rate (Not Store Survival)</div>
        <div class="v">Open ${s.openingRatePct}% (${s.openingStores}) · Close ${s.closureRatePct}% (${s.closedStores})</div>
      </div>
      ${salesHtml}
    </div>
  `;
}

function renderCashflowSvg(cashflow) {
  const container = document.getElementById("cashflowSvgContainer");
  const pts = [{ month: 0, endingCash: cashflow.checkpoints.month0Cash }, ...cashflow.months];

  const width = 680;
  const height = 220;
  const padL = 78;
  const padR = 24;
  const padT = 20;
  const padB = 34;

  const vals = pts.map((p) => p.endingCash);
  const minVal = Math.min(0, ...vals);
  const maxVal = Math.max(10_000_000, ...vals);
  const span = Math.max(1, maxVal - minVal);

  const xOf = (m) => padL + (m / 36) * (width - padL - padR);
  const yOf = (v) => padT + ((maxVal - v) / span) * (height - padT - padB);

  const zeroY = yOf(0);
  const polyPoints = pts.map((p) => `${xOf(p.month).toFixed(1)},${yOf(p.endingCash).toFixed(1)}`).join(" ");

  let markersSvg = "";
  if (cashflow.cashBoundaries.zeroCashBoundaryMonth !== null) {
    const m0 = cashflow.cashBoundaries.zeroCashBoundaryMonth;
    const pt0 = pts.find((p) => p.month === m0);
    if (pt0) {
      markersSvg += `
        <circle cx="${xOf(m0)}" cy="${yOf(pt0.endingCash)}" r="5" fill="#d97706" />
        <text x="${Math.min(width - 110, xOf(m0) + 6)}" y="${Math.max(15, yOf(pt0.endingCash) - 8)}" font-size="11" fill="#b45309" font-weight="700">Zero-Cash M${m0}</text>
      `;
    }
  }
  if (cashflow.cashBoundaries.firstNegativeCashMonth !== null) {
    const mNeg = cashflow.cashBoundaries.firstNegativeCashMonth;
    const ptNeg = pts.find((p) => p.month === mNeg);
    if (ptNeg) {
      markersSvg += `
        <circle cx="${xOf(mNeg)}" cy="${yOf(ptNeg.endingCash)}" r="5" fill="#b91c1c" />
        <text x="${Math.min(width - 125, xOf(mNeg) + 6)}" y="${Math.min(height - 12, yOf(ptNeg.endingCash) + 16)}" font-size="11" fill="#b91c1c" font-weight="700">1st Negative M${mNeg}</text>
      `;
    }
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="220" role="img" aria-label="36-month cashflow curve">
      <rect x="${padL}" y="${padT}" width="${width - padL - padR}" height="${height - padT - padB}" fill="#faf9f5" stroke="#e5e0d4" />
      ${
        minVal < 0
          ? `<rect x="${padL}" y="${zeroY}" width="${width - padL - padR}" height="${Math.max(0, height - padB - zeroY)}" fill="rgba(185,28,28,0.07)" />`
          : ""
      }
      <line x1="${padL}" y1="${zeroY}" x2="${width - padR}" y2="${zeroY}" stroke="#b91c1c" stroke-dasharray="4 3" stroke-width="1.2" />
      <text x="${padL - 6}" y="${zeroY + 4}" text-anchor="end" font-size="10" fill="#b91c1c">0 KRW</text>
      <text x="${padL - 6}" y="${padT + 8}" text-anchor="end" font-size="10" fill="#5a574f">${(maxVal / 1e6).toFixed(0)}M</text>
      <text x="${padL - 6}" y="${height - padB}" text-anchor="end" font-size="10" fill="#5a574f">${(minVal / 1e6).toFixed(0)}M</text>
      <polyline fill="none" stroke="#1f4e3d" stroke-width="2.6" points="${polyPoints}" />
      ${markersSvg}
      <text x="${xOf(0)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#5a574f">M0</text>
      <text x="${xOf(12)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#5a574f">M12</text>
      <text x="${xOf(24)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#5a574f">M24</text>
      <text x="${xOf(36)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#5a574f">M36</text>
    </svg>
  `;
}

function renderDistributionSvg(batch) {
  const container = document.getElementById("distributionSvgContainer");
  const bins = batch.histogramBins || [];
  const width = 680;
  const height = 185;
  const padL = 45;
  const padR = 20;
  const padT = 18;
  const padB = 38;

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barW = plotW / Math.max(1, bins.length);

  const barsSvg = bins
    .map((b, i) => {
      const h = (b.count / maxCount) * plotH;
      const x = padL + i * barW + 3;
      const y = padT + plotH - h;
      const fill = b.highKrw < 0 ? "#dc2626" : b.lowKrw < 0 ? "#d97706" : "#2e6f56";
      const labelM = `${(b.lowKrw / 1e6).toFixed(0)}M`;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(4, barW - 6).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="2" />
        <text x="${(x + (barW - 6) / 2).toFixed(1)}" y="${Math.max(12, y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#2c2a25">${b.count}</text>
        ${
          i % 2 === 0
            ? `<text x="${(x + (barW - 6) / 2).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-size="9.5" fill="#5a574f">${labelM}</text>`
            : ""
        }
      `;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="185" role="img" aria-label="1,000 scenario distribution histogram">
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="#c5bfb0" />
      ${barsSvg}
    </svg>
  `;

  document.getElementById("batchMetaLabel").textContent =
    `Seed: "${batch.seed}" · 1,000 assumed runs (${batch.distinctScenarioCount} distinct parameter combinations) · Not survival probabilities`;

  document.getElementById("batchSummaryRow").innerHTML = `
    <span class="batch-pill"><strong>Positive Monthly Cash Change:</strong> ${batch.counts.positiveMonthlyCashChangeScenarios} / 1,000 assumed scenarios</span>
    <span class="batch-pill"><strong>Non-Negative at Month 36:</strong> ${batch.counts.nonNegativeMonth36CashScenarios} / 1,000 assumed scenarios</span>
    <span class="batch-pill"><strong>P10 / P50 / P90 Month-36 Cash:</strong> ${(batch.percentiles.month36Cash.p10 / 1e6).toFixed(1)}M / ${(batch.percentiles.month36Cash.p50 / 1e6).toFixed(1)}M / ${(batch.percentiles.month36Cash.p90 / 1e6).toFixed(1)}M KRW</span>
  `;
}

function renderSimulationRun(runData) {
  const { cashflow, scenarioBatch, nextMeasurement } = runData;
  const rg = cashflow.reserveGate;
  const mm = cashflow.monthlyMetrics;
  const be = cashflow.breakEvenBoundary;
  const cb = cashflow.cashBoundaries;

  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi-card ${rg.passed ? "pass" : "fail"}">
      <div class="kpi-title">Initial Available Cash (C0) &amp; 10% Reserve Gate</div>
      <div class="kpi-value">${fmtKrw(rg.initialAvailableCash)}</div>
      <div class="kpi-sub">${rg.passed ? "PASS" : "FAIL"} (${(rg.reserveRatio * 100).toFixed(1)}% vs 10.0% min ${fmtKrw(rg.requiredReserveCash)})</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Monthly Sales (Assumed)</div>
      <div class="kpi-value">${fmtKrw(mm.monthlySales)}</div>
      <div class="kpi-sub">Var Cost ${fmtKrw(mm.monthlyVariableCost)} · Contrib ${fmtKrw(mm.monthlyContribution)}</div>
    </div>
    <div class="kpi-card ${mm.monthlyOperatingCashChange > 0 ? "pass" : "fail"}">
      <div class="kpi-title">Monthly Operating Cash Change</div>
      <div class="kpi-value">${mm.monthlyOperatingCashChange >= 0 ? "+" : ""}${fmtKrw(mm.monthlyOperatingCashChange)}</div>
      <div class="kpi-sub">Not net profit (taxes/debt/depreciation unmodeled)</div>
    </div>
    <div class="kpi-card ${cashflow.checkpoints.month36Cash >= 0 ? "pass" : "fail"}">
      <div class="kpi-title">Month-36 Cash Position</div>
      <div class="kpi-value">${fmtKrw(cashflow.checkpoints.month36Cash)}</div>
      <div class="kpi-sub">M8: ${fmtKrw(cashflow.checkpoints.month8Cash)} · M12: ${fmtKrw(cashflow.checkpoints.month12Cash)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">1st Positive Integer Daily Volume</div>
      <div class="kpi-value">${be.firstPositiveIntegerDailyTransactions ?? "N/A"} tx/day</div>
      <div class="kpi-sub">Exact 0-change boundary: ${be.exactZeroBreakEvenDailyTransactions !== null ? be.exactZeroBreakEvenDailyTransactions.toFixed(2) : "N/A"} tx/day</div>
    </div>
    <div class="kpi-card ${cb.firstNegativeCashMonth === null ? "pass" : "fail"}">
      <div class="kpi-title">Zero-Cash vs 1st Negative Month</div>
      <div class="kpi-value">Zero: ${cb.zeroCashBoundaryMonth !== null ? `M${cb.zeroCashBoundaryMonth}` : "None"} · Neg: ${cb.firstNegativeCashMonth !== null ? `M${cb.firstNegativeCashMonth}` : "None"}</div>
      <div class="kpi-sub">Zero cash and funding shortfall are shown separately</div>
    </div>
  `;

  renderCashflowSvg(cashflow);
  renderDistributionSvg(scenarioBatch);

  const checklistHtml = (nextMeasurement?.checklist || [])
    .map(
      (item) => `
      <div class="measurement-item">
        <strong>Priority ${item.priority}: ${escapeHtml(item.title)}</strong>
        <div><em>Threshold:</em> ${escapeHtml(item.thresholdText)}</div>
        <div class="helper-note" style="margin-top:0.25rem;"><strong>Field Protocol:</strong> ${escapeHtml(item.fieldProtocol)}</div>
      </div>
    `
    )
    .join("");

  document.getElementById("nextMeasurementContainer").innerHTML = checklistHtml;
  document.getElementById("evidenceMetaText").textContent =
    `Snapshot locked to ${runData.runId} (${runData.executedAtUtc}) · Schema v${runData.sourceSnapshot.contextSchemaVersion}`;
}

async function executeSimulation() {
  const errBox = document.getElementById("validationErrorBox");
  errBox.classList.add("hidden");
  errBox.textContent = "";

  const reqSeq = ++state.simRequestSeq;
  state.isSimInFlight = true;
  resetHumanDecision();

  const requestSnapshotKey = captureCurrentSnapshotKey();
  const rawInputs = readFormInputsRaw();
  const seed = getEffectiveSeed();
  const areaCode = state.selectedAreaCode;

  let response;
  let data;
  try {
    response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        areaCode,
        seed,
        inputs: rawInputs
      })
    });
    data = await response.json();
  } catch (_err) {
    if (reqSeq !== state.simRequestSeq) {
      return;
    }
    state.isSimInFlight = false;
    errBox.textContent = "Simulation request failed due to a network or response error.";
    errBox.classList.remove("hidden");
    markStaleState(true);
    return;
  }

  if (reqSeq !== state.simRequestSeq) {
    return;
  }

  state.isSimInFlight = false;

  if (!response.ok || !data || !data.ok) {
    const msgs = (data?.errors || []).map((e) => e.message).join(" ");
    errBox.textContent = msgs || data?.error || "Simulation input validation failed.";
    errBox.classList.remove("hidden");
    markStaleState(true);
    return;
  }

  state.lastVerifiedRun = data;
  resetHumanDecision();
  renderSimulationRun(data);

  const stillMatchesRequest = captureCurrentSnapshotKey() === requestSnapshotKey;
  markStaleState(!stillMatchesRequest);
}

async function requestGeminiProposal() {
  const box = document.getElementById("geminiProposalContent");
  box.textContent = "Requesting bounded assumption proposal from server Gemini Interactions endpoint...";

  const proposalRequestSnapshotKey = captureCurrentSnapshotKey();
  const rawInputs = readFormInputsRaw();
  const areaCode = state.selectedAreaCode;

  let data;
  try {
    const response = await fetch("/api/gemini/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        areaCode,
        inputs: rawInputs
      })
    });
    data = await response.json();
  } catch (_err) {
    state.lastGeminiProposal = null;
    box.innerHTML = `
      <div><strong>Status: <code>provider_transport_error</code></strong></div>
      <div style="margin-top:0.25rem;">Failed to reach server Gemini proposal endpoint.</div>
    `;
    return;
  }

  state.lastGeminiProposal = data;

  if (!data || !data.ok) {
    box.innerHTML = `
      <div><strong>Status: <code>${escapeHtml(data?.status || "error")}</code></strong> (Model: <code>${escapeHtml(data?.model || "gemini-3.8-flash")}</code>)</div>
      <div style="margin-top:0.25rem;">${escapeHtml(data?.message || "Proposal unavailable.")}</div>
    `;
    return;
  }

  const p = data.proposedAssumptions;
  box.innerHTML = `
    <div><strong>Status: Verified Bounded AI Proposal</strong> (Model: <code>${escapeHtml(data.model)}</code>)</div>
    <div style="margin-top:0.3rem;">
      Proposed Ticket: <strong>${fmtKrw(p.avgTicket)}</strong> ·
      Tx/Day: <strong>${p.transactionsPerDay}</strong> ·
      Days/Mo: <strong>${p.tradingDaysPerMonth}</strong> ·
      Var Ratio: <strong>${p.variableCostRatio}</strong> ·
      Fixed: <strong>${fmtKrw(p.monthlyFixedCost)}</strong>
    </div>
    <div class="helper-note" style="margin-top:0.25rem;"><strong>Rationale:</strong> ${escapeHtml(data.rationaleNote)}</div>
    <div class="helper-note"><strong>Engine Verifier Check:</strong> Monthly Change ${fmtKrw(data.verifiedByEngine.monthlyOperatingCashChange)}, M36 Cash ${fmtKrw(data.verifiedByEngine.month36Cash)}, 1st Positive Tx ${data.verifiedByEngine.firstPositiveIntegerDailyTransactions} tx/day</div>
    <button type="button" id="applyGeminiProposalBtn" class="btn-chip" style="margin-top:0.45rem;">Copy Verified Proposal into Form &amp; Run</button>
  `;

  if (captureCurrentSnapshotKey() !== proposalRequestSnapshotKey) {
    invalidatePendingProposalApply();
    return;
  }

  const applyBtn = document.getElementById("applyGeminiProposalBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (captureCurrentSnapshotKey() !== proposalRequestSnapshotKey) {
        invalidatePendingProposalApply();
        return;
      }
      setFormInputs(p);
      executeSimulation();
    });
  }
}

function downloadEvidenceJson() {
  if (!state.lastVerifiedRun || state.isStaleSinceLastRun || state.isSimInFlight || !state.selectedDecision) {
    return;
  }

  const run = state.lastVerifiedRun;
  const evidenceBundle = {
    appTitle: "A Thousand Stores",
    evidenceSchemaVersion: "1.1.0",
    runId: run.runId,
    executedAtUtc: run.executedAtUtc,
    engineVersion: run.engineVersion,
    isGeminiRun: false,
    inputOrigin: run.inputOrigin,
    humanDecision: {
      selectedOption: state.selectedDecision,
      ownerNote: document.getElementById("ownerNoteInput").value.trim() || null,
      recordedAtUtc: new Date().toISOString(),
      authorityNote: "Human decision only; no automated or LLM financial verdict."
    },
    exactVerifiedInputsSnapshot: run.cashflow.inputs,
    seed: run.scenarioBatch.seed,
    sourceDataSnapshot: run.sourceSnapshot,
    observedContextSnapshot: run.observedContextEvaluation,
    deterministicVerifierResults: {
      roundingConvention: run.cashflow.roundingConvention,
      reserveGate: run.cashflow.reserveGate,
      monthlyMetrics: run.cashflow.monthlyMetrics,
      breakEvenBoundary: run.cashflow.breakEvenBoundary,
      cashBoundaries: run.cashflow.cashBoundaries,
      checkpoints: run.cashflow.checkpoints
    },
    scenarioBatchSummary: {
      kind: run.scenarioBatch.kind,
      isProbabilityEstimate: run.scenarioBatch.isProbabilityEstimate,
      scenarioCount: run.scenarioBatch.scenarioCount,
      distinctScenarioCount: run.scenarioBatch.distinctScenarioCount,
      counts: run.scenarioBatch.counts,
      percentiles: run.scenarioBatch.percentiles
    },
    nextMeasurement: run.nextMeasurement,
    geminiSessionState: {
      status: "not_linked_to_this_run",
      model: state.geminiStatus?.model || "gemini-3.8-flash",
      usage: null
    }
  };

  const blob = new Blob([JSON.stringify(evidenceBundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `a-thousand-stores-evidence-${run.runId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function initDashboard() {
  resetHumanDecision();

  const res = await fetch("/api/context");
  const payload = await res.json();
  state.contextData = payload.context;
  state.geminiStatus = payload.gemini;

  renderGeminiStatusBadge(state.geminiStatus);

  const select = document.getElementById("areaSelect");
  select.innerHTML = (state.contextData.areas || [])
    .map((area) => {
      const salesTag = area.observedSales ? "Observed Sales" : "Sales Missing (null)";
      return `<option value="${escapeHtml(area.areaCode)}">[${escapeHtml(area.areaTypeName)}] ${escapeHtml(area.displayName)} (${escapeHtml(area.areaCode)}) — ${salesTag}</option>`;
    })
    .join("");

  if (state.contextData.areas?.length) {
    state.selectedAreaCode = state.contextData.areas[0].areaCode;
    select.value = state.selectedAreaCode;
  }

  renderAreaContextCard();

  select.addEventListener("change", () => {
    state.selectedAreaCode = select.value;
    renderAreaContextCard();
    invalidatePendingProposalApply();
    markStaleState(true);
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-preset");
      if (PRESETS[key]) {
        invalidatePendingProposalApply();
        setFormInputs(PRESETS[key]);
        executeSimulation();
      }
    });
  });

  document.querySelectorAll("#simulationForm input").forEach((inp) => {
    inp.addEventListener("input", () => {
      invalidatePendingProposalApply();
      markStaleState(true);
    });
  });

  document.getElementById("simulationForm").addEventListener("submit", (e) => {
    e.preventDefault();
    executeSimulation();
  });

  document.getElementById("proposeGeminiBtn").addEventListener("click", () => {
    requestGeminiProposal();
  });

  document.querySelectorAll(".btn-decision").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state.lastVerifiedRun || state.isStaleSinceLastRun || state.isSimInFlight) {
        return;
      }
      document.querySelectorAll(".btn-decision").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedDecision = btn.getAttribute("data-decision");
      updateDecisionAndExportControls();
    });
  });

  document.getElementById("downloadEvidenceBtn").addEventListener("click", () => {
    downloadEvidenceJson();
  });

  await executeSimulation();
}

initDashboard();
