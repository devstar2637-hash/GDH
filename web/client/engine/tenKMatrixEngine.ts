export type ScenarioId =
  | "layout"
  | "staff"
  | "both"
  | "rainy"
  | "influencer"
  | "stroller";

export type WaferViewMode = "proposed" | "baseline" | "delta" | "families";
export type WaferFilterMode = "all" | "rescued" | "failed" | "top100";

export interface StoreRunCell {
  runIndex: number; // 1..10000
  row: number; // 0..99
  col: number; // 0..99
  familyId: number; // 1..500
  variantId: number; // 1..20
  regimeId: ScenarioId;
  regimeCode: string;
  regimeLabel: string;
  arrivalRatePerMin: number;
  serviceCapacityPerMin: number;
  aisleClearanceM: number;
  baselineWaitSec: number;
  proposedWaitSec: number;
  baselineSurvived: boolean;
  proposedSurvived: boolean;
  rescuedByDesign: boolean;
  marginalRisk: boolean;
  monthlyNetKrwM: number; // in KRW millions (or USD eq)
  breakEvenMonth: number | null;
  month36BaselineUsdK: number;
  month36ProposedUsdK: number;
  month36DeltaUsdK: number;
  failureReason: string;
}

export interface TenKMatrixConfig {
  categoryKey: string;
  designKey: string;
  activeScenario: ScenarioId | "custom";
  baseWaitSec: number;
  propWaitSec: number;
  baseSurvivedTotal: number;
  propSurvivedTotal: number;
  scenarios: Array<{
    id: ScenarioId;
    code: string;
    label: string;
    runs: number;
    baseSurvived: number;
    propSurvived: number;
    baseWaitSec: number;
    propWaitSec: number;
  }>;
  onSelectRun?: (cell: StoreRunCell) => void;
}

export interface TenKMatrixStats {
  executedCount: number;
  baseSurvived: number;
  propSurvived: number;
  rescuedCount: number;
  marginalCount: number;
  failedCount: number;
  sweepProgress: number;
}

export interface TenKMatrixController {
  updateConfig: (cfg: TenKMatrixConfig, triggerSweep?: boolean) => void;
  setSimTime: (sec: number) => void;
  setViewMode: (mode: WaferViewMode) => void;
  setFilterMode: (filter: WaferFilterMode) => void;
  selectBenchmark: (kind: "optimal" | "rescued" | "worst") => StoreRunCell | null;
  selectRunByIndex: (runIndex: number) => StoreRunCell | null;
  triggerSweep: () => void;
  getCells: () => StoreRunCell[];
  dispose: () => void;
}

export interface Cell36MonthTrajectory {
  months: number;
  initialCapexUsdK: number;
  baselineCumUsdK: number[];
  proposedCumUsdK: number[];
  breakEvenMonth: number | null;
  month36BaselineUsdK: number;
  month36ProposedUsdK: number;
  month36DeltaUsdK: number;
}

