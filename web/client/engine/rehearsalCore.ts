// src/engine/rehearsalCore.ts
// Deterministic 2.5D spatial A* pathfinding + discrete-event queue simulation engine for Rehearsal.

export const STEP = 0.1;
export const SPEED = 1.15;
export const FRAME = 2.5;
const EPS = 1e-8;

export interface Point2D {
  x: number;
  y: number;
}

export interface SceneObject {
  id: string;
  label: string;
  koLabel?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "desk" | "seating" | "display" | "table" | "obstacle";
  movable: boolean;
}

export interface Scene {
  name: string;
  width: number;
  height: number;
  entrance: Point2D;
  exit: Point2D;
  order: Point2D;
  pickup: Point2D;
  objects: SceneObject[];
}

export interface SimConfig {
  arrivalsPerMin: number;
  orderStaff: number;
  pickupStaff: number;
  serviceSec: number;
  seed: number;
  duration: number;
  bodyWidth: number;
}

export const DEFAULTS: SimConfig = {
  arrivalsPerMin: 4,
  orderStaff: 1,
  pickupStaff: 1,
  serviceSec: 20,
  seed: 42,
  duration: 600,
  bodyWidth: 0.65,
};

export interface RouteLeg {
  points: Point2D[];
  cumulative: number[];
  length: number;
}

export interface TrackSegment {
  start: number;
  end: number;
  state: "walking" | "queue" | "service";
  stage: "order" | "pickup" | "exit" | "blocked";
  leg?: number;
  point?: Point2D;
}

export interface CustomerTrack {
  id: number;
  arrival: number;
  departure: number | null;
  wait: number;
  observedWait?: number;
  queueAt?: number;
  requirements: [number, number];
  segments: TrackSegment[];
}

export interface SampledPerson {
  id: number;
  x: number;
  y: number;
  state: "walking" | "queue" | "service";
  stage: "order" | "pickup" | "exit" | "blocked";
  leg: number | null;
  distanceAlongLeg: number | null;
}

export interface SampleFrame {
  t: number;
  people: SampledPerson[];
  queue: number;
  orderQueue: number;
  pickupQueue: number;
  completed: number;
}

export interface SimChecks {
  geometryInBounds: boolean;
  objectOverlaps: [string, string][];
  interactionPointsOutsideFurniture: boolean;
  bodyFitsAtNodes: boolean[];
  reachableLegs: boolean[];
  pathSegmentsClear: boolean;
  conservation: boolean;
  finalFrameConservation: boolean;
}

export interface SimResult {
  duration: number;
  arrivalCount: number;
  completed: number;
  active: number;
  meanWaitSec: number | null;
  p90WaitSec: number | null;
  maxQueue: number;
  meanJourneySec: number | null;
  routeBlocked: boolean;
  walkDistance: number | null;
  route: Point2D[];
  frames: SampleFrame[];
  config: SimConfig;
  checks: SimChecks;
  modelNotes: string[];
  legs: (RouteLeg | null)[];
  tracks: CustomerTrack[];
  walkingSpeed: number;
  frameInterval: number;
  arrivalTimes: number[];
  serviceMultipliers: [number, number][];
  censoredCount: number;
  censoredWaitCount: number;
  totalObservedWait: number;
  totalWalkDistance: number;
  meanCompletedWaitSec: number | null;
  maxQueueByStage: { order: number; pickup: number };
}

