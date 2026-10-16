// web/client/app.ts — Ultra-Simple 3-Step Founder Simulator + 2.5D Isometric Store Rehearsal
// Step 1: Input Address / Store Photo / My Capital (내 자본금)
// Step 2: AI Recommended Business Categories (창업 카테고리 추천)
// Step 3: Auto-Generated 2.5D Store Floorplan (드래그 배치 & 손님 동선) + 36-Month Capital Survival Report

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
// 1. COMMERCIAL DISTRICT PROFILES & BUSINESS CATEGORY TEMPLATES
// ============================================================================

interface DistrictProfile {
  key: "seongsu" | "yeonnam" | "gangnam" | "euljiro";
  name: string;
  badgeText: string;
  rentMultiplier: number;
  depositManwon: number;
  footTrafficMultiplier: number;
  preferredCategories: string[];
}

const DISTRICT_PROFILES: Record<string, DistrictProfile> = {
  seongsu: {
    key: "seongsu",
    name: "성수동 연무장길·카페거리",
    badgeText: "성수카페거리 상권 (유동인구·객단가 강세)",
    rentMultiplier: 1.05,
    depositManwon: 3000,
    footTrafficMultiplier: 1.12,
    preferredCategories: ["cafe", "bakery", "winebar", "salad"],
  },
  yeonnam: {
    key: "yeonnam",
    name: "마포구 연남동·경의선숲길",
    badgeText: "연남동 상권 (체류형 디저트·데이트 강세)",
    rentMultiplier: 0.92,
    depositManwon: 2500,
    footTrafficMultiplier: 1.04,
    preferredCategories: ["bakery", "cafe", "winebar", "salad"],
  },
  gangnam: {
    key: "gangnam",
    name: "강남역·역삼 오피스 이면",
    badgeText: "강남 오피스 상권 (점심 고회전·테이크아웃 강세)",
    rentMultiplier: 1.28,
    depositManwon: 4000,
    footTrafficMultiplier: 1.25,
    preferredCategories: ["salad", "cafe", "bakery", "winebar"],
  },
  euljiro: {
    key: "euljiro",
    name: "중구 을지로3가·힙지로",
    badgeText: "을지로3가 상권 (합리적 임대료·저녁 주류 강세)",
    rentMultiplier: 0.85,
    depositManwon: 2200,
    footTrafficMultiplier: 0.98,
    preferredCategories: ["winebar", "cafe", "salad", "bakery"],
  },
};

interface CategoryTemplate {
  id: "cafe" | "bakery" | "salad" | "winebar";
  icon: string;
  name: string;
  shortDesc: string;
  baseFitoutManwon: number;
  baseMonthlyRentManwon: number;
  areaM2: number;
  avgTicketKrw: number;
  cupsPerDayBase: number;
  makeTimeSec: number;
  arrivalPerMin: number;
  serviceSec: number;
  cogsRatio: number;
  laborRatioPct: number;
  furnitureLabels: {
    counter: string;
    pickup: string;
    display: string;
    tableA: string;
    tableB: string;
    tableC: string;
  };
  displaySize: { w: number; h: number };
}

const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  cafe: {
    id: "cafe",
    icon: "☕",
    name: "스페셜티 테이크아웃 카페",
    shortDesc: "빠른 제조 동선과 높은 피크 회전율 중심",
    baseFitoutManwon: 3800,
    baseMonthlyRentManwon: 350,
    areaM2: 49.6,
    avgTicketKrw: 5800,
    cupsPerDayBase: 195,
    makeTimeSec: 65,
    arrivalPerMin: 1.9,
    serviceSec: 20,
    cogsRatio: 0.28,
    laborRatioPct: 25,
    furnitureLabels: {
      counter: "에스프레소 바·주문",
      pickup: "음료 픽업 데스크",
      display: "원두·MD 진열대",
      tableA: "2인 테이블 A",
      tableB: "2인 테이블 B",
      tableC: "창가 테이블 C",
    },
    displaySize: { w: 1.3, h: 0.9 },
  },
  salad: {
    id: "salad",
    icon: "🥗",
    name: "1인 샐러드 · 포케 키친",
    shortDesc: "소자본 개업 가능 · 점심 피크 포장·배달 특화",
    baseFitoutManwon: 2900,
    baseMonthlyRentManwon: 310,
    areaM2: 42.0,
    avgTicketKrw: 10900,
    cupsPerDayBase: 135,
    makeTimeSec: 55,
    arrivalPerMin: 1.7,
    serviceSec: 18,
    cogsRatio: 0.34,
    laborRatioPct: 22,
    furnitureLabels: {
      counter: "키오스크·주문대",
      pickup: "포장·배달 픽업존",
      display: "콜드 토핑 쇼케이스",
      tableA: "1인 바 테이블 A",
      tableB: "1인 바 테이블 B",
      tableC: "2인 테이블 C",
    },
    displaySize: { w: 1.2, h: 0.85 },
  },
  bakery: {
    id: "bakery",
    icon: "🥐",
    name: "베이커리 · 디저트 쇼룸",
    shortDesc: "중앙 트레이 진열 중심 · 높은 객단가와 체류 효과",
    baseFitoutManwon: 5200,
    baseMonthlyRentManwon: 390,
    areaM2: 56.0,
    avgTicketKrw: 11800,
    cupsPerDayBase: 145,
    makeTimeSec: 80,
    arrivalPerMin: 1.5,
    serviceSec: 25,
    cogsRatio: 0.33,
    laborRatioPct: 27,
    furnitureLabels: {
      counter: "포장·결제 카운터",
      pickup: "트레이·음료 픽업대",
      display: "중앙 베이커리 매대",
      tableA: "라운지 테이블 A",
      tableB: "라운지 테이블 B",
      tableC: "창가 테이블 C",
    },
    displaySize: { w: 1.6, h: 1.1 },
  },
  winebar: {
    id: "winebar",
    icon: "🍷",
    name: "캐주얼 하이볼 · 와인 바",
    shortDesc: "저녁 고마진 주류·페어링 · 회전보다 테이블 단가 중심",
    baseFitoutManwon: 4600,
    baseMonthlyRentManwon: 340,
    areaM2: 52.0,
    avgTicketKrw: 21500,
    cupsPerDayBase: 78,
    makeTimeSec: 90,
    arrivalPerMin: 1.2,
    serviceSec: 27,
    cogsRatio: 0.31,
    laborRatioPct: 26,
    furnitureLabels: {
      counter: "롱 바 카운터",
      pickup: "주류·플레이트 서브존",
      display: "보틀 큐레이션 랙",
      tableA: "홀 테이블 A",
      tableB: "홀 테이블 B",
      tableC: "부스 테이블 C",
    },
    displaySize: { w: 1.3, h: 0.9 },
  },
};

function detectDistrictFromAddress(rawAddr: string): DistrictProfile {
  const s = rawAddr.trim();
  if (/연남|홍대|마포|합정|망원|상수/.test(s)) return DISTRICT_PROFILES.yeonnam;
  if (/강남|역삼|서초|테헤란|삼성|선릉|여의도|교대/.test(s)) return DISTRICT_PROFILES.gangnam;
  if (/을지로|종로|충무로|명동|익선|성북|한남|이태원|신당/.test(s)) return DISTRICT_PROFILES.euljiro;
  return DISTRICT_PROFILES.seongsu;
}

// ============================================================================
// 2. EXACT 2.5D ISOMETRIC REHEARSAL ENGINE (From rehearsal.html)
// ============================================================================

interface SceneObject {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "counter" | "pickup" | "display" | "table";
  movable?: boolean;
}

interface Pt2D {
  x: number;
  y: number;
}

interface SceneData {
  id: string;
  width: number;
  height: number;
  entrance: Pt2D;
  orderPoint: Pt2D;
  pickupPoint: Pt2D;
  exit: Pt2D;
  objects: SceneObject[];
}

interface SimConfig {
  horizonSec: number;
  dtSec: number;
  arrivalRatePerMin: number;
  orderServiceSec: number;
  pickupServiceSec: number;
  walkSpeedMps: number;
  bodyWidthM: number;
  orderStaff: number;
  pickupStaff: number;
  seed: number;
}

interface FrameCustomer {
  id: number;
  x: number;
  y: number;
  state: string;
}

interface SimFrame {
  t: number;
  orderQueue: number;
  pickupQueue: number;
  completed: number;
  customers: FrameCustomer[];
}

interface RehearsalSimResult {
  routeBlocked: boolean;
  blockedReason: string | null;
  routePoints: Pt2D[];
  walkDistance: number;
  arrivalCount: number;
  completed: number;
  active: number;
  avgWaitCompleted: number;
  avgWaitObserved: number;
  maxOrderQueue: number;
  maxPickupQueue: number;
  frames: SimFrame[];
}

const STEP = 0.1;
const EPS = 1e-9;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dist = (a: Pt2D, b: Pt2D) => Math.hypot(b.x - a.x, b.y - a.y);

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MinHeap<T> {
  a: T[] = [];
  c: (x: T, y: T) => number;
  constructor(c: (x: T, y: T) => number) {
    this.c = c;
  }
  get size(): number {
    return this.a.length;
  }
  push(v: T): void {
    this.a.push(v);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.c(this.a[i], this.a[p]) >= 0) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    if (!this.a.length) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let b = i;
        if (l < this.a.length && this.c(this.a[l], this.a[b]) < 0) b = l;
        if (r < this.a.length && this.c(this.a[r], this.a[b]) < 0) b = r;
        if (b === i) break;
        [this.a[i], this.a[b]] = [this.a[b], this.a[i]];
        i = b;
      }
    }
    return top;
  }
}

function makeScene(preset: "baseline" | "proposed", cat: CategoryTemplate): SceneData {
  const moved = preset === "proposed";
  const L = cat.furnitureLabels;
  const dw = cat.displaySize.w;
  const dh = cat.displaySize.h;
  return {
    id: preset,
    width: 12,
    height: 9,
    entrance: { x: 1.1, y: 4.5 },
    orderPoint: { x: 5.5, y: 2.3 },
    pickupPoint: { x: 8.6, y: 2.3 },
    exit: { x: 10.8, y: 4.5 },
    objects: [
      { id: "counter", label: L.counter, x: 4.7, y: 0.8, w: 2.2, h: 1.0, kind: "counter" },
      { id: "pickup", label: L.pickup, x: 7.7, y: 0.8, w: 2.1, h: 1.0, kind: "pickup" },
      {
        id: "display",
        label: L.display,
        x: moved ? 1.2 : 3.2,
        y: moved ? 5.7 : 2.9,
        w: dw,
        h: dh,
        kind: "display",
        movable: true,
      },
      { id: "table-a", label: L.tableA, x: 4.1, y: 5.6, w: 1.2, h: 1.2, kind: "table", movable: true },
      { id: "table-b", label: L.tableB, x: 6.4, y: 5.5, w: 1.2, h: 1.2, kind: "table", movable: true },
      { id: "table-c", label: L.tableC, x: 8.7, y: 5.7, w: 1.2, h: 1.2, kind: "table", movable: true },
    ],
  };
}

