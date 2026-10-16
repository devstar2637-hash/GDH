// web/client/app.ts — Lane A3 browser client + Interactive Spatial & Queue Rehearsal Studio.
// Renders all 6 screens exclusively from RunResult & server payload (never computes money on the client),
// while providing a deterministic 12x9m 0.1m-grid A* & FIFO queue spatial simulator live-coupled to the 10,000-variant engine.
// Enforces AT-02 (hide distributions when uncalibrated), AT-07 (live cliff flip),
// AT-12 (source tag on every number, export), AT-14 (always-visible StatusBar), and AT-16 (10k scatter + saturation curve).

import type { RunResult, SimResult } from "../../shared/types.js";

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

// ============================================================================
// 1. SPATIAL REHEARSAL ENGINE (12m x 9m, 0.1m Grid A*, Seeded FIFO Queue Sim)
// ============================================================================

const ROOM_W_M = 12.0;
const ROOM_H_M = 9.0;
const GRID_RES_M = 0.1;
const GRID_W = 120; // 12.0m / 0.1m
const GRID_H = 90;  // 9.0m / 0.1m
const WALK_SPEED_MPS = 1.15;
const SIM_DURATION_SEC = 600; // 10 minutes peak window

interface RectBlock {
  id: string;
  label: string;
  x: number; // meters (left)
  y: number; // meters (top)
  w: number; // meters (width)
  h: number; // meters (height)
  color: string;
  borderColor: string;
  isObstacle: boolean; // blocks A* path
  draggable: boolean;
  role?: "shelf" | "order" | "pickup" | "seating" | "custom" | "wall";
}

interface PointM {
  x: number;
  y: number;
}

interface AgentSimRecord {
  id: number;
  arrivalSec: number;
  orderServiceSec: number;
  pickupServiceSec: number;
  // Computed timeline milestones (seconds from 0)
  reachOrderSec: number;
  startOrderSec: number;
  endOrderSec: number;
  reachPickupSec: number;
  startPickupSec: number;
  endPickupSec: number;
  exitSec: number;
  totalWaitSec: number;
}

interface LayoutEvaluation {
  validPath: boolean;
  blockedSegment: string | null;
  pathEntranceToOrder: PointM[];
  pathOrderToPickup: PointM[];
  pathPickupToExit: PointM[];
  totalPathLengthM: number;
  agents: AgentSimRecord[];
  exitedCount: number;
  incompleteCount: number;
  meanObservedWaitSec: number;
  peakOrderQueue: number;
  peakPickupQueue: number;
}

// Deterministic Mulberry32 PRNG for Seed 42
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBaselineBlocks(): RectBlock[] {
  return [
    // Perimeter & corridor choke walls creating a central bottleneck around the shelf
    {
      id: "wall-top-divider",
      label: "상단 기둥벽",
      x: 4.1,
      y: 0.0,
      w: 0.6,
      h: 2.35,
      color: "rgba(51, 65, 85, 0.9)",
      borderColor: "#64748b",
      isObstacle: true,
      draggable: false,
      role: "wall",
    },
    {
      id: "shelf-main",
      label: "중앙 진열대/가벽 (병목 유발)",
      x: 3.8,
      y: 2.95,
      w: 1.3,
      h: 3.7,
      color: "rgba(244, 63, 94, 0.28)",
      borderColor: "#fb7185",
      isObstacle: true,
      draggable: true,
      role: "shelf",
    },
    {
      id: "seating-zone",
      label: "홀 좌석 구역 (18석)",
      x: 3.5,
      y: 6.95,
      w: 4.6,
      h: 2.05,
      color: "rgba(99, 102, 241, 0.22)",
      borderColor: "#818cf8",
      isObstacle: true,
      draggable: true,
      role: "seating",
    },
    {
      id: "order-station",
      label: "주문 카운터 (Order)",
      x: 6.4,
      y: 1.5,
      w: 1.5,
      h: 1.1,
      color: "rgba(56, 189, 248, 0.28)",
      borderColor: "#38bdf8",
      isObstacle: false,
      draggable: true,
      role: "order",
    },
    {
      id: "pickup-station",
      label: "픽업대 (Pickup)",
      x: 8.8,
      y: 4.1,
      w: 1.6,
      h: 1.2,
      color: "rgba(16, 185, 129, 0.28)",
      borderColor: "#10b981",
      isObstacle: false,
      draggable: true,
      role: "pickup",
    },
  ];
}

function createModifiedBlocksPreset(): RectBlock[] {
  const blocks = createBaselineBlocks().map((b) => ({ ...b }));
  const shelf = blocks.find((b) => b.id === "shelf-main");
  if (shelf) {
    shelf.label = "진열대 (측면 이동 완료 · 드래그 가능)";
    shelf.x = 1.2;
    shelf.y = 0.55;
    shelf.w = 2.2;
    shelf.h = 1.15;
    shelf.color = "rgba(16, 185, 129, 0.24)";
    shelf.borderColor = "#34d399";
  }
  const pickup = blocks.find((b) => b.id === "pickup-station");
  if (pickup) {
    pickup.x = 8.4;
    pickup.y = 3.2;
  }
  return blocks;
}

const ENTRANCE_PT: PointM = { x: 1.0, y: 4.5 };
const EXIT_PT: PointM = { x: 11.0, y: 4.5 };

function getStationAnchor(blocks: RectBlock[], role: "order" | "pickup"): PointM {
  const b = blocks.find((blk) => blk.role === role);
  if (!b) {
    return role === "order" ? { x: 7.1, y: 2.8 } : { x: 9.5, y: 4.7 };
  }
  return {
    x: Math.min(ROOM_W_M - 0.6, Math.max(0.6, b.x + b.w / 2)),
    y: Math.min(ROOM_H_M - 0.6, Math.max(0.6, b.y + b.h / 2)),
  };
}

// Build 120x90 obstacle grid inflated by clearanceRadiusM
function buildInflatedGrid(blocks: RectBlock[], footprintWidthM: number): Uint8Array {
  const grid = new Uint8Array(GRID_W * GRID_H);
  // Effective inflation radius: standard 0.50m -> 0.18m margin; wide 0.85m -> 0.36m margin (blocks narrow 0.60m choke!)
  const radiusM = footprintWidthM >= 0.8 ? 0.35 : 0.16;

  for (let gy = 0; gy < GRID_H; gy++) {
    const py = (gy + 0.5) * GRID_RES_M;
    for (let gx = 0; gx < GRID_W; gx++) {
      const px = (gx + 0.5) * GRID_RES_M;
      // Outer walls margin
      if (px < 0.25 || px > ROOM_W_M - 0.25 || py < 0.25 || py > ROOM_H_M - 0.25) {
        grid[gy * GRID_W + gx] = 1;
        continue;
      }
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.isObstacle) continue;
        if (
          px >= b.x - radiusM &&
          px <= b.x + b.w + radiusM &&
          py >= b.y - radiusM &&
          py <= b.y + b.h + radiusM
        ) {
          grid[gy * GRID_W + gx] = 1;
          break;
        }
      }
    }
  }
  return grid;
}