function hashFloat(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function buildTenKCells(cfg: TenKMatrixConfig): {
  cells: StoreRunCell[];
  stats: TenKMatrixStats;
} {
  const cells: StoreRunCell[] = new Array(10000);
  const catSalt =
    cfg.categoryKey === "coffee"
      ? 101
      : cfg.categoryKey === "bakery"
        ? 202
        : cfg.categoryKey === "matcha"
          ? 303
          : 404;
  const designSalt =
    cfg.designKey === "express" ? 17 : cfg.designKey === "island" ? 31 : 53;

  const ranges: Array<{
    start: number;
    end: number;
    scn: TenKMatrixConfig["scenarios"][number];
  }> = [];
  let cursor = 0;
  for (const s of cfg.scenarios) {
    ranges.push({
      start: cursor,
      end: cursor + s.runs,
      scn: s,
    });
    cursor += s.runs;
  }

  let baseSurvCount = 0;
  let propSurvCount = 0;
  let rescuedCount = 0;
  let marginalCount = 0;

  for (let i = 0; i < 10000; i++) {
    const row = Math.floor(i / 100);
    const col = i % 100;
    const familyId = Math.floor(i / 20) + 1; // 1..500
    const variantId = (i % 20) + 1; // 1..20

    let matched = ranges[0];
    for (const r of ranges) {
      if (i >= r.start && i < r.end) {
        matched = r;
        break;
      }
    }

    const scn = matched.scn;
    const localIdx = i - matched.start;
    const localRatio = localIdx / Math.max(1, scn.runs);

    const r1 = hashFloat(i * 37 + catSalt * 13 + designSalt * 7);
    const r2 = hashFloat(i * 73 + catSalt * 29 + designSalt * 19);
    const r3 = hashFloat(familyId * 97 + variantId * 41 + catSalt);

    const baseTargetRate = scn.baseSurvived / Math.max(1, scn.runs);
    const propTargetRate = scn.propSurvived / Math.max(1, scn.runs);

    const score = localRatio * 0.72 + r1 * 0.28;
    const baselineSurvived = score < baseTargetRate;
    const proposedSurvived = score < propTargetRate;
    const rescuedByDesign = !baselineSurvived && proposedSurvived;

    const arrivalRatePerMin = +(
      3.1 +
      r2 * 2.9 +
      (scn.id === "rainy" ? 1.1 : 0)
    ).toFixed(2);
    const serviceCapacityPerMin = +(
      (proposedSurvived ? 4.2 : 2.6) +
      r3 * 1.4
    ).toFixed(2);
    const aisleClearanceM = +(
      (proposedSurvived ? 1.15 : 0.68) +
      (r2 - 0.5) * 0.32
    ).toFixed(2);

    const baselineWaitSec = Math.round(
      scn.baseWaitSec * (0.65 + score * 0.85 + r2 * 0.2)
    );
    const proposedWaitSec = Math.round(
      scn.propWaitSec * (0.58 + score * 0.75 + r1 * 0.22)
    );

    const marginalRisk = proposedSurvived && score >= propTargetRate * 0.84;

    const monthlyNetKrwM = proposedSurvived
      ? +(4.2 + (1 - score) * 9.6 + r3 * 2.1).toFixed(1)
      : +(-6.8 + (1 - score) * 5.2).toFixed(1);

    const cashflow = computeCell36MonthTrajectory({
      monthlyNetKrwM,
      baselineSurvived,
      baselineWaitSec,
      proposedWaitSec,
    });

    let failureReason = "Optimal Flow · Zero Bottleneck";
    if (!proposedSurvived) {
      if (scn.id === "stroller") {
        failureReason = "Aisle Width < 1.2m Stroller Gridlock";
      } else if (scn.id === "layout") {
        failureReason = "Solo Barista Queue Overflow (>150s)";
      } else if (scn.id === "influencer") {
        failureReason = "Viral Entry Surge Spillover";
      } else if (scn.id === "rainy") {
        failureReason = "Dwell Time +35% Seating Saturation";
      } else {
        failureReason = "POS & Pickup Cross-Traffic Choke";
      }
    } else if (rescuedByDesign) {
      failureReason = "Rescued by Proposed Layout & Buffer";
    } else if (marginalRisk) {
      failureReason = "High Peak Load · Buffer Near 85%";
    }

    if (baselineSurvived) baseSurvCount++;
    if (proposedSurvived) propSurvCount++;
    if (rescuedByDesign) rescuedCount++;
    if (marginalRisk) marginalCount++;

    cells[i] = {
      runIndex: i + 1,
      row,
      col,
      familyId,
      variantId,
      regimeId: scn.id,
      regimeCode: scn.code,
      regimeLabel: scn.label,
      arrivalRatePerMin,
      serviceCapacityPerMin,
      aisleClearanceM,
      baselineWaitSec,
      proposedWaitSec,
      baselineSurvived,
      proposedSurvived,
      rescuedByDesign,
      marginalRisk,
      monthlyNetKrwM,
      breakEvenMonth: cashflow.breakEvenMonth,
      month36BaselineUsdK: cashflow.month36BaselineUsdK,
      month36ProposedUsdK: cashflow.month36ProposedUsdK,
      month36DeltaUsdK: cashflow.month36DeltaUsdK,
      failureReason,
    };
  }

  return {
    cells,
    stats: {
      executedCount: 10000,
      baseSurvived: baseSurvCount,
      propSurvived: propSurvCount,
      rescuedCount,
      marginalCount,
      failedCount: 10000 - propSurvCount,
      sweepProgress: 1,
    },
  };
}

function optimalStoreScore(cell: StoreRunCell): number {
  return cell.monthlyNetKrwM * 3 - cell.proposedWaitSec * 0.8 + cell.aisleClearanceM * 15;
}

export function findTop100StoreCells(cells: readonly StoreRunCell[]): StoreRunCell[] {
  // Rank every run so the 10K matrix always has exactly 100 top-percentile cells.
  return [...cells].sort((a, b) =>
    Number(b.proposedSurvived) - Number(a.proposedSurvived) ||
    Number(a.marginalRisk) - Number(b.marginalRisk) ||
    optimalStoreScore(b) - optimalStoreScore(a) ||
    a.runIndex - b.runIndex
  ).slice(0, 100);
}

export function findBenchmarkStoreCells(cells: StoreRunCell[]): {
  optimal: StoreRunCell;
  rescued: StoreRunCell;
  worst: StoreRunCell;
} {
  let optimal = cells[0];
  let bestOptScore = -Infinity;

  let rescued = cells[0];
  let bestRescuedDelta = -Infinity;

  let worst = cells[0];
  let worstScore = -Infinity;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;

    if (c.proposedSurvived && !c.marginalRisk) {
      const optScore = optimalStoreScore(c);
      if (optScore > bestOptScore) {
        bestOptScore = optScore;
        optimal = c;
      }
    }

    if (c.rescuedByDesign) {
      const deltaScore =
        (c.baselineWaitSec - c.proposedWaitSec) * 1.5 + c.monthlyNetKrwM * 2;
      if (deltaScore > bestRescuedDelta) {
        bestRescuedDelta = deltaScore;
        rescued = c;
      }
    }

    if (!c.proposedSurvived) {
      const failSeverity = c.proposedWaitSec - c.aisleClearanceM * 25;
      if (failSeverity > worstScore) {
        worstScore = failSeverity;
        worst = c;
      }
    }
  }

  return { optimal, rescued, worst };
}