export function makeScene(name: "baseline" | "proposed" = "baseline"): Scene {
  if (!["baseline", "proposed"].includes(name)) {
    throw new RangeError("Unknown scene");
  }
  return {
    name,
    width: 12,
    height: 9,
    entrance: { x: 4.5, y: 8.1 },
    exit: { x: 11.1, y: 7.1 },
    order: { x: 4.5, y: 1.9 },
    pickup: { x: 8.5, y: 1.9 },
    objects: [
      {
        id: "order-desk",
        label: "Order counter",
        koLabel: "주문대",
        x: 3.2,
        y: 0.3,
        w: 2.5,
        h: 0.8,
        kind: "desk",
        movable: false,
      },
      {
        id: "pickup-desk",
        label: "Pickup counter",
        koLabel: "픽업대",
        x: 7.3,
        y: 0.3,
        w: 2.5,
        h: 0.8,
        kind: "desk",
        movable: false,
      },
      {
        id: "bench",
        label: "Window seating",
        koLabel: "창가 벤치",
        x: 0.3,
        y: 6.2,
        w: 1.8,
        h: 0.8,
        kind: "seating",
        movable: false,
      },
      {
        id: "display",
        label: "Movable display",
        koLabel: "진열대",
        x: name === "baseline" ? 3.0 : 7.6,
        y: name === "baseline" ? 6.2 : 7.6,
        w: 3.8,
        h: 0.8,
        kind: "display",
        movable: true,
      },
      {
        id: "table-a",
        label: "Cafe table A",
        koLabel: "테이블 A",
        x: 0.7,
        y: 2.5,
        w: 1.5,
        h: 1.1,
        kind: "table",
        movable: true,
      },
      {
        id: "table-b",
        label: "Cafe table B",
        koLabel: "테이블 B",
        x: 0.7,
        y: 4.1,
        w: 1.5,
        h: 1.1,
        kind: "table",
        movable: true,
      },
      {
        id: "table-c",
        label: "Cafe table C",
        koLabel: "테이블 C",
        x: 9.8,
        y: 3.7,
        w: 1.3,
        h: 1.1,
        kind: "table",
        movable: true,
      },
    ],
  };
}

function finite(
  n: unknown,
  lo: number,
  hi: number,
  label: string,
  integer = false
): asserts n is number {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < lo ||
    n > hi ||
    (integer && !Number.isInteger(n))
  ) {
    throw new RangeError(
      `${label} must be ${integer ? "an integer" : "finite"} in [${lo}, ${hi}]`
    );
  }
}

export function validate(scene: Scene, input?: Partial<SimConfig>): SimConfig {
  const c: SimConfig = { ...DEFAULTS, ...input };
  finite(c.arrivalsPerMin, 0, 20, "arrivalsPerMin");
  finite(c.orderStaff, 1, 8, "orderStaff", true);
  finite(c.pickupStaff, 1, 8, "pickupStaff", true);
  finite(c.serviceSec, 2, 120, "serviceSec");
  finite(c.seed, 0, 4294967295, "seed", true);
  finite(c.duration, 1, 1200, "duration");
  finite(c.bodyWidth, 0.5, 1.4, "bodyWidth");

  if (!scene || !Array.isArray(scene.objects)) {
    throw new TypeError("Scene objects required");
  }
  finite(scene.width, 2, 20, "scene.width");
  finite(scene.height, 2, 20, "scene.height");
  if (scene.objects.length > 60) {
    throw new RangeError("At most 60 objects");
  }
  for (const k of ["entrance", "order", "pickup", "exit"] as const) {
    if (!scene[k]) throw new TypeError(`${k} point required`);
    finite(scene[k].x, 0, scene.width, `${k}.x`);
    finite(scene[k].y, 0, scene.height, `${k}.y`);
  }
  const ids = new Set<string>();
  for (const o of scene.objects) {
    if (!o.id || ids.has(o.id)) {
      throw new TypeError("Object ids must be unique");
    }
    ids.add(o.id);
    finite(o.x, 0, scene.width, "object.x");
    finite(o.y, 0, scene.height, "object.y");
    finite(o.w, 0.05, scene.width, "object.w");
    finite(o.h, 0.05, scene.height, "object.h");
    if (o.x + o.w > scene.width + EPS || o.y + o.h > scene.height + EPS) {
      throw new RangeError("Object outside room");
    }
  }
  return c;
}

const dist = (a: Point2D, b: Point2D): number => Math.hypot(a.x - b.x, a.y - b.y);

class Heap<T> {
  private a: T[] = [];
  private key: (item: T) => number;

  constructor(key: (item: T) => number) {
    this.key = key;
  }

  push(v: T): void {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key(a[p]) <= this.key(v)) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = v;
  }

  pop(): T | null {
    const a = this.a;
    if (!a.length) return null;
    const top = a[0];
    const v = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1;
        if (j + 1 < a.length && this.key(a[j + 1]) < this.key(a[j])) j++;
        if (this.key(v) <= this.key(a[j])) break;
        a[i] = a[j];
        i = j;
      }
      a[i] = v;
    }
    return top;
  }

  get length(): number {
    return this.a.length;
  }
}