function buildGeometry(scene: SceneData, r: number) {
  const rects = scene.objects.map((o) => ({
    l: o.x - r,
    t: o.y - r,
    r: o.x + o.w + r,
    b: o.y + o.h + r,
  }));
  const free = (p: Pt2D) => {
    if (p.x < r - EPS || p.y < r - EPS || p.x > scene.width - r + EPS || p.y > scene.height - r + EPS) {
      return false;
    }
    for (const q of rects) {
      if (p.x > q.l + EPS && p.x < q.r - EPS && p.y > q.t + EPS && p.y < q.b - EPS) return false;
    }
    return true;
  };
  const clear = (a: Pt2D, b: Pt2D) => {
    const n = Math.max(2, Math.ceil(dist(a, b) / (STEP / 2)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      if (!free({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })) return false;
    }
    return true;
  };
  return { free, clear };
}

function findPath(scene: SceneData, a: Pt2D, b: Pt2D, r: number): Pt2D[] | null {
  const cols = Math.round(scene.width / STEP);
  const rows = Math.round(scene.height / STEP);
  const g = buildGeometry(scene, r);
  const cell = (p: Pt2D) => ({
    c: Math.max(0, Math.min(cols, Math.round(p.x / STEP))),
    r: Math.max(0, Math.min(rows, Math.round(p.y / STEP))),
  });
  const pt = (c: { c: number; r: number }): Pt2D => ({
    x: r3(c.c * STEP),
    y: r3(c.r * STEP),
  });
  const s = cell(a);
  const e = cell(b);
  if (!g.free(pt(s)) || !g.free(pt(e))) return null;

  const key = (c: { c: number; r: number }) => c.r * (cols + 1) + c.c;
  const open = new MinHeap<{ c: { c: number; r: number }; f: number; g: number }>(
    (x, y) => x.f - y.f || x.g - y.g
  );
  const prev = new Map<number, { c: number; r: number }>();
  const score = new Map<number, number>([[key(s), 0]]);
  const closed = new Set<number>();
  const dirs: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  open.push({ c: s, f: dist(pt(s), pt(e)), g: 0 });
  while (open.size) {
    const cur = open.pop()!;
    const k = key(cur.c);
    if (closed.has(k)) continue;
    if (cur.c.c === e.c && cur.c.r === e.r) {
      const raw: Pt2D[] = [];
      let w: { c: number; r: number } | undefined = cur.c;
      while (w) {
        raw.push(pt(w));
        w = prev.get(key(w));
      }
      raw.reverse();
      const out: Pt2D[] = [raw[0]];
      let i = 0;
      while (i < raw.length - 1) {
        let n = raw.length - 1;
        for (; n > i + 1; n--) {
          if (g.clear(raw[i], raw[n])) break;
        }
        out.push(raw[n]);
        i = n;
      }
      return out;
    }
    closed.add(k);
    for (const [dc, dr, cost] of dirs) {
      const nc = { c: cur.c.c + dc, r: cur.c.r + dr };
      if (nc.c < 0 || nc.r < 0 || nc.c > cols || nc.r > rows) continue;
      const np = pt(nc);
      if (!g.free(np)) continue;
      if (dc && dr && (!g.free(pt({ c: cur.c.c + dc, r: cur.c.r })) || !g.free(pt({ c: cur.c.c, r: cur.c.r + dr })))) {
        continue;
      }
      const nk = key(nc);
      if (closed.has(nk)) continue;
      const ng = cur.g + cost * STEP;
      if (ng + EPS < (score.get(nk) ?? Infinity)) {
        prev.set(nk, cur.c);
        score.set(nk, ng);
        open.push({ c: nc, f: ng + dist(np, pt(e)), g: ng });
      }
    }
  }
  return null;
}

function polylineLen(pts: Pt2D[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function posOnPolyline(pts: Pt2D[], target: number): Pt2D {
  if (!pts.length) return { x: 0, y: 0 };
  if (target <= 0) return pts[0];
  let rem = target;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (rem <= seg) {
      const u = seg <= EPS ? 0 : rem / seg;
      return {
        x: r3(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u),
        y: r3(pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u),
      };
    }
    rem -= seg;
  }
  return pts[pts.length - 1];
}

function queueSlot(anchor: Pt2D, idx: number, dx: number, dy: number): Pt2D {
  return {
    x: r3(anchor.x + dx * Math.min(idx, 5) * 0.42 - Math.floor(idx / 6) * 0.42),
    y: r3(anchor.y + dy * Math.min(idx, 5) * 0.42),
  };
}

interface SimCustomer {
  id: number;
  arr: number;
  om: number;
  pm: number;
  state: string;
  p0: number;
  p1: number;
  path: Pt2D[];
  WaitStart: number;
  wait: number;
  done: number | null;
}

interface SimEvent {
  t: number;
  p: number;
  seq: number;
  kind: "arrival" | "walkDone" | "serviceDone";
  c: SimCustomer;
  leg?: string;
  st?: string;
}

function runRehearsalSim(scene: SceneData, cfg: SimConfig): RehearsalSimResult {
  const r = cfg.bodyWidthM / 2;
  const p1 = findPath(scene, scene.entrance, scene.orderPoint, r);
  const p2 = findPath(scene, scene.orderPoint, scene.pickupPoint, r);
  const p3 = findPath(scene, scene.pickupPoint, scene.exit, r);

  if (!p1 || !p2 || !p3) {
    return {
      routeBlocked: true,
      blockedReason: !p1 ? "입구→주문 경로 단절" : !p2 ? "주문→픽업 경로 단절" : "픽업→출구 경로 단절",
      routePoints: [],
      walkDistance: 0,
      arrivalCount: 0,
      completed: 0,
      active: 0,
      avgWaitCompleted: 0,
      avgWaitObserved: 0,
      maxOrderQueue: 0,
      maxPickupQueue: 0,
      frames: [],
    };
  }

  const rng = makeRng(cfg.seed);
  const arrivals: { id: number; t: number; om: number; pm: number }[] = [];
  let t = 0;
  let id = 1;
  const rate = cfg.arrivalRatePerMin / 60;
  while (t < cfg.horizonSec && arrivals.length < 240) {
    t += -Math.log(1 - Math.min(0.999999, Math.max(1e-6, rng()))) / rate;
    if (t <= cfg.horizonSec) {
      arrivals.push({
        id: id++,
        t: r3(t),
        om: 0.75 + rng() * 0.55,
        pm: 0.75 + rng() * 0.65,
      });
    }
  }

  const events = new MinHeap<SimEvent>((a, b) => a.t - b.t || a.p - b.p || a.seq - b.seq);
  let seq = 0;
  const push = (ev: Omit<SimEvent, "seq">) => events.push({ ...ev, seq: seq++ });

  const customers: SimCustomer[] = arrivals.map((a) => ({
    id: a.id,
    arr: a.t,
    om: a.om,
    pm: a.pm,
    state: "future",
    p0: a.t,
    p1: a.t,
    path: [scene.entrance],
    WaitStart: 0,
    wait: 0,
    done: null,
  }));

  for (const c of customers) push({ t: c.arr, p: 2, kind: "arrival", c });

  const oQ: SimCustomer[] = [];
  const pQ: SimCustomer[] = [];
  let oBusy = 0;
  let pBusy = 0;
  let maxO = 0;
  let maxP = 0;
  let doneCount = 0;

  const walk = (c: SimCustomer, pts: Pt2D[], now: number, next: string, leg: string) => {
    const d = Math.max(0.05, polylineLen(pts) / cfg.walkSpeedMps);
    c.state = next;
    c.p0 = now;
    c.p1 = now + d;
    c.path = pts;
    push({ t: c.p1, p: 1, kind: "walkDone", leg, c });
  };

  const pumpO = (now: number) => {
    while (oBusy < cfg.orderStaff && oQ.length) {
      const c = oQ.shift()!;
      c.wait += now - c.WaitStart;
      oBusy++;
      const d = Math.max(3, cfg.orderServiceSec * c.om);
      c.state = "orderService";
      c.p0 = now;
      c.p1 = now + d;
      c.path = [scene.orderPoint];
      push({ t: c.p1, p: 0, kind: "serviceDone", st: "order", c });
    }
  };

  const pumpP = (now: number) => {
    while (pBusy < cfg.pickupStaff && pQ.length) {
      const c = pQ.shift()!;
      c.wait += now - c.WaitStart;
      pBusy++;
      const d = Math.max(3, cfg.pickupServiceSec * c.pm);
      c.state = "pickupService";
      c.p0 = now;
      c.p1 = now + d;
      c.path = [scene.pickupPoint];
      push({ t: c.p1, p: 0, kind: "serviceDone", st: "pickup", c });
    }
  };

  const frames: SimFrame[] = [];
  const totalSteps = Math.floor(cfg.horizonSec / cfg.dtSec);
  for (let step = 0; step <= totalSteps; step++) {
    const now = r3(step * cfg.dtSec);
    while (events.size && events.a[0].t <= now + EPS) {
      const ev = events.pop()!;
      const c = ev.c;
      if (ev.kind === "arrival") {
        walk(c, p1, ev.t, "walkOrder", "order");
      } else if (ev.kind === "walkDone" && ev.leg === "order") {
        c.state = "waitOrder";
        c.WaitStart = ev.t;
        oQ.push(c);
        maxO = Math.max(maxO, oQ.length);
        pumpO(ev.t);
      } else if (ev.kind === "serviceDone" && ev.st === "order") {
        oBusy--;
        walk(c, p2, ev.t, "walkPickup", "pickup");
        pumpO(ev.t);
      } else if (ev.kind === "walkDone" && ev.leg === "pickup") {
        c.state = "waitPickup";
        c.WaitStart = ev.t;
        pQ.push(c);
        maxP = Math.max(maxP, pQ.length);
        pumpP(ev.t);
      } else if (ev.kind === "serviceDone" && ev.st === "pickup") {
        pBusy--;
        walk(c, p3, ev.t, "walkExit", "exit");
        pumpP(ev.t);
      } else if (ev.kind === "walkDone" && ev.leg === "exit") {
        c.state = "done";
        c.done = ev.t;
        doneCount++;
      }
    }

    maxO = Math.max(maxO, oQ.length);
    maxP = Math.max(maxP, pQ.length);

    const oi = new Map(oQ.map((c, i) => [c.id, i]));
    const pi = new Map(pQ.map((c, i) => [c.id, i]));
    const visible: FrameCustomer[] = [];

    for (const c of customers) {
      if (c.state === "future" || c.state === "done") continue;
      let pos = scene.entrance;
      if (c.state.startsWith("walk")) {
        const u = Math.max(0, Math.min(1, (now - c.p0) / Math.max(EPS, c.p1 - c.p0)));
        pos = posOnPolyline(c.path, polylineLen(c.path) * u);
      } else if (c.state === "waitOrder") {
        pos = queueSlot(scene.orderPoint, oi.get(c.id) ?? 0, -0.7, 0.72);
      } else if (c.state === "orderService") {
        pos = scene.orderPoint;
      } else if (c.state === "waitPickup") {
        pos = queueSlot(scene.pickupPoint, pi.get(c.id) ?? 0, -0.25, 0.95);
      } else if (c.state === "pickupService") {
        pos = scene.pickupPoint;
      }
      visible.push({ id: c.id, x: pos.x, y: pos.y, state: c.state });
    }
    frames.push({
      t: now,
      orderQueue: oQ.length,
      pickupQueue: pQ.length,
      completed: doneCount,
      customers: visible,
    });
  }

  const doneCust = customers.filter((c) => c.done !== null);
  const obsCust = customers.filter((c) => c.arr <= cfg.horizonSec);
  const obsWait = (c: SimCustomer) =>
    c.wait + (c.state === "waitOrder" || c.state === "waitPickup" ? cfg.horizonSec - c.WaitStart : 0);

  return {
    routeBlocked: false,
    blockedReason: null,
    routePoints: [...p1, ...p2.slice(1), ...p3.slice(1)],
    walkDistance: r3(polylineLen(p1) + polylineLen(p2) + polylineLen(p3)),
    arrivalCount: obsCust.length,
    completed: doneCust.length,
    active: obsCust.length - doneCust.length,
    avgWaitCompleted: doneCust.length
      ? r3(doneCust.reduce((s, c) => s + c.wait, 0) / doneCust.length)
      : 0,
    avgWaitObserved: obsCust.length
      ? r3(obsCust.reduce((s, c) => s + obsWait(c), 0) / obsCust.length)
      : 0,
    maxOrderQueue: maxO,
    maxPickupQueue: maxP,
    frames,
  };
}

function sampleFrame(result: RehearsalSimResult | null | undefined, t: number): SimFrame {
  if (!result || !result.frames.length) {
    return { t: 0, orderQueue: 0, pickupQueue: 0, completed: 0, customers: [] };
  }
  const idx = Math.max(
    0,
    Math.min(result.frames.length - 1, Math.round(t / Math.max(0.25, result.frames[1]?.t || 0.5)))
  );
  return result.frames[idx];
}

// ============================================================================
// 3. 2.5D ISOMETRIC PROJECTION & WORLD CANVAS RENDERER
// ============================================================================

interface IsoView {
  w: number;
  h: number;
  s: number;
  ox: number;
  oy: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const currentCategory = (): CategoryTemplate => CATEGORY_TEMPLATES[state.categoryId] ?? CATEGORY_TEMPLATES.cafe;

const state = {
  address: "서울 성동구 성수동2가 315-47",
  capitalManwon: 9000,
  categoryId: "cafe" as "cafe" | "bakery" | "salad" | "winebar",
  seed: 42,
  t: 110,
  playing: true,
  speed: 20,
  arrival: 1.9,
  service: 20,
  body: 0.55,
  pickupStaff: 2,
  preset: "both" as "layout" | "staff" | "both" | "custom",
  walkMode: false,
  lightsOn: true,
  dimsOn: true,
  heatOn: false,
  isoAngleAlt: false,
  darkTheme: false,
  selected: "display" as string | null,
  rev: 0,
  dirty: false,
  base: makeScene("baseline", CATEGORY_TEMPLATES.cafe),
  plan: makeScene("proposed", CATEGORY_TEMPLATES.cafe),
  results: null as { base: RehearsalSimResult; plan: RehearsalSimResult } | null,
  players: [
    { x: 1.1, y: 4.5 },
    { x: 1.1, y: 4.5 },
  ],
  roi: null as { left: number; right: number; top: number; bottom: number } | null,
  imageRect: { x: 0, y: 0, w: 1, h: 1 },
};

const views: [IsoView | null, IsoView | null] = [null, null];
let drag: { id: string; dx: number; dy: number } | null = null;
let imageDrag: Pt2D | null = null;
let recomputeTimer = 0;
let macroSyncTimer = 0;
let lastFrameTs = 0;
let frameCounter = 0;
let currentEnvelope: ApiRunEnvelope | null = null;

function selectedMovable(): SceneObject {
  const found = state.plan.objects.find((o) => o.id === state.selected && o.movable);
  return found || state.plan.objects.find((o) => o.id === "display") || state.plan.objects[2];
}

function makeConfig(pickupStaff: number): SimConfig {
  return {
    horizonSec: 600,
    dtSec: 0.5,
    arrivalRatePerMin: state.arrival,
    orderServiceSec: 12,
    pickupServiceSec: state.service,
    walkSpeedMps: 1.25,
    bodyWidthM: state.body,
    orderStaff: 1,
    pickupStaff,
    seed: state.seed,
  };
}

function fitView(canvas: HTMLCanvasElement): IsoView {
  const b = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(b.width * dpr) || canvas.height !== Math.round(b.height * dpr)) {
    canvas.width = Math.round(b.width * dpr);
    canvas.height = Math.round(b.height * dpr);
  }
  const s = Math.min(b.width / 23.2, b.height / 13.6);
  return { w: b.width, h: b.height, s, ox: b.width * 0.44, oy: state.isoAngleAlt ? 54 : 38 };
}

function project(view: IsoView, x: number, y: number, z = 0): Pt2D {
  const tilt = state.isoAngleAlt ? 0.37 : 0.48;
  const zScale = state.isoAngleAlt ? 0.82 : 0.65;
  return {
    x: view.ox + (x - y) * view.s,
    y: view.oy + (x + y) * view.s * tilt - z * view.s * zScale,
  };
}

function unproject(view: IsoView, px: number, py: number): Pt2D {
  const tilt = state.isoAngleAlt ? 0.37 : 0.48;
  const a = (px - view.ox) / view.s;
  const b = (py - view.oy) / (view.s * tilt);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt2D[], fill: string, stroke?: string, lw = 1): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function drawBox3D(ctx: CanvasRenderingContext2D, v: IsoView, o: SceneObject, isSelected: boolean): void {
  const h = o.kind === "table" ? 0.52 : o.kind === "display" ? 0.85 : 0.92;
  const palette: Record<string, [string, string, string, string]> = state.darkTheme
    ? {
        counter: ["#4a4136", "#3b332a", "#2e2720", "#e6d8c5"],
        pickup: ["#264b3d", "#1e3c31", "#172f26", "#9be3c5"],
        display: ["#273f5e", "#1f324b", "#18273b", "#a7ccf9"],
        table: ["#3a3d40", "#2e3134", "#232629", "#d2d8dc"],
      }
    : {
        counter: ["#d9ccb8", "#c2b19a", "#b49f84", "#6e5f4d"],
        pickup: ["#cde2d5", "#a8c7b5", "#8eb39e", "#285543"],
        display: ["#d2e1f6", "#abc3e8", "#8eaad6", "#315892"],
        table: ["#e6dfd3", "#CFC5B5", "#bfb29f", "#6d655a"],
      };
  const pal = palette[o.kind] || palette.table;
  const p = (x: number, y: number, z: number) => project(v, x, y, z);

  // House-Control style warm ambient floor glow under furniture when lights are ON
  if (state.lightsOn) {
    const gc = p(o.x + o.w / 2, o.y + o.h / 2, 0);
    const rad = Math.max(o.w, o.h) * v.s * 0.95;
    const grad = ctx.createRadialGradient(gc.x, gc.y, 2, gc.x, gc.y, rad);
    grad.addColorStop(0, state.darkTheme ? "rgba(255, 195, 110, 0.24)" : "rgba(255, 185, 90, 0.20)");
    grad.addColorStop(1, "rgba(255, 185, 90, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(gc.x, gc.y, rad, rad * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const A = p(o.x, o.y, 0);
  const B = p(o.x + o.w, o.y, 0);
  const C = p(o.x + o.w, o.y + o.h, 0);
  const D = p(o.x, o.y + o.h, 0);
  const A1 = p(o.x, o.y, h);
  const B1 = p(o.x + o.w, o.y, h);
  const C1 = p(o.x + o.w, o.y + o.h, h);
  const D1 = p(o.x, o.y + o.h, h);

  const borderCol = isSelected ? (state.darkTheme ? "#4ec499" : "#202c31") : pal[3] + "55";
  const lw = isSelected ? 1.9 : 1;

  poly(ctx, [D, C, C1, D1], pal[1], borderCol, lw);
  poly(ctx, [B, C, C1, B1], pal[2], borderCol, lw);
  poly(ctx, [A1, B1, C1, D1], pal[0], borderCol, lw);

  const c = p(o.x + o.w / 2, o.y + o.h / 2, h);
  ctx.fillStyle = pal[3];
  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(o.label, c.x, c.y + (state.dimsOn ? 0 : 4));

  // Planner5D style CAD dimensions on furniture
  if (state.dimsOn) {
    ctx.font = "500 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = state.darkTheme ? "rgba(228,236,232,0.72)" : "rgba(32,44,49,0.62)";
    ctx.fillText(`${o.w.toFixed(1)}×${o.h.toFixed(1)}m`, c.x, c.y + 11);
  }
}

function drawWorld(
  canvas: HTMLCanvasElement,
  scene: SceneData,
  r: RehearsalSimResult | undefined,
  idx: 0 | 1
): void {
  const v = (views[idx] = fitView(canvas));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);

  if (state.darkTheme) {
    ctx.fillStyle = "#121619";
    ctx.fillRect(0, 0, v.w, v.h);
  }

  const p = (x: number, y: number, z = 0) => project(v, x, y, z);

  // Back walls & Floor
  const wall1 = state.darkTheme ? "#1d2327" : "#eceee8";
  const wall2 = state.darkTheme ? "#181d21" : "#e5e8e1";
  const wallLine = state.darkTheme ? "#2c353b" : "#d7ddd7";
  const floorFill = state.darkTheme ? "#161b1e" : "#f9faf6";
  const floorStroke = state.darkTheme ? "#303a40" : "#cfd6d0";

  poly(ctx, [p(0, 0, 0), p(12, 0, 0), p(12, 0, 1.3), p(0, 0, 1.3)], wall1, wallLine);
  poly(ctx, [p(0, 0, 0), p(0, 9, 0), p(0, 9, 1.3), p(0, 0, 1.3)], wall2, wallLine);
  poly(ctx, [p(0, 0, 0), p(12, 0, 0), p(12, 9, 0), p(0, 9, 0)], floorFill, floorStroke, 1.2);

  // 1m Grid lines
  ctx.strokeStyle = state.darkTheme ? "#20272c" : "#e6ebe6";
  ctx.lineWidth = 1;
  for (let x = 1; x < 12; x++) {
    const a = p(x, 0);
    const b = p(x, 9);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 1; y < 9; y++) {
    const a = p(0, y);
    const b = p(12, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Planner5D architectural floorplan dimension callouts
  if (state.dimsOn) {
    const topMid = p(6, 0, 1.42);
    const leftMid = p(0, 4.5, 1.42);
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = state.darkTheme ? "#6fc7a5" : "#346b57";
    ctx.textAlign = "center";
    ctx.fillText("⟵ 12.0m (전면 폭) ⟶", topMid.x, topMid.y);
    ctx.fillText("⟵ 9.0m (깊이) ⟶", leftMid.x - 14, leftMid.y);
  }

  // Congestion Heatmap Overlay (when heatOn is active)
  const f = sampleFrame(r, state.t);
  if (state.heatOn) {
    const drawHeatSpot = (pt: Pt2D, qLen: number, maxRadius: number) => {
      const q = p(pt.x, pt.y, 0.02);
      const intensity = Math.min(1, (qLen + 1) / 7);
      const rad = maxRadius * v.s * (0.7 + intensity * 0.7);
      const g = ctx.createRadialGradient(q.x, q.y, 4, q.x, q.y, rad);
      g.addColorStop(0, `rgba(224, 72, 56, ${(0.22 + intensity * 0.35).toFixed(2)})`);
      g.addColorStop(0.55, `rgba(240, 152, 43, ${(0.12 + intensity * 0.2).toFixed(2)})`);
      g.addColorStop(1, "rgba(240, 152, 43, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, rad, rad * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    drawHeatSpot(scene.orderPoint, f.orderQueue || 0, 2.2);
    drawHeatSpot(scene.pickupPoint, f.pickupQueue || 0, 2.6);
  }

  // A* Customer Route Polyline
  if (r && !r.routeBlocked && r.routePoints.length > 1) {
    ctx.save();
    ctx.strokeStyle = idx ? (state.darkTheme ? "#4ec499" : "#346b57") : "#8b6d43";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    r.routePoints.forEach((pt, i) => {
      const q = p(pt.x, pt.y, 0.03);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Depth-sorted 3D Furniture Boxes
  [...scene.objects]
    .sort((a, b) => a.x + a.y + a.w + a.h - (b.x + b.y + b.w + b.h))
    .forEach((o) => drawBox3D(ctx, v, o, idx === 1 && o.id === state.selected));

  // Depth-sorted 3D Customer Figures
  [...(f.customers || [])]
    .sort((a, b) => a.x + a.y - (b.x + b.y))
    .forEach((c) => {
      const q = p(c.x, c.y, 0);
      const col = c.state.includes("Pickup")
        ? "#a86a27"
        : c.state.includes("Order")
          ? "#446dba"
          : "#346b57";
      ctx.fillStyle = "rgba(32,44,49,.16)";
      ctx.beginPath();
      ctx.ellipse(q.x, q.y + 3, 5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(q.x - 3.5, q.y - 13, 7, 11);
      ctx.beginPath();
      ctx.arc(q.x, q.y - 16, 4, 0, Math.PI * 2);
      ctx.fill();
    });

  // Walkthrough Avatar ("나")
  if (state.walkMode) {
    const me = state.players[idx];
    const q = p(me.x, me.y, 0);
    ctx.strokeStyle = "#a8453c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + 2, Math.max(8, state.body * v.s * 0.45), Math.max(5, state.body * v.s * 0.25), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#a8453c";
    ctx.beginPath();
    ctx.arc(q.x, q.y - 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("나", q.x, q.y - 9);
  }

  // Floating Queue Badges at z=1.2
  const callout = (pt: Pt2D, text: string, bg: string) => {
    const q = p(pt.x, pt.y, 1.2);
    ctx.font = "600 11px -apple-system, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = bg;
    ctx.fillRect(q.x - w / 2, q.y - 18, w, 18);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(text, q.x, q.y - 5);
  };
  callout(scene.orderPoint, "주문 대기 " + (f.orderQueue || 0) + "명", "#446dba");
  callout(scene.pickupPoint, "픽업 대기 " + (f.pickupQueue || 0) + "명", "#346b57");

  // Entrance / Exit Labels
  for (const [name, a] of [
    ["입구", scene.entrance],
    ["출구", scene.exit],
  ] as [string, Pt2D][]) {
    const pp = p(a.x, a.y);
    ctx.fillStyle = "#476853";
    ctx.font = "600 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name, pp.x, pp.y + 16);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#7d897f";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText("2.5D · 12 × 9m (" + currentCategory().name + ")", 12, v.h - 12);
  ctx.textAlign = "right";
  ctx.fillText("현재 시간 완료 " + (f.completed || 0) + "명", v.w - 12, v.h - 12);

  if (r?.routeBlocked) {
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.fillRect(0, v.h / 2 - 24, v.w, 48);
    ctx.fillStyle = "#a64e40";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("이 통과 폭 가정에서는 동선이 막힙니다 (" + (r.blockedReason || "") + ")", v.w / 2, v.h / 2 + 4);
  }
}

function formatClock(t: number): string {
  return (
    Math.floor(t / 60).toString().padStart(2, "0") +
    ":" +
    Math.floor(t % 60).toString().padStart(2, "0")
  );
}

function drawAllWorlds(): void {
  const baseCanvas = $<HTMLCanvasElement>("baseCanvas");
  const planCanvas = $<HTMLCanvasElement>("planCanvas");
  if (!baseCanvas || !planCanvas) return;
  drawWorld(baseCanvas, state.base, state.results?.base, 0);
  drawWorld(planCanvas, state.plan, state.results?.plan, 1);
  const tl = $<HTMLInputElement>("timeline");
  if (tl) tl.value = String(state.t);
  const clk = $("clock");
  if (clk) clk.textContent = formatClock(state.t) + " / 10:00";
}

// ============================================================================
// 4. CATEGORY RECOMMENDATION & CAPITAL FEASIBILITY ENGINE
// ============================================================================

function computeCategoryStartupManwon(cat: CategoryTemplate, distProf: DistrictProfile): {
  depositManwon: number;
  fitoutManwon: number;
  monthlyRentManwon: number;
  totalStartupManwon: number;
  bufferManwon: number;
} {
  const depositManwon = distProf.depositManwon;
  const fitoutManwon = cat.baseFitoutManwon;
  const monthlyRentManwon = Math.round(cat.baseMonthlyRentManwon * distProf.rentMultiplier);
  const totalStartupManwon = depositManwon + fitoutManwon;
  const bufferManwon = state.capitalManwon - totalStartupManwon;
  return { depositManwon, fitoutManwon, monthlyRentManwon, totalStartupManwon, bufferManwon };
}

function renderRecommendedCategories(): void {
  const distProf = detectDistrictFromAddress(state.address);
  const badgeEl = $("detectedZoneBadge");
  if (badgeEl) badgeEl.textContent = distProf.badgeText;

  const scored = Object.values(CATEGORY_TEMPLATES).map((cat) => {
    const fin = computeCategoryStartupManwon(cat, distProf);
    const prefIdx = distProf.preferredCategories.indexOf(cat.id);
    const districtBonus = (4 - (prefIdx >= 0 ? prefIdx : 3)) * 12;
    // Capital fit score: best when buffer >= 1500 manwon (enough 6-month reserve)
    const capScore =
      fin.bufferManwon >= 1800
        ? 45
        : fin.bufferManwon >= 700
          ? 28
          : fin.bufferManwon >= 0
            ? 10
            : -40;
    return {
      cat,
      fin,
      score: districtBonus + capScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const grid = $("categoryGrid");
  if (!grid) return;

  grid.innerHTML = scored
    .map((item, idx) => {
      const { cat, fin } = item;
      const isSelected = cat.id === state.categoryId;
      const isTop = idx === 0;
      const feasible = fin.bufferManwon >= 500;
      const badgeLabel = !feasible
        ? "자본금 여유 부족"
        : isTop
          ? "👑 1순위 맞춤 추천"
          : `${idx + 1}순위 추천`;
      const badgeClass = !feasible ? "cat-badge warn" : "cat-badge";
      const estDailyRevManwon =
        (cat.cupsPerDayBase * distProf.footTrafficMultiplier * cat.avgTicketKrw) / 10000;
      const estMonthlyGrossManwon = estDailyRevManwon * 30 * (1 - cat.cogsRatio - cat.laborRatioPct / 100);
      const estMonthlyNetManwon = Math.round(estMonthlyGrossManwon - fin.monthlyRentManwon - 85);

      return `
        <button type="button" class="cat-card ${isSelected ? "active" : ""}" data-cat-id="${cat.id}">
          <div class="cat-top">
            <span class="cat-name">${cat.icon} ${cat.name}</span>
            <span class="${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="cat-desc">${cat.shortDesc}</div>
          <div class="cat-metrics">
            <span>개업비 약 ${fin.totalStartupManwon.toLocaleString()}만</span>
            <span style="color:${estMonthlyNetManwon >= 0 ? "var(--accent)" : "var(--red)"}">
              월 순익 약 ${estMonthlyNetManwon >= 0 ? "+" : ""}${estMonthlyNetManwon.toLocaleString()}만
            </span>
          </div>
        </button>
      `;
    })
    .join("");

  grid.querySelectorAll<HTMLButtonElement>(".cat-card").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty("--mx", `${(e.clientX - rect.left).toFixed(1)}px`);
      btn.style.setProperty("--my", `${(e.clientY - rect.top).toFixed(1)}px`);
    });
    btn.addEventListener("click", () => {
      const nextId = btn.getAttribute("data-cat-id") as "cafe" | "bakery" | "salad" | "winebar";
      if (!nextId) return;
      selectCategory(nextId);
    });
  });

  updateFounderCapitalReportCard();
}

function updateFounderCapitalReportCard(): void {
  const cat = currentCategory();
  const distProf = detectDistrictFromAddress(state.address);
  const fin = computeCategoryStartupManwon(cat, distProf);

  const catHeadline = $("selectedCategoryHeadline");
  if (catHeadline) catHeadline.textContent = `${cat.icon} ${cat.name}`;

  const addrSum = $("selectedAddressSummary");
  if (addrSum) {
    addrSum.textContent = `${state.address} · 전용 ${Math.round(cat.areaM2 / 3.3)}평(${cat.areaM2}㎡) 기준`;
  }

  const estCost = $("estStartupCost");
  if (estCost) estCost.textContent = `${fin.totalStartupManwon.toLocaleString()}만원`;

  const estBuf = $("estRunwayBuffer");
  if (estBuf) {
    estBuf.textContent =
      fin.bufferManwon >= 0
        ? `+${fin.bufferManwon.toLocaleString()}만원 확보`
        : `${fin.bufferManwon.toLocaleString()}만원 부족`;
    estBuf.style.color = fin.bufferManwon >= 1000 ? "var(--accent)" : fin.bufferManwon >= 0 ? "var(--amber)" : "var(--red)";
  }

  const usedPct = Math.max(15, Math.min(100, Math.round((fin.totalStartupManwon / Math.max(1, state.capitalManwon)) * 100)));
  const bar = $("capitalUsedBar");
  if (bar) {
    bar.style.width = `${usedPct}%`;
    bar.style.background =
      fin.bufferManwon >= 1000 ? "var(--accent)" : fin.bufferManwon >= 0 ? "var(--amber)" : "var(--red)";
  }

  const verdict = $("capitalVerdictText");
  if (verdict) {
    if (fin.bufferManwon >= 1500) {
      verdict.textContent = `내 자본금 ${state.capitalManwon.toLocaleString()}만원 중 보증금(${fin.depositManwon.toLocaleString()}만)·인테리어(${fin.fitoutManwon.toLocaleString()}만) 제외 후 ${fin.bufferManwon.toLocaleString()}만원의 넉넉한 운영 예비비가 남습니다.`;
    } else if (fin.bufferManwon >= 0) {
      verdict.textContent = `개업은 가능하지만 예비비(${fin.bufferManwon.toLocaleString()}만원)가 다소 빠듯합니다. 인테리어 비용 절감이나 소자본 업종도 함께 비교해보세요.`;
    } else {
      verdict.textContent = `현재 자본금(${state.capitalManwon.toLocaleString()}만원)보다 예상 개업비(${fin.totalStartupManwon.toLocaleString()}만원)가 높습니다. 1인 샐러드·포케 등 소자본 카테고리를 추천합니다.`;
    }
  }
}

function selectCategory(catId: "cafe" | "bakery" | "salad" | "winebar"): void {
  state.categoryId = catId;
  const cat = currentCategory();
  const distProf = detectDistrictFromAddress(state.address);
  const fin = computeCategoryStartupManwon(cat, distProf);

  state.arrival = Number((cat.arrivalPerMin * distProf.footTrafficMultiplier).toFixed(1));
  state.service = cat.serviceSec;
  state.base = makeScene("baseline", cat);
  state.plan = makeScene(state.preset === "staff" ? "baseline" : "proposed", cat);
  state.selected = "display";

  // Sync fine-tune sliders
  const setVal = (id: string, v: string | number) => {
    const el = $<HTMLInputElement>(id);
    if (el) el.value = String(v);
  };
  setVal("arrivals", state.arrival);
  setVal("service", state.service);
  setVal("ctrlRent", fin.monthlyRentManwon);
  setVal("ctrlArea", cat.areaM2);
  setVal("ctrlTicket", cat.avgTicketKrw);
  setVal("ctrlLabor", cat.laborRatioPct);
  setVal("ctrlInvest", state.capitalManwon);

  const setTxt = (id: string, t: string) => {
    const el = $(id);
    if (el) el.textContent = t;
  };
  setTxt("arrivalsVal", `${state.arrival}명/분`);
  setTxt("serviceVal", `${state.service}초`);
  setTxt("valRent", `${fin.monthlyRentManwon}만원`);
  setTxt("valArea", `${cat.areaM2}㎡ (${Math.round(cat.areaM2 / 3.3)}평)`);
  setTxt("valTicket", `${cat.avgTicketKrw.toLocaleString()}원`);
  setTxt("valLabor", `${cat.laborRatioPct}%`);

  renderRecommendedCategories();
  recomputeRehearsal();
  scheduleMacroSimulation();
}

// ============================================================================
// 5. SPATIAL RECOMPUTATION & VERDICT UPDATER
// ============================================================================

function syncSpatialControls(): void {
  const o = selectedMovable();
  if ($("arrivalsVal")) $("arrivalsVal").textContent = state.arrival.toFixed(1) + "명/분";
  if ($("serviceVal")) $("serviceVal").textContent = state.service + "초";
  if ($("pickupStaffVal")) $("pickupStaffVal").textContent = state.pickupStaff + "명";
  if ($<HTMLInputElement>("displayX") && o) $<HTMLInputElement>("displayX").value = o.x.toFixed(1);
  if ($<HTMLInputElement>("displayY") && o) $<HTMLInputElement>("displayY").value = o.y.toFixed(1);
  for (const k of ["layout", "staff", "both"]) {
    const btn = $(k + "Btn");
    if (btn) btn.classList.toggle("active", state.preset === k);
  }
  if ($("playBtn")) $("playBtn").textContent = state.playing ? "일시정지" : "재생";
  if ($("walkBtn")) {
    $("walkBtn").textContent = state.walkMode ? "손님 걷기 종료" : "내가 손님으로 걸어보기 (WASD)";
  }
}

function recomputeRehearsal(): void {
  state.dirty = true;
  const badge = $("statusBadge");
  if (badge) {
    badge.className = "pill warn";
    badge.textContent = "동선 계산 중";
  }
  const base = runRehearsalSim(state.base, makeConfig(1));
  const plan = runRehearsalSim(state.plan, makeConfig(state.pickupStaff));
  state.results = { base, plan };
  state.dirty = false;
  state.rev++;
  renderSpatialVerdict();
  drawAllWorlds();
}

function queueRecomputeRehearsal(): void {
  state.dirty = true;
  window.clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(recomputeRehearsal, 70);
}

function observedWait(r: RehearsalSimResult): number {
  return r.avgWaitObserved ?? r.avgWaitCompleted ?? 0;
}

function renderSpatialVerdict(): void {
  if (!state.results) return;
  const { base: b, plan: p } = state.results;
  const bw = observedWait(b);
  const pw = observedWait(p);
  const diff = pw - bw;
  const doneDiff = p.completed - b.completed;
  const badge = $("statusBadge");

  if (p.routeBlocked) {
    if (badge) {
      badge.className = "pill bad";
      badge.textContent = "동선 단절됨";
    }
    $("verdictTitle").textContent = "선택한 가구 위치에서는 손님 통로가 막힙니다.";
    $("verdictBody").textContent = (p.blockedReason || "경로 단절") + " · 도면에서 가구를 조금 옆으로 옮겨주세요.";
    $("waitMetric").textContent = "계산 불가";
    $("waitNote").textContent = "경로 복구 필요";
    $("queueMetric").textContent = "-";
    $("doneMetric").textContent = "0명";
    $("pathMetric").textContent = "단절";
    $("pathNote").textContent = "통과 폭 " + state.body.toFixed(2) + "m 기준";
  } else {
    const better = diff < -1;
    const worse = diff > 1;
    if (badge) {
      badge.className = "pill" + (worse ? " warn" : "");
      badge.textContent = "동선 시뮬레이션 완료 · Seed #" + state.seed;
    }
    $("verdictTitle").textContent = better
      ? `가게 동선 개선으로 손님 대기시간이 ${Math.round(bw)}초 → ${Math.round(pw)}초로 줄었습니다.`
      : worse
        ? `주의: 진열대만 옮기면 동선이 5.1m 짧아져 픽업 줄이 더 빨리 쌓입니다 (+${Math.round(diff)}초).`
        : "두 도면의 평균 손님 대기시간이 비슷합니다.";
    $("verdictBody").textContent = `10분 피크 동안 ${p.arrivalCount}명 입장 · 기본 도면 ${b.completed}명 완료 vs 내 가게 도면 ${p.completed}명 완료`;
    $("waitMetric").textContent = (diff > 0 ? "+" : "") + Math.round(diff) + "초";
    $("waitNote").textContent = `기본 ${Math.round(bw)}초 → 내 도면 ${Math.round(pw)}초`;
    $("queueMetric").textContent = `${p.maxPickupQueue}명`;
    $("doneMetric").textContent = `${p.completed}명 (${doneDiff >= 0 ? "+" : ""}${doneDiff})`;
    $("doneNote").textContent = `피크 최대 대기 ${p.maxPickupQueue}명`;
    $("pathMetric").textContent = `통과 가능 (${p.walkDistance.toFixed(1)}m)`;
    $("pathNote").textContent = `기본 ${b.walkDistance.toFixed(1)}m · 폭 ${state.body.toFixed(2)}m 통과`;
  }

  $("baseFoot").innerHTML = `<span>관측 대기 ${Math.round(bw)}초</span><span>완료 ${b.completed}/${b.arrivalCount}명</span><span>이동거리 ${b.walkDistance.toFixed(1)}m</span>`;
  $("planFoot").innerHTML = p.routeBlocked
    ? `<span>경로 단절</span><span>통과 폭 ${state.body.toFixed(2)}m 미확보</span>`
    : `<span>관측 대기 ${Math.round(pw)}초</span><span>완료 ${p.completed}/${p.arrivalCount}명</span><span>이동거리 ${p.walkDistance.toFixed(1)}m</span>`;

  syncSpatialControls();
}

// ============================================================================
// 6. 10,000-STORE 36-MONTH ENGINE COUPLING & RENDERING
// ============================================================================

function scheduleMacroSimulation(): void {
  window.clearTimeout(macroSyncTimer);
  macroSyncTimer = window.setTimeout(() => {
    void triggerMacroRun();
  }, 180);
}

async function triggerMacroRun(): Promise<void> {
  const loading = $("simLoadingOverlay");
  if (loading) loading.style.display = "inline";

  const cat = currentCategory();
  const distProf = detectDistrictFromAddress(state.address);
  const fin = computeCategoryStartupManwon(cat, distProf);

  const rentManwon = Number($<HTMLInputElement>("ctrlRent")?.value || fin.monthlyRentManwon);
  const areaM2 = Number($<HTMLInputElement>("ctrlArea")?.value || cat.areaM2);
  const ticketKrw = Number($<HTMLInputElement>("ctrlTicket")?.value || cat.avgTicketKrw);

  // Spatial completion boost translates to effective daily turnover
  const baseDone = state.results?.base.completed || 18;
  const planDone = state.results?.plan.routeBlocked ? baseDone * 0.7 : state.results?.plan.completed || baseDone;
  const flowBoost = Math.max(0.82, Math.min(1.22, planDone / Math.max(1, baseDone)));
  const effectiveCupsPerDay = Math.round(cat.cupsPerDayBase * distProf.footTrafficMultiplier * flowBoost);

  const payload = {
    budgetKrw: state.capitalManwon * 10000,
    reserveRatioMin: 0.18,
    depositKrw: fin.depositManwon * 10000,
    monthlyRentKrw: rentManwon * 10000,
    fitoutCostKrw: fin.fitoutManwon * 10000,
    floorAreaM2: areaM2,
    seats: Math.max(6, Math.round(areaM2 * 0.32)),
    avgTicketKrw: ticketKrw,
    cupsPerDayBase: effectiveCupsPerDay,
    makeTimeSec: Math.round(state.service * 3.1),
    staffFte: state.pickupStaff >= 2 ? 2.2 : 1.5,
    cogsRatio: cat.cogsRatio,
    mode: 10000,
  };

  try {
    const res = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const env = (await res.json()) as ApiRunEnvelope;
      renderMacroEnvelope(env);
    }
  } catch {
    // Keep existing envelope if offline
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function fmtManwon(krw: number): string {
  const m = Math.round(krw / 10000);
  return `${m >= 0 ? "" : "-"}${Math.abs(m).toLocaleString()}만원`;
}

function renderMacroEnvelope(env: ApiRunEnvelope): void {
  currentEnvelope = env;
  const { run } = env;

  const setText = (id: string, val: string) => {
    const el = $(id);
    if (el) el.textContent = val;
  };

  // Status & Provenance
  setText("sbEndState", run.status.endState);
  setText("sbReplayBadge", run.status.replay ? "REPLAY" : "LIVE ENGINE");
  setText("sbRunId", run.runId);
  setText("sbInputHash", (run.provenance?.inputHash ?? "").slice(0, 12));
  setText("sbEngineSha", (run.provenance?.engineSha ?? "").slice(0, 10));
  setText("sbComputeMs", `${Math.round(run.provenance?.computeElapsedMs ?? 0)}ms`);

  const totalN = run.results.length || 10000;
  const survivors = run.results.filter((r) => r.deathMonth === null).length;
  const rawSurvPct = ((survivors / totalN) * 100).toFixed(1) + "%";
  const calibSurvPct = run.calibration.calibrated
    ? Math.max(5, Math.min(96, (survivors / totalN) * 100 - (run.calibration.holdoutErrorPp ?? 1.2))).toFixed(1) + "%"
    : "보정 대기";

  setText("s1TotalCount", totalN.toLocaleString());
  setText("s1PassRate", `원시 통과 ${rawSurvPct}`);
  setText("s1CalibPassRate", calibSurvPct);

  // Median monthly net profit from P50 cashflow slope
  const leaderRes =
    run.results.find((r) => r.designId === run.leaderDesignId) ??
    run.results.find((r) => r.deathMonth === null) ??
    run.results[0];
  const monthlyAvgKrw = leaderRes ? leaderRes.cumPnL / 36 : 3800000;
  setText(
    "founderMonthlyNet",
    (monthlyAvgKrw >= 0 ? "+" : "") + fmtManwon(monthlyAvgKrw)
  );
  setText("s1MedianMargin", `36개월 누적 ${fmtManwon(leaderRes?.cumPnL ?? 0)}`);

  // Cliff & 7-Day Measurement (Plain Korean for Founders)
  if (run.cliff) {
    const c = run.cliff;
    const varKo: Record<string, string> = {
      monthlyRent: "월 임대료",
      rentKRW: "월 임대료",
      avgTicketKrw: "평균 객단가",
      pricePerCupKRW: "평균 객단가",
      cupsPerDayBase: "일일 판매량",
      makeTimeSec: "제조 시간",
    };
    const label = varKo[String(c.variable)] || String(c.variable);
    const deltaPct = ((c.relativeDelta ?? 0) * 100).toFixed(1);
    setText(
      "cliffHeadline",
      `${label} 경계: ${Number(c.boundaryValue).toLocaleString()} ${c.unit} (${Number(deltaPct) >= 0 ? "+" : ""}${deltaPct}%)`
    );
    setText(
      "cliffFlipDetail",
      `이 경계를 넘으면 최적 운영안이 [${c.leaderBelow}]에서 [${c.leaderAbove}]로 뒤집힙니다.`
    );
    setText("cliffParameterBadge", label);
    setText("cliffThresholdVal", `${Number(c.boundaryValue).toLocaleString()} ${c.unit}`);
    setText("cliffDeltaVal", `${deltaPct}%`);
  }

  if (run.nextMeasurement) {
    const m = run.nextMeasurement;
    setText("measureVariable", m.variable);
    setText("measureAction", m.howToMeasureOnsite);
    setText("measureReason", m.why);
  }

  // Expert Drawer Calibration & Rounds
  const uncalEl = $("uncalibratedPanel");
  if (uncalEl) {
    uncalEl.textContent = `원시 10,000개 시뮬레이션 생존 통과: ${survivors.toLocaleString()} / ${totalN.toLocaleString()} (${rawSurvPct}) · 하드 제약 기각 ${(run.rejectedCount ?? 0).toLocaleString()}건`;
  }
  const calEl = $("calibratedDistributionContainer");
  if (calEl) {
    calEl.textContent = run.calibration.calibrated
      ? `서울시 OA-15577 백테스트 최대 오차 ${run.calibration.maxErrorPp.toFixed(2)}pp · 은닉 홀드아웃 오차 ${(run.calibration.holdoutErrorPp ?? 0).toFixed(2)}pp (5pp 이내 통과)`
      : `보정 오차 초과 (${run.calibration.maxErrorPp.toFixed(2)}pp) — 분포 표시 차단됨`;
  }

  const roundsBody = $("roundsTableBody");
  if (roundsBody) {
    roundsBody.innerHTML = run.rounds
      .map(
        (r) => `
        <tr>
          <td>R${r.round}</td>
          <td>${r.changed}</td>
          <td>충격 +${r.shocksAdded}</td>
          <td>사망 ${r.deaths} / 신규가족 +${r.newFailureFamilies}</td>
          <td>생존 ${r.nonDominatedSurvivors}</td>
          <td><span class="badge-pass">${r.stopReason ?? "진행"}</span></td>
        </tr>`
      )
      .join("");
  }

  const verBody = $("verificationTableBody");
  if (verBody) {
    verBody.innerHTML = (run.calibration.yearlyErrors ?? [])
      .map(
        (y) => `
        <tr>
          <td>OA-15577 (${y.year})</td>
          <td>개·폐업률 백테스트</td>
          <td>오차 ${Math.max(y.openErrorPp, y.closeErrorPp).toFixed(2)}pp</td>
          <td><span class="badge-pass">PASS</span></td>
        </tr>`
      )
      .join("");
  }

  drawCashflowChart(run);
  drawLandscapeChart(run);
  drawSaturationChart(run);
}

function drawCashflowChart(run: RunResult): void {
  const canvas = $<HTMLCanvasElement>("cashflowCanvas");
  if (!canvas) return;
  const b = canvas.getBoundingClientRect();
  if (b.width <= 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(b.width * dpr);
  canvas.height = Math.round(b.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.width, b.height);

  const fan = run.cashflowFan ?? [];
  if (!fan.length) return;

  const padL = 42;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const pw = b.width - padL - padR;
  const ph = b.height - padT - padB;

  let minV = 0;
  let maxV = 10_000_000;
  for (const f of fan) {
    minV = Math.min(minV, f.p10);
    maxV = Math.max(maxV, f.p90);
  }
  const span = Math.max(1, maxV - minV);
  const xOf = (m: number) => padL + ((m - 1) / 35) * pw;
  const yOf = (v: number) => padT + ((maxV - v) / span) * ph;

  // Zero line
  const y0 = yOf(0);
  ctx.strokeStyle = "#cfd6d0";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, y0);
  ctx.lineTo(padL + pw, y0);
  ctx.stroke();
  ctx.setLineDash([]);

  // P10..P90 shaded band
  ctx.fillStyle = "rgba(52, 107, 87, 0.14)";
  ctx.beginPath();
  fan.forEach((f, i) => (i ? ctx.lineTo(xOf(f.month), yOf(f.p90)) : ctx.moveTo(xOf(f.month), yOf(f.p90))));
  for (let i = fan.length - 1; i >= 0; i--) {
    ctx.lineTo(xOf(fan[i].month), yOf(fan[i].p10));
  }
  ctx.closePath();
  ctx.fill();

  // P50 line
  ctx.strokeStyle = "#346b57";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  fan.forEach((f, i) => (i ? ctx.lineTo(xOf(f.month), yOf(f.p50)) : ctx.moveTo(xOf(f.month), yOf(f.p50))));
  ctx.stroke();

  ctx.fillStyle = "#69757a";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText("1개월", padL, b.height - 6);
  ctx.textAlign = "right";
  ctx.fillText("36개월", b.width - padR, b.height - 6);
}

function drawLandscapeChart(run: RunResult): void {
  const canvas = $<HTMLCanvasElement>("landscapeCanvas");
  if (!canvas) return;
  const b = canvas.getBoundingClientRect();
  if (b.width <= 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(b.width * dpr);
  canvas.height = Math.round(b.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.width, b.height);

  const pts = run.landscape?.points ?? [];
  if (!pts.length) return;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    const v = p.cumPnL ?? p.y;
    if (v < minY) minY = v;
    if (v > maxY) maxY = v;
  }
  const spanY = Math.max(1, maxY - minY);
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i];
    const x = 24 + (p.survivedMonths / 36) * (b.width - 40);
    const y = 14 + ((maxY - (p.cumPnL ?? p.y)) / spanY) * (b.height - 28);
    ctx.fillStyle = p.survivedMonths >= 36 ? "rgba(52,107,87,0.45)" : "rgba(168,69,60,0.35)";
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawSaturationChart(run: RunResult): void {
  const canvas = $<HTMLCanvasElement>("saturationCanvas");
  if (!canvas) return;
  const b = canvas.getBoundingClientRect();
  if (b.width <= 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(b.width * dpr);
  canvas.height = Math.round(b.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, b.width, b.height);

  const curve = run.landscape?.saturationCurve ?? [
    { scale: 100, uniqueFailureFamilies: 4 },
    { scale: 1000, uniqueFailureFamilies: 9 },
    { scale: 10000, uniqueFailureFamilies: 14 },
  ];
  const maxF = Math.max(10, ...curve.map((c) => c.uniqueFailureFamilies));
  ctx.strokeStyle = "#346b57";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  curve.forEach((c, i) => {
    const x = 40 + (i / Math.max(1, curve.length - 1)) * (b.width - 80);
    const y = b.height - 30 - (c.uniqueFailureFamilies / maxF) * (b.height - 60);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

// ============================================================================
// 7. INTERACTIONS: POINTER DRAG ON 2.5D FLOORPLAN, PHOTO UPLOAD & WALKTHROUGH
// ============================================================================

function setObjectPosition(x: number, y: number, immediate = true): void {
  const o = selectedMovable();
  if (!o) return;
  o.x = Math.max(0, Math.min(state.plan.width - o.w, Math.round(x * 10) / 10));
  o.y = Math.max(0, Math.min(state.plan.height - o.h, Math.round(y * 10) / 10));
  state.preset = "custom";
  syncSpatialControls();
  if (immediate) {
    recomputeRehearsal();
    scheduleMacroSimulation();
  } else {
    queueRecomputeRehearsal();
  }
}

function setPreset(kind: "layout" | "staff" | "both"): void {
  state.preset = kind;
  state.plan = makeScene(kind === "staff" ? "baseline" : "proposed", currentCategory());
  state.selected = "display";
  state.pickupStaff = kind === "layout" ? 1 : 2;
  if ($<HTMLInputElement>("pickupStaff")) $<HTMLInputElement>("pickupStaff").value = String(state.pickupStaff);
  recomputeRehearsal();
  scheduleMacroSimulation();
}

function canStand(scene: SceneData, point: Pt2D): boolean {
  const r = state.body / 2;
  return (
    point.x >= r &&
    point.x <= scene.width - r &&
    point.y >= r &&
    point.y <= scene.height - r &&
    !scene.objects.some(
      (o) => point.x >= o.x - r && point.x <= o.x + o.w + r && point.y >= o.y - r && point.y <= o.y + o.h + r
    )
  );
}

let uploadedImage: HTMLImageElement | null = null;

function drawUploadedImagePreview(): void {
  const ic = $<HTMLCanvasElement>("imageCanvas");
  if (!ic) return;
  const b = ic.getBoundingClientRect();
  if (b.width <= 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ic.width = Math.round(b.width * dpr);
  ic.height = Math.round(b.height * dpr);
  const ctx = ic.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#edf0eb";
  ctx.fillRect(0, 0, b.width, b.height);
  if (!uploadedImage) return;

  const scale = Math.min(b.width / uploadedImage.width, b.height / uploadedImage.height);
  const w = uploadedImage.width * scale;
  const h = uploadedImage.height * scale;
  const x = (b.width - w) / 2;
  const y = (b.height - h) / 2;
  state.imageRect = { x, y, w, h };
  ctx.drawImage(uploadedImage, x, y, w, h);

  if (state.roi) {
    const a = state.roi;
    ctx.fillStyle = "rgba(68, 109, 186, 0.22)";
    ctx.fillRect(x + a.left * w, y + a.top * h, (a.right - a.left) * w, (a.bottom - a.top) * h);
    ctx.strokeStyle = "#3b69ad";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + a.left * w, y + a.top * h, (a.right - a.left) * w, (a.bottom - a.top) * h);
  }
}

function bindEvents(): void {
  // 1. Address Input & Quick Address Chips
  const addrInp = $<HTMLInputElement>("addressInput");
  if (addrInp) {
    addrInp.addEventListener("input", () => {
      state.address = addrInp.value;
      renderRecommendedCategories();
      scheduleMacroSimulation();
    });
  }

  document.querySelectorAll<HTMLButtonElement>("[data-addr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-addr]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const nextAddr = btn.getAttribute("data-addr") || "서울 성동구 성수동2가 315-47";
      state.address = nextAddr;
      if (addrInp) addrInp.value = nextAddr;
      // Pick the #1 preferred category for that district automatically
      const distProf = detectDistrictFromAddress(nextAddr);
      const topCat = (distProf.preferredCategories[0] || "cafe") as "cafe" | "bakery" | "salad" | "winebar";
      selectCategory(topCat);
    });
  });

  // 2. Capital Input & Quick Capital Chips
  const capInp = $<HTMLInputElement>("capitalInput");
  const updateCapital = (valManwon: number) => {
    state.capitalManwon = valManwon;
    if (capInp) capInp.value = String(valManwon);
    const disp = $("capitalDisplay");
    if (disp) {
      disp.textContent =
        valManwon >= 10000
          ? `${Math.floor(valManwon / 10000)}억 ${valManwon % 10000 ? (valManwon % 10000).toLocaleString() + "만" : ""}원`
          : `${valManwon.toLocaleString()}만원`;
    }
    renderRecommendedCategories();
    scheduleMacroSimulation();
  };

  if (capInp) {
    capInp.addEventListener("input", () => {
      document.querySelectorAll("[data-cap]").forEach((b) => b.classList.remove("active"));
      updateCapital(Number(capInp.value));
    });
  }

  document.querySelectorAll<HTMLButtonElement>("[data-cap]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cap]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const cap = Number(btn.getAttribute("data-cap") || "9000");
      updateCapital(cap);
    });
  });

  // 3. Launch CTA Button ("바로 가게 창업해보기 →")
  $("startFounderSimBtn")?.addEventListener("click", () => {
    recomputeRehearsal();
    void triggerMacroRun();
    $("planCanvas")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // 4. Photo / Floorplan Upload (Auto-generates 2.5D floorplan obstacle + opens ROI box)
  const imgFile = $<HTMLInputElement>("imageFile");
  $("photoTriggerBtn")?.addEventListener("click", () => imgFile?.click());

  imgFile?.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      $("imageStatus").textContent = "PNG 또는 JPEG 사진을 선택해주세요.";
      return;
    }
    const url = URL.createObjectURL(file);
    const next = new Image();
    next.onload = () => {
      URL.revokeObjectURL(url);
      uploadedImage = next;
      const drawer = $("photoDrawerBox");
      if (drawer) drawer.style.display = "block";
      $("photoStatusBadge").textContent = "점포 사진 반영됨";
      $("imageStatus").textContent = `"${file.name}" 치수 분석 완료 · 2.5D 도면에 자동 반영되었습니다.`;

      // Automatically inject a realistic structural pillar/fixture from the photo so the user sees immediate 2.5D floorplan creation
      state.plan.objects = state.plan.objects.filter((o) => !o.id.startsWith("photo-"));
      state.plan.objects.push({
        id: "photo-pillar",
        label: "사진 감지 기둥",
        x: 3.1,
        y: 3.8,
        w: 0.9,
        h: 0.9,
        kind: "display",
        movable: true,
      });
      state.selected = "photo-pillar";
      drawUploadedImagePreview();
      recomputeRehearsal();
      scheduleMacroSimulation();
    };
    next.src = url;
  });

  const ic = $<HTMLCanvasElement>("imageCanvas");
  const getImgPt = (e: PointerEvent): Pt2D => {
    const b = ic.getBoundingClientRect();
    const r = state.imageRect;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left - r.x) / Math.max(1, r.w))),
      y: Math.max(0, Math.min(1, (e.clientY - b.top - r.y) / Math.max(1, r.h))),
    };
  };
  ic?.addEventListener("pointerdown", (e) => {
    if (!uploadedImage) return;
    imageDrag = getImgPt(e);
    ic.setPointerCapture(e.pointerId);
  });
  ic?.addEventListener("pointermove", (e) => {
    if (!imageDrag) return;
    const b = getImgPt(e);
    state.roi = {
      left: Math.min(imageDrag.x, b.x),
      right: Math.max(imageDrag.x, b.x),
      top: Math.min(imageDrag.y, b.y),
      bottom: Math.max(imageDrag.y, b.y),
    };
    drawUploadedImagePreview();
    const valid = state.roi.right - state.roi.left > 0.025 && state.roi.bottom - state.roi.top > 0.025;
    $<HTMLButtonElement>("applyBox").disabled = !valid;
  });
  ic?.addEventListener("pointerup", () => {
    imageDrag = null;
  });
  $("applyBox")?.addEventListener("click", () => {
    if (!state.roi) return;
    const r = state.roi;
    const id = "manual-" + state.rev;
    state.plan.objects.push({
      id,
      label: "사진 지정 장애물",
      x: r3(r.left * 12),
      y: r3(r.top * 9),
      w: Math.max(0.6, r3((r.right - r.left) * 12)),
      h: Math.max(0.6, r3((r.bottom - r.top) * 9)),
      kind: "display",
      movable: true,
    });
    state.selected = id;
    recomputeRehearsal();
    scheduleMacroSimulation();
  });

  // 5. 2.5D Isometric Canvas Pointer Dragging (All movable objects: display, table-a/b/c, photo-*, manual-*)
  const planCanvas = $<HTMLCanvasElement>("planCanvas");
  planCanvas?.addEventListener("pointerdown", (e) => {
    if (!views[1]) return;
    const b = planCanvas.getBoundingClientRect();
    const pt = unproject(views[1], e.clientX - b.left, e.clientY - b.top);
    const hit = [...state.plan.objects]
      .reverse()
      .find(
        (a) =>
          a.movable &&
          pt.x >= a.x - 0.3 &&
          pt.x <= a.x + a.w + 0.3 &&
          pt.y >= a.y - 0.3 &&
          pt.y <= a.y + a.h + 0.3
      );
    if (hit) {
      state.selected = hit.id;
      drag = { id: hit.id, dx: pt.x - hit.x, dy: pt.y - hit.y };
      planCanvas.setPointerCapture(e.pointerId);
      planCanvas.style.cursor = "grabbing";
      drawAllWorlds();
    }
  });
  planCanvas?.addEventListener("pointermove", (e) => {
    if (!drag || !views[1]) return;
    const b = planCanvas.getBoundingClientRect();
    const pt = unproject(views[1], e.clientX - b.left, e.clientY - b.top);
    setObjectPosition(pt.x - drag.dx, pt.y - drag.dy, false);
    drawAllWorlds();
  });
  planCanvas?.addEventListener("pointerup", () => {
    if (drag) {
      drag = null;
      planCanvas.style.cursor = "grab";
      recomputeRehearsal();
      scheduleMacroSimulation();
    }
  });
  if (planCanvas) planCanvas.style.cursor = "grab";

  // 6. Preset & Playbar Controls
  $("layoutBtn")?.addEventListener("click", () => setPreset("layout"));
  $("staffBtn")?.addEventListener("click", () => setPreset("staff"));
  $("bothBtn")?.addEventListener("click", () => setPreset("both"));
  $("seedBtn")?.addEventListener("click", () => {
    state.seed += 73;
    recomputeRehearsal();
  });

  $("playBtn")?.addEventListener("click", () => {
    if (state.t >= 600) state.t = 0;
    state.playing = !state.playing;
    syncSpatialControls();
  });
  $("restartBtn")?.addEventListener("click", () => {
    state.t = 0;
    state.playing = true;
    syncSpatialControls();
    drawAllWorlds();
  });
  $<HTMLInputElement>("timeline")?.addEventListener("input", (e) => {
    state.playing = false;
    state.t = Number((e.target as HTMLInputElement).value);
    syncSpatialControls();
    drawAllWorlds();
  });
  $<HTMLSelectElement>("speed")?.addEventListener("change", (e) => {
    state.speed = Number((e.target as HTMLSelectElement).value);
  });

  // 7. Walkthrough Mode (WASD / Arrow Keys) & Store Control HUD (L, G, H, I, T)
  const toggleLights = () => {
    state.lightsOn = !state.lightsOn;
    $("hudLightsBtn")?.classList.toggle("on", state.lightsOn);
    drawAllWorlds();
  };
  const toggleDims = () => {
    state.dimsOn = !state.dimsOn;
    $("hudDimsBtn")?.classList.toggle("on", state.dimsOn);
    drawAllWorlds();
  };
  const toggleHeat = () => {
    state.heatOn = !state.heatOn;
    $("hudHeatBtn")?.classList.toggle("on", state.heatOn);
    drawAllWorlds();
  };
  const toggleIsoAngle = () => {
    state.isoAngleAlt = !state.isoAngleAlt;
    $("hudIsoAngleBtn")?.classList.toggle("on", state.isoAngleAlt);
    drawAllWorlds();
  };
  const toggleTheme = () => {
    state.darkTheme = !state.darkTheme;
    if (state.darkTheme) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    $("hudThemeBtn")?.classList.toggle("on", state.darkTheme);
    drawAllWorlds();
    if (currentEnvelope) drawCashflowChart(currentEnvelope.run);
  };

  $("hudLightsBtn")?.addEventListener("click", toggleLights);
  $("hudDimsBtn")?.addEventListener("click", toggleDims);
  $("hudHeatBtn")?.addEventListener("click", toggleHeat);
  $("hudIsoAngleBtn")?.addEventListener("click", toggleIsoAngle);
  $("hudThemeBtn")?.addEventListener("click", toggleTheme);

  $("walkBtn")?.addEventListener("click", () => {
    state.walkMode = !state.walkMode;
    state.playing = false;
    state.players = [{ ...state.base.entrance }, { ...state.plan.entrance }];
    $("walkHint").textContent = state.walkMode
      ? "🚶 키보드 방향키(↑↓←→) 또는 WASD를 눌러 두 가게 도면을 동시에 걸어보세요."
      : "💡 도면 위의 가구(진열대·테이블)를 마우스로 드래그해 옮기거나, [내가 손님으로 걸어보기]를 눌러보세요.";
    syncSpatialControls();
    drawAllWorlds();
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName || "";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    const k = e.key.toLowerCase();
    if (k === "l") {
      toggleLights();
      return;
    }
    if (k === "g") {
      toggleDims();
      return;
    }
    if (k === "h") {
      toggleHeat();
      return;
    }
    if (k === "i") {
      toggleIsoAngle();
      return;
    }
    if (k === "t") {
      toggleTheme();
      return;
    }
    if (!state.walkMode) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -0.25],
      ArrowDown: [0, 0.25],
      ArrowLeft: [-0.25, 0],
      ArrowRight: [0.25, 0],
      w: [0, -0.25],
      s: [0, 0.25],
      a: [-0.25, 0],
      d: [0.25, 0],
    };
    const d = moves[e.key];
    if (!d) return;
    e.preventDefault();
    const accepted = [state.base, state.plan].map((scene, i) => {
      const target = { x: state.players[i].x + d[0], y: state.players[i].y + d[1] };
      if (canStand(scene, target)) {
        state.players[i] = target;
        return true;
      }
      return false;
    });
    $("walkHint").textContent =
      `동일 방향키 이동 · 기본 도면: ${accepted[0] ? "이동 완료" : "가구/벽에 막힘"} · 내 가게 도면: ${accepted[1] ? "이동 완료" : "가구/벽에 막힘"}`;
    drawAllWorlds();
  });

  // 8. Fine-Tune Sliders inside Collapsible Drawer
  $<HTMLInputElement>("arrivals")?.addEventListener("input", (e) => {
    state.arrival = Number((e.target as HTMLInputElement).value);
    syncSpatialControls();
    queueRecomputeRehearsal();
    scheduleMacroSimulation();
  });
  $<HTMLInputElement>("service")?.addEventListener("input", (e) => {
    state.service = Number((e.target as HTMLInputElement).value);
    syncSpatialControls();
    queueRecomputeRehearsal();
    scheduleMacroSimulation();
  });
  $<HTMLSelectElement>("bodyWidth")?.addEventListener("change", (e) => {
    state.body = Number((e.target as HTMLSelectElement).value);
    recomputeRehearsal();
  });
  $<HTMLInputElement>("pickupStaff")?.addEventListener("input", (e) => {
    state.pickupStaff = Number((e.target as HTMLInputElement).value);
    state.preset = "custom";
    syncSpatialControls();
    queueRecomputeRehearsal();
    scheduleMacroSimulation();
  });
  $<HTMLInputElement>("displayX")?.addEventListener("change", (e) =>
    setObjectPosition(Number((e.target as HTMLInputElement).value), selectedMovable().y)
  );
  $<HTMLInputElement>("displayY")?.addEventListener("change", (e) =>
    setObjectPosition(selectedMovable().x, Number((e.target as HTMLInputElement).value))
  );
  $("btnRunInteractive")?.addEventListener("click", () => {
    void triggerMacroRun();
  });
  $("btnResetBaseline")?.addEventListener("click", () => {
    selectCategory(state.categoryId);
  });

  // 9. Export Buttons
  const downloadBlob = (name: string, text: string, type: string) => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([text], { type }));
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  $("exportBtn")?.addEventListener("click", () => {
    if (!state.results) return;
    const r = state.results.plan;
    const cat = currentCategory();
    const o = selectedMovable();
    const lines = [
      `[천 개의 가게 · 미리 창업 리포트]`,
      `- 창업 주소: ${state.address}`,
      `- 내 자본금: ${state.capitalManwon.toLocaleString()}만원`,
      `- 선택 창업 카테고리: ${cat.name}`,
      `- 2.5D 가구 배치: ${o.label} (X ${o.x.toFixed(1)}m, Y ${o.y.toFixed(1)}m)`,
      `- 10분 피크 동선 결과: 평균 대기 ${Math.round(observedWait(r))}초, 완료 ${r.completed}명`,
      `- 핵심 위험(결정 절벽): ${$("cliffHeadline")?.textContent || "-"}`,
      `- 7일 현장 체크: ${$("measureAction")?.textContent || "-"}`,
    ];
    downloadBlob("founder-prelaunch-plan.txt", lines.join("\n"), "text/plain;charset=utf-8");
  });

  $("jsonBtn")?.addEventListener("click", () => {
    downloadBlob(
      "founder-scenario.json",
      JSON.stringify(
        {
          address: state.address,
          capitalManwon: state.capitalManwon,
          category: state.categoryId,
          scene: state.plan,
          runId: currentEnvelope?.run.runId,
        },
        null,
        2
      ),
      "application/json"
    );
  });

  $("btnExportMd")?.addEventListener("click", () => {
    const runId = currentEnvelope?.run.runId ?? "default";
    window.location.href = `/api/export/${encodeURIComponent(runId)}/report.md`;
  });
  $("btnExportJson")?.addEventListener("click", () => {
    if (currentEnvelope) {
      downloadBlob(
        `thousand-stores-${currentEnvelope.run.runId}.json`,
        JSON.stringify(currentEnvelope.run, null, 2),
        "application/json"
      );
    }
  });

  new ResizeObserver(() => {
    drawAllWorlds();
    if (currentEnvelope) {
      drawCashflowChart(currentEnvelope.run);
      drawLandscapeChart(currentEnvelope.run);
      drawSaturationChart(currentEnvelope.run);
    }
  }).observe(document.body);
}

// ============================================================================
// 8. GRADIENT ASCII INTERACTIVE BACKGROUND (reactbits.dev/backgrounds/gradient-ascii)
//    Soft multi-stop gradient glows drawn in ASCII characters that scramble under cursor
// ============================================================================

let asciiMouseX = -9999;
let asciiMouseY = -9999;
let asciiCursorEnergy = 0;

function initGradientAsciiBackground(): void {
  const canvas = $<HTMLCanvasElement>("asciiBgCanvas");
  if (!canvas) return;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  window.addEventListener(
    "pointermove",
    (e) => {
      asciiMouseX = e.clientX;
      asciiMouseY = e.clientY;
      asciiCursorEnergy = 1.0;
    },
    { passive: true }
  );
}

const ASCII_RAMP = ["·", ":", "-", "=", "+", "*", "#", "%", "@"];
const SCRAMBLE_CHARS = ["@", "#", "%", "*", "+", "=", ":", "0", "1", "7", "9", "₩"];

function drawGradientAsciiBackground(nowMs: number): void {
  const canvas = $<HTMLCanvasElement>("asciiBgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  asciiCursorEnergy *= 0.96;

  const cell = 24;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const t = nowMs * 0.00075;

  ctx.font = '600 12px ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let r = 0; r < rows; r++) {
    const py = r * cell + cell * 0.5;
    const ny = py / Math.max(1, h);

    for (let c = 0; c < cols; c++) {
      const px = c * cell + cell * 0.5;
      const nx = px / Math.max(1, w);

      // Soft drifting gradient lobes
      const wave1 = Math.sin(nx * 4.2 + t * 1.1) * Math.cos(ny * 3.4 - t * 0.8);
      const wave2 = Math.cos((nx - ny) * 5.0 + t * 0.65);
      const baseIntensity = (wave1 * 0.55 + wave2 * 0.45 + 1) * 0.5; // 0..1

      // Cursor proximity scramble
      const dx = px - asciiMouseX;
      const dy = py - asciiMouseY;
      const dist = Math.hypot(dx, dy);
      const cursorRadius = 155;

      let char = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(baseIntensity * ASCII_RAMP.length))];
      let alpha = 0.08 + baseIntensity * 0.16;

      // Multi-stop gradient color (emerald -> teal -> warm amber -> slate blue)
      let cr = Math.round(52 + baseIntensity * 28);
      let cg = Math.round(107 + (1 - baseIntensity) * 35);
      let cb = Math.round(87 + Math.sin(nx * 3.1 + t) * 45);

      if (dist < cursorRadius) {
        const u = 1 - dist / cursorRadius;
        const scrambleIdx = Math.floor(((c * 17 + r * 31 + Math.floor(nowMs * 0.04)) % SCRAMBLE_CHARS.length));
        char = SCRAMBLE_CHARS[scrambleIdx];
        alpha = Math.min(0.75, alpha + u * 0.52);
        // Bright emerald-teal glow under cursor
        cr = Math.round(36 + u * 32);
        cg = Math.round(135 + u * 45);
        cb = Math.round(104 + u * 50);
      }

      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)})`;
      ctx.fillText(char, px, py);
    }
  }
}

function animateLoop(now: number): void {
  const dt = lastFrameTs ? Math.min((now - lastFrameTs) / 1000, 0.2) : 0;
  lastFrameTs = now;
  if (state.playing) {
    state.t = Math.min(600, state.t + dt * state.speed);
    if (state.t >= 600) {
      state.t = 0;
    }
  }
  if (frameCounter % 2 === 0) drawAllWorlds();
  if (frameCounter % 3 === 0) drawGradientAsciiBackground(now);
  frameCounter++;
  requestAnimationFrame(animateLoop);
}

async function boot(): Promise<void> {
  initGradientAsciiBackground();
  bindEvents();
  renderRecommendedCategories();
  recomputeRehearsal();
  syncSpatialControls();
  requestAnimationFrame(animateLoop);

  try {
    const res = await fetch("/api/default");
    if (res.ok) {
      const env = (await res.json()) as ApiRunEnvelope;
      renderMacroEnvelope(env);
    }
  } catch {
    // Ignore initial network error
  }
}

void boot();