export function computeCell36MonthTrajectory(
  cell: Pick<StoreRunCell,
    "monthlyNetKrwM" | "baselineSurvived" | "baselineWaitSec" | "proposedWaitSec"
  >
): Cell36MonthTrajectory {
  const months = 36;
  const initialCapexUsdK = 66; // Deposit + Fit-out baseline in $k
  const propMonthlyNetUsdK = Number((cell.monthlyNetKrwM * 0.75).toFixed(2));
  const waitPenaltyUsdK = Math.max(
    1.8,
    Number(((cell.baselineWaitSec - cell.proposedWaitSec) * 0.11).toFixed(2))
  );
  const baseMonthlyNetUsdK = cell.baselineSurvived
    ? Number((propMonthlyNetUsdK - waitPenaltyUsdK * 0.55).toFixed(2))
    : Number(Math.min(-1.4, propMonthlyNetUsdK - waitPenaltyUsdK).toFixed(2));

  const baselineCumUsdK: number[] = [];
  const proposedCumUsdK: number[] = [];
  let bCum = -initialCapexUsdK;
  let pCum = -initialCapexUsdK;
  let breakEvenMonth: number | null = null;

  for (let m = 1; m <= months; m++) {
    const ramp = m === 1 ? 0.65 : m === 2 ? 0.85 : 1.0;
    const seasonal = 1 + Math.sin((m / 12) * Math.PI * 2) * 0.08;
    bCum = Number((bCum + baseMonthlyNetUsdK * ramp * seasonal).toFixed(1));
    pCum = Number((pCum + propMonthlyNetUsdK * ramp * seasonal).toFixed(1));
    baselineCumUsdK.push(bCum);
    proposedCumUsdK.push(pCum);
    if (breakEvenMonth === null && pCum >= 0) {
      breakEvenMonth = m;
    }
  }

  const month36BaselineUsdK = baselineCumUsdK[months - 1] ?? 0;
  const month36ProposedUsdK = proposedCumUsdK[months - 1] ?? 0;

  return {
    months,
    initialCapexUsdK,
    baselineCumUsdK,
    proposedCumUsdK,
    breakEvenMonth,
    month36BaselineUsdK,
    month36ProposedUsdK,
    month36DeltaUsdK: Number(
      (month36ProposedUsdK - month36BaselineUsdK).toFixed(1)
    ),
  };
}