export function geometry(scene: Scene, r: number) {
  const rects = scene.objects.map((o) => ({
    x: o.x - r,
    y: o.y - r,
    w: o.w + 2 * r,
    h: o.h + 2 * r,
  }));

  const free = (p: Point2D): boolean =>
    p.x >= r - EPS &&
    p.x <= scene.width - r + EPS &&
    p.y >= r - EPS &&
    p.y <= scene.height - r + EPS &&
    !rects.some(
      (o) =>
        p.x > o.x - EPS &&
        p.x < o.x + o.w + EPS &&
        p.y > o.y - EPS &&
        p.y < o.y + o.h + EPS
    );

  function clear(a: Point2D, b: Point2D): boolean {
    if (!free(a) || !free(b)) return false;
    for (const o of rects) {
      let lo = 0;
      let hi = 1;
      const axes: [number, number, number, number][] = [
        [a.x, b.x - a.x, o.x, o.x + o.w],
        [a.y, b.y - a.y, o.y, o.y + o.h],
      ];
      for (const [v, d, mn, mx] of axes) {
        if (Math.abs(d) < EPS) {
          if (v < mn || v > mx) {
            lo = 2;
            break;
          }
        } else {
          const t1 = (mn - v) / d;
          const t2 = (mx - v) / d;
          lo = Math.max(lo, Math.min(t1, t2));
          hi = Math.min(hi, Math.max(t1, t2));
        }
      }
      if (lo <= hi + EPS && hi >= 0 && lo <= 1) return false;
    }
    return true;
  }

  return { free, clear };
}