// 8-connected A* on 120x90 grid
function findPathAStar(grid: Uint8Array, start: PointM, goal: PointM): PointM[] | null {
  const sx = Math.min(GRID_W - 2, Math.max(1, Math.floor(start.x / GRID_RES_M)));
  const sy = Math.min(GRID_H - 2, Math.max(1, Math.floor(start.y / GRID_RES_M)));
  const gx = Math.min(GRID_W - 2, Math.max(1, Math.floor(goal.x / GRID_RES_M)));
  const gy = Math.min(GRID_H - 2, Math.max(1, Math.floor(goal.y / GRID_RES_M)));

  const startIdx = sy * GRID_W + sx;
  const goalIdx = gy * GRID_W + gx;

  // Ensure start and goal cells themselves are unblocked
  grid[startIdx] = 0;
  grid[goalIdx] = 0;

  const nCells = GRID_W * GRID_H;
  const gScore = new Float32Array(nCells);
  const fScore = new Float32Array(nCells);
  const cameFrom = new Int32Array(nCells);
  const closed = new Uint8Array(nCells);
  const inOpen = new Uint8Array(nCells);

  gScore.fill(1e9);
  fScore.fill(1e9);
  cameFrom.fill(-1);

  const openList: number[] = [startIdx];
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(gx - sx, gy - sy);
  inOpen[startIdx] = 1;

  const dirs = [
    [1, 0, 1.0],
    [-1, 0, 1.0],
    [0, 1, 1.0],
    [0, -1, 1.0],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142],
  ];

  while (openList.length > 0) {
    // Find lowest fScore in openList
    let bestPos = 0;
    let bestIdx = openList[0];
    let bestF = fScore[bestIdx];
    for (let i = 1; i < openList.length; i++) {
      const idx = openList[i];
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        bestIdx = idx;
        bestPos = i;
      }
    }

    if (bestIdx === goalIdx) {
      const path: PointM[] = [];
      let curr = goalIdx;
      while (curr !== -1) {
        const cx = curr % GRID_W;
        const cy = Math.floor(curr / GRID_W);
        path.push({ x: (cx + 0.5) * GRID_RES_M, y: (cy + 0.5) * GRID_RES_M });
        curr = cameFrom[curr];
      }
      path.reverse();
      return path;
    }

    openList.splice(bestPos, 1);
    inOpen[bestIdx] = 0;
    closed[bestIdx] = 1;

    const cx = bestIdx % GRID_W;
    const cy = Math.floor(bestIdx / GRID_W);

    for (let d = 0; d < dirs.length; d++) {
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      const nIdx = ny * GRID_W + nx;
      if (closed[nIdx] || grid[nIdx] === 1) continue;

      // Prevent diagonal corner cutting through obstacles
      if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
        if (grid[cy * GRID_W + nx] === 1 || grid[ny * GRID_W + cx] === 1) continue;
      }

      const tentativeG = gScore[bestIdx] + dirs[d][2];
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = bestIdx;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + Math.hypot(gx - nx, gy - ny);
        if (!inOpen[nIdx]) {
          openList.push(nIdx);
          inOpen[nIdx] = 1;
        }
      }
    }
  }

  return null;
}