export function exportTenKCellsCsv(cells: StoreRunCell[]): string {
  const header = [
    "run_index",
    "ai_family_id",
    "variant_id",
    "wafer_row",
    "wafer_col",
    "regime_code",
    "regime_label",
    "arrival_pax_per_min",
    "service_cap_per_min",
    "aisle_clearance_m",
    "baseline_wait_sec",
    "proposed_wait_sec",
    "wait_delta_sec",
    "baseline_survived",
    "proposed_survived",
    "rescued_by_design",
    "monthly_net_usd_k",
    "break_even_month",
    "diagnosis",
    "month36_baseline_usd_k",
    "month36_proposed_usd_k",
    "month36_delta_usd_k",
    "source_tag",
  ].join(",");

  const rows: string[] = [header];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c) continue;
    const cashflow = computeCell36MonthTrajectory(c);
    const usdNet = (c.monthlyNetKrwM * 0.75).toFixed(2);
    const waitDelta = c.proposedWaitSec - c.baselineWaitSec;
    rows.push(
      [
        c.runIndex,
        c.familyId,
        c.variantId,
        c.row + 1,
        c.col + 1,
        c.regimeCode,
        `"${c.regimeLabel.replace(/"/g, '""')}"`,
        c.arrivalRatePerMin,
        c.serviceCapacityPerMin,
        c.aisleClearanceM,
        c.baselineWaitSec,
        c.proposedWaitSec,
        waitDelta,
        c.baselineSurvived ? 1 : 0,
        c.proposedSurvived ? 1 : 0,
        c.rescuedByDesign ? 1 : 0,
        usdNet,
        cashflow.breakEvenMonth,
        `"${c.failureReason.replace(/"/g, '""')}"`,
        cashflow.month36BaselineUsdK,
        cashflow.month36ProposedUsdK,
        cashflow.month36DeltaUsdK,
        "assumed",
      ].join(",")
    );
  }
  return rows.join("\n");
}

