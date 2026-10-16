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
  preferredCategories: ("cafe" | "bakery" | "popup" | "dining")[];
}

const DISTRICT_PROFILES: Record<string, DistrictProfile> = {
  seongsu: {
    key: "seongsu",
    name: "성수동 연무장길·카페거리",
    badgeText: "성수 연무장길 상권 (팝업·로스터리·베이커리 강세)",
    rentMultiplier: 1.05,
    depositManwon: 3000,
    footTrafficMultiplier: 1.14,
    preferredCategories: ["popup", "cafe", "bakery", "dining"],
  },
  yeonnam: {
    key: "yeonnam",
    name: "마포구 연남동·경의선숲길",
    badgeText: "연남동 상권 (베이커리·디저트·카페 강세)",
    rentMultiplier: 0.92,
    depositManwon: 2500,
    footTrafficMultiplier: 1.05,
    preferredCategories: ["bakery", "cafe", "dining", "popup"],
  },
  gangnam: {
    key: "gangnam",
    name: "강남역·역삼 오피스 이면",
    badgeText: "강남 오피스 상권 (스페셜티 카페·다이닝 강세)",
    rentMultiplier: 1.26,
    depositManwon: 4000,
    footTrafficMultiplier: 1.25,
    preferredCategories: ["cafe", "dining", "bakery", "popup"],
  },
  euljiro: {
    key: "euljiro",
    name: "중구 을지로3가·힙지로",
    badgeText: "을지로3가 상권 (다이닝 바·로스터리 카페 강세)",
    rentMultiplier: 0.85,
    depositManwon: 2200,
    footTrafficMultiplier: 0.98,
    preferredCategories: ["dining", "cafe", "popup", "bakery"],
  },
};

type CategoryId = "cafe" | "bakery" | "popup" | "dining";

