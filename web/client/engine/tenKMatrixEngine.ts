export type ScenarioId =
  | "layout"
  | "staff"
  | "both"
  | "rainy"
  | "influencer"
  | "stroller";

export type WaferViewMode = "proposed" | "baseline" | "delta" | "families";

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
  breakEvenMonth: number;
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
  triggerSweep: () => void;
  getCells: () => StoreRunCell[];
  dispose: () => void;
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

    const breakEvenMonth = proposedSurvived
      ? Math.max(5, Math.min(28, Math.round(8 + score * 14)))
      : 36;

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
      breakEvenMonth,
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

export function createTenKMatrixEngine(
  canvas: HTMLCanvasElement,
  callbacks: {
    onHoverCell: (cell: StoreRunCell, totalStats: TenKMatrixStats) => void;
    onSelectCell?: (cell: StoreRunCell) => void;
  }
): TenKMatrixController {
  const ctx = canvas.getContext("2d")!;
  let cells: StoreRunCell[] = new Array(10000);
  let viewMode: WaferViewMode = "proposed";
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
  }

  function getCellColor(cell: StoreRunCell, idx: number, nowMs: number): string {
    const cellNorm = idx / 10000;
    if (sweepProgress < 1 && Math.abs(cellNorm - sweepProgress) < 0.04) {
      return "#ffffff"; // Crisp white-hot leading wavefront across the 10,000 cells
    }
    if (sweepProgress < 1 && cellNorm > sweepProgress) {
      return cell.proposedSurvived ? "rgba(234, 88, 12, 0.35)" : "#232329";
    }

    // Time-based dynamic pulse synced with simulation clock
    const timeWave = Math.sin(simTimeSec * 0.09 + cell.row * 0.14 + cell.col * 0.09);

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
    ctx.fillStyle = "#a1a1aa";
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("100×100 WAFER MATRIX · 1 CELL = 1 STORE", padLeft, 16);

    ctx.textAlign = "right";
    ctx.fillStyle = sweepProgress < 1 ? "#fb923c" : "#f97316";
    ctx.fillText(
      sweepProgress < 1
        ? `SWEEPING: ${totalStats.executedCount.toLocaleString("en-US")} / 10,000 (${Math.round(sweepProgress * 100)}%)`
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
    ctx.fillText(`SURVIVED (${totalStats.propSurvived.toLocaleString("en-US")})`, padLeft + 12, legY);

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

    ctx.textAlign = "right";
    ctx.fillStyle = "#fb923c";
    ctx.fillText(
      `RESCUED BY LAYOUT: +${totalStats.rescuedCount.toLocaleString("en-US")} STORES`,
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