export function renderCellCashflowSparkline(
  canvas: HTMLCanvasElement | null,
  cell: StoreRunCell
): Cell36MonthTrajectory {
  const traj = computeCell36MonthTrajectory(cell);
  if (!canvas) return traj;
  const ctx = canvas.getContext("2d");
  if (!ctx) return traj;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(220, Math.round(rect.width || 260));
  const h = Math.max(64, Math.round(rect.height || 72));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, w, h);

  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 14;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allVals = [
    -traj.initialCapexUsdK,
    0,
    ...traj.baselineCumUsdK,
    ...traj.proposedCumUsdK,
  ];
  const minVal = Math.min(...allVals, -70);
  const maxVal = Math.max(...allVals, 40);
  const span = Math.max(1, maxVal - minVal);

  const toX = (mIdx: number) => padL + (mIdx / (traj.months - 1)) * plotW;
  const toY = (v: number) => padT + (1 - (v - minVal) / span) * plotH;

  // Zero break-even horizontal dashed line
  const zeroY = toY(0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, zeroY);
  ctx.lineTo(w - padR, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Baseline 36-month curve (muted slate/red)
  ctx.strokeStyle = "#71717a";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < traj.baselineCumUsdK.length; i++) {
    const x = toX(i);
    const y = toY(traj.baselineCumUsdK[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Proposed 36-month curve (Signal Orange)
  ctx.strokeStyle = cell.proposedSurvived ? "#ea580c" : "#ef4444";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < traj.proposedCumUsdK.length; i++) {
    const x = toX(i);
    const y = toY(traj.proposedCumUsdK[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Break-even dot marker
  if (traj.breakEvenMonth !== null && traj.breakEvenMonth >= 1 && traj.breakEvenMonth <= 36) {
    const bx = toX(traj.breakEvenMonth - 1);
    const by = toY(traj.proposedCumUsdK[traj.breakEvenMonth - 1]);
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Header & Footer labels inside sparkline
  ctx.font = '700 9px "JetBrains Mono", monospace';
  ctx.textAlign = "left";
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText("36M CUMULATIVE ROI", padL, 11);

  ctx.textAlign = "right";
  ctx.fillStyle = cell.proposedSurvived ? "#fb923c" : "#fca5a5";
  const m36Sign = traj.month36ProposedUsdK >= 0 ? "+" : "";
  ctx.fillText(
    traj.breakEvenMonth
      ? `BEP Mo ${traj.breakEvenMonth} · 36M ${m36Sign}$${Math.round(traj.month36ProposedUsdK)}k`
      : `UNRECOVERED · 36M ${m36Sign}$${Math.round(traj.month36ProposedUsdK)}k`,
    w - padR,
    11
  );

  ctx.fillStyle = "#71717a";
  ctx.textAlign = "left";
  ctx.fillText("M01 (-$66k)", padL, h - 3);
  ctx.textAlign = "right";
  ctx.fillText("M36", w - padR, h - 3);

  ctx.restore();
  return traj;
}

export function createTenKMatrixEngine(
  canvas: HTMLCanvasElement,
  callbacks: {
    onHoverCell: (cell: StoreRunCell, totalStats: TenKMatrixStats) => void;
    onSelectCell?: (cell: StoreRunCell) => void;
  }
): TenKMatrixController {
  const ctx = canvas.getContext("2d")!;
  let cells: StoreRunCell[] = new Array(10000);
  let top100RunIndices = new Set<number>();
  let viewMode: WaferViewMode = "proposed";
  let filterMode: WaferFilterMode = "all";
  let simTimeSec = 0;
  let sweepProgress = 0; // 0..1 (1 = all 10,000 cells swept)
  let sweepStartTime = performance.now();
  const SWEEP_DURATION_MS = 1150;

  let hoveredIndex = 1420;
  let selectedIndex = 1420;
  let pointerInside = false;
  let currentCfg: TenKMatrixConfig | null = null;
  let rafId = 0;
  let disposed = false;

  let totalStats: TenKMatrixStats = {
    executedCount: 10000,
    baseSurvived: 3140,
    propSurvived: 8420,
    rescuedCount: 5280,
    marginalCount: 740,
    failedCount: 1580,
    sweepProgress: 1,
  };

  function rebuildCells(cfg: TenKMatrixConfig): void {
    currentCfg = cfg;
    const built = buildTenKCells(cfg);
    cells = built.cells;
    totalStats = built.stats;
    top100RunIndices = new Set(findTop100StoreCells(cells).map((cell) => cell.runIndex));
  }

  function matchesFilter(cell: StoreRunCell): boolean {
    if (filterMode === "all") return true;
    if (filterMode === "rescued") return cell.rescuedByDesign;
    if (filterMode === "failed") return !cell.proposedSurvived;
    if (filterMode === "top100") {
      return top100RunIndices.has(cell.runIndex);
    }
    return true;
  }

  function getCellColor(cell: StoreRunCell, idx: number, nowMs: number): string {
    if (!matchesFilter(cell)) {
      return "#1e1e23";
    }

    const cellNorm = idx / 10000;
    if (sweepProgress < 1 && Math.abs(cellNorm - sweepProgress) < 0.04) {
      return "#ffffff"; // Crisp white-hot leading wavefront across the 10,000 cells
    }
    if (sweepProgress < 1 && cellNorm > sweepProgress) {
      return cell.proposedSurvived ? "rgba(234, 88, 12, 0.35)" : "#232329";
    }

    // Time-based dynamic pulse synced with simulation clock
    const timeWave = Math.sin(simTimeSec * 0.09 + cell.row * 0.14 + cell.col * 0.09);

    if (filterMode === "top100") {
      return timeWave > 0.2 ? "#fbbf24" : "#f97316";
    }

    if (viewMode === "baseline") {
      if (cell.baselineSurvived) {
        return timeWave > 0.65 ? "#f97316" : "#ea580c";
      }
      return "#27272a";
    }

    if (viewMode === "delta") {
      if (cell.rescuedByDesign) {
        return timeWave > 0.3 ? "#ea580c" : "#f97316"; // Bright Signal Orange for rescued stores!
      }
      if (cell.proposedSurvived && cell.baselineSurvived) {
        return "#fdba74"; // Already survived in both
      }
      return "#27272a"; // Failed in both
    }

    if (viewMode === "families") {
      // Highlight 500 AI Design Families x 20 Variations bands
      const famBand = cell.familyId % 4;
      if (!cell.proposedSurvived) return "#27272a";
      if (famBand === 0) return "#c2410c";
      if (famBand === 1) return "#ea580c";
      if (famBand === 2) return "#f97316";
      return "#fb923c";
    }

    // Default: "proposed"
    if (cell.proposedSurvived) {
      if (cell.marginalRisk) {
        return timeWave > 0.4 ? "#f59e0b" : "#fb923c";
      }
      return timeWave > 0.7 ? "#f97316" : "#ea580c";
    }
    // Failed cell
    const failPulse = Math.sin(nowMs * 0.004 + idx * 0.13);
    return failPulse > 0.88 ? "#7f1d1d" : "#27272a";
  }

  function renderFrame(nowMs: number): void {
    if (disposed) return;

    if (sweepProgress < 1) {
      const elapsed = nowMs - sweepStartTime;
      sweepProgress = Math.min(1, elapsed / SWEEP_DURATION_MS);
      totalStats.executedCount = Math.floor(sweepProgress * 10000);
      totalStats.sweepProgress = sweepProgress;
    } else {
      totalStats.executedCount = 10000;
      totalStats.sweepProgress = 1;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(320, Math.round(rect.width || 680));
    const cssH = Math.max(260, Math.round(rect.height || 340));

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Architectural warm stone background
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, cssW, cssH);

    const padLeft = 48;
    const padRight = 14;
    const padTop = 28;
    const padBottom = 26;

    const gridW = cssW - padLeft - padRight;
    const gridH = cssH - padTop - padBottom;
    const cellW = gridW / 100;
    const cellH = gridH / 100;

    // Top axis header labels (Variants 01..100)
    const isNarrow = cssW < 520;
    ctx.fillStyle = "#a1a1aa";
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText(
      isNarrow ? "100×100 WAFER" : "100×100 WAFER MATRIX · 1 CELL = 1 STORE",
      padLeft,
      16
    );

    ctx.textAlign = "right";
    ctx.fillStyle = sweepProgress < 1 ? "#fb923c" : "#f97316";
    ctx.fillText(
      sweepProgress < 1
        ? `SWEEP ${Math.round(sweepProgress * 100)}%`
        : isNarrow
          ? `t=${Math.round(simTimeSec)}s · 10K ACTIVE`
          : `LIVE SYNC @ t=${Math.round(simTimeSec)}s · 10,000 ACTIVE`,
      cssW - padRight,
      16
    );

    // Draw all 10,000 cells (100 rows x 100 cols)
    const gapX = cellW > 3.2 ? 0.65 : 0.35;
    const gapY = cellH > 2.4 ? 0.55 : 0.25;
    const drawW = Math.max(1, cellW - gapX);
    const drawH = Math.max(1, cellH - gapY);

    const activeScenarioId = currentCfg?.activeScenario;

    for (let i = 0; i < 10000; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const x = padLeft + cell.col * cellW;
      const y = padTop + cell.row * cellH;

      ctx.fillStyle = getCellColor(cell, i, nowMs);
      ctx.fillRect(x, y, drawW, drawH);
    }

    // Draw regime horizontal boundary lines and left-rail regime labels
    const regimeRowStarts = [
      { row: 0, code: "SCN-01", runs: "3.2k", id: "both" },
      { row: 32, code: "SCN-02", runs: "2.4k", id: "rainy" },
      { row: 56, code: "SCN-03", runs: "1.4k", id: "layout" },
      { row: 70, code: "SCN-04", runs: "1.2k", id: "influencer" },
      { row: 82, code: "SCN-05", runs: "1.0k", id: "staff" },
      { row: 92, code: "SCN-06", runs: "0.8k", id: "stroller" },
    ];

    ctx.textAlign = "right";
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    for (let r = 0; r < regimeRowStarts.length; r++) {
      const item = regimeRowStarts[r];
      const nextRow = r + 1 < regimeRowStarts.length ? regimeRowStarts[r + 1].row : 100;
      const yTop = padTop + item.row * cellH;
      const yMid = padTop + ((item.row + nextRow) * 0.5) * cellH + 3;

      if (item.row > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, yTop);
        ctx.lineTo(padLeft + gridW, yTop);
        ctx.stroke();
      }

      const isCurrentScn = activeScenarioId === item.id;
      ctx.fillStyle = isCurrentScn ? "#fb923c" : "#a1a1aa";
      ctx.fillText(item.code, padLeft - 6, yMid);

      if (isCurrentScn) {
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          padLeft - 1,
          yTop,
          gridW + 2,
          (nextRow - item.row) * cellH
        );
      }
    }

    // Highlight selected / hovered cell crosshair
    const targetIdx = pointerInside ? hoveredIndex : selectedIndex;
    const targetCell = cells[targetIdx];
    if (targetCell) {
      const cx = padLeft + targetCell.col * cellW;
      const cy = padTop + targetCell.row * cellH;

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cx - 1.5, cy - 1.5, cellW + 3, cellH + 3);

      // If pointer is inside, draw a crisp 5x5 Magnifier Loupe in the corner away from cursor
      if (pointerInside) {
        const loupeSize = 74;
        const lx = targetCell.col > 50 ? padLeft + 10 : cssW - padRight - loupeSize - 10;
        const ly = targetCell.row > 50 ? padTop + 10 : cssH - padBottom - loupeSize - 10;

        ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
        ctx.fillRect(lx, ly, loupeSize, loupeSize);
        ctx.strokeStyle = "#ea580c";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(lx, ly, loupeSize, loupeSize);

        const subCell = (loupeSize - 12) / 5;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = Math.max(0, Math.min(99, targetCell.row + dr));
            const nc = Math.max(0, Math.min(99, targetCell.col + dc));
            const nIdx = nr * 100 + nc;
            const nCell = cells[nIdx];
            if (!nCell) continue;
            const sx = lx + 6 + (dc + 2) * subCell;
            const sy = ly + 6 + (dr + 2) * subCell;
            ctx.fillStyle = getCellColor(nCell, nIdx, nowMs);
            ctx.fillRect(sx, sy, subCell - 1.5, subCell - 1.5);
            if (dr === 0 && dc === 0) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(sx - 0.5, sy - 0.5, subCell - 0.5, subCell - 0.5);
            }
          }
        }
      }
    }

    // Bottom legend bar inside canvas
    const legY = cssH - 8;
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillStyle = "#ea580c";
    ctx.fillRect(padLeft, legY - 7, 8, 8);
    ctx.fillStyle = "#d4d4d8";
    ctx.fillText(
      isNarrow
        ? `OK ${totalStats.propSurvived.toLocaleString("en-US")}`
        : `SURVIVED (${totalStats.propSurvived.toLocaleString("en-US")})`,
      padLeft + 12,
      legY
    );

    if (!isNarrow) {
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(padLeft + 118, legY - 7, 8, 8);
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText(`MARGINAL (${totalStats.marginalCount.toLocaleString("en-US")})`, padLeft + 130, legY);

      ctx.fillStyle = "#27272a";
      ctx.fillRect(padLeft + 232, legY - 7, 8, 8);
      ctx.strokeStyle = "#71717a";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(padLeft + 232, legY - 7, 8, 8);
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText(`COLLAPSED (${totalStats.failedCount.toLocaleString("en-US")})`, padLeft + 244, legY);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#fb923c";
    ctx.fillText(
      isNarrow
        ? `RESCUED +${totalStats.rescuedCount.toLocaleString("en-US")}`
        : `RESCUED BY LAYOUT: +${totalStats.rescuedCount.toLocaleString("en-US")} STORES`,
      cssW - padRight,
      legY
    );

    ctx.restore();

    if (cells[targetIdx]) {
      callbacks.onHoverCell(cells[targetIdx], totalStats);
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  function pointerToCellIndex(ev: MouseEvent): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const padLeft = 48;
    const padRight = 14;
    const padTop = 28;
    const padBottom = 26;
    const gridW = rect.width - padLeft - padRight;
    const gridH = rect.height - padTop - padBottom;
    if (x < padLeft || x > padLeft + gridW || y < padTop || y > padTop + gridH) {
      return null;
    }
    const col = Math.max(0, Math.min(99, Math.floor(((x - padLeft) / gridW) * 100)));
    const row = Math.max(0, Math.min(99, Math.floor(((y - padTop) / gridH) * 100)));
    return row * 100 + col;
  }

  const onMouseMove = (ev: MouseEvent) => {
    const idx = pointerToCellIndex(ev);
    if (idx !== null && cells[idx]) {
      pointerInside = true;
      hoveredIndex = idx;
      callbacks.onHoverCell(cells[idx], totalStats);
    } else {
      pointerInside = false;
    }
  };

  const onMouseLeave = () => {
    pointerInside = false;
  };

  const onClick = (ev: MouseEvent) => {
    const idx = pointerToCellIndex(ev);
    if (idx !== null && cells[idx]) {
      selectedIndex = idx;
      hoveredIndex = idx;
      callbacks.onHoverCell(cells[idx], totalStats);
      if (callbacks.onSelectCell) {
        callbacks.onSelectCell(cells[idx]);
      }
    }
  };

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("click", onClick);

  rafId = requestAnimationFrame(renderFrame);

  return {
    updateConfig(cfg: TenKMatrixConfig, shouldSweep = true) {
      rebuildCells(cfg);
      if (shouldSweep) {
        sweepProgress = 0;
        sweepStartTime = performance.now();
      }
      const inspectCell = cells[selectedIndex] || cells[0];
      if (inspectCell) {
        callbacks.onHoverCell(inspectCell, totalStats);
      }
    },
    setSimTime(sec: number) {
      simTimeSec = sec;
    },
    setViewMode(mode: WaferViewMode) {
      viewMode = mode;
      sweepProgress = 0;
      sweepStartTime = performance.now();
    },
    setFilterMode(filter: WaferFilterMode) {
      filterMode = filter;
    },
    selectBenchmark(kind: "optimal" | "rescued" | "worst") {
      if (!cells.length || !cells[0]) return null;
      const benches = findBenchmarkStoreCells(cells);
      const target = benches[kind];
      if (!target) return null;
      selectedIndex = target.runIndex - 1;
      hoveredIndex = selectedIndex;
      callbacks.onHoverCell(target, totalStats);
      if (callbacks.onSelectCell) {
        callbacks.onSelectCell(target);
      }
      return target;
    },
    selectRunByIndex(runIndex: number) {
      if (!cells.length) return null;
      const clamped = Math.max(1, Math.min(10000, Math.round(runIndex)));
      const target = cells[clamped - 1];
      if (!target) return null;
      selectedIndex = clamped - 1;
      hoveredIndex = selectedIndex;
      callbacks.onHoverCell(target, totalStats);
      if (callbacks.onSelectCell) {
        callbacks.onSelectCell(target);
      }
      return target;
    },
    triggerSweep() {
      sweepProgress = 0;
      sweepStartTime = performance.now();
    },
    getCells() {
      return cells;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("click", onClick);
    },
  };
}