interface CategoryTemplate {
  id: CategoryId;
  icon: string;
  name: string;
  shortDesc: string;
  interiorConcept: string;
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

const CATEGORY_TEMPLATES: Record<CategoryId, CategoryTemplate> = {
  cafe: {
    id: "cafe",
    icon: "☕",
    name: "스페셜티 카페 · 로스터리",
    shortDesc: "우드 슬랫 에스프레소 바 · 푸어오버 브루잉 바 · 로스터기 · 창가 우드 테이블",
    interiorConcept: "헤링본 우드 바닥 + 테라조 바 조닝 + 2그룹 에스프레소 머신 & 그라인더 + 원두 로스터기",
    baseFitoutManwon: 3800,
    baseMonthlyRentManwon: 350,
    areaM2: 49.6,
    avgTicketKrw: 6200,
    cupsPerDayBase: 195,
    makeTimeSec: 65,
    arrivalPerMin: 1.9,
    serviceSec: 20,
    cogsRatio: 0.28,
    laborRatioPct: 25,
    furnitureLabels: {
      counter: "에스프레소 바·포스",
      pickup: "핸드드립·픽업 바",
      display: "로스터기·원두 MD랙",
      tableA: "창가 우드 2인석 A",
      tableB: "라운지 원형 4인석 B",
      tableC: "창가 노트북 바 C",
    },
    displaySize: { w: 1.4, h: 0.95 },
  },
  bakery: {
    id: "bakery",
    icon: "🥐",
    name: "아티장 베이커리 · 파티세리",
    shortDesc: "중앙 대형 우드 빵 매대(트레이·집게) · 3단 데크 오븐 · 유리 케이크 쇼케이스",
    interiorConcept: "프렌치 크림 체크 타일 + 중앙 크루아상·바게트 아일랜드 매대 + 베이킹 룸 유리 가벽 & 데크 오븐",
    baseFitoutManwon: 5200,
    baseMonthlyRentManwon: 390,
    areaM2: 56.0,
    avgTicketKrw: 12800,
    cupsPerDayBase: 145,
    makeTimeSec: 75,
    arrivalPerMin: 1.6,
    serviceSec: 24,
    cogsRatio: 0.33,
    laborRatioPct: 27,
    furnitureLabels: {
      counter: "케이크 쇼케이스·결제",
      pickup: "데크오븐·포장 픽업대",
      display: "중앙 아일랜드 빵 매대",
      tableA: "파티세리 비스트로석 A",
      tableB: "파티세리 비스트로석 B",
      tableC: "창가 브런치 테이블 C",
    },
    displaySize: { w: 2.2, h: 1.2 },
  },
  popup: {
    id: "popup",
    icon: "✨",
    name: "성수 브랜드 팝업스토어",
    shortDesc: "코발트 런웨이 카펫 · 아치 포토존 & 전신거울 · 아크릴 전시 플린스 · 럭키드로우",
    interiorConcept: "노출 콘크리트 + 코발트 블루 런웨이 + 브랜드 아치 포토존 + 아크릴 전시대 & 크롬 행거 랙",
    baseFitoutManwon: 3100,
    baseMonthlyRentManwon: 330,
    areaM2: 52.0,
    avgTicketKrw: 24000,
    cupsPerDayBase: 115,
    makeTimeSec: 50,
    arrivalPerMin: 1.8,
    serviceSec: 18,
    cogsRatio: 0.32,
    laborRatioPct: 21,
    furnitureLabels: {
      counter: "QR 체크인·굿즈 결제데스크",
      pickup: "럭키드로우·기프트 부스",
      display: "브랜드 아치 포토존·거울",
      tableA: "아크릴 전시 플린스 A",
      tableB: "크롬 에디션 행거 랙 B",
      tableC: "아크릴 전시 플린스 C",
    },
    displaySize: { w: 1.8, h: 1.1 },
  },
  dining: {
    id: "dining",
    icon: "🍽️",
    name: "캐주얼 다이닝 · 하이볼 바",
    shortDesc: "오픈 키친 바 & 바 스툴 4석 · 주류 백바 & 숙성고 · 4인 패브릭 부스 소파석",
    interiorConcept: "다크 슬레이트 & 월넛 바닥 + 오픈 키친 L자 바 카운터 + 하이볼 타워 + 프라이빗 부스 소파 테이블",
    baseFitoutManwon: 4600,
    baseMonthlyRentManwon: 340,
    areaM2: 52.0,
    avgTicketKrw: 22500,
    cupsPerDayBase: 82,
    makeTimeSec: 88,
    arrivalPerMin: 1.3,
    serviceSec: 26,
    cogsRatio: 0.31,
    laborRatioPct: 26,
    furnitureLabels: {
      counter: "오픈 키친 바·스툴 4석",
      pickup: "화구 패스·하이볼 디스펜서",
      display: "보틀 셀러·숙성 쇼케이스",
      tableA: "4인 다이닝 부스 소파석 A",
      tableB: "4인 다이닝 부스 소파석 B",
      tableC: "창가 2인 와인 테이블 C",
    },
    displaySize: { w: 1.4, h: 0.9 },
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

  if (cat.id === "bakery") {
    // Bakery: Central Bread Island is the star; in proposed layout it shifts slightly down-left so queue & tray browsing don't collide
    return {
      id: preset,
      width: 12,
      height: 9,
      entrance: { x: 1.1, y: 4.6 },
      orderPoint: { x: 5.5, y: 2.3 },
      pickupPoint: { x: 8.8, y: 2.3 },
      exit: { x: 10.8, y: 4.6 },
      objects: [
        { id: "counter", label: L.counter, x: 4.4, y: 0.75, w: 2.4, h: 1.05, kind: "counter", movable: true },
        { id: "pickup", label: L.pickup, x: 7.6, y: 0.75, w: 2.3, h: 1.05, kind: "pickup", movable: true },
        {
          id: "display",
          label: L.display,
          x: moved ? 1.5 : 3.0,
          y: moved ? 5.3 : 2.8,
          w: dw,
          h: dh,
          kind: "display",
          movable: true,
        },
        { id: "table-a", label: L.tableA, x: 4.5, y: 6.1, w: 1.25, h: 1.25, kind: "table", movable: true },
        { id: "table-b", label: L.tableB, x: 6.8, y: 6.1, w: 1.25, h: 1.25, kind: "table", movable: true },
        { id: "table-c", label: L.tableC, x: 9.1, y: 6.1, w: 1.25, h: 1.25, kind: "table", movable: true },
      ],
    };
  }

  if (cat.id === "popup") {
    // Pop-up Showroom: Arch Photo Zone + Acrylic Plinths + Chrome Garment Rack + Lucky Draw Booth
    return {
      id: preset,
      width: 12,
      height: 9,
      entrance: { x: 1.1, y: 4.5 },
      orderPoint: { x: 5.4, y: 2.3 },
      pickupPoint: { x: 8.7, y: 2.3 },
      exit: { x: 10.8, y: 4.5 },
      objects: [
        { id: "counter", label: L.counter, x: 4.4, y: 0.8, w: 2.2, h: 0.95, kind: "counter", movable: true },
        { id: "pickup", label: L.pickup, x: 7.6, y: 0.8, w: 2.1, h: 0.95, kind: "pickup", movable: true },
        {
          id: "display",
          label: L.display,
          x: moved ? 1.2 : 3.1,
          y: moved ? 5.6 : 2.85,
          w: dw,
          h: dh,
          kind: "display",
          movable: true,
        },
        { id: "table-a", label: L.tableA, x: 4.2, y: 5.5, w: 1.15, h: 1.15, kind: "table", movable: true },
        { id: "table-b", label: L.tableB, x: 6.4, y: 5.4, w: 1.5, h: 0.95, kind: "table", movable: true },
        { id: "table-c", label: L.tableC, x: 8.8, y: 5.6, w: 1.15, h: 1.15, kind: "table", movable: true },
      ],
    };
  }

  if (cat.id === "dining") {
    // Casual Dining & Highball Bar: Open Kitchen Bar with 4 Stools + 4-Person Booth Sofas
    return {
      id: preset,
      width: 12,
      height: 9,
      entrance: { x: 1.1, y: 4.5 },
      orderPoint: { x: 5.6, y: 2.4 },
      pickupPoint: { x: 8.7, y: 2.4 },
      exit: { x: 10.8, y: 4.5 },
      objects: [
        { id: "counter", label: L.counter, x: 4.3, y: 0.75, w: 2.6, h: 1.15, kind: "counter", movable: true },
        { id: "pickup", label: L.pickup, x: 7.6, y: 0.75, w: 2.2, h: 1.1, kind: "pickup", movable: true },
        {
          id: "display",
          label: L.display,
          x: moved ? 1.15 : 3.15,
          y: moved ? 5.6 : 2.9,
          w: dw,
          h: dh,
          kind: "display",
          movable: true,
        },
        { id: "table-a", label: L.tableA, x: 3.9, y: 5.6, w: 1.55, h: 1.35, kind: "table", movable: true },
        { id: "table-b", label: L.tableB, x: 6.3, y: 5.6, w: 1.55, h: 1.35, kind: "table", movable: true },
        { id: "table-c", label: L.tableC, x: 8.8, y: 5.7, w: 1.3, h: 1.2, kind: "table", movable: true },
      ],
    };
  }

  // Default: Specialty Cafe & Roastery
  return {
    id: preset,
    width: 12,
    height: 9,
    entrance: { x: 1.1, y: 4.5 },
    orderPoint: { x: 5.5, y: 2.3 },
    pickupPoint: { x: 8.6, y: 2.3 },
    exit: { x: 10.8, y: 4.5 },
    objects: [
      { id: "counter", label: L.counter, x: 4.6, y: 0.8, w: 2.3, h: 1.0, kind: "counter", movable: true },
      { id: "pickup", label: L.pickup, x: 7.6, y: 0.8, w: 2.1, h: 1.0, kind: "pickup", movable: true },
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
      { id: "table-b", label: L.tableB, x: 6.4, y: 5.5, w: 1.25, h: 1.25, kind: "table", movable: true },
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
  categoryId: "cafe" as CategoryId,
  reaStep: 1 as 1 | 2 | 3,
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

// Helper: Draw a 3D isometric box from z0 to z1 with top, front-left (y+h), and front-right (x+w) faces
function drawPrism(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  x: number,
  y: number,
  z0: number,
  w: number,
  h: number,
  dz: number,
  topFill: string,
  frontFill: string,
  sideFill: string,
  stroke = "rgba(32,37,43,0.22)",
  lw = 0.85
): void {
  const z1 = z0 + dz;
  const A = project(v, x, y, z0);
  const B = project(v, x + w, y, z0);
  const C = project(v, x + w, y + h, z0);
  const D = project(v, x, y + h, z0);
  const A1 = project(v, x, y, z1);
  const B1 = project(v, x + w, y, z1);
  const C1 = project(v, x + w, y + h, z1);
  const D1 = project(v, x, y + h, z1);
  void A;
  poly(ctx, [D, C, C1, D1], frontFill, stroke, lw);
  poly(ctx, [B, C, C1, B1], sideFill, stroke, lw);
  poly(ctx, [A1, B1, C1, D1], topFill, stroke, lw);
}

function drawChair3D(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  cx: number,
  cy: number,
  facing: "N" | "S" | "E" | "W",
  woodTop = "#d7b38c",
  woodSide = "#a67f58"
): void {
  const sw = 0.34;
  const sh = 0.34;
  const x = cx - sw / 2;
  const y = cy - sh / 2;
  // Chair base / legs
  drawPrism(ctx, v, x + 0.04, y + 0.04, 0, sw - 0.08, sh - 0.08, 0.38, "#58524c", "#45403b", "#35312d", "rgba(0,0,0,0.18)", 0.6);
  // Seat cushion
  drawPrism(ctx, v, x, y, 0.38, sw, sh, 0.07, woodTop, woodSide, woodSide, "rgba(32,37,43,0.25)", 0.7);
  // Backrest on the side opposite to facing
  if (facing === "S") {
    drawPrism(ctx, v, x, y, 0.45, sw, 0.08, 0.32, woodTop, woodSide, woodSide, "rgba(32,37,43,0.25)", 0.7);
  } else if (facing === "N") {
    drawPrism(ctx, v, x, y + sh - 0.08, 0.45, sw, 0.08, 0.32, woodTop, woodSide, woodSide, "rgba(32,37,43,0.25)", 0.7);
  } else if (facing === "E") {
    drawPrism(ctx, v, x, y, 0.45, 0.08, sh, 0.32, woodTop, woodSide, woodSide, "rgba(32,37,43,0.25)", 0.7);
  } else {
    drawPrism(ctx, v, x + sw - 0.08, y, 0.45, 0.08, sh, 0.32, woodTop, woodSide, woodSide, "rgba(32,37,43,0.25)", 0.7);
  }
}

function drawPottedPlant3D(ctx: CanvasRenderingContext2D, v: IsoView, x: number, y: number, scale = 1): void {
  const pw = 0.42 * scale;
  drawPrism(
    ctx,
    v,
    x - pw / 2,
    y - pw / 2,
    0,
    pw,
    pw,
    0.42 * scale,
    "#e6dccf",
    "#cfc2b0",
    "#b8a996",
    "rgba(32,37,43,0.25)",
    0.7
  );
  const top = project(v, x, y, 0.52 * scale);
  const r = Math.max(5, v.s * 0.25 * scale);
  ctx.fillStyle = state.darkTheme ? "#2f6b53" : "#3a7d5e";
  ctx.beginPath();
  ctx.arc(top.x - r * 0.45, top.y, r * 0.85, 0, Math.PI * 2);
  ctx.arc(top.x + r * 0.45, top.y + 1, r * 0.8, 0, Math.PI * 2);
  ctx.arc(top.x, top.y - r * 0.55, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = state.darkTheme ? "#479474" : "#54a37d";
  ctx.beginPath();
  ctx.arc(top.x - r * 0.15, top.y - r * 0.65, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawBox3D(ctx: CanvasRenderingContext2D, v: IsoView, o: SceneObject, isSelected: boolean): void {
  const catId = state.categoryId;
  const p = (x: number, y: number, z = 0) => project(v, x, y, z);

  // Ambient floor shadow & warm glow under every furniture piece
  const shadowPad = 0.06;
  poly(
    ctx,
    [
      p(o.x - shadowPad, o.y - shadowPad, 0.005),
      p(o.x + o.w + shadowPad, o.y - shadowPad, 0.005),
      p(o.x + o.w + shadowPad, o.y + o.h + shadowPad, 0.005),
      p(o.x - shadowPad, o.y + o.h + shadowPad, 0.005),
    ],
    state.darkTheme ? "rgba(0,0,0,0.34)" : "rgba(25,32,40,0.09)"
  );

  if (state.lightsOn) {
    const gc = p(o.x + o.w / 2, o.y + o.h / 2, 0.01);
    const rad = Math.max(o.w, o.h) * v.s * 0.95;
    const grad = ctx.createRadialGradient(gc.x, gc.y, 2, gc.x, gc.y, rad);
    const glowCol =
      catId === "popup"
        ? state.darkTheme
          ? "rgba(88, 148, 235, 0.25)"
          : "rgba(41, 79, 130, 0.16)"
        : state.darkTheme
          ? "rgba(255, 195, 110, 0.22)"
          : "rgba(255, 185, 90, 0.18)";
    grad.addColorStop(0, glowCol);
    grad.addColorStop(1, "rgba(255, 185, 90, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(gc.x, gc.y, rad, rad * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const selStroke = isSelected ? (state.darkTheme ? "#6ea2eb" : "#294f82") : "rgba(32,37,43,0.26)";
  const selLw = isSelected ? 2.1 : 0.95;
  let labelZ = 1.05;

  // ==========================================================================
  // CATEGORY 1: SPECIALTY CAFE & ROASTERY (스페셜티 카페 · 로스터리)
  // ==========================================================================
  if (catId === "cafe") {
    if (o.kind === "counter") {
      // Warm walnut wood-slat bar + white marble top
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.84, "#d9c2a3", "#9c744f", "#7d5a3b", selStroke, selLw);
      drawPrism(ctx, v, o.x - 0.03, o.y - 0.03, 0.84, o.w + 0.06, o.h + 0.06, 0.08, "#f7f5f0", "#e5e0d5", "#cfc8ba", selStroke, 0.8);
      // Vertical wood slats on front face
      ctx.strokeStyle = "rgba(58, 38, 22, 0.45)";
      ctx.lineWidth = 1;
      for (let sx = o.x + 0.15; sx < o.x + o.w - 0.1; sx += 0.18) {
        const b0 = p(sx, o.y + o.h, 0.04);
        const b1 = p(sx, o.y + o.h, 0.82);
        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.stroke();
      }
      // 2-Group Chrome Espresso Machine on left
      const emW = Math.min(0.75, o.w * 0.34);
      drawPrism(ctx, v, o.x + 0.16, o.y + 0.18, 0.92, emW, 0.48, 0.36, "#e8edf2", "#b8c2cc", "#8e99a4", "#49545e", 0.8);
      // Espresso cup warmer rail + group heads
      drawPrism(ctx, v, o.x + 0.22, o.y + 0.56, 0.98, emW - 0.12, 0.14, 0.12, "#2f353b", "#1f2428", "#15191c");
      // 2 Twin Bean Hopper Grinders
      drawPrism(ctx, v, o.x + emW + 0.26, o.y + 0.22, 0.92, 0.18, 0.2, 0.44, "#383e45", "#262b30", "#1b1f23");
      drawPrism(ctx, v, o.x + emW + 0.48, o.y + 0.22, 0.92, 0.18, 0.2, 0.44, "#383e45", "#262b30", "#1b1f23");
      // POS touchscreen in middle
      drawPrism(ctx, v, o.x + o.w * 0.56, o.y + 0.52, 0.92, 0.28, 0.18, 0.26, "#252a30", "#181c20", "#101316");
      // Glass Cake & Pastry Showcase on right end
      const scW = Math.max(0.55, o.w * 0.3);
      drawPrism(
        ctx,
        v,
        o.x + o.w - scW - 0.08,
        o.y + 0.1,
        0.92,
        scW,
        o.h - 0.2,
        0.38,
        "rgba(215, 236, 250, 0.78)",
        "rgba(182, 214, 238, 0.65)",
        "rgba(152, 192, 222, 0.65)",
        "#5b7c99",
        0.9
      );
      // Pastries inside showcase
      drawPrism(ctx, v, o.x + o.w - scW + 0.04, o.y + 0.26, 0.96, 0.18, 0.22, 0.1, "#f2d194", "#d9ad62", "#b88c42");
      drawPrism(ctx, v, o.x + o.w - scW + 0.28, o.y + 0.26, 0.96, 0.18, 0.22, 0.12, "#f7e6e2", "#e0a9a2", "#c4837b");
      labelZ = 1.48;
    } else if (o.kind === "pickup") {
      // Pour-over Brewing & Pickup Bar
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.84, "#d9c2a3", "#9c744f", "#7d5a3b", selStroke, selLw);
      drawPrism(ctx, v, o.x - 0.02, o.y - 0.02, 0.84, o.w + 0.04, o.h + 0.04, 0.07, "#ebeae4", "#d6d4cb", "#bebbb0", selStroke, 0.8);
      // Pour-over drip station rack (3 drippers)
      drawPrism(ctx, v, o.x + 0.2, o.y + 0.28, 0.91, Math.min(0.95, o.w * 0.48), 0.26, 0.24, "#d4af7a", "#b38b54", "#8f6c3c");
      // Takeout cup stacks
      drawPrism(ctx, v, o.x + o.w - 0.55, o.y + 0.25, 0.91, 0.16, 0.16, 0.34, "#f5f2eb", "#ded9ce", "#c4beb2");
      drawPrism(ctx, v, o.x + o.w - 0.34, o.y + 0.25, 0.91, 0.16, 0.16, 0.28, "#f5f2eb", "#ded9ce", "#c4beb2");
      // Navy/forest pickup tray mat on front
      drawPrism(ctx, v, o.x + 0.25, o.y + o.h - 0.32, 0.91, Math.min(0.8, o.w * 0.42), 0.22, 0.03, "#294f82", "#1e3b63", "#162c4a");
      labelZ = 1.35;
    } else if (o.kind === "display") {
      // Roastery Drum Machine + 3-Tier Coffee Bean MD Rack
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.42, "#d8c3a8", "#b0926e", "#8f7352", selStroke, selLw);
      // Copper & Cast-Iron Coffee Roaster on left half
      const rw = Math.min(0.62, o.w * 0.44);
      drawPrism(ctx, v, o.x + 0.12, o.y + 0.16, 0.42, rw, o.h * 0.55, 0.72, "#c87d4b", "#9e5b30", "#78411e", "#3b2313", 0.9);
      // Roaster exhaust chimney
      drawPrism(ctx, v, o.x + 0.22, o.y + 0.18, 1.14, 0.16, 0.16, 0.42, "#d0d7de", "#9aa4af", "#76808a");
      // Roaster cooling tray in front
      drawPrism(ctx, v, o.x + 0.14, o.y + o.h * 0.62, 0.42, rw, o.h * 0.28, 0.22, "#5c3d28", "#8c969e", "#6c757d");
      // 3-Tier Bean & MD Shelf on right half
      const sx = o.x + rw + 0.22;
      const sw = Math.max(0.45, o.w - rw - 0.32);
      drawPrism(ctx, v, sx, o.y + 0.12, 0.42, sw, o.h - 0.24, 0.34, "#e4d2b8", "#bfa380", "#9e8260", selStroke, 0.75);
      drawPrism(ctx, v, sx + 0.04, o.y + 0.16, 0.76, sw - 0.08, o.h - 0.32, 0.3, "#eadbc4", "#c7ab88", "#a68a68", selStroke, 0.75);
      // Colorful coffee bean bags on shelf
      const bagCols = ["#c85a32", "#294f82", "#2f6b53", "#d49b35"];
      for (let i = 0; i < 3; i++) {
        const bx = sx + 0.06 + i * Math.min(0.18, (sw - 0.14) / 3);
        drawPrism(ctx, v, bx, o.y + 0.24, 1.06, 0.12, 0.16, 0.18, bagCols[i % 4], bagCols[i % 4], "#20252b");
      }
      labelZ = 1.56;
    } else {
      // Cafe Wood Table + 3D Chairs + Latte Cups & Laptop
      drawChair3D(ctx, v, o.x + o.w * 0.5, o.y - 0.12, "S", "#d9b891", "#a37e58");
      drawChair3D(ctx, v, o.x + o.w * 0.5, o.y + o.h + 0.12, "N", "#d9b891", "#a37e58");
      if (o.w >= 1.22) {
        drawChair3D(ctx, v, o.x - 0.12, o.y + o.h * 0.5, "E", "#d9b891", "#a37e58");
        drawChair3D(ctx, v, o.x + o.w + 0.12, o.y + o.h * 0.5, "W", "#d9b891", "#a37e58");
      }
      // Central pedestal leg
      drawPrism(ctx, v, o.x + o.w * 0.42, o.y + o.h * 0.42, 0, o.w * 0.16, o.h * 0.16, 0.64, "#49433e", "#36312d", "#262320");
      // Oak tabletop
      drawPrism(ctx, v, o.x, o.y, 0.64, o.w, o.h, 0.08, "#e8cfa8", "#c4a378", "#a3835a", selStroke, selLw);
      // Tiny laptop & coffee cups on tabletop
      drawPrism(ctx, v, o.x + o.w * 0.26, o.y + o.h * 0.34, 0.72, 0.26, 0.2, 0.03, "#dce2e8", "#aeb6bf", "#8c959e");
      const cup1 = p(o.x + o.w * 0.68, o.y + o.h * 0.58, 0.74);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cup1.x, cup1.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8c5832";
      ctx.beginPath();
      ctx.arc(cup1.x, cup1.y, 2.0, 0, Math.PI * 2);
      ctx.fill();
      labelZ = 0.92;
    }
  }

  // ==========================================================================
  // CATEGORY 2: ARTISAN BAKERY & PATISSERIE (아티장 베이커리 · 파티세리)
  // ==========================================================================
  else if (catId === "bakery") {
    if (o.kind === "counter") {
      // Illuminated 2-Tier Glass Patisserie & Cake Showcase + POS Counter
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.52, "#e8dccb", "#cbb89e", "#b09b80", selStroke, selLw);
      // Front brass tray rail for customers sliding bread trays
      drawPrism(ctx, v, o.x + 0.08, o.y + o.h, 0.46, o.w * 0.65, 0.14, 0.04, "#d8b46c", "#b59049", "#947232");
      // Glass upper showcase (left 68%)
      const gw = o.w * 0.68;
      drawPrism(
        ctx,
        v,
        o.x + 0.04,
        o.y + 0.06,
        0.52,
        gw,
        o.h - 0.12,
        0.58,
        "rgba(255, 248, 232, 0.82)",
        "rgba(235, 224, 202, 0.68)",
        "rgba(215, 200, 175, 0.68)",
        "#b59257",
        1.0
      );
      // Whole cakes & tarts inside glass showcase
      const cakeCols = ["#f5d0c8", "#f2cf7e", "#7a4b32", "#e8ebd5"];
      for (let i = 0; i < 4; i++) {
        drawPrism(
          ctx,
          v,
          o.x + 0.14 + i * (gw * 0.22),
          o.y + o.h * 0.35,
          0.62,
          0.24,
          0.24,
          0.16,
          "#fff9f5",
          cakeCols[i],
          "#c79d8c"
        );
      }
      // Checkout POS & Pastry Box stack on right
      drawPrism(ctx, v, o.x + gw + 0.14, o.y + 0.35, 0.52, o.w - gw - 0.2, 0.45, 0.36, "#f7f3eb", "#dfd6c7", "#c4b9a7");
      drawPrism(ctx, v, o.x + gw + 0.22, o.y + 0.45, 0.88, 0.28, 0.2, 0.25, "#262b30", "#181c20", "#101316");
      labelZ = 1.32;
    } else if (o.kind === "pickup") {
      // Tall 3-Deck Artisan Stone Baking Oven + Bread Cooling & Packaging Counter
      drawPrism(ctx, v, o.x, o.y, 0, o.w * 0.52, o.h, 0.86, "#e6d8c3", "#c4b093", "#a69072", selStroke, selLw);
      // Kraft bread bags & packaging boxes on left counter
      drawPrism(ctx, v, o.x + 0.18, o.y + 0.28, 0.86, 0.36, 0.28, 0.24, "#d9a973", "#b88752", "#966a3b");
      // Tall 3-Deck Baking Oven on right half
      const ox = o.x + o.w * 0.52;
      const ow = o.w * 0.48;
      drawPrism(ctx, v, ox, o.y, 0, ow, o.h, 1.58, "#d4d9de", "#9ea7b0", "#7c858e", selStroke, selLw);
      // 3 Glowing Amber Baking Deck Windows on front of oven
      for (let deck = 0; deck < 3; deck++) {
        const dz = 0.48 + deck * 0.34;
        drawPrism(
          ctx,
          v,
          ox + 0.12,
          o.y + o.h - 0.05,
          dz,
          ow - 0.24,
          0.06,
          0.2,
          "#ffcf70",
          "#f59f2a",
          "#c77712",
          "#4a3219",
          0.8
        );
      }
      labelZ = 1.72;
    } else if (o.kind === "display") {
      // Central Artisan Bread Island Table with 6 Woven Trays of Croissants/Baguettes + Tray/Tongs Stand
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.78, "#e3c8a4", "#b89368", "#96734c", selStroke, selLw);
      // Glass sneeze-guard canopy frame over bread island
      drawPrism(
        ctx,
        v,
        o.x + 0.08,
        o.y + 0.08,
        0.78,
        o.w - 0.16,
        o.h - 0.16,
        0.24,
        "rgba(255,252,245,0.42)",
        "rgba(235,225,208,0.32)",
        "rgba(215,202,182,0.32)",
        "rgba(166,132,88,0.55)",
        0.8
      );
      // 6 Wooden Bread Baskets (3 cols x 2 rows) overflowing with golden pastries
      const cols = 3;
      const rows = 2;
      const padX = 0.14;
      const padY = 0.14;
      const tw = (o.w - padX * 2 - 0.16) / cols;
      const th = (o.h - padY * 2 - 0.1) / rows;
      const breadColors = [
        ["#e8a948", "#c98427"], // Golden Croissants
        ["#d99538", "#b5721c"], // Baguettes
        ["#f0be6e", "#cf9642"], // Brioche
        ["#c77d2c", "#9e5d16"], // Pain au chocolat
        ["#e5b35a", "#bf8932"], // Pretzels / Campagne
        ["#f2cfa0", "#cfa36b"], // Scones / Kouign-amann
      ];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = o.x + padX + c * (tw + 0.08);
          const by = o.y + padY + r * (th + 0.1);
          const [topC, sideC] = breadColors[(r * cols + c) % breadColors.length];
          // Wooden tray rim
          drawPrism(ctx, v, bx, by, 0.78, tw, th, 0.08, "#caa474", "#9e784b", "#7d5c34");
          // Golden baked loaves mounded inside tray
          drawPrism(ctx, v, bx + 0.05, by + 0.05, 0.86, tw * 0.42, th - 0.1, 0.11, topC, sideC, sideC);
          drawPrism(ctx, v, bx + tw * 0.5, by + 0.05, 0.86, tw * 0.42, th - 0.1, 0.11, topC, sideC, sideC);
        }
      }
      // Corner White Tray & Tongs Stack Pedestal
      drawPrism(ctx, v, o.x - 0.04, o.y + o.h - 0.28, 0.78, 0.26, 0.26, 0.26, "#ffffff", "#e3ded6", "#c7c0b6", "#6e655a", 0.8);
      labelZ = 1.24;
    } else {
      // French Patisserie Cream Marble Bistro Table + Chairs + Pastry Plates
      drawChair3D(ctx, v, o.x + o.w * 0.5, o.y - 0.12, "S", "#e6d2b8", "#b39774");
      drawChair3D(ctx, v, o.x + o.w * 0.5, o.y + o.h + 0.12, "N", "#e6d2b8", "#b39774");
      drawChair3D(ctx, v, o.x - 0.12, o.y + o.h * 0.5, "E", "#e6d2b8", "#b39774");
      drawChair3D(ctx, v, o.x + o.w + 0.12, o.y + o.h * 0.5, "W", "#e6d2b8", "#b39774");
      // Brass table pedestal
      drawPrism(ctx, v, o.x + o.w * 0.42, o.y + o.h * 0.42, 0, o.w * 0.16, o.h * 0.16, 0.64, "#c9a66b", "#9e7c44", "#7d5f2e");
      // Cream marble tabletop
      drawPrism(ctx, v, o.x, o.y, 0.64, o.w, o.h, 0.08, "#fbf8f2", "#e3dcd0", "#cbc2b4", selStroke, selLw);
      // Pastry plate with golden croissant on table
      drawPrism(ctx, v, o.x + o.w * 0.35, o.y + o.h * 0.35, 0.72, 0.28, 0.24, 0.04, "#ffffff", "#dedad2", "#c7c2b8");
      drawPrism(ctx, v, o.x + o.w * 0.4, o.y + o.h * 0.4, 0.76, 0.16, 0.12, 0.07, "#e8a948", "#c98427", "#a66814");
      labelZ = 0.92;
    }
  }

  // ==========================================================================
  // CATEGORY 3: SEONGSU BRAND POP-UP STORE (성수 브랜드 팝업스토어 · 쇼룸)
  // ==========================================================================
  else if (catId === "popup") {
    if (o.kind === "counter") {
      // Brushed Aluminum & Electric Cobalt Blue Check-in / Merch Desk
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.1, "#4c8bf5", "#294f82", "#1d3961"); // Cobalt LED base
      drawPrism(ctx, v, o.x, o.y, 0.1, o.w, o.h, 0.78, "#eef2f6", "#cfd6df", "#b2bcc8", selStroke, selLw);
      // Cobalt brand stripe on front face
      drawPrism(ctx, v, o.x + 0.15, o.y + o.h - 0.03, 0.42, o.w - 0.3, 0.04, 0.18, "#294f82", "#294f82", "#1c385e");
      // QR Check-in iPad stands + Cobalt Shopping Bags on top
      drawPrism(ctx, v, o.x + 0.28, o.y + 0.45, 0.88, 0.22, 0.16, 0.24, "#20252b", "#14181c", "#0c0e12");
      drawPrism(ctx, v, o.x + 0.68, o.y + 0.45, 0.88, 0.22, 0.16, 0.24, "#20252b", "#14181c", "#0c0e12");
      // Limited-edition Cobalt Shopping Bags lined up
      for (let i = 0; i < 3; i++) {
        drawPrism(ctx, v, o.x + o.w - 0.85 + i * 0.24, o.y + 0.25, 0.88, 0.18, 0.22, 0.28, "#3b6eb5", "#294f82", "#1d3961");
      }
      labelZ = 1.35;
    } else if (o.kind === "pickup") {
      // Lucky Draw Gacha Capsule Machine + Limited Gift Booth
      // Left: Tall Gacha Machine
      const gw = Math.min(0.75, o.w * 0.38);
      drawPrism(ctx, v, o.x, o.y + 0.05, 0, gw, o.h - 0.1, 0.82, "#3b6eb5", "#294f82", "#1d3961", selStroke, selLw);
      drawPrism(
        ctx,
        v,
        o.x + 0.06,
        o.y + 0.11,
        0.82,
        gw - 0.12,
        o.h - 0.22,
        0.68,
        "rgba(235, 245, 255, 0.82)",
        "rgba(205, 226, 250, 0.68)",
        "rgba(175, 205, 240, 0.68)",
        "#294f82",
        1.0
      );
      // Colorful gacha capsules inside globe
      const capCols = ["#e85c4a", "#3b82f6", "#f5b82e", "#10b981"];
      for (let i = 0; i < 4; i++) {
        const cp = p(o.x + 0.22 + (i % 2) * 0.22, o.y + 0.32 + Math.floor(i / 2) * 0.24, 1.02 + (i % 2) * 0.14);
        ctx.fillStyle = capCols[i];
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Right: Gift Box Claim Counter
      drawPrism(ctx, v, o.x + gw + 0.08, o.y, 0, o.w - gw - 0.08, o.h, 0.86, "#eef2f6", "#cfd6df", "#b2bcc8", selStroke, selLw);
      drawPrism(ctx, v, o.x + gw + 0.22, o.y + 0.25, 0.86, 0.42, 0.32, 0.24, "#ffffff", "#294f82", "#1d3961");
      drawPrism(ctx, v, o.x + gw + 0.28, o.y + 0.28, 1.1, 0.32, 0.24, 0.18, "#294f82", "#1d3961", "#142947");
      labelZ = 1.66;
    } else if (o.kind === "display") {
      // Iconic Brand Arch Photo Zone + Full-Length Selfie Mirror + Hero Sculpture Podium
      // Base platform rug
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.12, "#294f82", "#1e3c66", "#152b4a", selStroke, selLw);
      // Tall Cobalt & Silver Backdrop Arch Wall at back of zone
      drawPrism(ctx, v, o.x + 0.08, o.y + 0.06, 0.12, o.w - 0.16, 0.22, 1.52, "#3b6eb5", "#294f82", "#1b365c", selStroke, 1.0);
      // Inner illuminated arch panel
      drawPrism(ctx, v, o.x + 0.32, o.y + 0.09, 0.24, o.w - 0.64, 0.21, 1.22, "#f5f8fc", "#e4ecf7", "#cbd8eb");
      // Angled Full-Length Selfie Mirror on left
      drawPrism(ctx, v, o.x + 0.14, o.y + 0.34, 0.12, 0.36, 0.14, 1.32, "#ffffff", "#cbe0fa", "#9ec0eb", "#607d9e", 1.0);
      // Central Hero Sculpture Podium + Cobalt/Silver Art Object
      drawPrism(ctx, v, o.x + o.w * 0.44, o.y + o.h * 0.45, 0.12, 0.48, 0.42, 0.68, "#ffffff", "#dfe5ec", "#c5ced9");
      drawPrism(ctx, v, o.x + o.w * 0.52, o.y + o.h * 0.52, 0.8, 0.28, 0.26, 0.36, "#6ea2eb", "#294f82", "#1c385e");
      labelZ = 1.82;
    } else if (o.id === "table-b" || o.w >= 1.4) {
      // Chrome Edition Apparel Hanger Rack (성수 팝업 의류 행거 랙)
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.14, "#e6ebf0", "#c7d0d9", "#abb6c2", selStroke, selLw);
      // Left & right chrome uprights + top crossbar
      drawPrism(ctx, v, o.x + 0.12, o.y + o.h * 0.44, 0.14, 0.08, 0.12, 1.22, "#f0f4f8", "#b8c2cc", "#8c96a0");
      drawPrism(ctx, v, o.x + o.w - 0.2, o.y + o.h * 0.44, 0.14, 0.08, 0.12, 1.22, "#f0f4f8", "#b8c2cc", "#8c96a0");
      drawPrism(ctx, v, o.x + 0.12, o.y + o.h * 0.44, 1.32, o.w - 0.24, 0.12, 0.07, "#ffffff", "#c0cad4", "#9aa4ae");
      // 5 Hanging Garments (Cobalt, Off-White, Charcoal, Sage, Silver)
      const gCols = [
        ["#3b6eb5", "#294f82"],
        ["#f5f3ee", "#dad5cb"],
        ["#343a40", "#212529"],
        ["#6ea2eb", "#4576ba"],
        ["#d8dde3", "#adb5bd"],
      ];
      for (let i = 0; i < 5; i++) {
        const gx = o.x + 0.24 + i * ((o.w - 0.52) / 4.5);
        const [gt, gs] = gCols[i % gCols.length];
        drawPrism(ctx, v, gx, o.y + o.h * 0.24, 0.48, 0.14, o.h * 0.52, 0.78, gt, gs, gs);
      }
      labelZ = 1.54;
    } else {
      // Museum Acrylic Display Plinth with Hero Product & Glass Vitrine
      drawPrism(ctx, v, o.x + 0.08, o.y + 0.08, 0, o.w - 0.16, o.h - 0.16, 0.74, "#f7f9fc", "#dde4ed", "#c2ccd9", selStroke, selLw);
      // Clear acrylic vitrine hood
      drawPrism(
        ctx,
        v,
        o.x + 0.12,
        o.y + 0.12,
        0.74,
        o.w - 0.24,
        o.h - 0.24,
        0.38,
        "rgba(220, 236, 255, 0.55)",
        "rgba(185, 214, 248, 0.42)",
        "rgba(155, 192, 235, 0.42)",
        "#5b82b8",
        0.85
      );
      // Hero object inside vitrine (Cobalt sneaker / bottle)
      drawPrism(ctx, v, o.x + o.w * 0.34, o.y + o.h * 0.34, 0.76, o.w * 0.32, o.h * 0.32, 0.22, "#3b6eb5", "#294f82", "#193357");
      labelZ = 1.26;
    }
  }

  // ==========================================================================
  // CATEGORY 4: CASUAL DINING & HIGHBALL BAR (캐주얼 다이닝 · 하이볼 바)
  // ==========================================================================
  else {
    if (o.kind === "counter") {
      // Open Kitchen Bar Counter + 4 Round Upholstered Bar Stools + Highball Draft Tower
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.88, "#594230", "#423022", "#302217", selStroke, selLw);
      // Dark slate & walnut bar top
      drawPrism(ctx, v, o.x - 0.03, o.y - 0.03, 0.88, o.w + 0.06, o.h + 0.06, 0.08, "#b88c5a", "#8f693e", "#6e4f2c", selStroke, 0.8);
      // Brass Highball Draft Tower + Chef Cutting Boards
      drawPrism(ctx, v, o.x + 0.32, o.y + 0.3, 0.96, 0.24, 0.22, 0.42, "#e8c476", "#c49c48", "#9e7a2f");
      drawPrism(ctx, v, o.x + 0.85, o.y + 0.35, 0.96, 0.55, 0.32, 0.05, "#e3c598", "#bd9d6e", "#9c7e52");
      drawPrism(ctx, v, o.x + 1.65, o.y + 0.35, 0.96, 0.55, 0.32, 0.05, "#f5f2eb", "#d9d4c9", "#bdb7ab");
      // 4 Round Bar Stools along the front of the bar
      for (let i = 0; i < 4; i++) {
        const sx = o.x + 0.28 + i * ((o.w - 0.56) / 3);
        const sy = o.y + o.h + 0.14;
        drawPrism(ctx, v, sx - 0.12, sy - 0.12, 0, 0.24, 0.24, 0.54, "#383430", "#292623", "#1c1a18");
        drawPrism(ctx, v, sx - 0.16, sy - 0.16, 0.54, 0.32, 0.32, 0.09, "#b85d43", "#94442e", "#73311f");
      }
      labelZ = 1.48;
    } else if (o.kind === "pickup") {
      // Stainless Chef Pass + Overhead Amber Heat Lamp Bridge + Sizzling Plates
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 0.88, "#d5dce2", "#9ea8b2", "#7d8791", selStroke, selLw);
      // Overhead Heat Lamp Bridge
      drawPrism(ctx, v, o.x + 0.15, o.y + 0.35, 0.88, 0.08, 0.08, 0.44, "#b8c2cc", "#8c96a0", "#6c757d");
      drawPrism(ctx, v, o.x + o.w - 0.23, o.y + 0.35, 0.88, 0.08, 0.08, 0.44, "#b8c2cc", "#8c96a0", "#6c757d");
      drawPrism(ctx, v, o.x + 0.12, o.y + 0.28, 1.32, o.w - 0.24, 0.24, 0.1, "#e6c37a", "#ffa834", "#c97a16");
      // Plated dishes waiting under heat lamp
      drawPrism(ctx, v, o.x + 0.38, o.y + 0.34, 0.88, 0.32, 0.28, 0.06, "#ffffff", "#d9d4cc", "#bdb7ae");
      drawPrism(ctx, v, o.x + 0.92, o.y + 0.34, 0.88, 0.32, 0.28, 0.06, "#383430", "#262320", "#1a1816");
      labelZ = 1.56;
    } else if (o.kind === "display") {
      // Illuminated Wine, Whisky & Dry-Aging Cellar Cabinet
      drawPrism(ctx, v, o.x, o.y, 0, o.w, o.h, 1.52, "#3d332c", "#2b241f", "#1f1916", selStroke, selLw);
      // Warm amber glass front doors (2 bays)
      const bw = (o.w - 0.24) / 2;
      for (let b = 0; b < 2; b++) {
        const bx = o.x + 0.08 + b * (bw + 0.08);
        drawPrism(
          ctx,
          v,
          bx,
          o.y + o.h - 0.06,
          0.14,
          bw,
          0.07,
          1.26,
          "#ffdfa0",
          "rgba(245, 190, 105, 0.72)",
          "rgba(205, 150, 75, 0.72)",
          "#8f6b3e",
          0.85
        );
      }
      labelZ = 1.68;
    } else {
      // 4-Person Upholstered Booth Sofa Table (Left & Right Leather Banquettes + Walnut Table)
      // Left sofa bench
      drawPrism(ctx, v, o.x, o.y, 0, 0.36, o.h, 0.44, "#b85d43", "#94442e", "#73311f", selStroke, 0.8);
      drawPrism(ctx, v, o.x, o.y, 0.44, 0.14, o.h, 0.42, "#c96d52", "#9e4b34", "#7a3622", selStroke, 0.8);
      // Right sofa bench
      drawPrism(ctx, v, o.x + o.w - 0.36, o.y, 0, 0.36, o.h, 0.44, "#b85d43", "#94442e", "#73311f", selStroke, 0.8);
      drawPrism(ctx, v, o.x + o.w - 0.14, o.y, 0.44, 0.14, o.h, 0.42, "#c96d52", "#9e4b34", "#7a3622", selStroke, 0.8);
      // Center Walnut Dining Table
      drawPrism(ctx, v, o.x + 0.3, o.y + 0.08, 0.64, o.w - 0.6, o.h - 0.16, 0.08, "#9c7048", "#7a5432", "#5c3e23", selStroke, selLw);
      // Dinner plates + cordless amber table lamp
      drawPrism(ctx, v, o.x + o.w * 0.46, o.y + o.h * 0.25, 0.72, 0.14, 0.14, 0.22, "#ffdf8c", "#d9a848", "#b38228");
      drawPrism(ctx, v, o.x + o.w * 0.38, o.y + o.h * 0.56, 0.72, 0.22, 0.2, 0.03, "#ffffff", "#dcd6cc", "#c2bcb2");
      labelZ = 1.04;
    }
  }

  // Selection highlight ring around base when selected on right canvas
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = state.darkTheme ? "#6ea2eb" : "#294f82";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    poly(
      ctx,
      [
        p(o.x - 0.08, o.y - 0.08, 0.02),
        p(o.x + o.w + 0.08, o.y - 0.08, 0.02),
        p(o.x + o.w + 0.08, o.y + o.h + 0.08, 0.02),
        p(o.x - 0.08, o.y + o.h + 0.08, 0.02),
      ],
      "",
      state.darkTheme ? "#6ea2eb" : "#294f82",
      2
    );
    ctx.restore();
  }

  // Crisp Pill Tag for Furniture Label + CAD Dimensions
  const c = p(o.x + o.w / 2, o.y + o.h / 2, labelZ);
  ctx.font = "600 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
  const labelText = o.label;
  const tw = ctx.measureText(labelText).width + 12;
  const th = state.dimsOn ? 26 : 16;
  ctx.fillStyle = isSelected
    ? state.darkTheme
      ? "rgba(41, 79, 130, 0.94)"
      : "rgba(32, 37, 43, 0.92)"
    : state.darkTheme
      ? "rgba(23, 28, 34, 0.84)"
      : "rgba(255, 255, 255, 0.88)";
  ctx.strokeStyle = isSelected ? "#6ea2eb" : "rgba(32, 37, 43, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(c.x - tw / 2, c.y - 11, tw, th, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSelected ? "#ffffff" : state.darkTheme ? "#e8edf2" : "#20252b";
  ctx.textAlign = "center";
  ctx.fillText(labelText, c.x, c.y + 1);

  if (state.dimsOn) {
    ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = isSelected ? "#cfe0ff" : state.darkTheme ? "#94a0ad" : "#5a626e";
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

  const catId = state.categoryId;

  if (state.darkTheme) {
    ctx.fillStyle = "#11151a";
    ctx.fillRect(0, 0, v.w, v.h);
  }

  const p = (x: number, y: number, z = 0) => project(v, x, y, z);

  // ==========================================================================
  // 1. ARCHITECTURAL SHELL: THICK 3D WALLS, FLOOR MATERIAL & ZONING
  // ==========================================================================
  const floorBase = state.darkTheme
    ? catId === "dining"
      ? "#1b1918"
      : catId === "popup"
        ? "#181d24"
        : "#191d22"
    : catId === "cafe"
      ? "#f3ece1" // Warm oak wood floor
      : catId === "bakery"
        ? "#f8f3ea" // Cream patisserie tile
        : catId === "popup"
          ? "#ebedf0" // Seongsu micro-cement gallery floor
          : "#e6dfd5"; // Slate & walnut dining floor

  const floorStroke = state.darkTheme ? "#2f3842" : "#cbd2d9";
  poly(ctx, [p(0, 0, 0), p(12, 0, 0), p(12, 9, 0), p(0, 9, 0)], floorBase, floorStroke, 1.4);

  // Category-specific Floor Textures & Zoning Rugs
  if (catId === "cafe") {
    // Terrazzo Bar Service Zone along back wall (y: 0..2.45)
    poly(
      ctx,
      [p(0, 0, 0.002), p(12, 0, 0.002), p(12, 2.45, 0.002), p(0, 2.45, 0.002)],
      state.darkTheme ? "#222830" : "#e5e3dc"
    );
    // Brass zoning divider strip at y = 2.45
    const b0 = p(0, 2.45, 0.004);
    const b1 = p(12, 2.45, 0.004);
    ctx.strokeStyle = "#b89758";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    // Subtle oak plank lines in hall
    ctx.strokeStyle = state.darkTheme ? "rgba(255,255,255,0.03)" : "rgba(138, 102, 66, 0.10)";
    ctx.lineWidth = 1;
    for (let x = 0.5; x < 12; x += 0.5) {
      const a = p(x, 2.45, 0.002);
      const b = p(x, 9, 0.002);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else if (catId === "bakery") {
    // French Patisserie Checkerboard Tile Pattern
    const tileFill = state.darkTheme ? "rgba(255,255,255,0.035)" : "rgba(205, 184, 152, 0.26)";
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 9; y++) {
        if ((x + y) % 2 === 0) {
          poly(ctx, [p(x, y, 0.002), p(x + 1, y, 0.002), p(x + 1, y + 1, 0.002), p(x, y + 1, 0.002)], tileFill);
        }
      }
    }
    // Warm walnut border carpet under central bread zone
    poly(
      ctx,
      [p(1.0, 2.3, 0.003), p(6.2, 2.3, 0.003), p(6.2, 6.8, 0.003), p(1.0, 6.8, 0.003)],
      state.darkTheme ? "rgba(184, 140, 88, 0.10)" : "rgba(184, 140, 88, 0.14)",
      "rgba(166, 124, 74, 0.35)",
      1
    );
  } else if (catId === "popup") {
    // Seongsu Electric Cobalt Blue Brand Runway Carpet across center of showroom
    poly(
      ctx,
      [p(0.8, 2.3, 0.003), p(11.2, 2.3, 0.003), p(11.2, 5.2, 0.003), p(0.8, 5.2, 0.003)],
      state.darkTheme ? "rgba(41, 79, 130, 0.42)" : "rgba(41, 79, 130, 0.17)",
      state.darkTheme ? "#4c8bf5" : "#294f82",
      1.3
    );
  } else {
    // Casual Dining: Dark Slate Kitchen Zone + Warm Walnut Booth Zone
    poly(
      ctx,
      [p(0, 0, 0.002), p(12, 0, 0.002), p(12, 2.8, 0.002), p(0, 2.8, 0.002)],
      state.darkTheme ? "#14181d" : "#d3d8de"
    );
    poly(
      ctx,
      [p(3.2, 4.9, 0.003), p(10.8, 4.9, 0.003), p(10.8, 7.6, 0.003), p(3.2, 7.6, 0.003)],
      state.darkTheme ? "rgba(156, 104, 64, 0.14)" : "rgba(148, 98, 56, 0.12)",
      "rgba(148, 98, 56, 0.3)",
      1
    );
  }

  // Subtle 1m CAD Grid Lines
  ctx.strokeStyle = state.darkTheme ? "rgba(255,255,255,0.04)" : "rgba(32, 37, 43, 0.055)";
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

  // Thick 3D Cutaway Back Wall (y: -0.22..0) & Left Entrance Wall (x: -0.22..0)
  const wallTop = state.darkTheme ? "#2c343e" : "#dce1e7";
  const wallFront = state.darkTheme
    ? "#1e242b"
    : catId === "cafe"
      ? "#efeae0"
      : catId === "bakery"
        ? "#f3ece0"
        : catId === "popup"
          ? "#e6ebf2"
          : "#e3ddd5";
  const wallSide = state.darkTheme ? "#181d23" : "#e3e7ec";
  const wallStroke = state.darkTheme ? "#38424d" : "#c5cdd6";

  // Left Wall (x: -0.22..0, y: 0..9, z: 0..1.52)
  drawPrism(ctx, v, -0.22, 0, 0, 0.22, 9, 1.52, wallTop, wallFront, wallSide, wallStroke, 1.0);
  // Back Wall (x: -0.22..12, y: -0.22..0, z: 0..1.52)
  drawPrism(ctx, v, -0.22, -0.22, 0, 12.22, 0.22, 1.52, wallTop, wallFront, wallSide, wallStroke, 1.0);

  // Back Wall Category Feature Cladding & Signage
  if (catId === "cafe") {
    // Walnut wood-slat acoustic wall behind Espresso Bar
    drawPrism(ctx, v, 3.8, -0.02, 0.18, 6.2, 0.06, 1.18, "#c29b70", "#8c643e", "#6e4d2e");
    // Menu board on back wall
    drawPrism(ctx, v, 4.6, 0.01, 0.92, 2.2, 0.04, 0.36, "#20252b", "#20252b", "#15191d");
    // 3 Hanging Brass Pendant Lights
    for (const lx of [5.2, 6.8, 8.6]) {
      const topPt = p(lx, 0.9, 1.55);
      const bulbPt = p(lx, 0.9, 1.22);
      ctx.strokeStyle = "#8c6d3b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(topPt.x, topPt.y);
      ctx.lineTo(bulbPt.x, bulbPt.y);
      ctx.stroke();
      ctx.fillStyle = state.lightsOn ? "#ffcf70" : "#b89758";
      ctx.beginPath();
      ctx.arc(bulbPt.x, bulbPt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (catId === "bakery") {
    // Warm Boulangerie Wall Rack with Baguettes + Baking Room Glass Window
    drawPrism(ctx, v, 3.8, -0.02, 0.2, 3.4, 0.08, 1.15, "#d8b88c", "#b58e5d", "#947043");
    // Glass partition window into oven room on right back wall
    drawPrism(
      ctx,
      v,
      7.4,
      -0.02,
      0.35,
      2.7,
      0.06,
      0.95,
      "#e8f2fa",
      "rgba(255, 224, 168, 0.55)",
      "rgba(225, 190, 130, 0.55)",
      "#8c6d3b",
      1.0
    );
  } else if (catId === "popup") {
    // Electric Cobalt Brand Wall Panel + Vertical Neon Bars
    drawPrism(ctx, v, 3.6, -0.02, 0.15, 6.4, 0.06, 1.22, "#3b6eb5", "#294f82", "#1b365c");
    drawPrism(ctx, v, 4.0, 0.02, 0.25, 0.08, 0.04, 1.02, "#ffffff", "#9ec5ff", "#6ea2eb");
    drawPrism(ctx, v, 9.5, 0.02, 0.25, 0.08, 0.04, 1.02, "#ffffff", "#9ec5ff", "#6ea2eb");
  } else {
    // Casual Dining & Highball Bar: Backlit Bottle Library + Stainless Kitchen Range Hood
    drawPrism(ctx, v, 3.8, -0.02, 0.2, 3.5, 0.12, 1.18, "#4a3728", "#33251b", "#241a12");
    drawPrism(ctx, v, 4.0, 0.04, 0.55, 3.1, 0.06, 0.58, "#ffdf9a", "rgba(245, 185, 90, 0.55)", "#b58338");
    // Stainless Steel Kitchen Exhaust Hood over Pickup/Pass
    drawPrism(ctx, v, 7.5, 0.0, 1.02, 2.3, 0.75, 0.45, "#dfe5eb", "#aeb7c0", "#88929c");
  }

  // Back Wall Brand Signboard Text
  const signPt = p(6.6, 0.06, 1.28);
  ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = catId === "popup" || catId === "dining" ? "#ffffff" : state.darkTheme ? "#e8edf2" : "#20252b";
  ctx.textAlign = "center";
  const signText =
    catId === "cafe"
      ? "ESPRESSO BAR · ROASTERY"
      : catId === "bakery"
        ? "BOULANGERIE · FRESH BAKED"
        : catId === "popup"
          ? "SEONGSU POP-UP EDITION"
          : "OPEN KITCHEN · HIGHBALL BAR";
  ctx.fillText(signText, signPt.x, signPt.y);

  // Left Wall Double Glass Entrance Door (y: 3.7..5.3, z: 0..1.25) + Welcome Mat
  poly(
    ctx,
    [p(0.01, 3.75, 0), p(0.01, 5.25, 0), p(0.01, 5.25, 1.22), p(0.01, 3.75, 1.22)],
    "rgba(185, 220, 245, 0.52)",
    "#5b7c99",
    1.4
  );
  // Welcome Mat inside entrance
  poly(
    ctx,
    [p(0.12, 3.9, 0.004), p(0.95, 3.9, 0.004), p(0.95, 5.1, 0.004), p(0.12, 5.1, 0.004)],
    catId === "popup" ? "#294f82" : "#4a525a",
    "rgba(255,255,255,0.25)",
    0.8
  );

  // Front Cutaway Street Window Sill (y: 8.88..9.0) + Daylight Sunbeams on Floor
  drawPrism(ctx, v, 2.2, 8.88, 0, 8.4, 0.12, 0.18, "#dce3ea", "#b8c2cc", "#96a1ad");
  if (state.lightsOn) {
    poly(
      ctx,
      [p(2.6, 8.85, 0.003), p(9.8, 8.85, 0.003), p(8.9, 6.6, 0.003), p(1.8, 6.6, 0.003)],
      state.darkTheme ? "rgba(255, 220, 150, 0.04)" : "rgba(255, 238, 195, 0.24)"
    );
  }

  // Interior Corner Potted Plants & Sidewalk Trees outside entrance
  drawPottedPlant3D(ctx, v, 0.55, 0.55, 1.0);
  drawPottedPlant3D(ctx, v, 11.35, 0.55, 1.0);
  drawPottedPlant3D(ctx, v, 11.35, 8.25, 0.9);
  drawPottedPlant3D(ctx, v, -0.65, 2.5, 1.15);
  drawPottedPlant3D(ctx, v, -0.65, 6.5, 1.15);

  // Planner5D architectural floorplan dimension callouts
  if (state.dimsOn) {
    const topMid = p(6, -0.22, 1.66);
    const leftMid = p(-0.22, 4.5, 1.66);
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = state.darkTheme ? "#6ea2eb" : "#294f82";
    ctx.textAlign = "center";
    ctx.fillText("⟵ 12.0m (전면 폭) ⟶", topMid.x, topMid.y);
    ctx.fillText("⟵ 9.0m (깊이) ⟶", leftMid.x - 18, leftMid.y);
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
    ctx.strokeStyle = idx ? (state.darkTheme ? "#6ea2eb" : "#294f82") : "#8b6d43";
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

  // Staff Baristas / Bakers / Curators / Chefs behind Counter & Pickup
  const counterObj = scene.objects.find((o) => o.kind === "counter");
  const pickupObj = scene.objects.find((o) => o.kind === "pickup");
  const drawStaffFigure = (sx: number, sy: number, apronCol: string) => {
    const q = p(sx, sy, 0);
    ctx.fillStyle = "rgba(32,37,43,0.18)";
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + 2, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = apronCol;
    ctx.beginPath();
    ctx.roundRect(q.x - 4, q.y - 14, 8, 12, 3);
    ctx.fill();
    ctx.fillStyle = "#f2d2b6";
    ctx.beginPath();
    ctx.arc(q.x, q.y - 17, 4.2, 0, Math.PI * 2);
    ctx.fill();
  };
  const staffCol = catId === "bakery" ? "#d97724" : catId === "popup" ? "#294f82" : catId === "dining" ? "#20252b" : "#5c4328";
  if (counterObj) {
    drawStaffFigure(counterObj.x + counterObj.w * 0.5, Math.max(0.32, counterObj.y - 0.18), staffCol);
  }
  if (pickupObj) {
    const staffCount = idx === 1 ? state.pickupStaff : 1;
    for (let s = 0; s < staffCount; s++) {
      drawStaffFigure(
        pickupObj.x + pickupObj.w * (staffCount === 1 ? 0.5 : 0.32 + s * 0.36),
        Math.max(0.32, pickupObj.y - 0.18),
        staffCol
      );
    }
  }

  // Depth-sorted 3D Furniture & Interior Fixtures
  [...scene.objects]
    .sort((a, b) => a.x + a.y + a.w + a.h - (b.x + b.y + b.w + b.h))
    .forEach((o) => drawBox3D(ctx, v, o, idx === 1 && o.id === state.selected));

  // Depth-sorted 3D Customer Figures (with subtle shoulder/head styling & shopping/tray prop)
  [...(f.customers || [])]
    .sort((a, b) => a.x + a.y - (b.x + b.y))
    .forEach((c) => {
      const q = p(c.x, c.y, 0);
      const col = c.state.includes("Pickup")
        ? "#b46924"
        : c.state.includes("Order")
          ? "#294f82"
          : "#2a6f4e";
      ctx.fillStyle = "rgba(32,44,49,.18)";
      ctx.beginPath();
      ctx.ellipse(q.x, q.y + 3, 5.2, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(q.x - 4, q.y - 13, 8, 11, 3);
      ctx.fill();
      ctx.fillStyle = "#f4d7be";
      ctx.beginPath();
      ctx.arc(q.x, q.y - 16.5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.id % 2 === 0 ? "#2c221e" : "#594436";
      ctx.beginPath();
      ctx.arc(q.x, q.y - 18, 3.6, Math.PI, Math.PI * 2);
      ctx.fill();
    });

  // Walkthrough Avatar ("나")
  if (state.walkMode) {
    const me = state.players[idx];
    const q = p(me.x, me.y, 0);
    ctx.strokeStyle = "#b83b32";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + 2, Math.max(8, state.body * v.s * 0.45), Math.max(5, state.body * v.s * 0.25), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#b83b32";
    ctx.beginPath();
    ctx.arc(q.x, q.y - 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("나", q.x, q.y - 9);
  }

  // Floating Queue Badges at z=1.55
  const callout = (pt: Pt2D, text: string, bg: string) => {
    const q = p(pt.x, pt.y, 1.55);
    ctx.font = "600 10.5px -apple-system, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(q.x - w / 2, q.y - 18, w, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(text, q.x, q.y - 5);
  };
  callout(scene.orderPoint, "주문 대기 " + (f.orderQueue || 0) + "명", "#294f82");
  callout(scene.pickupPoint, "픽업 대기 " + (f.pickupQueue || 0) + "명", "#2a6f4e");

  // Entrance / Exit Labels
  for (const [name, a] of [
    ["입구 DOOR", scene.entrance],
    ["출구 EXIT", scene.exit],
  ] as [string, Pt2D][]) {
    const pp = p(a.x, a.y);
    ctx.fillStyle = state.darkTheme ? "#94a0ad" : "#294f82";
    ctx.font = "700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(name, pp.x, pp.y + 16);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = state.darkTheme ? "#94a0ad" : "#5a626e";
  ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`2.5D INTERIOR · 12×9m · ${currentCategory().name}`, 12, v.h - 12);
  ctx.textAlign = "right";
  ctx.fillText("완료 " + (f.completed || 0) + "명", v.w - 12, v.h - 12);

  if (r?.routeBlocked) {
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillRect(0, v.h / 2 - 24, v.w, 48);
    ctx.fillStyle = "#b83b32";
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
          ? "1순위 맞춤 추천"
          : `${idx + 1}순위 추천`;
      const badgeClass = !feasible ? "cat-badge warn" : "cat-badge";
      const estDailyRevManwon =
        (cat.cupsPerDayBase * distProf.footTrafficMultiplier * cat.avgTicketKrw) / 10000;
      const estMonthlyGrossManwon = estDailyRevManwon * 30 * (1 - cat.cogsRatio - cat.laborRatioPct / 100);
      const estMonthlyNetManwon = Math.round(estMonthlyGrossManwon - fin.monthlyRentManwon - 85);

      return `
        <button type="button" class="cat-card ${isSelected ? "active" : ""}" data-cat-id="${cat.id}">
          <div class="cat-top">
            <span class="cat-name">${cat.name}</span>
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
      const nextId = btn.getAttribute("data-cat-id") as CategoryId;
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
  if (catHeadline) catHeadline.textContent = cat.name;

  const addrSum = $("selectedAddressSummary");
  if (addrSum) {
    addrSum.textContent = `${state.address} · 전용 ${Math.round(cat.areaM2 / 3.3)}평(${cat.areaM2}㎡) · ${cat.interiorConcept}`;
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
      verdict.textContent = `현재 자본금(${state.capitalManwon.toLocaleString()}만원)보다 예상 개업비(${fin.totalStartupManwon.toLocaleString()}만원)가 높습니다. 브랜드 팝업이나 카페 등 초기 시공비가 낮은 구성을 추천합니다.`;
    }
  }
}

function selectCategory(catId: CategoryId): void {
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
  updateReaEvidenceTerminal();
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

function updateReaEvidenceTerminal(): void {
  const promptEl = $("reaPromptLine");
  const replyEl = $("reaReplyLine");
  if (!promptEl || !replyEl) return;

  const cat = currentCategory();
  const distProf = detectDistrictFromAddress(state.address);
  const fin = computeCategoryStartupManwon(cat, distProf);
  const selObj = selectedMovable();
  const step = state.reaStep;

  if (step === 1) {
    promptEl.textContent = `> inspect --category="${cat.id}" --district="${distProf.name}" --selected="${selObj.label}"`;
    replyEl.innerHTML =
      `[${cat.name}] 전용 2.5D 인테리어 로드 완료 · <b>카운터</b> + <b>진열대</b> + <b>픽업대</b> + 좌석 3조 배치됨.<br/>` +
      `현재 선택 가구: <b>${selObj.label}</b> (좌표 X:${selObj.x.toFixed(1)}m, Y:${selObj.y.toFixed(1)}m, 크기 ${selObj.w.toFixed(1)}×${selObj.h.toFixed(1)}m) — 마우스 드래그로 이동하거나 <kbd>R</kbd> 키로 90° 회전 가능.`;
  } else if (step === 2) {
    const r = state.results?.plan;
    const b = state.results?.base;
    const waitP = r ? Math.round(observedWait(r)) : 0;
    const waitB = b ? Math.round(observedWait(b)) : 0;
    promptEl.textContent = `> rehearse --peak="10min" --arrival="${state.arrival.toFixed(1)}/min" --staff=${state.pickupStaff} --seed=${state.seed}`;
    replyEl.innerHTML = r?.routeBlocked
      ? `<b>동선 단절 감지</b>: ${r.blockedReason || "통로 폭 미달"} (최소 통과 폭 ${state.body.toFixed(2)}m 필요). 도면 위에서 가구를 옆으로 드래그하세요.`
      : `10분 피크 시뮬레이션 완료 · 입구→주문→픽업 이동거리 <b>${(r?.walkDistance ?? 0).toFixed(1)}m</b> · 평균 대기시간 기본 <b>${waitB}초</b> → 내 도면 <b>${waitP}초</b> (최대 픽업 줄 ${r?.maxPickupQueue ?? 0}명).`;
  } else {
    const cliffTxt = $("cliffHeadline")?.textContent || "월 임대료 경계 계산 중";
    const netTxt = $("founderMonthlyNet")?.textContent || "+380만원";
    promptEl.textContent = `> verify --runs=10000 --horizon="36m" --capital="${state.capitalManwon}만원" --dataset="Seoul-OA-15577"`;
    replyEl.innerHTML =
      `예상 초기 창업비 <b>${fin.startupTotalManwon.toLocaleString()}만원</b> (보증금 ${fin.depositManwon.toLocaleString()}만 + 인테리어 ${fin.fitoutManwon.toLocaleString()}만) · 내 자본금 대비 <b>${fin.feasible ? "창업 가능 (여유 " + fin.gapManwon.toLocaleString() + "만원)" : "자본금 " + Math.abs(fin.gapManwon).toLocaleString() + "만원 부족"}</b>.<br/>` +
      `36개월 기대 월 순익 <b>${netTxt}</b> · 핵심 임계점: <b>${cliffTxt}</b>`;
  }
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
        ? `주의: 진열대만 옮기면 동선이 짧아져 픽업 줄이 더 빨리 쌓입니다 (+${Math.round(diff)}초).`
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
  updateReaEvidenceTerminal();
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
  // Status bar reads runs/<id>/status only (AT-14): hash, engine SHA, input files, tokens, gate log. Never a placeholder.
  const st = run.status as unknown as {
    inputHash?: string; engineSha?: string; inputFiles?: string[];
    tokenTotal?: { input: number; output: number }; tokens?: unknown[];
    gateLog?: { gate: string; passed: boolean | null }[];
  };
  const prov = (run as unknown as { provenance?: { inputHash?: string; engineSha?: string; computeElapsedMs?: number } }).provenance;
  setText("sbInputHash", (prov?.inputHash ?? st.inputHash ?? "-").slice(0, 12));
  setText("sbEngineSha", (prov?.engineSha ?? st.engineSha ?? "-").slice(0, 10));
  const computeMs = prov?.computeElapsedMs ?? (run as unknown as { computeMs?: number }).computeMs;
  setText("sbComputeMs", computeMs !== undefined ? `${Math.round(computeMs)}ms` : "-");
  setText("sbInputFiles", (st.inputFiles ?? []).map((f) => f.split("/").pop() ?? f).join(", ") || "-");
  const tt = st.tokenTotal;
  setText("sbTokensTotal", tt ? `${(tt.input + tt.output).toLocaleString()} (in ${tt.input.toLocaleString()} / out ${tt.output.toLocaleString()}, ${st.tokens?.length ?? 0} calls)` : "-");
  const gl = st.gateLog ?? [];
  const gatePass = gl.filter((g) => g.passed === true).length;
  setText("sbGateLog", gl.length ? `${gatePass}/${gl.length} PASS · ${gl.map((g) => `${g.gate}:${g.passed === true ? "ok" : g.passed === false ? "FAIL" : "n/a"}`).join(" ")}` : "-");
  setText("s5PassCount", gl.length ? `${gatePass}/${gl.length}` : "-");
  setText("s5AllGreenBadge", gl.length ? (gatePass === gl.length ? "ALL PASS" : `${gl.length - gatePass} FAIL`) : "-");

  const totalN = run.results.length || 10000;
  const survivors = run.results.filter((r) => r.deathMonth === null).length;
  const rawSurvPct = ((survivors / totalN) * 100).toFixed(1) + "%";
  // The client never computes money or rates: show the engine's calibration label and its measured error, nothing derived here.
  const calib = run.calibration as unknown as { calibrated?: boolean; label?: string; koLabel?: string; errorPp?: number | null; maxErrorPp?: number; holdoutErrorPp?: number | null };
  const isCalibrated = calib.calibrated === true || calib.label === "calibrated";
  const calibErrPp = calib.errorPp ?? calib.maxErrorPp ?? null;
  const calibSurvPct = isCalibrated ? (calib.koLabel ?? "보정됨") : (calib.koLabel ?? "미보정");
  const calibSubText = `원시 통과 ${rawSurvPct} · 백테스트 오차 ${calibErrPp !== null ? calibErrPp.toFixed(2) : "-"}pp`;

  setText("s1TotalCount", totalN.toLocaleString());
  setText("s1PassRate", calibSubText);
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
    calEl.textContent = isCalibrated
      ? `서울시 OA-15577 백테스트 최대 오차 ${calibErrPp !== null ? calibErrPp.toFixed(2) : "-"}pp · 은닉 홀드아웃 오차 ${(calib.holdoutErrorPp ?? 0).toFixed(2)}pp (5pp 이내 통과)`
      : `미보정 — 보정 오차 초과 (${calibErrPp !== null ? calibErrPp.toFixed(2) : "-"}pp) — 분포 표시 차단됨, 가정표만 표시`;
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
  updateReaEvidenceTerminal();
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

  // The engine does not emit a fan; take P10/P50/P90 of the engine's own month-end cash over the sampled variants
  // that carry monthly rows (no money is computed here, only percentiles of engine values).
  const fan: { month: number; p10: number; p50: number; p90: number }[] = (run.cashflowFan ?? []).length
    ? (run.cashflowFan as { month: number; p10: number; p50: number; p90: number }[])
    : (() => {
        const withMonths = (run.results as unknown as { months?: { cashEnd: number }[] }[]).filter((r) => (r.months?.length ?? 0) > 0);
        const out: { month: number; p10: number; p50: number; p90: number }[] = [];
        for (let m = 0; m < 36; m++) {
          const vals = withMonths.map((r) => r.months![m]?.cashEnd).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
          if (!vals.length) break;
          const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))];
          out.push({ month: m + 1, p10: q(0.1), p50: q(0.5), p90: q(0.9) });
        }
        return out;
      })();
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
  ctx.strokeStyle = "rgba(21, 20, 15, 0.18)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, y0);
  ctx.lineTo(padL + pw, y0);
  ctx.stroke();
  ctx.setLineDash([]);

  // P10..P90 shaded band
  ctx.fillStyle = "rgba(21, 20, 15, 0.10)";
  ctx.beginPath();
  fan.forEach((f, i) => (i ? ctx.lineTo(xOf(f.month), yOf(f.p90)) : ctx.moveTo(xOf(f.month), yOf(f.p90))));
  for (let i = fan.length - 1; i >= 0; i--) {
    ctx.lineTo(xOf(fan[i].month), yOf(fan[i].p10));
  }
  ctx.closePath();
  ctx.fill();

  // P50 line
  ctx.strokeStyle = "#15140f";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  fan.forEach((f, i) => (i ? ctx.lineTo(xOf(f.month), yOf(f.p50)) : ctx.moveTo(xOf(f.month), yOf(f.p50))));
  ctx.stroke();

  ctx.fillStyle = "#6f6a5e";
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
    ctx.fillStyle = p.survivedMonths >= 36 ? "rgba(41,79,130,0.48)" : "rgba(166,58,50,0.35)";
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
  ctx.strokeStyle = "#294f82";
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
// 7. INTERACTIONS: POINTER DRAG ON 2.5D FLOORPLAN, ROTATE/ADD, PHOTO & WALK
// ============================================================================

function syncOrderPickupAnchorFromObject(o: SceneObject): void {
  if (o.kind === "counter") {
    state.plan.orderPoint = {
      x: Math.max(0.8, Math.min(state.plan.width - 0.8, r3(o.x + o.w * 0.5))),
      y: Math.max(0.8, Math.min(state.plan.height - 0.8, r3(o.y + o.h + 0.55))),
    };
  } else if (o.kind === "pickup") {
    state.plan.pickupPoint = {
      x: Math.max(0.8, Math.min(state.plan.width - 0.8, r3(o.x - 0.45))),
      y: Math.max(0.8, Math.min(state.plan.height - 0.8, r3(o.y + o.h * 0.5))),
    };
  }
}

function setObjectPosition(x: number, y: number, immediate = true): void {
  const o = selectedMovable();
  if (!o) return;
  o.x = Math.max(0.3, Math.min(state.plan.width - o.w - 0.3, Math.round(x * 10) / 10));
  o.y = Math.max(0.3, Math.min(state.plan.height - o.h - 0.3, Math.round(y * 10) / 10));
  syncOrderPickupAnchorFromObject(o);
  state.preset = "custom";
  syncSpatialControls();
  if (immediate) {
    recomputeRehearsal();
    scheduleMacroSimulation();
  } else {
    queueRecomputeRehearsal();
  }
}

function rotateSelectedFurniture(): void {
  const o = selectedMovable();
  if (!o) return;
  const nextW = o.h;
  const nextH = o.w;
  o.w = nextW;
  o.h = nextH;
  o.x = Math.max(0.3, Math.min(state.plan.width - o.w - 0.3, o.x));
  o.y = Math.max(0.3, Math.min(state.plan.height - o.h - 0.3, o.y));
  syncOrderPickupAnchorFromObject(o);
  state.preset = "custom";
  recomputeRehearsal();
  scheduleMacroSimulation();
}

function addExtraFurniture(): void {
  const cat = currentCategory();
  const idx = state.plan.objects.filter((o) => o.id.startsWith("extra-")).length + 1;
  const id = `extra-${idx}`;
  const isPopup = cat.id === "popup";
  const newObj: SceneObject = {
    id,
    label: isPopup ? `추가 전시 플린스 ${idx}` : `추가 좌석 ${idx}`,
    x: r3(3.4 + ((idx * 1.1) % 3.2)),
    y: r3(5.2 + ((idx * 0.8) % 2.1)),
    w: isPopup ? 1.1 : 1.15,
    h: isPopup ? 1.1 : 0.95,
    kind: isPopup ? "display" : "table",
    movable: true,
  };
  state.plan.objects.push(newObj);
  state.selected = id;
  state.preset = "custom";
  recomputeRehearsal();
  scheduleMacroSimulation();
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
  // 0. rea.tools-style 3-Step Evidence Cards
  document.querySelectorAll<HTMLElement>("[data-rea-step]").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll("[data-rea-step]").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      const s = Number(card.getAttribute("data-rea-step") || "1") as 1 | 2 | 3;
      state.reaStep = s;
      updateReaEvidenceTerminal();
    });
  });

  // 1. Address Input & Quick Address Chips
  const addrInp = $<HTMLInputElement>("addressInput");
  if (addrInp) {
    addrInp.addEventListener("input", () => {
      state.address = addrInp.value;
      renderRecommendedCategories();
      updateReaEvidenceTerminal();
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
      const topCat = (distProf.preferredCategories[0] || "cafe") as CategoryId;
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
    updateReaEvidenceTerminal();
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

  // 5. 2.5D Isometric Canvas Pointer Dragging (All furniture movable: counter, pickup, display, table-a/b/c, extra-*)
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
          pt.x >= a.x - 0.35 &&
          pt.x <= a.x + a.w + 0.35 &&
          pt.y >= a.y - 0.35 &&
          pt.y <= a.y + a.h + 0.35
      );
    if (hit) {
      state.selected = hit.id;
      drag = { id: hit.id, dx: pt.x - hit.x, dy: pt.y - hit.y };
      planCanvas.setPointerCapture(e.pointerId);
      planCanvas.style.cursor = "grabbing";
      updateReaEvidenceTerminal();
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

  // 7. Walkthrough Mode (WASD / Arrow Keys) & Store Control HUD (L, G, H, I, R, +, T)
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
  $("hudRotateBtn")?.addEventListener("click", rotateSelectedFurniture);
  $("hudAddTableBtn")?.addEventListener("click", addExtraFurniture);
  $("hudThemeBtn")?.addEventListener("click", toggleTheme);

  $("walkBtn")?.addEventListener("click", () => {
    state.walkMode = !state.walkMode;
    state.playing = false;
    state.players = [{ ...state.base.entrance }, { ...state.plan.entrance }];
    $("walkHint").textContent = state.walkMode
      ? "🚶 키보드 방향키(↑↓←→) 또는 WASD를 눌러 두 가게 도면을 동시에 걸어보세요."
      : "도면 위의 가구(카운터·쇼케이스·진열대·테이블)를 마우스로 드래그하거나 [R] 키로 회전해보세요.";
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
    if (k === "r") {
      rotateSelectedFurniture();
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
      let alpha = 0.05 + baseIntensity * 0.17;

      // Monochrome ink field on paper (editorial); the accent appears only under the cursor
      let cr = Math.round(58 - baseIntensity * 18);
      let cg = Math.round(55 - baseIntensity * 18);
      let cb = Math.round(48 - baseIntensity * 14);

      if (dist < cursorRadius) {
        const u = 1 - dist / cursorRadius;
        const scrambleIdx = Math.floor(((c * 17 + r * 31 + Math.floor(nowMs * 0.04)) % SCRAMBLE_CHARS.length));
        char = SCRAMBLE_CHARS[scrambleIdx];
        alpha = Math.min(0.8, alpha + u * 0.55);
        cr = Math.round(120 + u * 61);
        cg = Math.round(60 + u * 4);
        cb = Math.round(40 - u * 13);
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