function planner(
  scene: Scene,
  g: { free: (p: Point2D) => boolean; clear: (a: Point2D, b: Point2D) => boolean }
) {
  const nx = Math.floor(scene.width / STEP) + 1;
  const ny = Math.floor(scene.height / STEP) + 1;
  const n = nx * ny;
  const pt = (i: number): Point2D => ({
    x: (i % nx) * STEP,
    y: Math.floor(i / nx) * STEP,
  });
  const pass = new Uint8Array(n);
  for (let i = 0; i < n; i++) pass[i] = g.free(pt(i)) ? 1 : 0;

  function node(p: Point2D): number {
    const x = Math.round(p.x / STEP);
    const y = Math.round(p.y / STEP);
    let best = -1;
    let bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= nx || yy < 0 || yy >= ny) continue;
        const i = yy * nx + xx;
        const d = dist(p, pt(i));
        if (pass[i] && d < bd && g.clear(p, pt(i))) {
          best = i;
          bd = d;
        }
      }
    }
    return best;
  }

  return function findPath(a: Point2D, b: Point2D): Point2D[] | null {
    if (!g.free(a) || !g.free(b)) return null;
    const start = node(a);
    const goal = node(b);
    if (start < 0 || goal < 0) return null;

    const costs = new Float64Array(n);
    costs.fill(Infinity);
    costs[start] = 0;
    const prev = new Int32Array(n);
    prev.fill(-1);
    const closed = new Uint8Array(n);
    const heap = new Heap<{ i: number; f: number }>((v) => v.f);
    heap.push({ i: start, f: dist(pt(start), pt(goal)) });

    let found = false;
    while (heap.length) {
      const cur = heap.pop()!;
      const { i } = cur;
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) {
        found = true;
        break;
      }
      const x = i % nx;
      const y = Math.floor(i / nx);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= nx || yy < 0 || yy >= ny) continue;
          const j = yy * nx + xx;
          if (!pass[j] || closed[j]) continue;
          if (dx && dy && (!pass[y * nx + xx] || !pass[yy * nx + x])) continue;
          if (!g.clear(pt(i), pt(j))) continue;
          const cost = costs[i] + STEP * (dx && dy ? Math.SQRT2 : 1);
          if (cost < costs[j] - EPS) {
            costs[j] = cost;
            prev[j] = i;
            heap.push({ i: j, f: cost + dist(pt(j), pt(goal)) });
          }
        }
      }
    }
    if (!found) return null;

    const raw: Point2D[] = [];
    for (let i = goal; i !== -1; i = prev[i]) raw.push(pt(i));
    raw.reverse();

    const points = [{ ...a }, ...raw, { ...b }];
    const out: Point2D[] = [];
    for (const p of points) {
      if (out.length && dist(out[out.length - 1], p) < EPS) continue;
      while (out.length >= 2) {
        const q = out[out.length - 2];
        const v = out[out.length - 1];
        const cross = (v.x - q.x) * (p.y - v.y) - (v.y - q.y) * (p.x - v.x);
        if (Math.abs(cross) > EPS || !g.clear(q, p)) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function requirements(seed: number, id: number): [number, number] {
  const r = rng((seed ^ Math.imul(id + 1, 0x9e3779b9) ^ 0xa511e9b3) >>> 0);
  return [0.45 * (0.75 + 0.5 * r()), 0.75 + 0.5 * r()];
}

function measure(points: Point2D[]): RouteLeg {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
  }
  return {
    points,
    cumulative,
    length: cumulative[cumulative.length - 1] || 0,
  };
}

function along(leg: RouteLeg | null, d: number): Point2D | null {
  if (!leg || !leg.points.length) return null;
  const clamped = Math.max(0, Math.min(leg.length, d));
  let i = 1;
  while (i < leg.cumulative.length && leg.cumulative[i] < clamped) i++;
  if (i === leg.points.length) return { ...leg.points[i - 1] };
  const a = leg.points[i - 1];
  const b = leg.points[i];
  const span = leg.cumulative[i] - leg.cumulative[i - 1];
  const u = span ? (clamped - leg.cumulative[i - 1]) / span : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export function sample(result: SimResult, t: number): SampleFrame {
  finite(t, 0, result.duration, "sample time");
  let completed = 0;
  let queue = 0;
  let orderQueue = 0;
  let pickupQueue = 0;
  const people: SampledPerson[] = [];

  for (const p of result.tracks) {
    if (p.arrival > t + EPS) continue;
    if (p.departure !== null && p.departure <= t + EPS) {
      completed++;
      continue;
    }
    let seg: TrackSegment | null = null;
    for (const s of p.segments) {
      if (s.start <= t + EPS && t < s.end - EPS) seg = s;
    }
    if (!seg) continue;
    const pos =
      seg.state === "walking" && seg.leg !== undefined
        ? along(result.legs[seg.leg], (t - seg.start) * SPEED)
        : seg.point ?? null;
    if (!pos) continue;

    if (seg.state === "queue" && seg.stage !== "blocked") {
      queue++;
      if (seg.stage === "order") orderQueue++;
      if (seg.stage === "pickup") pickupQueue++;
    }
    people.push({
      id: p.id,
      x: pos.x,
      y: pos.y,
      state: seg.state,
      stage: seg.stage,
      leg: seg.leg ?? null,
      distanceAlongLeg:
        seg.state === "walking" ? Math.max(0, (t - seg.start) * SPEED) : null,
    });
  }
  return { t, people, queue, orderQueue, pickupQueue, completed };
}

export function run(scene: Scene, input: Partial<SimConfig> = {}): SimResult {
  const c = validate(scene, input);
  const g = geometry(scene, c.bodyWidth / 2);
  const find = planner(scene, g);
  const nodes = [scene.entrance, scene.order, scene.pickup, scene.exit];
  const names: ("order" | "pickup" | "exit")[] = ["order", "pickup", "exit"];
  const paths = [
    find(nodes[0], nodes[1]),
    find(nodes[1], nodes[2]),
    find(nodes[2], nodes[3]),
  ];
  const blocked = paths.some((p) => !p);
  const legs = paths.map((p) => (p ? measure(p) : null));

  const arrivalRng = rng(c.seed);
  const arrivals: number[] = [];
  let at = 0;
  if (c.arrivalsPerMin > 0) {
    while (true) {
      at += (-Math.log(1 - arrivalRng()) * 60) / c.arrivalsPerMin;
      if (at > c.duration) break;
      arrivals.push(at);
      if (arrivals.length > 2000) {
        throw new RangeError("Synthetic arrival limit exceeded");
      }
    }
  }

  const tracks: CustomerTrack[] = arrivals.map((t, id) => ({
    id,
    arrival: t,
    departure: null,
    wait: 0,
    requirements: requirements(c.seed, id),
    segments: [],
  }));

  const result: SimResult = {
    duration: c.duration,
    arrivalCount: arrivals.length,
    completed: 0,
    active: arrivals.length,
    meanWaitSec: 0,
    p90WaitSec: 0,
    maxQueue: 0,
    meanJourneySec: null,
    routeBlocked: blocked,
    walkDistance: blocked
      ? null
      : legs.reduce((s, l) => s + (l ? l.length : 0), 0),
    route: blocked
      ? []
      : paths.flatMap((p, i) => (p ? (i ? p.slice(1) : p) : [])),
    frames: [],
    config: { ...c },
    checks: {
      geometryInBounds: true,
      objectOverlaps: [],
      interactionPointsOutsideFurniture: true,
      bodyFitsAtNodes: [],
      reachableLegs: [],
      pathSegmentsClear: false,
      conservation: false,
      finalFrameConservation: false,
    },
    modelNotes: [],
    legs,
    tracks,
    walkingSpeed: SPEED,
    frameInterval: FRAME,
    arrivalTimes: arrivals,
    serviceMultipliers: tracks.map(
      (p) => [...p.requirements] as [number, number]
    ),
    censoredCount: arrivals.length,
    censoredWaitCount: 0,
    totalObservedWait: 0,
    totalWalkDistance: 0,
    meanCompletedWaitSec: null,
    maxQueueByStage: { order: 0, pickup: 0 },
  };

  if (blocked) {
    for (const p of tracks) {
      p.segments.push({
        start: p.arrival,
        end: Infinity,
        state: "queue",
        stage: "blocked",
        point: { ...scene.entrance },
      });
    }
    result.meanWaitSec = null;
    result.p90WaitSec = null;
  } else {
    interface SimEvent {
      t: number;
      type: "arrival" | "walkDone" | "serviceDone";
      p: CustomerTrack;
      stage: number;
    }
    const events = new Heap<SimEvent>((v) => v.t);
    const queues: [CustomerTrack[], CustomerTrack[]] = [[], []];
    const busy = [0, 0];
    const staff = [c.orderStaff, c.pickupStaff];

    const schedule = (
      t: number,
      type: SimEvent["type"],
      p: CustomerTrack,
      stage: number
    ) => events.push({ t, type, p, stage });

    const append = (p: CustomerTrack, s: TrackSegment) => {
      const old = p.segments[p.segments.length - 1];
      if (old && old.end === Infinity) old.end = s.start;
      p.segments.push(s);
    };

    const walk = (p: CustomerTrack, leg: number, t: number) => {
      const legLen = legs[leg]!.length;
      append(p, {
        start: t,
        end: t + legLen / SPEED,
        state: "walking",
        stage: names[leg],
        leg,
      });
      schedule(t + legLen / SPEED, "walkDone", p, leg);
    };

    const serve = (stage: number, t: number) => {
      while (busy[stage] < staff[stage] && queues[stage].length) {
        const p = queues[stage].shift()!;
        p.wait += t - (p.queueAt ?? t);
        busy[stage]++;
        const end = t + c.serviceSec * p.requirements[stage];
        append(p, {
          start: t,
          end,
          state: "service",
          stage: names[stage],
          point: { ...nodes[stage + 1] },
        });
        schedule(end, "serviceDone", p, stage);
      }
    };

    for (const p of tracks) schedule(p.arrival, "arrival", p, 0);

    while (events.length) {
      const e = events.pop()!;
      if (e.t > c.duration + EPS) break;
      const { t, p, stage } = e;
      if (e.type === "arrival") {
        walk(p, 0, t);
      } else if (e.type === "walkDone") {
        if (stage === 2) {
          p.departure = t;
          result.completed++;
          continue;
        }
        p.queueAt = t;
        append(p, {
          start: t,
          end: Infinity,
          state: "queue",
          stage: names[stage],
          point: { ...nodes[stage + 1] },
        });
        queues[stage].push(p);
        serve(stage, t);
      } else {
        busy[stage]--;
        walk(p, stage + 1, t);
        serve(stage, t);
      }
      result.maxQueue = Math.max(
        result.maxQueue,
        queues[0].length + queues[1].length
      );
      result.maxQueueByStage.order = Math.max(
        result.maxQueueByStage.order,
        queues[0].length
      );
      result.maxQueueByStage.pickup = Math.max(
        result.maxQueueByStage.pickup,
        queues[1].length
      );
    }

    const waits: number[] = [];
    let journey = 0;
    let completedWait = 0;
    for (const p of tracks) {
      const last = p.segments[p.segments.length - 1];
      let w = p.wait;
      if (last && last.state === "queue") {
        w += c.duration - last.start;
        result.censoredWaitCount++;
      }
      p.observedWait = w;
      waits.push(w);
      if (p.departure !== null) {
        journey += p.departure - p.arrival;
        completedWait += w;
      }
      for (const s of p.segments) {
        if (s.state === "walking") {
          result.totalWalkDistance +=
            Math.max(0, Math.min(c.duration, s.end) - s.start) * SPEED;
        }
      }
    }
    result.totalObservedWait = waits.reduce((a, b) => a + b, 0);
    result.meanWaitSec = waits.length
      ? result.totalObservedWait / waits.length
      : 0;
    waits.sort((a, b) => a - b);
    result.p90WaitSec = waits.length
      ? waits[Math.ceil(waits.length * 0.9) - 1]
      : 0;
    result.meanJourneySec = result.completed
      ? journey / result.completed
      : null;
    result.meanCompletedWaitSec = result.completed
      ? completedWait / result.completed
      : null;
  }

  result.active = result.arrivalCount - result.completed;
  result.censoredCount = result.active;

  for (let t = 0; t < c.duration - EPS; t += FRAME) {
    result.frames.push(sample(result, t));
  }
  result.frames.push(sample(result, c.duration));

  const overlaps: [string, string][] = [];
  for (let i = 0; i < scene.objects.length; i++) {
    for (let j = i + 1; j < scene.objects.length; j++) {
      const a = scene.objects[i];
      const b = scene.objects[j];
      if (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      ) {
        overlaps.push([a.id, b.id]);
      }
    }
  }

  result.checks = {
    geometryInBounds: true,
    objectOverlaps: overlaps,
    interactionPointsOutsideFurniture: (["order", "pickup"] as const).every(
      (k) =>
        !scene.objects.some(
          (o) =>
            scene[k].x >= o.x &&
            scene[k].x <= o.x + o.w &&
            scene[k].y >= o.y &&
            scene[k].y <= o.y + o.h
        )
    ),
    bodyFitsAtNodes: nodes.map((p) => g.free(p)),
    reachableLegs: paths.map(Boolean),
    pathSegmentsClear:
      !blocked &&
      paths.every((p) => p!.every((q, i) => !i || g.clear(p![i - 1], q))),
    conservation: result.arrivalCount === result.completed + result.active,
    finalFrameConservation:
      result.frames[result.frames.length - 1].people.length +
        result.frames[result.frames.length - 1].completed ===
      result.arrivalCount,
  };

  result.modelNotes = [
    "Concept rehearsal, not prediction: all arrivals and service requirements are synthetic seeded draws. No real customer data, model API, or live feeds.",
    "Poisson arrivals use seeded exponential gaps. Per-customer order/pickup requirement multipliers are keyed by seed and id, independent of geometry/staffing.",
    "Order service = serviceSec × 0.45 × uniform[0.75,1.25); pickup service = serviceSec × uniform[0.75,1.25). FIFO separate fixed-station staff pools; fixed 1.15m/s walking.",
    "0.1m grid A*, bodyWidth/2 square inflation, no diagonal corner cutting. Conservative static footprint test, not a safety or legal certification.",
  ];

  return result;
}

export function canStand(
  scene: Scene,
  point: Point2D,
  bodyWidth: number
): boolean {
  const r = bodyWidth / 2;
  return (
    point.x >= r &&
    point.x <= scene.width - r &&
    point.y >= r &&
    point.y <= scene.height - r &&
    !scene.objects.some(
      (o) =>
        point.x >= o.x - r &&
        point.x <= o.x + o.w + r &&
        point.y >= o.y - r &&
        point.y <= o.y + o.h + r
    )
  );
}

export const RehearsalCore = {
  makeScene,
  run,
  sample,
  canStand,
  defaults: { ...DEFAULTS },
  version: "1.0.0",
};