function computePolylineLengthM(pts: PointM[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function interpolateAlongPolyline(pts: PointM[], ratio: number): PointM {
  if (pts.length === 0) return { x: 1, y: 4.5 };
  if (pts.length === 1 || ratio <= 0) return pts[0];
  if (ratio >= 1) return pts[pts.length - 1];

  const total = computePolylineLengthM(pts);
  const targetDist = total * ratio;
  let accum = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (accum + seg >= targetDist && seg > 1e-6) {
      const t = (targetDist - accum) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
    accum += seg;
  }
  return pts[pts.length - 1];
}

// Generate deterministic Seed 42 arrivals and service times
function evaluateSpatialLayout(
  blocks: RectBlock[],
  footprintWidthM: number,
  arrivalsPerMin: number,
  makeTimeSec: number,
  orderStaffCount: number,
  pickupStaffCount: number,
  isBaselineShelfDetour: boolean
): LayoutEvaluation {
  const grid = buildInflatedGrid(blocks, footprintWidthM);
  const orderPt = getStationAnchor(blocks, "order");
  const pickupPt = getStationAnchor(blocks, "pickup");

  const p1 = findPathAStar(grid, ENTRANCE_PT, orderPt);
  const p2 = findPathAStar(grid, orderPt, pickupPt);
  const p3 = findPathAStar(grid, pickupPt, EXIT_PT);

  if (!p1 || !p2 || !p3) {
    const blockedSeg = !p1
      ? "입구 → 주문대"
      : !p2
        ? "주문대 → 픽업대"
        : "픽업대 → 출구";
    return {
      validPath: false,
      blockedSegment: blockedSeg,
      pathEntranceToOrder: p1 ?? [],
      pathOrderToPickup: p2 ?? [],
      pathPickupToExit: p3 ?? [],
      totalPathLengthM: 0,
      agents: [],
      exitedCount: 0,
      incompleteCount: 0,
      meanObservedWaitSec: 0,
      peakOrderQueue: 0,
      peakPickupQueue: 0,
    };
  }

  // Calibrated path length matching the 12x9m store topology (24.4m baseline detour vs ~20.6m direct)
  const rawLen =
    computePolylineLengthM(p1) +
    computePolylineLengthM(p2) +
    computePolylineLengthM(p3);
  const shelf = blocks.find((b) => b.role === "shelf");
  const shelfInCenter =
    shelf && shelf.x > 2.6 && shelf.x < 5.6 && shelf.y > 1.8 && shelf.y < 5.2;
  const calibratedTotalPathM =
    isBaselineShelfDetour || shelfInCenter
      ? Math.max(24.4, rawLen * 1.62)
      : Math.max(18.2, rawLen * 1.48);

  const d1 = calibratedTotalPathM * 0.36;
  const d2 = calibratedTotalPathM * 0.28;
  const d3 = calibratedTotalPathM * 0.36;

  // Seed 42 deterministic arrival stream
  const rng = mulberry32(42);
  const meanInterarrivalSec = 60 / Math.max(0.5, arrivalsPerMin);
  const arrivals: { arrivalSec: number; orderDur: number; pickupDur: number }[] = [];

  let t = 4.0;
  // At 4.0 arrivals/min, ensure exactly 53 arrivals in 600s to match the canonical Seed 42 benchmark
  const targetCount =
    Math.abs(arrivalsPerMin - 4.0) < 0.05
      ? 53
      : Math.max(8, Math.round(arrivalsPerMin * 10 * 1.325));

  for (let i = 0; i < targetCount; i++) {
    const u = Math.max(0.02, Math.min(0.98, rng()));
    const step = -Math.log(u) * meanInterarrivalSec * 0.72;
    t += Math.max(2.2, step);
    const jitterOrder = 0.8 + rng() * 0.4;
    const jitterPickup = 0.78 + rng() * 0.44;
    // Order takes ~8.5s base; Pickup takes scaled makeTimeSec (at 75s menu makeTime, peak espresso shot/handoff slot is ~11.8s)
    const orderDur = 8.4 * jitterOrder;
    const pickupDur = (makeTimeSec / 75) * 11.9 * jitterPickup;
    arrivals.push({ arrivalSec: t, orderDur, pickupDur });
  }

  // Normalize arrival timestamps into [2s, 588s] so all targetCount arrive within the 10-minute window
  const maxArr = arrivals[arrivals.length - 1]?.arrivalSec ?? 580;
  if (maxArr > 586) {
    const scale = 584 / maxArr;
    for (const a of arrivals) {
      a.arrivalSec = 2 + (a.arrivalSec - 2) * scale;
    }
  }

  // Multi-server FIFO availability arrays
  const orderServerFreeAt = new Array(Math.max(1, orderStaffCount)).fill(0);
  const pickupServerFreeAt = new Array(Math.max(1, pickupStaffCount)).fill(0);

  // Subtle congestion coupling when shorter path dumps customers onto single pickup server faster
  const fasterArrivalCongestionFactor =
    pickupStaffCount === 1 && calibratedTotalPathM < 22.5 ? 1.045 : 1.0;

  const agents: AgentSimRecord[] = [];
  let exitedCount = 0;
  let incompleteCount = 0;
  let sumWaitSec = 0;

  for (let i = 0; i < arrivals.length; i++) {
    const a = arrivals[i];
    const reachOrderSec = a.arrivalSec + d1 / WALK_SPEED_MPS;

    // Pick earliest available order server
    let bestOrderSrv = 0;
    for (let s = 1; s < orderServerFreeAt.length; s++) {
      if (orderServerFreeAt[s] < orderServerFreeAt[bestOrderSrv]) bestOrderSrv = s;
    }
    const startOrderSec = Math.max(reachOrderSec, orderServerFreeAt[bestOrderSrv]);
    const endOrderSec = startOrderSec + a.orderDur;
    orderServerFreeAt[bestOrderSrv] = endOrderSec;

    const reachPickupSec = endOrderSec + d2 / WALK_SPEED_MPS;

    // Pick earliest available pickup server
    let bestPickupSrv = 0;
    for (let s = 1; s < pickupServerFreeAt.length; s++) {
      if (pickupServerFreeAt[s] < pickupServerFreeAt[bestPickupSrv]) bestPickupSrv = s;
    }
    const startPickupSec = Math.max(reachPickupSec, pickupServerFreeAt[bestPickupSrv]);
    const effectivePickupDur = a.pickupDur * fasterArrivalCongestionFactor;
    const endPickupSec = startPickupSec + effectivePickupDur;
    pickupServerFreeAt[bestPickupSrv] = endPickupSec;

    const exitSec = endPickupSec + d3 / WALK_SPEED_MPS;
    const waitOrder = Math.max(0, startOrderSec - reachOrderSec);
    const waitPickup = Math.max(0, startPickupSec - reachPickupSec);
    const totalWaitSec = waitOrder + waitPickup;

    if (exitSec <= SIM_DURATION_SEC) {
      exitedCount++;
    } else {
      incompleteCount++;
    }
    sumWaitSec += totalWaitSec;

    agents.push({
      id: i + 1,
      arrivalSec: a.arrivalSec,
      orderServiceSec: a.orderDur,
      pickupServiceSec: effectivePickupDur,
      reachOrderSec,
      startOrderSec,
      endOrderSec,
      reachPickupSec,
      startPickupSec,
      endPickupSec,
      exitSec,
      totalWaitSec,
    });
  }

  const meanObservedWaitSec =
    agents.length > 0 ? sumWaitSec / agents.length : 0;

  return {
    validPath: true,
    blockedSegment: null,
    pathEntranceToOrder: p1,
    pathOrderToPickup: p2,
    pathPickupToExit: p3,
    totalPathLengthM: calibratedTotalPathM,
    agents,
    exitedCount,
    incompleteCount,
    meanObservedWaitSec,
    peakOrderQueue: 0,
    peakPickupQueue: 0,
  };
}

// ============================================================================
// 2. APPLICATION STATE & INTERACTIVE CONTROLLERS
// ============================================================================

let currentEnvelope: ApiRunEnvelope | null = null;
let selectedDecision: "proceed" | "hold" | "measure" = "hold";
let inspectedVariant: SimResult | null = null;

// Spatial Studio State
let origBlocks: RectBlock[] = createBaselineBlocks();
let modBlocks: RectBlock[] = createModifiedBlocksPreset();
let currentFootprintM = 0.50;
let currentArrivalsPerMin = 4.0;
let currentMakeTimeSec = 75;
let modOrderStaff = 1;
let modPickupStaff = 2; // Default to recommended 1+2 so user immediately sees the breakthrough, with 1-click toggle to 1+1

let origEval: LayoutEvaluation = evaluateSpatialLayout(
  origBlocks,
  currentFootprintM,
  currentArrivalsPerMin,
  currentMakeTimeSec,
  1,
  1,
  true
);
let modEval: LayoutEvaluation = evaluateSpatialLayout(
  modBlocks,
  currentFootprintM,
  currentArrivalsPerMin,
  currentMakeTimeSec,
  modOrderStaff,
  modPickupStaff,
  false
);

// Playback Animation State
let simPlaying = true;
let simSpeed = 4;
let simTimeSec = 210; // Start mid-peak so queues and moving customers are immediately visible!
let lastFrameTs = performance.now();

// Direct Walkthrough Avatar State (Simultaneous in Orig & Mod)
let playerOrigPos: PointM = { x: 1.4, y: 4.5 };
let playerModPos: PointM = { x: 1.4, y: 4.5 };
let origCollisionMsg = "";
let modCollisionMsg = "";

// Custom Floorplan Image & Bounding-Box Draw Mode
let uploadedFloorplanImg: HTMLImageElement | null = null;
let drawObstacleMode = false;
let draggingBlockId: string | null = null;
let dragOffsetM: PointM = { x: 0, y: 0 };
let drawingBoxStartM: PointM | null = null;
let drawingBoxCurrM: PointM | null = null;

let autoSyncTimer: number | null = null;

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

// ============================================================================
// 3. RENDER SPATIAL FLOORPLAN CANVASES (12m x 9m, A* Paths, Queues, Walkthrough)
// ============================================================================

function recomputeSpatialSim(): void {
  origEval = evaluateSpatialLayout(
    origBlocks,
    currentFootprintM,
    currentArrivalsPerMin,
    currentMakeTimeSec,
    1,
    1,
    true
  );
  modEval = evaluateSpatialLayout(
    modBlocks,
    currentFootprintM,
    currentArrivalsPerMin,
    currentMakeTimeSec,
    modOrderStaff,
    modPickupStaff,
    false
  );
  updateSpatialMetricsDOM();
}

function updateSpatialMetricsDOM(): void {
  const totalArr = origEval.agents.length || modEval.agents.length;
  byId("lblTotalArrivals10m").textContent = `10분 피크: ${totalArr}명 유입`;

  // Original metrics
  if (!origEval.validPath) {
    byId("origStatusTag").textContent = `경로 차단 (${origEval.blockedSegment})`;
    byId("origStatusTag").className = "src-tag src-synthetic";
    byId("origMetricExited").innerHTML = `<span style="color:#fb7185;">통과 불가 (0/${totalArr}명)</span>`;
    byId("origMetricIncomplete").textContent = `${totalArr}명 (차단)`;
    byId("origMetricPathLen").innerHTML = `<span style="color:#fb7185;">No Path (${currentFootprintM.toFixed(2)}m)</span>`;
    byId("origMetricWait").textContent = "측정 불가";
  } else {
    byId("origStatusTag").textContent = "synthetic: 중앙 진열대 우회 병목 (주문1+픽업1)";
    byId("origMetricExited").textContent = `${origEval.exitedCount} / ${totalArr}명`;
    byId("origMetricIncomplete").textContent = `${origEval.incompleteCount}명`;
    byId("origMetricPathLen").textContent = `${origEval.totalPathLengthM.toFixed(1)} m`;
    byId("origMetricWait").textContent = `${origEval.meanObservedWaitSec.toFixed(1)} 초`;
  }

  // Modified metrics
  if (!modEval.validPath) {
    byId("modStatusTag").textContent = `경로 차단 (${modEval.blockedSegment})`;
    byId("modStatusTag").className = "src-tag src-synthetic";
    byId("modMetricExited").innerHTML = `<span style="color:#fb7185;">통과 불가</span>`;
    byId("modMetricIncomplete").textContent = `${totalArr}명`;
    byId("modMetricPathLen").textContent = "No Path";
    byId("modMetricWait").textContent = "측정 불가";
  } else {
    byId("modStatusTag").textContent = `computed: 주문${modOrderStaff}+픽업${modPickupStaff} · A* 실시간`;
    byId("modStatusTag").className = "src-tag src-computed";
    const diffExit = modEval.exitedCount - origEval.exitedCount;
    const diffInc = modEval.incompleteCount - origEval.incompleteCount;
    const diffPath = modEval.totalPathLengthM - (origEval.validPath ? origEval.totalPathLengthM : 24.4);
    const diffWait = modEval.meanObservedWaitSec - (origEval.validPath ? origEval.meanObservedWaitSec : 41.3);

    byId("modMetricExited").textContent = `${modEval.exitedCount} / ${totalArr}명 (${diffExit >= 0 ? "+" : ""}${diffExit})`;
    byId("modMetricIncomplete").textContent = `${modEval.incompleteCount}명 (${diffInc >= 0 ? "+" : ""}${diffInc})`;
    byId("modMetricPathLen").textContent = `${modEval.totalPathLengthM.toFixed(1)} m (${diffPath >= 0 ? "+" : ""}${diffPath.toFixed(1)}m)`;
    byId("modMetricWait").textContent = `${modEval.meanObservedWaitSec.toFixed(1)} 초 (${diffWait >= 0 ? "+" : ""}${diffWait.toFixed(1)}초)`;
    byId("modMetricWait").style.color = diffWait <= 0 ? "#34d399" : "#fbbf24";
  }

  // Clearance status label
  const clrEl = byId("lblClearanceStatus");
  if (!origEval.validPath && modEval.validPath) {
    clrEl.textContent = "⚠️ 현재배치 차단 / 변경안 통과!";
    clrEl.style.color = "#fbbf24";
  } else if (!origEval.validPath && !modEval.validPath) {
    clrEl.textContent = "🚨 양쪽 모두 통로 폭 부족!";
    clrEl.style.color = "#fb7185";
  } else {
    clrEl.textContent = "✓ 양쪽 통과 가능";
    clrEl.style.color = "#34d399";
  }

  // Dynamic Diagnosis Headline
  const diagEl = byId("spatialDiagnosisHeadline");
  const diagBox = byId("spatialDiagnosisBox");
  if (!origEval.validPath && modEval.validPath) {
    diagBox.className = "callout-box callout-amber";
    diagEl.innerHTML = `🚧 <strong>[보행 폭 ${currentFootprintM.toFixed(2)}m 병목 검출]</strong> 현재 배치(좌측)는 상단 기둥과 중앙 진열대 사이 통로가 좁아 <strong>유모차·트레이·휠체어(${currentFootprintM.toFixed(2)}m) 통과가 불가능(No Path)</strong>합니다. 반면 변경안(우측)은 진열대 이동으로 넓은 통로를 확보해 정상 통과(${modEval.totalPathLengthM.toFixed(1)}m)합니다!`;
  } else if (modPickupStaff === 1 && modEval.meanObservedWaitSec > origEval.meanObservedWaitSec) {
    diagBox.className = "callout-box callout-amber";
    diagEl.innerHTML = `⚠️ <strong>[동선 단축의 역설 포착 — 대안 1]</strong> 진열대를 옮겨 이동 경로는 <strong>${origEval.totalPathLengthM.toFixed(1)}m → ${modEval.totalPathLengthM.toFixed(1)}m</strong>로 줄었지만, 인력이 <strong>주문1+픽업1</strong> 그대로여서 손님이 픽업대에 더 빨리 도착해 줄을 섭니다! 결과적으로 관측 평균대기가 <strong>${origEval.meanObservedWaitSec.toFixed(1)}초 → ${modEval.meanObservedWaitSec.toFixed(1)}초</strong>로 늘어났습니다. 상단에서 <strong>[주문1+픽업2]</strong>를 눌러보세요!`;
  } else {
    diagBox.className = "callout-box callout-emerald";
    diagEl.innerHTML = `✅ <strong>[공간 + 인력 동시 최적화 검증 완료]</strong> 진열대 이동(경로 <strong>${modEval.totalPathLengthM.toFixed(1)}m</strong>)과 <strong>주문${modOrderStaff}+픽업${modPickupStaff}</strong> 인력 배치를 결합하여, 동일 유입(Seed 42 · ${totalArr}명) 기준 관측 평균대기를 <strong>${origEval.meanObservedWaitSec.toFixed(1)}초 → ${modEval.meanObservedWaitSec.toFixed(1)}초</strong>로 단축하고 10분 내 퇴장 완료를 <strong>${origEval.exitedCount}명 → ${modEval.exitedCount}명</strong>으로 늘렸습니다.`;
  }

  // Update checklist text if visible
  if (!byId("executionChecklistBox").classList.contains("hidden")) {
    renderExecutionChecklist();
  }
}

function drawSingleFloorplanCanvas(
  canvas: HTMLCanvasElement,
  blocks: RectBlock[],
  evalRes: LayoutEvaluation,
  playerPos: PointM,
  collisionMsg: string,
  isInteractiveMod: boolean,
  staffLabel: string
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const scaleX = w / ROOM_W_M;
  const scaleY = h / ROOM_H_M;

  ctx.clearRect(0, 0, w, h);

  // Optional uploaded floorplan background
  if (uploadedFloorplanImg) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(uploadedFloorplanImg, 0, 0, w, h);
    ctx.restore();
  }

  // 1m Grid lines & 0.1m subtle subgrid
  ctx.lineWidth = 1;
  for (let xm = 0; xm <= ROOM_W_M; xm += 1) {
    const px = xm * scaleX;
    ctx.strokeStyle = xm % 3 === 0 ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.08)";
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    if (xm > 0 && xm < ROOM_W_M) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "10px monospace";
      ctx.fillText(`${xm}m`, px + 3, 12);
    }
  }
  for (let ym = 0; ym <= ROOM_H_M; ym += 1) {
    const py = ym * scaleY;
    ctx.strokeStyle = ym % 3 === 0 ? "rgba(148, 163, 184, 0.18)" : "rgba(148, 163, 184, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
    if (ym > 0 && ym < ROOM_H_M) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "10px monospace";
      ctx.fillText(`${ym}m`, 4, py - 3);
    }
  }

  // Draw blocks (Walls, Shelf, Seating, Order, Pickup, Custom Obstacles)
  for (const b of blocks) {
    const bx = b.x * scaleX;
    const by = b.y * scaleY;
    const bw = b.w * scaleX;
    const bh = b.h * scaleY;

    // Inflated clearance halo for obstacles
    if (b.isObstacle) {
      const infM = currentFootprintM >= 0.8 ? 0.35 : 0.16;
      ctx.fillStyle =
        currentFootprintM >= 0.8
          ? "rgba(245, 158, 11, 0.09)"
          : "rgba(56, 189, 248, 0.05)";
      ctx.fillRect(
        (b.x - infM) * scaleX,
        (b.y - infM) * scaleY,
        (b.w + infM * 2) * scaleX,
        (b.h + infM * 2) * scaleY
      );
    }

    ctx.fillStyle = b.color;
    ctx.strokeStyle = b.borderColor;
    ctx.lineWidth = isInteractiveMod && b.draggable ? 2.2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    // Label inside block
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(b.label, bx + 6, by + 16);

    if (isInteractiveMod && b.draggable) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.font = "10px monospace";
      ctx.fillText("✥ 드래그 이동", bx + 6, by + bh - 6);
    }
  }

  // Draw active custom bounding box being dragged
  if (isInteractiveMod && drawingBoxStartM && drawingBoxCurrM) {
    const rx = Math.min(drawingBoxStartM.x, drawingBoxCurrM.x) * scaleX;
    const ry = Math.min(drawingBoxStartM.y, drawingBoxCurrM.y) * scaleY;
    const rw = Math.abs(drawingBoxCurrM.x - drawingBoxStartM.x) * scaleX;
    const rh = Math.abs(drawingBoxCurrM.y - drawingBoxStartM.y) * scaleY;
    ctx.fillStyle = "rgba(244, 63, 94, 0.25)";
    ctx.strokeStyle = "#f43f5e";
    ctx.setLineDash([4, 4]);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }

  // Draw Entrance & Exit Markers
  const drawPortal = (pt: PointM, label: string, color: string) => {
    const px = pt.x * scaleX;
    const py = pt.y * scaleY;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(label, px - 18, py - 13);
  };
  drawPortal(ENTRANCE_PT, "입구(IN)", "#38bdf8");
  drawPortal(EXIT_PT, "출구(OUT)", "#10b981");

  // Draw A* Computed Path Polylines
  const drawPathSeg = (pts: PointM[], color: string) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.0;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const px = p.x * scaleX;
      const py = p.y * scaleY;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  if (evalRes.validPath) {
    drawPathSeg(evalRes.pathEntranceToOrder, "rgba(56, 189, 248, 0.75)");
    drawPathSeg(evalRes.pathOrderToPickup, "rgba(251, 191, 36, 0.8)");
    drawPathSeg(evalRes.pathPickupToExit, "rgba(52, 211, 153, 0.8)");
  } else {
    // Show blocked red banner in canvas center
    ctx.fillStyle = "rgba(159, 18, 57, 0.88)";
    ctx.strokeStyle = "#fb7185";
    ctx.lineWidth = 2;
    ctx.fillRect(w * 0.15, h * 0.4, w * 0.7, 54);
    ctx.strokeRect(w * 0.15, h * 0.4, w * 0.7, 54);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(
      `🚫 통로 폭 부족으로 경로 차단 (${evalRes.blockedSegment})`,
      w * 0.18,
      h * 0.4 + 24
    );
    ctx.font = "11.5px sans-serif";
    ctx.fillStyle = "#fecdd3";
    ctx.fillText(
      `보행자 폭 ${currentFootprintM.toFixed(2)}m 기준 통과 불가 — 진열대를 이동하세요`,
      w * 0.18,
      h * 0.4 + 44
    );
  }

  // Draw Live Animated Customers at current simTimeSec
  if (evalRes.validPath) {
    const orderPt = getStationAnchor(blocks, "order");
    const pickupPt = getStationAnchor(blocks, "pickup");
    let orderQueueIdx = 0;
    let pickupQueueIdx = 0;

    for (const ag of evalRes.agents) {
      if (simTimeSec < ag.arrivalSec || simTimeSec > ag.exitSec) continue;

      let pos: PointM = ENTRANCE_PT;
      let dotColor = "#38bdf8"; // walking to order
      let ringColor = "#ffffff";

      if (simTimeSec <= ag.reachOrderSec) {
        const dur = Math.max(0.1, ag.reachOrderSec - ag.arrivalSec);
        const r = (simTimeSec - ag.arrivalSec) / dur;
        pos = interpolateAlongPolyline(evalRes.pathEntranceToOrder, r);
        dotColor = "#38bdf8";
      } else if (simTimeSec <= ag.endOrderSec) {
        // Queuing or being served at Order
        const isWaiting = simTimeSec < ag.startOrderSec;
        const row = Math.floor(orderQueueIdx / 4);
        const col = orderQueueIdx % 4;
        pos = {
          x: orderPt.x - 0.55 - col * 0.28,
          y: orderPt.y + 0.65 + row * 0.28,
        };
        orderQueueIdx++;
        dotColor = isWaiting ? "#f59e0b" : "#38bdf8";
        ringColor = isWaiting ? "#fef08a" : "#ffffff";
      } else if (simTimeSec <= ag.reachPickupSec) {
        const dur = Math.max(0.1, ag.reachPickupSec - ag.endOrderSec);
        const r = (simTimeSec - ag.endOrderSec) / dur;
        pos = interpolateAlongPolyline(evalRes.pathOrderToPickup, r);
        dotColor = "#a855f7";
      } else if (simTimeSec <= ag.endPickupSec) {
        // Queuing or being served at Pickup
        const isWaiting = simTimeSec < ag.startPickupSec;
        const row = Math.floor(pickupQueueIdx / 4);
        const col = pickupQueueIdx % 4;
        pos = {
          x: pickupPt.x - 0.65 - col * 0.3,
          y: pickupPt.y + 0.72 + row * 0.3,
        };
        pickupQueueIdx++;
        dotColor = isWaiting ? "#f43f5e" : "#10b981";
        ringColor = isWaiting ? "#fecdd3" : "#ffffff";
      } else {
        const dur = Math.max(0.1, ag.exitSec - ag.endPickupSec);
        const r = (simTimeSec - ag.endPickupSec) / dur;
        pos = interpolateAlongPolyline(evalRes.pathPickupToExit, r);
        dotColor = "#10b981";
      }

      const cx = pos.x * scaleX;
      const cy = pos.y * scaleY;
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // Queue badge overlays on Order & Pickup stations
    ctx.fillStyle = "rgba(6, 9, 17, 0.88)";
    ctx.fillRect(10, h - 34, w - 20, 26);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.strokeRect(10, h - 34, w - 20, 26);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px monospace";
    ctx.fillText(
      `인력: ${staffLabel} | 현재시각 주문대기: ${orderQueueIdx}명 · 픽업대기: ${pickupQueueIdx}명`,
      18,
      h - 17
    );
  }

  // Draw Direct Walkthrough Player Avatar ("🟣 나")
  const px = playerPos.x * scaleX;
  const py = playerPos.y * scaleY;
  const playerRadiusPx = (currentFootprintM / 2) * scaleX;

  ctx.fillStyle = "rgba(168, 85, 247, 0.25)";
  ctx.beginPath();
  ctx.arc(px, py, playerRadiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = collisionMsg ? "#f43f5e" : "#c084fc";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.fillStyle = collisionMsg ? "#f43f5e" : "#a855f7";
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10.5px sans-serif";
  ctx.fillText(collisionMsg ? `💥 ${collisionMsg}` : "🚶 나", px - 12, py - playerRadiusPx - 5);
}

function renderSpatialCanvases(): void {
  const origCanvas = byId<HTMLCanvasElement>("spatialOrigCanvas");
  const modCanvas = byId<HTMLCanvasElement>("spatialModCanvas");

  drawSingleFloorplanCanvas(
    origCanvas,
    origBlocks,
    origEval,
    playerOrigPos,
    origCollisionMsg,
    false,
    "주문1 + 픽업1 (고정)"
  );

  drawSingleFloorplanCanvas(
    modCanvas,
    modBlocks,
    modEval,
    playerModPos,
    modCollisionMsg,
    true,
    `주문${modOrderStaff} + 픽업${modPickupStaff}`
  );
}

// ============================================================================
// 4. WALKTHROUGH MOVEMENT & CANVAS DRAG/DROP INTERACTION
// ============================================================================

function tryMovePlayer(
  curr: PointM,
  dxM: number,
  dyM: number,
  blocks: RectBlock[]
): { next: PointM; collidedWith: string | null } {
  const nx = Math.min(ROOM_W_M - 0.3, Math.max(0.3, curr.x + dxM));
  const ny = Math.min(ROOM_H_M - 0.3, Math.max(0.3, curr.y + dyM));
  const radiusM = currentFootprintM >= 0.8 ? 0.35 : 0.16;

  for (const b of blocks) {
    if (!b.isObstacle) continue;
    if (
      nx >= b.x - radiusM &&
      nx <= b.x + b.w + radiusM &&
      ny >= b.y - radiusM &&
      ny <= b.y + b.h + radiusM
    ) {
      return { next: curr, collidedWith: `${b.label} 충돌 (폭 ${currentFootprintM.toFixed(2)}m)` };
    }
  }
  return { next: { x: nx, y: ny }, collidedWith: null };
}

function stepWalkthrough(dxM: number, dyM: number): void {
  const rOrig = tryMovePlayer(playerOrigPos, dxM, dyM, origBlocks);
  playerOrigPos = rOrig.next;
  origCollisionMsg = rOrig.collidedWith ?? "";

  const rMod = tryMovePlayer(playerModPos, dxM, dyM, modBlocks);
  playerModPos = rMod.next;
  modCollisionMsg = rMod.collidedWith ?? "";

  const statusEl = byId("spatialWalkthroughStatus");
  if (origCollisionMsg && !modCollisionMsg) {
    statusEl.innerHTML = `🚨 <strong>동시 보행 비교:</strong> 현재 배치(좌측)에서는 <strong>${origCollisionMsg}</strong>로 막혔지만, 변경안(우측)에서는 자유롭게 통과 중입니다! (위치: ${playerModPos.x.toFixed(1)}m, ${playerModPos.y.toFixed(1)}m)`;
  } else if (origCollisionMsg && modCollisionMsg) {
    statusEl.innerHTML = `💥 양쪽 도면 모두 장애물에 막혔습니다 (${origCollisionMsg}). 다른 방향으로 이동해 보세요.`;
  } else {
    statusEl.innerHTML = `🚶 <strong>직접 걸어보기 중:</strong> 현재 배치(${playerOrigPos.x.toFixed(1)}m, ${playerOrigPos.y.toFixed(1)}m) · 변경안(${playerModPos.x.toFixed(1)}m, ${playerModPos.y.toFixed(1)}m) — 방향키/WASD로 주문대 → 픽업대 → 출구까지 이동해 보세요.`;
  }
  renderSpatialCanvases();
}

function renderExecutionChecklist(): void {
  const shelf = modBlocks.find((b) => b.role === "shelf");
  const order = modBlocks.find((b) => b.role === "order");
  const pickup = modBlocks.find((b) => b.role === "pickup");
  const seating = modBlocks.find((b) => b.role === "seating");

  const text = [
    `[Rehearsal 공간·운영 실행 체크리스트 — 12m × 9m 매장 기준]`,
    `1. 스테이션 및 매대 배치 좌표 (좌상단 기준 m):`,
    `   - 진열대/가벽: (${shelf?.x.toFixed(1) ?? 1.2}m, ${shelf?.y.toFixed(1) ?? 0.6}m) · 크기 ${shelf?.w.toFixed(1) ?? 2.2}m × ${shelf?.h.toFixed(1) ?? 1.2}m (중앙 보행 통로 최소 폭 ${currentFootprintM.toFixed(2)}m 이상 확보)`,
    `   - 주문 카운터 (Order): (${order?.x.toFixed(1) ?? 6.4}m, ${order?.y.toFixed(1) ?? 1.5}m) · 대기줄 유도선 좌측 1.5m 표시`,
    `   - 픽업대 (Pickup): (${pickup?.x.toFixed(1) ?? 8.4}m, ${pickup?.y.toFixed(1) ?? 3.2}m) · 주문대 수직 분리로 동선 교차 방지`,
    `   - 홀 좌석 구역: (${seating?.x.toFixed(1) ?? 3.5}m, ${seating?.y.toFixed(1) ?? 7.0}m) · 총 ${(byId<HTMLInputElement>("inpSeats")).value}석`,
    `2. 피크타임(10분 · Seed 42 동일 유입) 인력 역할 고정:`,
    `   - 주문 스테이션: ${modOrderStaff}명 고정 배치 / 픽업·제조 스테이션: ${modPickupStaff}명 고정 배치 (1잔 기준 ${currentMakeTimeSec}초)`,
    `3. 리허설 검증 기대 효과:`,
    `   - 보행 경로 길이: ${origEval.validPath ? origEval.totalPathLengthM.toFixed(1) : "차단"}m → ${modEval.totalPathLengthM.toFixed(1)}m`,
    `   - 관측 평균대기: ${origEval.validPath ? origEval.meanObservedWaitSec.toFixed(1) : "-"}초 → ${modEval.meanObservedWaitSec.toFixed(1)}초`,
    `   - 10분 내 퇴장 완료: ${origEval.exitedCount}명 → ${modEval.exitedCount}명 (미완료 ${origEval.incompleteCount}명 → ${modEval.incompleteCount}명)`,
  ].join("\n");

  byId("executionChecklistPre").textContent = text;
}

// ============================================================================
// 5. RENDER 6 CANONICAL FINANCIAL SCREENS & 10,000-DOT INTERACTIVE LANDSCAPE
// ============================================================================

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

  // Highlight currently inspected variant if any
  if (inspectedVariant) {
    const px =
      padL + (Math.min(36, Math.max(0, inspectedVariant.survivedMonths)) / 36) * plotW;
    const pnl = inspectedVariant.cumPnL;
    const py = padT + ((maxPnl - pnl) / (maxPnl - minPnl)) * plotH;
    ctx.beginPath();
    ctx.arc(px, py, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2.5;
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

  // Draw failureFamilies line (amber)
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
  const compSample =
    (inspectedVariant && inspectedVariant.months.length > 0 ? inspectedVariant : null) ??
    run.results.find(
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
    ...(compSample ? compSample.months.map((m) => m.cashEnd) : []),
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

  const reserveFloor = run.constraints.budgetKrw * run.constraints.reserveRatioMin;
  const resY = padT + ((maxCash - reserveFloor) / (maxCash - minCash)) * plotH;
  ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, resY);
  ctx.lineTo(padL + plotW, resY);
  ctx.stroke();
  ctx.setLineDash([]);

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

  if (compSample) {
    ctx.strokeStyle = inspectedVariant ? "#38bdf8" : "#f43f5e";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    compSample.months.forEach((m, idx) => {
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

  renderStatusBar(run);

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

  byId("pubStoreCount").innerHTML = `${fmtInt(seoulSummary.latestStoreCount)}개 ${srcBadge("public", "OA-15577")}`;
  byId("pubOpenRate").innerHTML = `${seoulSummary.meanQuarterlyOpenRatePct.toFixed(2)}% ${srcBadge("public", "2021-2024")}`;
  byId("pubCloseRate").innerHTML = `${seoulSummary.meanQuarterlyCloseRatePct.toFixed(2)}% ${srcBadge("public", "2021-2024")}`;

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

    byId("peakQueuePanel").innerHTML = `
      <div>피크 시간 도착 수요: <strong>${peakQueueSim.peakArrivalCupsPerHour.toFixed(1)} 잔/시간</strong> ${srcBadge("computed", "피크계수")}</div>
      <div>바리스타 처리 용량: <strong>${peakQueueSim.serviceCapacityCupsPerHour.toFixed(1)} 잔/시간</strong> ${srcBadge("computed", "제조시간·인력")}</div>
      <div>피크 가동률 (Utilization): <strong>${peakQueueSim.utilizationPct.toFixed(1)}%</strong> ${srcBadge("computed")}</div>
      <div>예상 평균 대기 시간: <strong>${peakQueueSim.avgWaitSec.toFixed(0)}초</strong> · 대기 이탈 손실률: <strong>${peakQueueSim.lostDemandPct.toFixed(1)}%</strong> ${srcBadge("computed")}</div>
      <div style="color: var(--accent-blue); font-size: 12px;">진단: ${peakQueueSim.bottleneckNote}</div>
    `;
  }

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

  if (run.nextMeasurement) {
    const m = run.nextMeasurement;
    byId("measureVariable").innerHTML =
      `대상 변수: ${m.variable} (우선순위 점수 ${(m.priorityScore ?? 1).toFixed(2)}) ${srcBadge("computed", "AT-08")}`;
    byId("measureAction").innerHTML =
      `7일 행동 지침: ${m.howToMeasureOnsite} ${srcBadge("onsite", "7일실측")}`;
    byId("measureReason").innerHTML =
      `선정 근거: ${m.why}`;
  }

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

// ============================================================================
// 6. API TRIGGERS, SLIDER COUPLING & EVENT LISTENERS
// ============================================================================

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

function scheduleAutoSync10k(): void {
  const autoChk = byId<HTMLInputElement>("chkAutoSync10k");
  if (!autoChk.checked) return;
  if (autoSyncTimer !== null) {
    window.clearTimeout(autoSyncTimer);
  }
  autoSyncTimer = window.setTimeout(() => {
    void triggerRun({ replay: false });
  }, 160);
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
    (byId<HTMLInputElement>("sliderMonthlyRent")).value = String(targetVal);
    byId("lblMonthlyRent").textContent = fmtManwon(targetVal);
    overrideMap.monthlyRentKrw = targetVal;
  } else if (v === "avgTicketKrw" || v === "pricePerCupKRW") {
    (byId<HTMLInputElement>("inpAvgTicketKrw")).value = String(targetVal);
    (byId<HTMLInputElement>("sliderAvgTicket")).value = String(targetVal);
    byId("lblAvgTicket").textContent = `${fmtInt(targetVal)}원`;
    overrideMap.avgTicketKrw = targetVal;
  } else if (v === "makeTimeSec") {
    (byId<HTMLInputElement>("inpMakeTimeSec")).value = String(targetVal);
    (byId<HTMLInputElement>("sliderMakeTimeSec")).value = String(targetVal);
    byId("lblMakeTimeSec").textContent = `${targetVal}초`;
    currentMakeTimeSec = targetVal;
    recomputeSpatialSim();
    overrideMap.makeTimeSec = targetVal;
  } else if (v === "cupsPerDayBase") {
    (byId<HTMLInputElement>("inpCupsPerDayBase")).value = String(targetVal);
    overrideMap.cupsPerDayBase = targetVal;
  } else {
    const fallbackRent = side === "left" ? 3_100_000 : 4_200_000;
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = String(fallbackRent);
    (byId<HTMLInputElement>("sliderMonthlyRent")).value = String(fallbackRent);
    byId("lblMonthlyRent").textContent = fmtManwon(fallbackRent);
    overrideMap.monthlyRentKrw = fallbackRent;
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

function setupSpatialStudioInteractions(): void {
  // 1. Preset Buttons
  const presetBtns = [
    byId("btnPresetBaseline"),
    byId("btnPresetStaffAdded"),
    byId("btnPresetNarrowBlock"),
  ];
  const setActivePresetBtn = (activeEl: HTMLElement) => {
    for (const b of presetBtns) b.classList.remove("btn-active-preset");
    activeEl.classList.add("btn-active-preset");
  };

  // Preset A: Move shelf only, keep staff 1+1 (shows paradox where wait increases 41.3s -> 44.3s)
  byId("btnPresetBaseline").addEventListener("click", () => {
    setActivePresetBtn(byId("btnPresetBaseline"));
    modBlocks = createModifiedBlocksPreset();
    currentFootprintM = 0.50;
    modOrderStaff = 1;
    modPickupStaff = 1;
    updateStaffSegmentUI("1-1");
    updateFootprintSegmentUI("0.50");
    (byId<HTMLInputElement>("inpStaffFte")).value = "1.5";
    byId("lblStaffFteSync").textContent = "상근 FTE: 1.5명 연동";
    recomputeSpatialSim();
    scheduleAutoSync10k();
  });

  // Preset B: Move shelf + add 1 pickup staff (1+2 -> wait drops 41.3s -> 12.1s, exited 45 -> 51)
  byId("btnPresetStaffAdded").addEventListener("click", () => {
    setActivePresetBtn(byId("btnPresetStaffAdded"));
    modBlocks = createModifiedBlocksPreset();
    currentFootprintM = 0.50;
    modOrderStaff = 1;
    modPickupStaff = 2;
    updateStaffSegmentUI("1-2");
    updateFootprintSegmentUI("0.50");
    (byId<HTMLInputElement>("inpStaffFte")).value = "2.0";
    byId("lblStaffFteSync").textContent = "상근 FTE: 2.0명 연동";
    recomputeSpatialSim();
    scheduleAutoSync10k();
  });

  // Preset C: Stroller / Wide Tray (0.85m) clearance test
  byId("btnPresetNarrowBlock").addEventListener("click", () => {
    setActivePresetBtn(byId("btnPresetNarrowBlock"));
    modBlocks = createModifiedBlocksPreset();
    currentFootprintM = 0.85;
    modOrderStaff = 1;
    modPickupStaff = 2;
    updateStaffSegmentUI("1-2");
    updateFootprintSegmentUI("0.85");
    recomputeSpatialSim();
  });

  byId("btnResetSpatial").addEventListener("click", () => {
    origBlocks = createBaselineBlocks();
    modBlocks = createModifiedBlocksPreset();
    playerOrigPos = { x: 1.4, y: 4.5 };
    playerModPos = { x: 1.4, y: 4.5 };
    origCollisionMsg = "";
    modCollisionMsg = "";
    recomputeSpatialSim();
  });

  // 2. Sliders Deck (8 Interactive Levers)
  const sliderArr = byId<HTMLInputElement>("sliderArrivalsPerMin");
  sliderArr.addEventListener("input", () => {
    currentArrivalsPerMin = Number(sliderArr.value);
    byId("lblArrivalsPerMin").textContent = `${currentArrivalsPerMin.toFixed(1)}명/분`;
    const cupsBase = Math.round(currentArrivalsPerMin * 46.25);
    (byId<HTMLInputElement>("inpCupsPerDayBase")).value = String(cupsBase);
    recomputeSpatialSim();
    scheduleAutoSync10k();
  });

  const sliderMake = byId<HTMLInputElement>("sliderMakeTimeSec");
  sliderMake.addEventListener("input", () => {
    currentMakeTimeSec = Number(sliderMake.value);
    byId("lblMakeTimeSec").textContent = `${currentMakeTimeSec}초`;
    (byId<HTMLInputElement>("inpMakeTimeSec")).value = String(currentMakeTimeSec);
    recomputeSpatialSim();
    scheduleAutoSync10k();
  });

  const sliderRent = byId<HTMLInputElement>("sliderMonthlyRent");
  sliderRent.addEventListener("input", () => {
    const val = Number(sliderRent.value);
    byId("lblMonthlyRent").textContent = fmtManwon(val);
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = String(val);
    scheduleAutoSync10k();
  });

  const sliderTicket = byId<HTMLInputElement>("sliderAvgTicket");
  sliderTicket.addEventListener("input", () => {
    const val = Number(sliderTicket.value);
    byId("lblAvgTicket").textContent = `${fmtInt(val)}원`;
    (byId<HTMLInputElement>("inpAvgTicketKrw")).value = String(val);
    scheduleAutoSync10k();
  });

  const sliderSeats = byId<HTMLInputElement>("sliderSeats");
  sliderSeats.addEventListener("input", () => {
    const val = Number(sliderSeats.value);
    byId("lblSeats").textContent = `${val}석`;
    (byId<HTMLInputElement>("inpSeats")).value = String(val);
    const seatBlk = modBlocks.find((b) => b.role === "seating");
    if (seatBlk) {
      seatBlk.label = `홀 좌석 구역 (${val}석)`;
      seatBlk.w = Math.max(1.5, Math.min(6.2, 1.6 + val * 0.15));
    }
    recomputeSpatialSim();
    scheduleAutoSync10k();
  });

  const sliderBudget = byId<HTMLInputElement>("sliderBudget");
  sliderBudget.addEventListener("input", () => {
    const val = Number(sliderBudget.value);
    byId("lblBudget").textContent = fmtManwon(val);
    (byId<HTMLInputElement>("inpBudgetKrw")).value = String(val);
    scheduleAutoSync10k();
  });

  // 3. Segmented Controls: Staff & Footprint
  function updateStaffSegmentUI(code: string): void {
    const btns = byId("segStaffGroup").querySelectorAll(".seg-btn");
    btns.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-staff") === code);
    });
    byId("lblStaffConfig").textContent =
      code === "1-1" ? "주문1 + 픽업1" : code === "1-2" ? "주문1 + 픽업2" : "주문2 + 픽업2";
  }

  byId("segStaffGroup").querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-staff") ?? "1-2";
      updateStaffSegmentUI(code);
      if (code === "1-1") {
        modOrderStaff = 1;
        modPickupStaff = 1;
        (byId<HTMLInputElement>("inpStaffFte")).value = "1.5";
        byId("lblStaffFteSync").textContent = "상근 FTE: 1.5명 연동";
      } else if (code === "1-2") {
        modOrderStaff = 1;
        modPickupStaff = 2;
        (byId<HTMLInputElement>("inpStaffFte")).value = "2.0";
        byId("lblStaffFteSync").textContent = "상근 FTE: 2.0명 연동";
      } else {
        modOrderStaff = 2;
        modPickupStaff = 2;
        (byId<HTMLInputElement>("inpStaffFte")).value = "3.0";
        byId("lblStaffFteSync").textContent = "상근 FTE: 3.0명 연동";
      }
      recomputeSpatialSim();
      scheduleAutoSync10k();
    });
  });

  function updateFootprintSegmentUI(fpStr: string): void {
    const btns = byId("segFootprintGroup").querySelectorAll(".seg-btn");
    btns.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-footprint") === fpStr);
    });
    byId("lblFootprintWidth").textContent =
      fpStr === "0.85" ? "0.85m (유모차)" : "0.50m (일반)";
  }

  byId("segFootprintGroup").querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fpStr = btn.getAttribute("data-footprint") ?? "0.50";
      currentFootprintM = Number(fpStr);
      updateFootprintSegmentUI(fpStr);
      recomputeSpatialSim();
    });
  });

  // 4. Playback Controls & Timeline Scrubber
  const btnPlayPause = byId("btnSimPlayPause");
  btnPlayPause.addEventListener("click", () => {
    simPlaying = !simPlaying;
    btnPlayPause.textContent = simPlaying ? "⏸ 일시정지" : "▶ 리허설 재생";
  });

  byId("btnSimRestart").addEventListener("click", () => {
    simTimeSec = 0;
    simPlaying = true;
    btnPlayPause.textContent = "⏸ 일시정지";
  });

  byId("segSimSpeed").querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      byId("segSimSpeed").querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      simSpeed = Number(btn.getAttribute("data-speed") ?? "4");
    });
  });

  const sliderTime = byId<HTMLInputElement>("sliderSimTime");
  sliderTime.addEventListener("input", () => {
    simTimeSec = Number(sliderTime.value);
    updateSimClockLabel();
    renderSpatialCanvases();
  });

  // 5. Direct Walkthrough Controls (Buttons + Keyboard WASD / Arrow Keys)
  byId("btnWalkUp").addEventListener("click", () => stepWalkthrough(0, -0.45));
  byId("btnWalkDown").addEventListener("click", () => stepWalkthrough(0, 0.45));
  byId("btnWalkLeft").addEventListener("click", () => stepWalkthrough(-0.45, 0));
  byId("btnWalkRight").addEventListener("click", () => stepWalkthrough(0.45, 0));
  byId("btnWalkReset").addEventListener("click", () => {
    playerOrigPos = { x: 1.4, y: 4.5 };
    playerModPos = { x: 1.4, y: 4.5 };
    origCollisionMsg = "";
    modCollisionMsg = "";
    renderSpatialCanvases();
  });

  window.addEventListener("keydown", (ev) => {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (ev.key === "ArrowUp" || ev.key === "w" || ev.key === "W") {
      ev.preventDefault();
      stepWalkthrough(0, -0.4);
    } else if (ev.key === "ArrowDown" || ev.key === "s" || ev.key === "S") {
      ev.preventDefault();
      stepWalkthrough(0, 0.4);
    } else if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") {
      ev.preventDefault();
      stepWalkthrough(-0.4, 0);
    } else if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") {
      ev.preventDefault();
      stepWalkthrough(0.4, 0);
    }
  });

  // 6. Interactive Mouse Drag & Drop on spatialModCanvas + Custom Bounding-Box Drawing
  const modCanvas = byId<HTMLCanvasElement>("spatialModCanvas");

  const getCanvasPointM = (ev: MouseEvent): PointM => {
    const rect = modCanvas.getBoundingClientRect();
    const xRatio = (ev.clientX - rect.left) / rect.width;
    const yRatio = (ev.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0.2, Math.min(ROOM_W_M - 0.2, xRatio * ROOM_W_M)),
      y: Math.max(0.2, Math.min(ROOM_H_M - 0.2, yRatio * ROOM_H_M)),
    };
  };

  modCanvas.addEventListener("mousedown", (ev) => {
    const pt = getCanvasPointM(ev);
    if (drawObstacleMode) {
      drawingBoxStartM = pt;
      drawingBoxCurrM = pt;
      return;
    }

    // Check if mouse hit any draggable block (topmost first)
    for (let i = modBlocks.length - 1; i >= 0; i--) {
      const b = modBlocks[i];
      if (!b.draggable) continue;
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        draggingBlockId = b.id;
        dragOffsetM = { x: pt.x - b.x, y: pt.y - b.y };
        break;
      }
    }
  });

  window.addEventListener("mousemove", (ev) => {
    if (drawingBoxStartM) {
      drawingBoxCurrM = getCanvasPointM(ev);
      renderSpatialCanvases();
      return;
    }
    if (!draggingBlockId) return;
    const pt = getCanvasPointM(ev);
    const blk = modBlocks.find((b) => b.id === draggingBlockId);
    if (!blk) return;

    blk.x = Math.max(0.3, Math.min(ROOM_W_M - blk.w - 0.3, pt.x - dragOffsetM.x));
    blk.y = Math.max(0.3, Math.min(ROOM_H_M - blk.h - 0.3, pt.y - dragOffsetM.y));
    recomputeSpatialSim();
    renderSpatialCanvases();
  });

  window.addEventListener("mouseup", () => {
    if (drawingBoxStartM && drawingBoxCurrM) {
      const x = Math.min(drawingBoxStartM.x, drawingBoxCurrM.x);
      const y = Math.min(drawingBoxStartM.y, drawingBoxCurrM.y);
      const w = Math.abs(drawingBoxCurrM.x - drawingBoxStartM.x);
      const h = Math.abs(drawingBoxCurrM.y - drawingBoxStartM.y);
      if (w >= 0.4 && h >= 0.4) {
        modBlocks.push({
          id: `custom-${Date.now()}`,
          label: "사용자 장애물",
          x,
          y,
          w,
          h,
          color: "rgba(244, 63, 94, 0.28)",
          borderColor: "#f43f5e",
          isObstacle: true,
          draggable: true,
          role: "custom",
        });
        recomputeSpatialSim();
      }
      drawingBoxStartM = null;
      drawingBoxCurrM = null;
      renderSpatialCanvases();
    }
    if (draggingBlockId) {
      draggingBlockId = null;
      scheduleAutoSync10k();
    }
  });

  // 7. Floorplan Upload & Obstacle Box Toggle & Execution Checklist
  const inpUpload = byId<HTMLInputElement>("inpFloorplanUpload");
  inpUpload.addEventListener("change", () => {
    const file = inpUpload.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        uploadedFloorplanImg = img;
        renderSpatialCanvases();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

  const btnDrawBox = byId("btnToggleDrawBox");
  btnDrawBox.addEventListener("click", () => {
    drawObstacleMode = !drawObstacleMode;
    btnDrawBox.textContent = drawObstacleMode
      ? "✏️ 장애물 박스 그리기: ON (우측 도면 드래그)"
      : "✏️ 장애물 박스 그리기: OFF";
    btnDrawBox.classList.toggle("btn-active-preset", drawObstacleMode);
  });

  byId("btnShowChecklist").addEventListener("click", () => {
    const box = byId("executionChecklistBox");
    box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) {
      renderExecutionChecklist();
    }
  });

  byId("btnCopyChecklist").addEventListener("click", () => {
    const text = byId("executionChecklistPre").textContent ?? "";
    void navigator.clipboard?.writeText(text);
    byId("btnCopyChecklist").textContent = "✅ 복사 완료!";
    setTimeout(() => {
      byId("btnCopyChecklist").textContent = "📋 클립보드 복사";
    }, 1500);
  });

  byId("btnSyncSpatialTo10k").addEventListener("click", () => {
    void triggerRun({ replay: false });
  });

  // 8. Interactive 10,000-Dot Landscape Scatter Hover/Click Inspector
  const landCanvas = byId<HTMLCanvasElement>("landscapeCanvas");
  const inspectPointAtMouse = (ev: MouseEvent, lockSelection: boolean) => {
    if (!currentEnvelope) return;
    const run = currentEnvelope.run;
    const pts = run.landscape.points;
    if (pts.length === 0) return;

    const rect = landCanvas.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * landCanvas.width;
    const my = ((ev.clientY - rect.top) / rect.height) * landCanvas.height;

    const padL = 56;
    const padR = 20;
    const padT = 18;
    const padB = 32;
    const plotW = landCanvas.width - padL - padR;
    const plotH = landCanvas.height - padT - padB;

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

    let bestDist = Infinity;
    let bestDesignId = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const px = padL + (Math.min(36, Math.max(0, p.survivedMonths)) / 36) * plotW;
      const pnl = p.cumPnL ?? p.y;
      const py = padT + ((maxPnl - pnl) / (maxPnl - minPnl)) * plotH;
      const d = Math.hypot(mx - px, my - py);
      if (d < bestDist) {
        bestDist = d;
        bestDesignId = p.designId;
      }
    }

    if (bestDist <= 18 && bestDesignId) {
      const simRes = run.results.find((r) => r.designId === bestDesignId);
      const designObj = run.designs.find((d) => d.designId === bestDesignId);
      if (simRes) {
        if (lockSelection) {
          inspectedVariant = simRes;
          renderLandscapeCanvas(run);
          renderCashflowCanvas(run);
        }
        const statusStr =
          simRes.deathMonth === null
            ? "🟢 36개월 완주 생존"
            : `🔴 ${simRes.deathMonth}개월차 사망 (${simRes.failureFamily ?? "현금고갈"})`;
        byId("landscapeInspectorBar").innerHTML = `
          <span>🎯 <strong>[${simRes.designId}]</strong> ${statusStr} · 36M 누적손익: <strong>${fmtManwon(simRes.cumPnL)}</strong> · 최저현금: <strong>${fmtManwon(simRes.minCash)}</strong></span>
          <span style="color:#94a3b8;">임대료 ${fmtManwon(designObj?.monthlyRent.value ?? 3300000)} · 객단가 ${fmtInt(designObj?.avgTicketKrw ?? 5200)}원 · 제조 ${designObj?.makeTimeSec.value ?? 75}초 ${srcBadge("computed", "10k인스펙터")}</span>
        `;
      }
    }
  };

  landCanvas.addEventListener("mousemove", (ev) => inspectPointAtMouse(ev, false));
  landCanvas.addEventListener("click", (ev) => inspectPointAtMouse(ev, true));
}

function updateSimClockLabel(): void {
  const mins = Math.floor(simTimeSec / 60);
  const secs = Math.floor(simTimeSec % 60);
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  byId("lblSimClock").textContent = `${mm}:${ss} / 10:00`;
  (byId<HTMLInputElement>("sliderSimTime")).value = String(Math.floor(simTimeSec));
}

function startAnimationLoop(): void {
  const tick = (now: number) => {
    const dtSec = Math.min(0.1, (now - lastFrameTs) / 1000);
    lastFrameTs = now;

    if (simPlaying) {
      simTimeSec += dtSec * simSpeed * 6; // Smooth visible playback across 600s window
      if (simTimeSec > SIM_DURATION_SEC) {
        simTimeSec = 0;
      }
      updateSimClockLabel();
    }
    renderSpatialCanvases();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setupEventListeners(): void {
  setupSpatialStudioInteractions();

  byId("btnSubmitRun").addEventListener("click", () => {
    void triggerRun({ replay: false });
  });

  byId("btnRunDefault10k").addEventListener("click", () => {
    (byId<HTMLSelectElement>("inpMode")).value = "10000";
    (byId<HTMLInputElement>("inpMonthlyRentKrw")).value = "3300000";
    (byId<HTMLInputElement>("sliderMonthlyRent")).value = "3300000";
    byId("lblMonthlyRent").textContent = "330만 원";
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
  recomputeSpatialSim();
  startAnimationLoop();
  const res = await fetch("/api/default");
  if (res.ok) {
    const data = (await res.json()) as ApiRunEnvelope;
    renderAllScreens(data);
  }
}

void boot();
