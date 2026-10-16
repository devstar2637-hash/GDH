// web/client/storeStudio3D.ts — Real-time Three.js 3D Store Architecture, Lighting, AC Airflow & CAD Blueprint Engine
// Reverse-engineered & adapted for Commercial Store Simulation (Cafe, Bakery, Popup, Takeout)

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

export type FloorKind = "oak" | "walnut" | "tile" | "stone";
export type LightKind = "ceiling" | "pendant" | "spots" | "floor" | "strip";
export type WallSide = "north" | "east" | "south" | "west";
export type SceneMoodId = "cozy" | "bright" | "peak" | "night";

export interface StoreRoomSpec {
  id: string;
  name: string;
  rect: [number, number, number, number]; // [x, z, w, d] in meters
  floor: FloorKind;
}

export interface StoreOpeningSpec {
  id: string;
  type: "door" | "window" | "open";
  from: [number, number];
  to: [number, number];
  sill?: number;
  head?: number;
}

export interface StoreLightSpec {
  id: string;
  name: string;
  room: string;
  type: LightKind;
  pos: [number, number];
  y?: number;
  rot?: number;
  length?: number;
  color?: string;
  temp?: number;
  brightness?: number;
  on?: boolean;
}

export interface StoreACSpec {
  id: string;
  name: string;
  room: string;
  wall: WallSide;
  pos: [number, number];
  y: number;
  on?: boolean;
  mode?: "cool" | "heat" | "fan";
  target?: number;
}

export interface StoreFurnitureInput {
  id: string;
  type: string;
  label: string;
  x: number; // 0..1 normalized or meter mapped
  y: number;
  w: number;
  h: number;
  seats: number;
  costManwon: number;
  color: string;
  rot?: number;
}

export interface StoreFloorPlanDoc {
  name: string;
  category: "cafe" | "bakery" | "popup" | "takeout";
  wallHeight: number;
  interiorWallHeight: number;
  outdoorTemp: number;
  camera: { azimuth: number; elevation: number };
  rooms: StoreRoomSpec[];
  openings: StoreOpeningSpec[];
  lights: StoreLightSpec[];
  acs: StoreACSpec[];
}

export const STAGE_BG = "#0a0e1a";

/* ---------- Cached Materials & Primitive Builders ---------- */

const materials = new Map<string, THREE.MeshStandardMaterial>();

export function mat(
  color: string,
  {
    rough = 0.82,
    metal = 0,
    emissive = null as string | null,
    emissiveIntensity = 1,
    opacity = 1,
  } = {}
): THREE.MeshStandardMaterial {
  const key = [color, rough, metal, emissive, emissiveIntensity, opacity].join("|");
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    if (opacity < 1) {
      m.transparent = true;
      m.opacity = opacity;
    }
    materials.set(key, m);
  }
  return m;
}

export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material | THREE.Material[],
  { r = 0.02 } = {}
): THREE.Mesh {
  const radius = Math.max(0, Math.min(r, Math.min(w, h, d) / 2 - 0.001));
  const geo =
    radius > 0.002
      ? new RoundedBoxGeometry(w, h, d, 2, radius)
      : new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  return new THREE.Mesh(geo, material);
}

export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  seg = 24
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  geo.translate(0, h / 2, 0);
  return new THREE.Mesh(geo, material);
}

export function at<T extends THREE.Object3D>(mesh: T, x = 0, y = 0, z = 0): T {
  mesh.position.set(x, y, z);
  return mesh;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Procedural Floor Textures ---------- */

const TILE_SCALE = 2.4;

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

function planksTexture(base: string): THREE.CanvasTexture {
  return canvasTexture(512, (g, s) => {
    const rand = rng(base.length * 97 + base.charCodeAt(3));
    const rows = 14;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * s * 0.5;
      while (x < s) {
        const len = s * (0.32 + rand() * 0.36);
        g.fillStyle = shade(base, (rand() - 0.5) * 0.08);
        g.fillRect(x, r * rh, len, rh);
        g.fillStyle = "rgba(0,0,0,0.26)";
        g.fillRect(x, r * rh, 1.5, rh);
        g.strokeStyle = "rgba(0,0,0,0.05)";
        for (let k = 0; k < 2; k++) {
          const y = r * rh + rand() * rh;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + len, y + (rand() - 0.5) * 3);
          g.stroke();
        }
        x += len;
      }
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.fillRect(0, r * rh, s, 1.5);
    }
  });
}

function tilesTexture(base: string, perSide: number, grout: string): THREE.CanvasTexture {
  return canvasTexture(512, (g, s) => {
    const rand = rng(perSide * 31 + base.charCodeAt(2));
    const t = s / perSide;
    g.fillStyle = grout;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < perSide; i++) {
      for (let j = 0; j < perSide; j++) {
        g.fillStyle = shade(base, (rand() - 0.5) * 0.05);
        g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    }
  });
}

const FLOOR_TEX: Record<FloorKind, () => THREE.CanvasTexture> = {
  oak: () => planksTexture("#c7a47c"),
  walnut: () => planksTexture("#8d6952"),
  tile: () => tilesTexture("#d5dade", 4, "#aab0b8"),
  stone: () => tilesTexture("#9ea5ae", 3, "#787e87"),
};

const floorMaterials = new Map<FloorKind, THREE.MeshStandardMaterial>();

export function floorMaterial(kind: FloorKind): THREE.MeshStandardMaterial {
  const name: FloorKind = FLOOR_TEX[kind] ? kind : "oak";
  let m = floorMaterials.get(name);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: FLOOR_TEX[name](),
      roughness: name === "tile" || name === "stone" ? 0.52 : 0.72,
    });
    floorMaterials.set(name, m);
  }
  return m;
}

export function floorMesh(room: StoreRoomSpec): THREE.Mesh {
  const [rx, rz, rw, rd] = room.rect;
  const geo = new THREE.PlaneGeometry(rw, rd);
  geo.rotateX(-Math.PI / 2);
  geo.translate(rx + rw / 2, 0, rz + rd / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / TILE_SCALE, pos.getZ(i) / TILE_SCALE);
  }
  const mesh = new THREE.Mesh(geo, floorMaterial(room.floor));
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------- Automatic Cutaway Store Architecture (house.js pattern) ---------- */

const EXT_T = 0.2;
const INT_T = 0.1;
const CURB = 0.14;
const EPS = 1e-4;
const keyCoord = (v: number) => Math.round(v * 1000);

interface WallSeg {
  axis: "x" | "z";
  c: number;
  a: number;
  b: number;
  kind: "exterior" | "interior";
  inside: number;
  opening: (StoreOpeningSpec & { a: number; b: number }) | null;
  freeA?: boolean;
  freeB?: boolean;
}

export function computeBounds(rooms: StoreRoomSpec[]) {
  if (!rooms.length) return { minX: 0, minZ: 0, maxX: 8.8, maxZ: 5.6 };
  const minX = Math.min(...rooms.map((r) => r.rect[0]));
  const minZ = Math.min(...rooms.map((r) => r.rect[1]));
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const maxZ = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  return { minX, minZ, maxX, maxZ };
}

function wallSegments(doc: StoreFloorPlanDoc): WallSeg[] {
  const lines = new Map<
    string,
    {
      axis: "x" | "z";
      c: number;
      edges: { a: number; b: number; inside: number }[];
      openings: (StoreOpeningSpec & { a: number; b: number })[];
    }
  >();
  const line = (axis: "x" | "z", c: number) => {
    const k = `${axis}:${keyCoord(c)}`;
    let l = lines.get(k);
    if (!l) {
      l = { axis, c, edges: [], openings: [] };
      lines.set(k, l);
    }
    return l;
  };

  for (const r of doc.rooms) {
    const [x, z, w, d] = r.rect;
    line("x", z).edges.push({ a: x, b: x + w, inside: 1 });
    line("x", z + d).edges.push({ a: x, b: x + w, inside: -1 });
    line("z", x).edges.push({ a: z, b: z + d, inside: 1 });
    line("z", x + w).edges.push({ a: z, b: z + d, inside: -1 });
  }

  for (const o of doc.openings) {
    const alongX = Math.abs(o.from[1] - o.to[1]) < 0.05;
    const k = alongX ? `x:${keyCoord(o.from[1])}` : `z:${keyCoord(o.from[0])}`;
    const l = lines.get(k);
    if (!l) continue;
    const p = alongX ? [o.from[0], o.to[0]] : [o.from[1], o.to[1]];
    l.openings.push({ ...o, a: Math.min(...p), b: Math.max(...p) });
  }

  const segments: WallSeg[] = [];
  for (const l of lines.values()) {
    const pts = [
      ...new Set([...l.edges, ...l.openings].flatMap((e) => [keyCoord(e.a), keyCoord(e.b)])),
    ]
      .sort((p, q) => p - q)
      .map((p) => p / 1000);
    const run: WallSeg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = (pts[i] + pts[i + 1]) / 2;
      const covering = l.edges.filter((e) => e.a < mid && mid < e.b);
      if (!covering.length) continue;
      const seg: WallSeg = {
        axis: l.axis,
        c: l.c,
        a: pts[i],
        b: pts[i + 1],
        kind: covering.length > 1 ? "interior" : "exterior",
        inside: covering[0].inside,
        opening: l.openings.find((o) => o.a < mid && mid < o.b) || null,
      };
      const prev = run[run.length - 1];
      if (
        prev &&
        Math.abs(prev.b - seg.a) < EPS &&
        prev.kind === seg.kind &&
        prev.inside === seg.inside &&
        prev.opening === seg.opening
      ) {
        prev.b = seg.b;
      } else {
        run.push(seg);
      }
    }
    run.forEach((s, i) => {
      s.freeA = !(run[i - 1] && Math.abs(run[i - 1].b - s.a) < EPS);
      s.freeB = !(run[i + 1] && Math.abs(run[i + 1].a - s.b) < EPS);
    });
    segments.push(...run);
  }
  return segments;
}

export function buildStoreHouse(doc: StoreFloorPlanDoc, camDir: THREE.Vector3) {
  const group = new THREE.Group();
  const floors: THREE.Mesh[] = [];
  const H = doc.wallHeight;
  const Hi = Math.min(doc.interiorWallHeight, H);
  const { minX, minZ, maxX, maxZ } = computeBounds(doc.rooms);

  // Architectural plinth base
  const plinth = box(
    maxX - minX + 0.72,
    0.32,
    maxZ - minZ + 0.72,
    mat("#141927", { rough: 0.9 }),
    { r: 0.12 }
  );
  at(plinth, (minX + maxX) / 2, -0.325, (minZ + maxZ) / 2);
  plinth.receiveShadow = true;
  group.add(plinth);

  for (const room of doc.rooms) {
    const floor = floorMesh(room);
    floor.userData = { kind: "room", id: room.id, name: room.name };
    floors.push(floor);
    group.add(floor);
  }

  const wallBody = mat("#e7e3db", { rough: 0.94 });
  const wallCap = mat("#262b3a", { rough: 0.8 });
  const wallMats = [wallBody, wallBody, wallCap, wallBody, wallBody, wallBody];
  const blocker = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const glass = new THREE.MeshStandardMaterial({
    color: "#9cc0ff",
    roughness: 0.08,
    transparent: true,
    opacity: 0.24,
    emissive: "#3d5fae",
    emissiveIntensity: 0.52,
  });
  const frame = mat("#2c3142", { rough: 0.55 });

  const piece = (
    s: WallSeg,
    a: number,
    b: number,
    y0: number,
    y1: number,
    t: number,
    mats: THREE.Material | THREE.Material[] = wallMats
  ) => {
    const len = Math.max(0.01, b - a);
    const geo =
      s.axis === "x"
        ? new THREE.BoxGeometry(len, Math.max(0.01, y1 - y0), t)
        : new THREE.BoxGeometry(t, Math.max(0.01, y1 - y0), len);
    const m = new THREE.Mesh(geo, mats);
    const mid = (a + b) / 2;
    m.position.set(s.axis === "x" ? mid : s.c, (y0 + y1) / 2, s.axis === "x" ? s.c : mid);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };

  for (const s of wallSegments(doc)) {
    const exterior = s.kind === "exterior";
    const t = exterior ? EXT_T : INT_T;
    const nx = s.axis === "z" ? -s.inside : 0;
    const nz = s.axis === "x" ? -s.inside : 0;
    const near = exterior && nx * camDir.x + nz * camDir.z > 0.15;
    const a = s.a - (s.freeA ? EXT_T / 2 : 0);
    const b = s.b + (s.freeB ? EXT_T / 2 : 0);
    const type = s.opening?.type;

    if (near) {
      if (type !== "door") piece(s, a, b, 0, CURB, t);
      continue;
    }
    if (type === "door" || type === "open") continue;

    const height = exterior ? H : Hi;
    if (type === "window" && exterior && s.opening) {
      const sill = s.opening.sill ?? 0.65;
      const head = s.opening.head ?? 2.25;
      piece(s, a, b, 0, sill, t);
      piece(s, a, b, Math.min(head, H), H, t);
      const pane = piece(s, a, b, sill, head, 0.03, glass);
      pane.castShadow = false;
      const fw = 0.05;
      const bars: [number, number, number, number][] = [
        [a, a + fw, sill, head],
        [b - fw, b, sill, head],
        [a, b, sill, sill + fw],
        [a, b, head - fw, head],
      ];
      if (b - a > 1.2) {
        bars.push([(a + b) / 2 - fw / 2, (a + b) / 2 + fw / 2, sill, head]);
      }
      for (const [fa, fb, y0, y1] of bars) piece(s, fa, fb, y0, y1, 0.07, frame);
      continue;
    }
    if (type === "window") {
      // Interior glass partition (e.g., open baking room view window)
      const sill = s.opening?.sill ?? 0.9;
      const head = s.opening?.head ?? 2.1;
      piece(s, a, b, 0, Math.min(sill, Hi), t);
      const pane = piece(s, a, b, Math.min(sill, Hi), head, 0.025, glass);
      pane.castShadow = false;
      continue;
    }

    piece(s, a, b, 0, height, t);
    if (!exterior && Hi < H) {
      piece(s, a, b, Hi, H, 0.04, blocker).receiveShadow = false;
    }
  }

  return { group, floors };
}

/* ---------- Bespoke 3D Commercial Store Furniture Library ---------- */

const WOOD = "#b38b5d";
const DARK_WOOD = "#563e2e";
const WHITE = "#efede8";
const BLACK = "#1b1d24";
const CHROME = "#b8c0cc";
const BRASS = "#d4a857";
const MARBLE = "#f4f2ed";

const makeGroup = (...children: (THREE.Object3D | THREE.Object3D[] | null | undefined)[]) => {
  const g = new THREE.Group();
  for (const c of children.flat()) {
    if (c) g.add(c);
  }
  return g;
};

function legs(w: number, d: number, h: number, material: THREE.Material, inset = 0.06, r = 0.02) {
  const out: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(at(cyl(r, r * 0.8, h, material, 10), sx * (w / 2 - inset), 0, sz * (d / 2 - inset)));
    }
  }
  return out;
}

function cafeChair3D(color = "#2b2f3a") {
  const m = mat(color, { rough: 0.65 });
  const back = at(box(0.42, 0.38, 0.04, m, { r: 0.02 }), 0, 0.46, -0.19);
  back.rotation.x = -0.1;
  return makeGroup(
    ...legs(0.42, 0.42, 0.43, mat(BLACK, { rough: 0.4 }), 0.04, 0.014),
    at(box(0.44, 0.045, 0.44, m, { r: 0.02 }), 0, 0.42, 0),
    back
  );
}

export function buildStoreFurnitureItem3D(
  item: StoreFurnitureInput,
  category: "cafe" | "bakery" | "popup" | "takeout",
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  selected: boolean
): THREE.Group {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const w = Math.max(0.45, item.w * spanX);
  const d = Math.max(0.45, item.h * spanZ);
  const cx = bounds.minX + (item.x + item.w / 2) * spanX;
  const cz = bounds.minZ + (item.y + item.h / 2) * spanZ;

  let meshGroup: THREE.Group;

  switch (item.type) {
    case "counter": {
      // Main Espresso Bar / Bakery POS Counter / Popup Reception
      const baseColor =
        category === "popup" ? "#2e3545" : category === "bakery" ? "#7c5836" : DARK_WOOD;
      const topMat = mat(MARBLE, { rough: 0.25 });
      const bodyMat = mat(baseColor, { rough: 0.65 });
      const slatMat = mat(WOOD, { rough: 0.55 });
      const chromeMat = mat(CHROME, { rough: 0.22, metal: 0.85 });
      const screenMat = mat("#070b14", {
        rough: 0.2,
        emissive: "#38bdf8",
        emissiveIntensity: 0.85,
      });
      const ledStrip = mat("#ffbd7a", {
        rough: 0.3,
        emissive: "#ffaa44",
        emissiveIntensity: 1.8,
      });

      const parts: THREE.Object3D[] = [
        at(box(w - 0.06, 0.88, d - 0.06, bodyMat, { r: 0.02 }), 0, 0, 0),
        at(box(w, 0.05, d, topMat, { r: 0.015 }), 0, 0.88, 0),
        // Warm under-bar LED kickstrip
        at(box(w - 0.1, 0.03, 0.02, ledStrip, { r: 0.008 }), 0, 0.06, d / 2 - 0.02),
      ];
      // Slatted front ribs
      const slats = Math.max(4, Math.floor(w / 0.18));
      for (let i = 0; i < slats; i++) {
        const sx = -w / 2 + 0.08 + ((w - 0.16) / Math.max(1, slats - 1)) * i;
        parts.push(at(box(0.035, 0.78, 0.02, slatMat, { r: 0.005 }), sx, 0.08, d / 2 - 0.02));
      }

      if (category !== "popup") {
        // 2-Group La Marzocco Espresso Machine + 2 Bean Grinders + Knockbox
        const ex = -w * 0.22;
        parts.push(
          at(box(Math.min(0.68, w * 0.36), 0.38, Math.min(0.46, d * 0.55), chromeMat, { r: 0.03 }), ex, 0.93, -0.04),
          at(box(Math.min(0.62, w * 0.32), 0.04, 0.26, mat(BLACK, { rough: 0.4 }), { r: 0.01 }), ex, 0.93, 0.14),
          // Cup warmer stack on top of espresso machine
          at(cyl(0.04, 0.035, 0.14, mat(WHITE, { rough: 0.3 })), ex - 0.16, 1.31, -0.04),
          at(cyl(0.04, 0.035, 0.12, mat(WHITE, { rough: 0.3 })), ex - 0.06, 1.31, -0.04),
          // Dual Grinders
          at(cyl(0.07, 0.08, 0.32, mat(BLACK, { rough: 0.4 })), ex + 0.46, 0.93, -0.05),
          at(cyl(0.08, 0.06, 0.18, mat("#9cc0ff", { rough: 0.1, opacity: 0.55 })), ex + 0.46, 1.25, -0.05),
          at(cyl(0.065, 0.075, 0.3, mat(BLACK, { rough: 0.4 })), ex + 0.64, 0.93, -0.05)
        );
      }

      // POS dual-screen terminal on the right
      const px = w * 0.28;
      parts.push(
        at(box(0.28, 0.2, 0.03, mat(BLACK, { rough: 0.35 }), { r: 0.01 }), px, 1.02, 0.05),
        at(box(0.25, 0.17, 0.01, screenMat, { r: 0.005 }), px, 1.035, 0.068),
        at(cyl(0.04, 0.06, 0.1, mat(BLACK, { rough: 0.4 })), px, 0.93, 0.05)
      );

      meshGroup = makeGroup(parts);
      break;
    }

    case "showcase": {
      if (category === "bakery") {
        // Center Artisan Bakery Island / Pastry Vitrine with Croissants, Sourdough & Warm Shelf Glow
        const woodMat = mat(WOOD, { rough: 0.58 });
        const trayMat = mat("#3d2d20", { rough: 0.75 });
        const glassMat = mat("#bfe0ff", {
          rough: 0.08,
          opacity: 0.32,
          emissive: "#ffbd7a",
          emissiveIntensity: 0.35,
        });
        const breadGold = mat("#d98a3c", { rough: 0.72 });
        const breadCrust = mat("#a85d24", { rough: 0.8 });
        const creamMat = mat("#fff7e6", { rough: 0.5 });

        const parts: THREE.Object3D[] = [
          at(box(w, 0.78, d, woodMat, { r: 0.025 }), 0, 0, 0),
          at(box(w + 0.04, 0.04, d + 0.04, mat(MARBLE, { rough: 0.3 }), { r: 0.015 }), 0, 0.78, 0),
          // Glass sneeze-guard case
          at(box(w - 0.08, 0.38, d - 0.08, glassMat, { r: 0.01 }), 0, 0.82, 0),
          // Warm internal LED bar
          at(
            box(w - 0.16, 0.02, 0.03, mat("#ffbd7a", { emissive: "#ffae42", emissiveIntensity: 2.2 })),
            0,
            1.17,
            0
          ),
        ];

        // Fill trays with 3D croissants, sourdough loaves, and berry tarts
        const cols = Math.max(2, Math.floor(w / 0.42));
        const rows = Math.max(1, Math.floor(d / 0.42));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const tx = -w / 2 + (w / cols) * (c + 0.5);
            const tz = -d / 2 + (d / rows) * (r + 0.5);
            parts.push(at(box(0.32, 0.02, 0.26, trayMat, { r: 0.008 }), tx, 0.83, tz));
            // 2 loaves/pastries per tray
            parts.push(
              at(box(0.11, 0.065, 0.08, (c + r) % 2 === 0 ? breadGold : breadCrust, { r: 0.03 }), tx - 0.07, 0.85, tz),
              at(box(0.11, 0.065, 0.08, (c + r) % 3 === 0 ? creamMat : breadGold, { r: 0.03 }), tx + 0.07, 0.85, tz)
            );
          }
        }
        meshGroup = makeGroup(parts);
      } else if (category === "popup") {
        // Seongsu Popup Sculptural Hero Plinth + Illuminated Art Object
        const plinthMat = mat("#e5e7eb", { rough: 0.35 });
        const neonBase = mat("#a855f7", {
          rough: 0.2,
          emissive: "#c084fc",
          emissiveIntensity: 2.0,
        });
        const sculptureMat = mat("#38bdf8", {
          rough: 0.15,
          metal: 0.7,
          emissive: "#0284c7",
          emissiveIntensity: 0.9,
        });
        const glassCase = mat("#e0f2fe", { rough: 0.08, opacity: 0.22 });
        const sculpture = new THREE.Mesh(
          new THREE.TorusKnotGeometry(Math.min(w, d) * 0.18, 0.045, 64, 12),
          sculptureMat
        );
        sculpture.position.set(0, 1.18, 0);
        meshGroup = makeGroup(
          at(box(w * 0.88, 0.82, d * 0.88, plinthMat, { r: 0.03 }), 0, 0, 0),
          at(box(w * 0.92, 0.03, d * 0.92, neonBase, { r: 0.01 }), 0, 0.02, 0),
          at(box(w * 0.78, 0.68, d * 0.78, glassCase, { r: 0.01 }), 0, 0.82, 0),
          sculpture
        );
      } else {
        // Cafe Refrigerated Cake & Bottle Vitrine
        const glassMat = mat("#cce4ff", {
          rough: 0.1,
          opacity: 0.34,
          emissive: "#ffbd7a",
          emissiveIntensity: 0.4,
        });
        meshGroup = makeGroup(
          at(box(w, 0.72, d, mat(DARK_WOOD, { rough: 0.6 }), { r: 0.02 }), 0, 0, 0),
          at(box(w - 0.04, 0.56, d - 0.04, glassMat, { r: 0.015 }), 0, 0.72, 0),
          at(box(w - 0.1, 0.02, d - 0.1, mat(WHITE, { rough: 0.3 }), { r: 0.005 }), 0, 0.98, 0),
          at(cyl(0.11, 0.11, 0.09, mat("#f43f5e", { rough: 0.5 })), -w * 0.2, 1.0, 0),
          at(cyl(0.11, 0.11, 0.09, mat("#f59e0b", { rough: 0.5 })), w * 0.2, 1.0, 0)
        );
      }
      break;
    }

    case "prep": {
      if (category === "bakery") {
        // Commercial 3-Tier Stainless Deck Oven with Glowing Baking Chambers
        const steel = mat("#cbd5e1", { rough: 0.32, metal: 0.75 });
        const darkSteel = mat("#334155", { rough: 0.45, metal: 0.6 });
        const ovenGlow = mat("#ff7b24", {
          rough: 0.2,
          emissive: "#ff5500",
          emissiveIntensity: 1.9,
        });
        const parts: THREE.Object3D[] = [
          at(box(w, 1.68, d, steel, { r: 0.025 }), 0, 0, 0),
          at(box(w + 0.04, 0.14, d + 0.06, darkSteel, { r: 0.015 }), 0, 1.68, 0),
        ];
        for (let tier = 0; tier < 3; tier++) {
          const y = 0.38 + tier * 0.42;
          parts.push(
            at(box(w * 0.76, 0.26, 0.03, darkSteel, { r: 0.008 }), -w * 0.06, y, d / 2),
            at(box(w * 0.68, 0.16, 0.02, ovenGlow, { r: 0.005 }), -w * 0.06, y + 0.05, d / 2 + 0.01)
          );
        }
        meshGroup = makeGroup(parts);
      } else {
        // Specialty Coffee Roaster + Stainless Back-Bar Sink & Prep Station
        const steel = mat("#d1d5db", { rough: 0.35, metal: 0.7 });
        const copper = mat("#b45309", { rough: 0.28, metal: 0.82 });
        meshGroup = makeGroup(
          at(box(w, 0.86, d, steel, { r: 0.02 }), 0, 0, 0),
          at(box(w * 0.42, 0.02, d * 0.65, mat(BLACK, { rough: 0.2 })), -w * 0.2, 0.86, 0),
          // Roaster drum & hopper on right side
          at(cyl(0.18, 0.18, 0.46, copper, 20), w * 0.22, 0.86, 0),
          at(cyl(0.12, 0.05, 0.24, mat(BLACK, { rough: 0.4 }), 16), w * 0.22, 1.32, -0.05)
        );
      }
      break;
    }

    case "table2": {
      const r = Math.min(w, d) * 0.38;
      const topColor = category === "popup" ? "#e2e8f0" : WOOD;
      const chairA = cafeChair3D("#2b2e37");
      chairA.position.set(-r - 0.12, 0, 0);
      chairA.rotation.y = Math.PI / 2;
      const chairB = cafeChair3D("#2b2e37");
      chairB.position.set(r + 0.12, 0, 0);
      chairB.rotation.y = -Math.PI / 2;
      meshGroup = makeGroup(
        at(cyl(0.18, 0.2, 0.025, mat(BLACK, { rough: 0.4 })), 0, 0, 0),
        at(cyl(0.028, 0.028, 0.7, mat(BLACK, { rough: 0.4 }), 12), 0, 0.02, 0),
        at(cyl(r, r, 0.04, mat(topColor, { rough: 0.5 }), 28), 0, 0.71, 0),
        // Two ceramic cups
        at(cyl(0.04, 0.032, 0.065, mat(WHITE, { rough: 0.3 })), -0.09, 0.75, 0.04),
        at(cyl(0.04, 0.032, 0.065, mat("#d97706", { rough: 0.4 })), 0.09, 0.75, -0.04),
        chairA,
        chairB
      );
      break;
    }

    case "table4": {
      const tw = Math.max(0.75, w * 0.76);
      const td = Math.max(0.55, d * 0.64);
      const g = makeGroup(
        at(box(tw, 0.045, td, mat(WOOD, { rough: 0.55 }), { r: 0.018 }), 0, 0.71, 0),
        ...legs(tw, td, 0.71, mat(BLACK, { rough: 0.45 }), 0.08, 0.022),
        at(cyl(0.09, 0.07, 0.06, mat(WHITE, { rough: 0.35 })), 0, 0.755, 0),
        at(box(0.22, 0.03, 0.16, mat("#c9553f", { rough: 0.85 }), { r: 0.006 }), 0.18, 0.755, 0.08)
      );
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const c = cafeChair3D("#2b2e37");
          c.position.set(sx * (tw * 0.27), 0, sz * (td / 2 + 0.12));
          c.rotation.y = sz > 0 ? Math.PI : 0;
          g.add(c);
        }
      }
      meshGroup = g;
      break;
    }

    case "sofa": {
      if (category === "popup") {
        // Neon Photo Booth & Velvet Bench
        const neonFrame = mat("#ec4899", {
          rough: 0.2,
          emissive: "#f472b6",
          emissiveIntensity: 2.2,
        });
        const mirrorMat = new THREE.MeshStandardMaterial({
          color: "#dbeafe",
          roughness: 0.06,
          metalness: 0.92,
        });
        meshGroup = makeGroup(
          at(box(w, 1.85, 0.08, mat("#1e1b4b", { rough: 0.7 }), { r: 0.02 }), 0, 0, -d / 2 + 0.05),
          at(box(w * 0.72, 1.45, 0.03, mirrorMat, { r: 0.02 }), 0, 0.22, -d / 2 + 0.09),
          at(box(w * 0.78, 1.52, 0.02, neonFrame, { r: 0.02 }), 0, 0.19, -d / 2 + 0.08),
          at(box(w * 0.75, 0.42, d * 0.48, mat("#a855f7", { rough: 0.85 }), { r: 0.08 }), 0, 0, d * 0.14)
        );
      } else {
        // Cozy Cafe Banquette Sofa + Low Coffee Table
        const fabric = mat("#c28a5a", { rough: 0.92 });
        const darkFabric = mat("#9c6b43", { rough: 0.95 });
        meshGroup = makeGroup(
          at(box(w, 0.22, d * 0.56, darkFabric, { r: 0.05 }), 0, 0.08, -d * 0.14),
          at(box(w - 0.12, 0.52, 0.22, darkFabric, { r: 0.08 }), 0, 0.3, -d * 0.32),
          at(box(w - 0.16, 0.16, d * 0.48, fabric, { r: 0.06 }), 0, 0.28, -d * 0.1),
          // Throw pillow
          at(box(0.32, 0.32, 0.12, mat("#f3e8d6", { rough: 0.95 }), { r: 0.05 }), -w * 0.28, 0.44, -d * 0.18),
          // Low coffee table in front
          at(box(w * 0.65, 0.04, 0.42, mat(WOOD, { rough: 0.55 }), { r: 0.015 }), 0, 0.38, d * 0.26),
          ...legs(w * 0.65, 0.42, 0.38, mat(BLACK, { rough: 0.45 }), 0.05, 0.014).map((l) => {
            l.position.z += d * 0.26;
            return l;
          })
        );
      }
      break;
    }

    case "windowbar": {
      const stools = Math.max(2, item.seats || 3);
      const g = makeGroup(
        at(box(w, 0.05, d * 0.55, mat(WOOD, { rough: 0.52 }), { r: 0.015 }), 0, 0.88, -d * 0.12),
        ...legs(w, d * 0.5, 0.88, mat(BLACK, { rough: 0.45 }), 0.06, 0.018).map((l) => {
          l.position.z -= d * 0.12;
          return l;
        })
      );
      for (let i = 0; i < stools; i++) {
        const sx = -w / 2 + (w / stools) * (i + 0.5);
        g.add(
          makeGroup(
            at(cyl(0.14, 0.14, 0.014, mat(BLACK, { rough: 0.4 })), sx, 0, d * 0.24),
            at(cyl(0.015, 0.015, 0.64, mat(CHROME, { rough: 0.28, metal: 0.8 }), 10), sx, 0, d * 0.24),
            at(cyl(0.15, 0.14, 0.05, mat("#c28a5a", { rough: 0.88 })), sx, 0.64, d * 0.24)
          )
        );
      }
      meshGroup = g;
      break;
    }

    case "kiosk": {
      const screenGlow = mat("#0284c7", {
        rough: 0.15,
        emissive: "#38bdf8",
        emissiveIntensity: 1.5,
      });
      meshGroup = makeGroup(
        at(box(0.46, 0.04, 0.42, mat(BLACK, { rough: 0.4 }), { r: 0.015 }), 0, 0, 0),
        at(box(0.22, 0.92, 0.18, mat("#1e293b", { rough: 0.45 }), { r: 0.02 }), 0, 0.04, 0),
        at(box(0.44, 0.68, 0.07, mat(BLACK, { rough: 0.3 }), { r: 0.02 }), 0, 0.92, 0.02),
        at(box(0.38, 0.58, 0.015, screenGlow, { r: 0.01 }), 0, 0.97, 0.055)
      );
      break;
    }

    case "shelf": {
      const rand = rng(Math.round(w * 100 + d * 37));
      const woodMat = mat(category === "popup" ? "#e2e8f0" : WOOD, { rough: 0.58 });
      const height = 1.65;
      const g = makeGroup(at(box(w, height, 0.035, woodMat, { r: 0 }), 0, 0, -d / 2 + 0.02));
      for (const sx of [-1, 1]) {
        g.add(at(box(0.03, height, d, woodMat, { r: 0 }), sx * (w / 2 - 0.015), 0, 0));
      }
      const shelves = 4;
      const itemColors =
        category === "bakery"
          ? ["#d98a3c", "#a85d24", "#e6b87d", "#8c4a1c"]
          : category === "popup"
            ? ["#a855f7", "#38bdf8", "#f472b6", "#facc15"]
            : ["#c9553f", "#3d6b8c", "#d8c9a8", "#4f9462", "#d9b98a"];
      for (let i = 0; i <= shelves; i++) {
        const y = (height - 0.03) * (i / shelves);
        g.add(at(box(w, 0.03, d, woodMat, { r: 0 }), 0, y, 0));
        if (i === shelves) break;
        let x = -w / 2 + 0.08;
        while (x < w / 2 - 0.14) {
          const bw = 0.08 + rand() * 0.08;
          const bh = 0.16 + rand() * 0.1;
          g.add(
            at(
              box(bw, bh, d * 0.55, mat(itemColors[Math.floor(rand() * itemColors.length)], { rough: 0.75 }), { r: 0.015 }),
              x + bw / 2,
              y + 0.03,
              0
            )
          );
          x += bw + 0.05;
        }
      }
      meshGroup = g;
      break;
    }

    case "plant":
    default: {
      const height = 1.25;
      const rand = rng(Math.round(cx * 100 + cz * 100));
      const leaves = [
        mat("#3f7d52", { rough: 0.88 }),
        mat("#4f9462", { rough: 0.88 }),
        mat("#35694a", { rough: 0.88 }),
      ];
      const g = makeGroup(
        at(cyl(0.18, 0.13, 0.32, mat("#d7d0c4", { rough: 0.8 })), 0, 0, 0),
        at(cyl(0.16, 0.16, 0.02, mat("#3a2c22", { rough: 1 })), 0, 0.305, 0),
        at(cyl(0.018, 0.024, height * 0.55, mat("#6b4a33", { rough: 1 }), 8), 0, 0.32, 0)
      );
      const count = 12;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const y = 0.52 + t * (height - 0.62);
        const spread = 0.28 * Math.sin(Math.PI * (0.25 + t * 0.7));
        const a = rand() * Math.PI * 2;
        const blob = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.13 + rand() * 0.09, 1),
          leaves[i % 3]
        );
        blob.position.set(Math.cos(a) * spread * rand(), y, Math.sin(a) * spread * rand());
        blob.scale.y = 0.75 + rand() * 0.3;
        g.add(blob);
      }
      meshGroup = g;
      break;
    }
  }

  // Selection highlight ring on floor when selected
  if (selected) {
    const ring = at(
      box(w + 0.14, 0.018, d + 0.14, mat("#38bdf8", { emissive: "#38bdf8", emissiveIntensity: 1.6, opacity: 0.55 }), { r: 0.04 }),
      0,
      0.005,
      0
    );
    meshGroup.add(ring);
  }

  meshGroup.position.set(cx, 0, cz);
  meshGroup.rotation.y = THREE.MathUtils.degToRad(item.rot || 0);
  meshGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Invisible hit box for direct 3D picking
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.3, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(0, 0.65, 0);
  hit.userData = { kind: "furniture", id: item.id, label: item.label };
  meshGroup.add(hit);

  return meshGroup;
}

/* ---------- Real Three.js Dynamic Lighting (lights.js pattern) ---------- */

const KELVIN_STOPS: [number, THREE.Color][] = [
  [2200, new THREE.Color("#ff9438")],
  [3000, new THREE.Color("#ffbd7a")],
  [4200, new THREE.Color("#ffe2c2")],
  [6500, new THREE.Color("#dfe9ff")],
];

export function tempToColor(kelvin: number, out = new THREE.Color()): THREE.Color {
  const k = Math.min(6500, Math.max(2200, kelvin));
  for (let i = 0; i < KELVIN_STOPS.length - 1; i++) {
    const [k0, c0] = KELVIN_STOPS[i];
    const [k1, c1] = KELVIN_STOPS[i + 1];
    if (k <= k1) return out.copy(c0).lerp(c1, (k - k0) / (k1 - k0));
  }
  return out.copy(KELVIN_STOPS[KELVIN_STOPS.length - 1][1]);
}

const FIXTURE_DARK = "#23262e";

function glowMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#8d8f96",
    roughness: 0.55,
    emissive: "#000000",
    emissiveIntensity: 1,
  });
}

function makeSpotLight(intensity: number, y: number, castShadow = false) {
  const light = new THREE.SpotLight(0xffffff, 0, 0, 1.22, 0.75, 2);
  light.position.set(0, y, 0);
  light.target.position.set(0, y - 1, 0);
  if (castShadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.15;
    light.shadow.camera.far = 9;
    light.shadow.bias = -0.0008;
    light.shadow.normalBias = 0.03;
  }
  light.userData.max = intensity;
  return light;
}

function makePointLight(intensity: number, y: number, distance = 0, x = 0, z = 0) {
  const light = new THREE.PointLight(0xffffff, 0, distance, 2);
  light.position.set(x, y, z);
  light.userData.max = intensity;
  return light;
}

export class StoreLightUnit {
  cfg: StoreLightSpec;
  id: string;
  group: THREE.Group;
  model: THREE.Group;
  pivotY: number;
  glow: THREE.MeshStandardMaterial[];
  lights: (THREE.SpotLight | THREE.PointLight)[];
  hit: THREE.Mesh;
  level = 0;
  goal = 1;
  color = new THREE.Color("#ffbd7a");
  goalColor = new THREE.Color("#ffbd7a");
  hover = 0;
  hoverGoal = 0;
  pulse = 0;

  constructor(cfg: StoreLightSpec, H: number, castShadow = false) {
    this.cfg = cfg;
    this.id = cfg.id;

    let parts: THREE.Mesh[] = [];
    let glowMeshes: THREE.Mesh[] = [];
    let lights: (THREE.SpotLight | THREE.PointLight)[] = [];
    let hitSpec: [number, number, number, number] = [0.75, 0.5, 0.75, H - 0.14];

    if (cfg.type === "pendant") {
      const y = cfg.y ?? 1.82;
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), glowMaterial());
      globe.position.set(0, y, 0);
      parts = [
        at(cyl(0.006, 0.006, H - y - 0.14, mat(FIXTURE_DARK), 6), 0, y + 0.14, 0),
        at(cyl(0.04, 0.05, 0.05, mat(BRASS, { rough: 0.35, metal: 0.7 }), 14), 0, y + 0.13, 0),
      ];
      glowMeshes = [globe];
      lights = [makeSpotLight(11, y - 0.05, castShadow)];
      hitSpec = [0.6, 0.7, 0.6, y];
    } else if (cfg.type === "spots") {
      const y = cfg.y ?? H - 0.16;
      glowMeshes = [-0.32, 0, 0.32].map((x) =>
        at(cyl(0.055, 0.045, 0.1, glowMaterial(), 16), x, y - 0.06, 0)
      );
      parts = [at(box(0.96, 0.03, 0.05, mat(FIXTURE_DARK, { rough: 0.5 }), { r: 0.01 }), 0, y + 0.05, 0)];
      lights = [makeSpotLight(22, y - 0.08, castShadow)];
      hitSpec = [1.1, 0.45, 0.5, y];
    } else if (cfg.type === "strip") {
      const y = cfg.y ?? 1.15;
      const length = cfg.length ?? 1.8;
      glowMeshes = [at(box(length, 0.025, 0.025, glowMaterial(), { r: 0.008 }), 0, y, 0)];
      lights = [
        makePointLight(2.4, y, 4.2, -length * 0.25, 0.06),
        makePointLight(2.4, y, 4.2, length * 0.25, 0.06),
      ];
      hitSpec = [length + 0.2, 0.4, 0.4, y];
    } else if (cfg.type === "floor") {
      const shadeMesh = cyl(0.14, 0.19, 0.3, glowMaterial(), 24);
      parts = [
        at(cyl(0.15, 0.16, 0.025, mat(FIXTURE_DARK, { rough: 0.4, metal: 0.5 })), 0, 0, 0),
        at(cyl(0.012, 0.012, 1.3, mat(FIXTURE_DARK, { rough: 0.4, metal: 0.5 }), 8), 0, 0.02, 0),
      ];
      glowMeshes = [at(shadeMesh, 0, 1.28, 0)];
      lights = [makePointLight(4.2, 1.46, 5.5)];
      hitSpec = [0.6, 1.7, 0.6, 0.85];
    } else {
      const y = cfg.y ?? H - 0.14;
      parts = [at(cyl(0.012, 0.012, H - y - 0.05, mat(FIXTURE_DARK), 8), 0, y + 0.05, 0)];
      glowMeshes = [at(cyl(0.26, 0.26, 0.055, glowMaterial(), 32), 0, y, 0)];
      lights = [makeSpotLight(18, y - 0.02, castShadow)];
      hitSpec = [0.75, 0.5, 0.75, y];
    }

    this.group = new THREE.Group();
    this.group.position.set(cfg.pos[0], 0, cfg.pos[1]);
    this.group.rotation.y = THREE.MathUtils.degToRad(cfg.rot || 0);

    this.model = new THREE.Group();
    this.pivotY = hitSpec[3];
    this.model.position.y = this.pivotY;
    for (const m of [...parts, ...glowMeshes]) {
      m.position.y -= this.pivotY;
      m.castShadow = false;
      m.receiveShadow = false;
      this.model.add(m);
    }
    this.group.add(this.model);

    this.glow = glowMeshes.map((m) => m.material as THREE.MeshStandardMaterial);
    this.lights = lights;
    for (const l of this.lights) {
      this.group.add(l);
      if ((l as THREE.SpotLight).target) this.group.add((l as THREE.SpotLight).target);
    }

    const [hw, hh, hd, hy] = hitSpec;
    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(hw, hh, hd),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.position.y = hy;
    this.hit.userData = { kind: "light", id: cfg.id, name: cfg.name };
    this.group.add(this.hit);

    this.apply({
      on: cfg.on !== false,
      brightness: cfg.brightness ?? 0.9,
      temp: cfg.temp ?? 3000,
      color: cfg.color,
    }, true);
  }

  apply(
    state: { on: boolean; brightness: number; temp: number; color?: string },
    instant = false
  ) {
    this.goal = state.on ? state.brightness : 0;
    if (state.color) this.goalColor.set(state.color);
    else tempToColor(state.temp, this.goalColor);
    if (instant) {
      this.level = this.goal;
      this.color.copy(this.goalColor);
      this.write();
    }
  }

  bump() {
    this.pulse = 1;
  }

  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 6.5);
    const dl = this.goal - this.level;
    const dh = this.hoverGoal - this.hover;
    const moving =
      Math.abs(dl) > 0.002 || Math.abs(dh) > 0.004 || this.pulse > 0.004;
    if (!moving) return false;
    this.level += dl * k;
    this.hover += dh * (1 - Math.exp(-dt * 14));
    this.pulse *= Math.exp(-dt * 7);
    this.color.lerp(this.goalColor, 1 - Math.exp(-dt * 6));
    this.write();
    return true;
  }

  write() {
    const out = Math.pow(Math.max(0, this.level), 1.45);
    for (const l of this.lights) {
      l.intensity = (l.userData.max as number) * out;
      l.color.copy(this.color);
    }
    const e = this.level > 0.001 ? 0.85 + 1.8 * Math.pow(this.level, 0.7) : 0;
    const offColor = new THREE.Color("#5b6b93");
    const baseColor = new THREE.Color("#8d8f96");
    for (const m of this.glow) {
      m.emissive.copy(this.level < 0.001 ? offColor : this.color);
      m.emissiveIntensity = e + this.hover * 0.5;
      m.color.copy(baseColor).lerp(this.color, Math.min(1, this.level * 2));
    }
    const s = 1 + this.hover * 0.14 + Math.sin(this.pulse * Math.PI) * 0.2;
    this.model.scale.setScalar(s);
  }
}

/* ---------- Wall-Mounted Commercial AC with 3D Airflow Streaks (ac.js pattern) ---------- */

const AC_WALL_ROT: Record<WallSide, number> = {
  north: 0,
  south: Math.PI,
  west: Math.PI / 2,
  east: -Math.PI / 2,
};

const STREAKS = 64;
const REACH = 2.45;

export class StoreACUnit {
  cfg: StoreACSpec;
  id: string;
  group: THREE.Group;
  body: THREE.Group;
  led: THREE.MeshStandardMaterial;
  flapPivot: THREE.Group;
  wash: THREE.PointLight;
  flow: LineSegments2;
  flowPos: THREE.InterleavedBuffer;
  flowCol: THREE.InterleavedBuffer;
  seeds: { phase: number; u: number; speed: number; wobble: number }[];
  hit: THREE.Mesh;
  power = 1;
  goal = 1;
  color = new THREE.Color("#5db2ff");
  clock = 0;

  constructor(cfg: StoreACSpec) {
    this.cfg = cfg;
    this.id = cfg.id;

    this.group = new THREE.Group();
    this.group.position.set(cfg.pos[0], cfg.y, cfg.pos[1]);
    this.group.rotation.y = AC_WALL_ROT[cfg.wall] ?? 0;

    const body = new THREE.Group();
    body.position.z = 0.205;
    const shell = mat("#f3f4f6", { rough: 0.35 });
    this.led = new THREE.MeshStandardMaterial({
      color: "#30343c",
      emissive: "#5db2ff",
      emissiveIntensity: 2.5,
      roughness: 0.4,
    });
    const flap = box(0.8, 0.012, 0.075, mat("#e3e5e9", { rough: 0.35 }), { r: 0.004 });
    this.flapPivot = new THREE.Group();
    this.flapPivot.position.set(0, -0.145, 0.03);
    flap.position.set(0, -0.006, 0.0375);
    this.flapPivot.add(flap);

    body.add(
      at(box(0.96, 0.29, 0.21, shell, { r: 0.05 }), 0, -0.145, 0),
      at(box(0.84, 0.03, 0.09, mat("#17191d", { rough: 0.6 }), { r: 0.006 }), 0, -0.16, 0.055),
      at(box(0.085, 0.022, 0.006, this.led, { r: 0.003 }), 0.34, -0.06, 0.105),
      this.flapPivot
    );
    body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(body);
    this.body = body;

    this.wash = new THREE.PointLight(0x5db2ff, 1.3, 3.5, 2);
    this.wash.position.set(0, -0.5, 0.75);
    this.group.add(this.wash);

    const geo = new LineSegmentsGeometry();
    geo.setPositions(new Float32Array(STREAKS * 6));
    geo.setColors(new Float32Array(STREAKS * 6));
    this.flowPos = (geo.attributes.instanceStart as unknown as { data: THREE.InterleavedBuffer }).data;
    this.flowCol = (geo.attributes.instanceColorStart as unknown as { data: THREE.InterleavedBuffer }).data;
    this.flowPos.setUsage(THREE.DynamicDrawUsage);
    this.flowCol.setUsage(THREE.DynamicDrawUsage);

    this.flow = new LineSegments2(
      geo,
      new LineMaterial({
        linewidth: 2.2,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      })
    );
    this.flow.frustumCulled = false;
    this.flow.position.set(0, -0.17, 0.25);
    this.group.add(this.flow);

    this.seeds = Array.from({ length: STREAKS }, (_, i) => ({
      phase: (i * 0.618034) % 1,
      u: ((i * 0.381966) % 1) * 2 - 1,
      speed: 0.8 + ((i * 0.7548) % 1) * 0.5,
      wobble: (i * 2.399) % (Math.PI * 2),
    }));

    this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.position.set(0, -0.15, 0.25);
    this.hit.userData = { kind: "ac", id: cfg.id, name: cfg.name };
    this.group.add(this.hit);

    this.goal = cfg.on !== false ? 1 : 0;
    this.power = this.goal;
  }

  toggle() {
    this.goal = this.goal > 0.5 ? 0 : 1;
    this.cfg.on = this.goal > 0.5;
  }

  update(dt: number): boolean {
    this.power += (this.goal - this.power) * (1 - Math.exp(-dt * 4));
    if (Math.abs(this.goal - this.power) < 0.002) this.power = this.goal;
    this.clock += dt;

    const angle = 36 + Math.sin(this.clock * 1.1) * 22;
    this.flapPivot.rotation.x = THREE.MathUtils.degToRad(angle * 0.9 + 10) * this.power;
    this.led.emissiveIntensity = this.power * 2.8;
    this.wash.intensity = this.power * 1.35;

    const running = this.power > 0.004;
    this.flow.visible = running;
    if (running) this.writeFlow(angle);
    return running || this.goal !== this.power;
  }

  writeFlow(angleDeg: number) {
    const pos = this.flowPos.array as Float32Array;
    const col = this.flowCol.array as Float32Array;
    const a = THREE.MathUtils.degToRad(angleDeg);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const { r, g, b } = this.color;

    const sample = (
      seed: { phase: number; u: number; speed: number; wobble: number },
      t: number,
      out: Float32Array,
      o: number
    ) => {
      const d = REACH * t;
      const spread = 0.35 + 0.5 * t;
      const sway = Math.sin(this.clock * 1.8 + seed.wobble + t * 5) * 0.035 * t;
      out[o] = seed.u * spread + sway;
      out[o + 1] = -sin * d - 0.35 * t * t;
      out[o + 2] = cos * d;
    };

    for (let i = 0; i < STREAKS; i++) {
      const seed = this.seeds[i];
      const t = (seed.phase + this.clock * 0.48 * seed.speed) % 1;
      const tail = Math.max(0, t - 0.09);
      sample(seed, t, pos, i * 6);
      sample(seed, tail, pos, i * 6 + 3);
      const fade = Math.pow(Math.sin(Math.PI * t), 0.7) * this.power * 1.25;
      col[i * 6] = r * fade;
      col[i * 6 + 1] = g * fade;
      col[i * 6 + 2] = b * fade;
      col[i * 6 + 3] = r * fade * 0.1;
      col[i * 6 + 4] = g * fade * 0.1;
      col[i * 6 + 5] = b * fade * 0.1;
    }
    this.flowPos.needsUpdate = true;
    this.flowCol.needsUpdate = true;
  }
}

/* ---------- Default Category Store Architectural Plans ---------- */

export function createDefaultStorePlan(
  category: "cafe" | "bakery" | "popup" | "takeout"
): StoreFloorPlanDoc {
  if (category === "bakery") {
    return {
      name: "아티잔 베이커리 & 윈도우 키친",
      category: "bakery",
      wallHeight: 2.65,
      interiorWallHeight: 1.25,
      outdoorTemp: 26,
      camera: { azimuth: 34, elevation: 44 },
      rooms: [
        { id: "hall", name: "베이커리 쇼케이스 홀", rect: [0, 0, 5.6, 5.2], floor: "oak" },
        { id: "bake", name: "오픈 베이킹 룸", rect: [5.6, 0, 3.2, 3.2], floor: "tile" },
        { id: "pos", name: "포장 · 에스프레소 카운터", rect: [5.6, 3.2, 3.2, 2.0], floor: "walnut" },
      ],
      openings: [
        { id: "win1", type: "window", from: [0, 0.8], to: [0, 4.4], sill: 0.55, head: 2.25 },
        { id: "door1", type: "door", from: [1.2, 5.2], to: [2.4, 5.2] },
        { id: "bakewin", type: "window", from: [5.6, 0.6], to: [5.6, 2.6], sill: 0.95, head: 2.1 },
        { id: "open1", type: "open", from: [5.6, 3.3], to: [5.6, 5.0] },
      ],
      lights: [
        { id: "hall.pendant1", name: "아일랜드 펜던트 A", room: "hall", type: "pendant", pos: [2.7, 2.2], temp: 2800, brightness: 0.95, on: true },
        { id: "hall.pendant2", name: "아일랜드 펜던트 B", room: "hall", type: "pendant", pos: [2.7, 3.6], temp: 2800, brightness: 0.95, on: true },
        { id: "hall.spots", name: "트레이존 트랙조명", room: "hall", type: "spots", pos: [1.4, 1.3], temp: 3100, brightness: 0.9, on: true },
        { id: "bake.ceiling", name: "오븐실 직부등", room: "bake", type: "ceiling", pos: [7.2, 1.5], temp: 4200, brightness: 0.95, on: true },
        { id: "pos.strip", name: "카운터 간접 LED", room: "pos", type: "strip", pos: [7.1, 4.1], length: 2.2, temp: 2900, brightness: 1.0, on: true },
      ],
      acs: [
        { id: "hall.ac", name: "매장 인버터 냉난방기", room: "hall", wall: "north", pos: [2.8, 0], y: 2.25, on: true, mode: "cool", target: 22 },
      ],
    };
  }

  if (category === "popup") {
    return {
      name: "성수 플래그십 쇼룸 팝업",
      category: "popup",
      wallHeight: 2.75,
      interiorWallHeight: 1.25,
      outdoorTemp: 25,
      camera: { azimuth: 36, elevation: 43 },
      rooms: [
        { id: "gallery", name: "메인 조형물 · 큐레이션 홀", rect: [0, 0, 5.8, 5.2], floor: "stone" },
        { id: "photo", name: "네온 포토부스 · 미디어존", rect: [5.8, 0, 3.0, 3.0], floor: "tile" },
        { id: "goods", name: "한정판 굿즈 픽업 데스크", rect: [5.8, 3.0, 3.0, 2.2], floor: "stone" },
      ],
      openings: [
        { id: "win1", type: "window", from: [0, 0.6], to: [0, 4.6], sill: 0.4, head: 2.35 },
        { id: "door1", type: "door", from: [1.5, 5.2], to: [2.9, 5.2] },
        { id: "open1", type: "open", from: [5.8, 0.5], to: [5.8, 2.6] },
        { id: "open2", type: "open", from: [5.8, 3.2], to: [5.8, 4.9] },
      ],
      lights: [
        { id: "gal.spots", name: "히어로 조형물 핀스팟", room: "gallery", type: "spots", pos: [2.9, 2.5], color: "#89b4fa", temp: 4500, brightness: 1.0, on: true },
        { id: "gal.strip", name: "갤러리 네온 라인", room: "gallery", type: "strip", pos: [2.8, 0.4], length: 3.4, color: "#c084fc", temp: 4000, brightness: 1.0, on: true },
        { id: "photo.strip", name: "포토존 핑크 네온", room: "photo", type: "strip", pos: [7.3, 0.4], length: 2.2, color: "#f472b6", temp: 3500, brightness: 1.0, on: true },
        { id: "goods.pendant", name: "픽업 데스크 펜던트", room: "goods", type: "pendant", pos: [7.3, 4.1], temp: 3200, brightness: 0.9, on: true },
      ],
      acs: [
        { id: "gal.ac", name: "쇼룸 공조 시스템", room: "gallery", wall: "north", pos: [2.8, 0], y: 2.3, on: true, mode: "cool", target: 21 },
      ],
    };
  }

  if (category === "takeout") {
    return {
      name: "초고속 테이크아웃 익스프레스 바",
      category: "takeout",
      wallHeight: 2.55,
      interiorWallHeight: 1.2,
      outdoorTemp: 27,
      camera: { azimuth: 32, elevation: 46 },
      rooms: [
        { id: "express", name: "키오스크 · 픽업 대기존", rect: [0, 0, 4.8, 4.8], floor: "stone" },
        { id: "prep", name: "고속 음료 제조 · 백바", rect: [4.8, 0, 3.6, 4.8], floor: "tile" },
      ],
      openings: [
        { id: "win1", type: "window", from: [0, 0.8], to: [0, 4.0], sill: 0.65, head: 2.2 },
        { id: "door1", type: "door", from: [1.4, 4.8], to: [2.8, 4.8] },
        { id: "open1", type: "open", from: [4.8, 0.8], to: [4.8, 4.2] },
      ],
      lights: [
        { id: "exp.ceiling", name: "픽업홀 메인 조명", room: "express", type: "ceiling", pos: [2.4, 2.4], temp: 4000, brightness: 0.95, on: true },
        { id: "prep.spots", name: "에스프레소 추출바 스팟", room: "prep", type: "spots", pos: [6.4, 2.2], temp: 3600, brightness: 1.0, on: true },
      ],
      acs: [
        { id: "exp.ac", name: "익스프레스 에어컨", room: "express", wall: "north", pos: [2.4, 0], y: 2.2, on: true, mode: "cool", target: 22 },
      ],
    };
  }

  // Default: Specialty Cafe (스페셜티 카페 & 로스터리)
  return {
    name: "스페셜티 커피 & 로스터리 라운지",
    category: "cafe",
    wallHeight: 2.65,
    interiorWallHeight: 1.25,
    outdoorTemp: 26,
    camera: { azimuth: 34, elevation: 45 },
    rooms: [
      { id: "hall", name: "홀 라운지 · 좌석존", rect: [0, 0, 5.6, 5.2], floor: "oak" },
      { id: "bar", name: "에스프레소 바 · 픽업존", rect: [5.6, 0, 3.2, 3.4], floor: "walnut" },
      { id: "roastery", name: "로스터리 · 백바 준비실", rect: [5.6, 3.4, 3.2, 1.8], floor: "tile" },
    ],
    openings: [
      { id: "win1", type: "window", from: [0, 0.7], to: [0, 4.5], sill: 0.6, head: 2.25 },
      { id: "win2", type: "window", from: [1.2, 0], to: [4.4, 0], sill: 0.75, head: 2.2 },
      { id: "door1", type: "door", from: [1.3, 5.2], to: [2.5, 5.2] },
      { id: "open1", type: "open", from: [5.6, 0.5], to: [5.6, 3.1] },
      { id: "door2", type: "door", from: [5.6, 3.7], to: [5.6, 4.6] },
    ],
    lights: [
      { id: "hall.pendant1", name: "창가 테이블 펜던트", room: "hall", type: "pendant", pos: [1.6, 1.8], temp: 2700, brightness: 0.92, on: true },
      { id: "hall.pendant2", name: "센터 라운지 펜던트", room: "hall", type: "pendant", pos: [3.4, 2.8], temp: 2700, brightness: 0.92, on: true },
      { id: "hall.floor", name: "소파 라운지 플로어램프", room: "hall", type: "floor", pos: [4.6, 4.3], temp: 2500, brightness: 0.9, on: true },
      { id: "bar.spots", name: "에스프레소 바 트랙조명", room: "bar", type: "spots", pos: [7.1, 1.6], temp: 3100, brightness: 1.0, on: true },
      { id: "bar.strip", name: "바 언더 간접조명", room: "bar", type: "strip", pos: [6.8, 0.5], length: 2.4, temp: 2800, brightness: 0.95, on: true },
      { id: "roast.ceiling", name: "로스터리 작업등", room: "roastery", type: "ceiling", pos: [7.2, 4.3], temp: 4000, brightness: 0.85, on: true },
    ],
    acs: [
      { id: "hall.ac", name: "홀 인버터 에어컨 23°C", room: "hall", wall: "west", pos: [0, 2.6], y: 2.25, on: true, mode: "cool", target: 23 },
    ],
  };
}

/* ---------- Live 3D Stage Controller (world.js pattern) ---------- */

const rad = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;

export interface StoreWorld3DController {
  rebuild(
    doc: StoreFloorPlanDoc,
    furniture: StoreFurnitureInput[],
    selectedId: string | null,
    hudOpts: { flow: boolean; heat: boolean; light: boolean }
  ): void;
  setSceneMood(mood: SceneMoodId): void;
  focusZone(roomId: string | null): void;
  toggleAllLights(on: boolean): void;
  toggleAC(): boolean;
  resize(): void;
  dispose(): void;
}

export function createStoreWorld3D(
  canvas: HTMLCanvasElement,
  initialDoc: StoreFloorPlanDoc,
  initialFurniture: StoreFurnitureInput[],
  callbacks: {
    onSelectFurniture?: (id: string) => void;
    onSelectRoom?: (roomId: string) => void;
    onHoverInfo?: (label: string | null) => void;
  }
): StoreWorld3DController {
  let doc = initialDoc;
  let furnitureList = initialFurniture;
  let selectedItemId: string | null = null;
  let hudState = { flow: true, heat: false, light: true };
  let currentMood: SceneMoodId = "cozy";

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);

  const camera = new THREE.PerspectiveCamera(25, 1, 0.5, 120);

  const hemiLight = new THREE.HemisphereLight(0x9bb2ff, 0x101422, 0.52);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xbad0ff, 0.72);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.bias = -0.0008;
  dirLight.shadow.normalBias = 0.04;
  scene.add(dirLight, dirLight.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const contentRoot = new THREE.Group();
  scene.add(contentRoot);

  const customerGroup = new THREE.Group();
  scene.add(customerGroup);

  let lightsMap = new Map<string, StoreLightUnit>();
  let acsMap = new Map<string, StoreACUnit>();
  let hitTargets: THREE.Object3D[] = [];

  const rig = {
    az: doc.camera.azimuth,
    el: doc.camera.elevation,
    dist: 24,
    target: new THREE.Vector3(4.4, 0, 2.6),
    goal: {
      az: doc.camera.azimuth,
      el: doc.camera.elevation,
      dist: 24,
      target: new THREE.Vector3(4.4, 0, 2.6),
    },
    zoom: 1,
    focusRoomId: null as string | null,
  };

  let width = 1;
  let height = 1;
  const v = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function basis(az: number, el: number) {
    const a = rad(az);
    const e = rad(el);
    fwd.set(-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e));
    right.set(Math.cos(a), 0, -Math.sin(a));
    up.crossVectors(right, fwd);
  }

  function fitDistance(box3: THREE.Box3, az: number, el: number, fill: number) {
    basis(az, el);
    const c = box3.getCenter(new THREE.Vector3());
    const tanV = Math.tan(rad(camera.fov / 2)) * fill;
    const tanH = Math.tan(rad(camera.fov / 2)) * Math.max(0.5, camera.aspect) * fill;
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box3.max.x : box3.min.x,
        i & 2 ? box3.max.y : box3.min.y,
        i & 4 ? box3.max.z : box3.min.z
      ).sub(c);
      const depth = v.dot(fwd);
      dist = Math.max(
        dist,
        Math.abs(v.dot(right)) / tanH - depth,
        Math.abs(v.dot(up)) / tanV - depth
      );
    }
    return { dist: Math.max(8, dist), center: c };
  }

  function frameGoal() {
    const b = computeBounds(doc.rooms);
    const H = doc.wallHeight;
    let box3: THREE.Box3;
    let fill = 0.92;
    if (rig.focusRoomId) {
      const r = doc.rooms.find((rm) => rm.id === rig.focusRoomId);
      if (r) {
        const [rx, rz, rw, rd] = r.rect;
        box3 = new THREE.Box3(
          new THREE.Vector3(rx, 0, rz),
          new THREE.Vector3(rx + rw, H * 0.75, rz + rd)
        );
        fill = 0.82;
      } else {
        box3 = new THREE.Box3(
          new THREE.Vector3(b.minX, 0, b.minZ),
          new THREE.Vector3(b.maxX, H * 0.8, b.maxZ)
        );
      }
    } else {
      box3 = new THREE.Box3(
        new THREE.Vector3(b.minX, 0, b.minZ),
        new THREE.Vector3(b.maxX, H * 0.8, b.maxZ)
      );
    }
    const { dist, center } = fitDistance(box3, rig.goal.az, rig.goal.el, fill);
    rig.goal.dist = dist * rig.zoom;
    rig.goal.target.copy(center);
  }

  function buildCustomers(bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    customerGroup.clear();
    if (!hudState.flow) return;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;

    // Animated customer flow path curve on the floor + stylized 3D customer avatars
    const points = [
      new THREE.Vector3(bounds.minX + spanX * 0.22, 0.04, bounds.maxZ - 0.35),
      new THREE.Vector3(bounds.minX + spanX * 0.38, 0.04, bounds.minZ + spanZ * 0.58),
      new THREE.Vector3(bounds.minX + spanX * 0.68, 0.04, bounds.minZ + spanZ * 0.42),
      new THREE.Vector3(bounds.minX + spanX * 0.42, 0.04, bounds.minZ + spanZ * 0.28),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 36, 0.035, 8, false);
    const tubeMat = mat("#38bdf8", {
      emissive: "#38bdf8",
      emissiveIntensity: 1.4,
      opacity: 0.7,
    });
    customerGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

    const avatarColors = ["#38bdf8", "#f59e0b", "#a855f7", "#10b981"];
    for (let i = 0; i < 4; i++) {
      const p = curve.getPoint(i / 3.5);
      const avatar = makeGroup(
        at(cyl(0.13, 0.16, 0.72, mat(avatarColors[i % avatarColors.length], { rough: 0.5 })), 0, 0, 0),
        at(
          new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 16, 12),
            mat("#fde68a", { rough: 0.6 })
          ),
          0,
          0.86,
          0
        )
      );
      avatar.position.set(p.x, 0, p.z);
      avatar.userData = { basePos: p.clone(), phase: i * 1.4 };
      customerGroup.add(avatar);
    }
  }

  function rebuildScene() {
    contentRoot.clear();
    lightsMap.clear();
    acsMap.clear();
    hitTargets = [];

    const b = computeBounds(doc.rooms);
    const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const camDir = new THREE.Vector3(
      Math.sin(rad(rig.goal.az)),
      0,
      Math.cos(rad(rig.goal.az))
    );

    dirLight.position.copy(center).add(new THREE.Vector3(camDir.x * 3.5 + 1.8, 10, camDir.z * 3.5 - 1.8));
    dirLight.target.position.copy(center);
    const sc = dirLight.shadow.camera;
    sc.left = sc.bottom = -span * 0.85;
    sc.right = sc.top = span * 0.85;
    sc.near = 1;
    sc.far = 32;
    sc.updateProjectionMatrix();

    const house = buildStoreHouse(doc, camDir);
    contentRoot.add(house.group);
    hitTargets.push(...house.floors);

    for (const item of furnitureList) {
      const fg = buildStoreFurnitureItem3D(
        item,
        doc.category,
        b,
        item.id === selectedItemId
      );
      contentRoot.add(fg);
      fg.traverse((o) => {
        if (o.userData?.kind === "furniture") hitTargets.push(o);
      });
    }

    doc.lights.forEach((lCfg, idx) => {
      const unit = new StoreLightUnit(lCfg, doc.wallHeight, idx < 2);
      lightsMap.set(lCfg.id, unit);
      contentRoot.add(unit.group);
      hitTargets.push(unit.hit);
    });

    for (const acCfg of doc.acs) {
      const unit = new StoreACUnit(acCfg);
      acsMap.set(acCfg.id, unit);
      contentRoot.add(unit.group);
      hitTargets.push(unit.hit);
    }

    // Optional Bottleneck Heatmap zone overlay on floor
    if (hudState.heat) {
      const heatZone = at(
        box(
          (b.maxX - b.minX) * 0.34,
          0.015,
          (b.maxZ - b.minZ) * 0.42,
          mat("#ef4444", { emissive: "#ef4444", emissiveIntensity: 1.5, opacity: 0.38 }),
          { r: 0.1 }
        ),
        b.minX + (b.maxX - b.minX) * 0.56,
        0.01,
        b.minZ + (b.maxZ - b.minZ) * 0.48
      );
      contentRoot.add(heatZone);
    }

    buildCustomers(b);
    applyMoodLighting(currentMood, true);
    frameGoal();
    renderer.shadowMap.needsUpdate = true;
  }

  function applyMoodLighting(mood: SceneMoodId, instant = false) {
    currentMood = mood;
    if (mood === "bright") {
      scene.background = new THREE.Color("#111827");
      hemiLight.intensity = 0.88;
      dirLight.intensity = 1.05;
      bloom.strength = 0.24;
      for (const u of lightsMap.values()) {
        u.apply({ on: hudState.light, brightness: 1.0, temp: 4000, color: u.cfg.color }, instant);
      }
    } else if (mood === "peak") {
      scene.background = new THREE.Color("#0d1322");
      hemiLight.intensity = 0.68;
      dirLight.intensity = 0.85;
      bloom.strength = 0.34;
      for (const u of lightsMap.values()) {
        u.apply({ on: hudState.light, brightness: 0.95, temp: 3200, color: u.cfg.color }, instant);
      }
    } else if (mood === "night") {
      scene.background = new THREE.Color("#060911");
      hemiLight.intensity = 0.28;
      dirLight.intensity = 0.35;
      bloom.strength = 0.48;
      for (const u of lightsMap.values()) {
        u.apply(
          {
            on: hudState.light,
            brightness: 1.0,
            temp: 2400,
            color: u.cfg.color || (doc.category === "popup" ? "#c084fc" : undefined),
          },
          instant
        );
      }
    } else {
      // cozy default (matches hc_hero.png warm architectural glow)
      scene.background = new THREE.Color(STAGE_BG);
      hemiLight.intensity = 0.46;
      dirLight.intensity = 0.62;
      bloom.strength = 0.36;
      for (const u of lightsMap.values()) {
        u.apply(
          {
            on: hudState.light,
            brightness: u.cfg.brightness ?? 0.92,
            temp: u.cfg.temp ?? 2850,
            color: u.cfg.color,
          },
          instant
        );
      }
    }
  }

  /* ---------- Picking & Orbit Controls ---------- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag: { x: number; y: number; az: number; el: number; moved: boolean } | null = null;

  function pick(ev: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (!hits.length) return null;
    const nonRoom = hits.find((h) => h.object.userData?.kind !== "room");
    return (nonRoom || hits[0]).object.userData;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    drag = {
      x: ev.clientX,
      y: ev.clientY,
      az: rig.goal.az,
      el: rig.goal.el,
      moved: false,
    };
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (drag) {
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        canvas.style.cursor = "grabbing";
      }
      if (drag.moved) {
        rig.goal.az = clamp(drag.az - dx * 0.38, -25, 85);
        rig.goal.el = clamp(drag.el + dy * 0.3, 24, 72);
        frameGoal();
      }
      return;
    }
    const hit = pick(ev);
    canvas.style.cursor = hit ? "pointer" : "grab";
    if (callbacks.onHoverInfo) {
      if (hit?.kind === "furniture") callbacks.onHoverInfo(`집기: ${hit.label}`);
      else if (hit?.kind === "light") callbacks.onHoverInfo(`조명: ${hit.name} (클릭하여 ON/OFF)`);
      else if (hit?.kind === "ac") callbacks.onHoverInfo(`공조: ${hit.name} (클릭하여 기류 토글)`);
      else if (hit?.kind === "room") callbacks.onHoverInfo(`구역: ${hit.name}`);
      else callbacks.onHoverInfo(null);
    }
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!drag) return;
    const wasMoved = drag.moved;
    drag = null;
    canvas.style.cursor = "grab";
    if (wasMoved) return;
    const hit = pick(ev);
    if (!hit) return;
    if (hit.kind === "furniture" && callbacks.onSelectFurniture) {
      callbacks.onSelectFurniture(hit.id);
    } else if (hit.kind === "light") {
      const u = lightsMap.get(hit.id);
      if (u) {
        u.cfg.on = u.goal < 0.1;
        u.apply({
          on: u.cfg.on,
          brightness: u.cfg.brightness ?? 0.92,
          temp: u.cfg.temp ?? 2900,
          color: u.cfg.color,
        });
        u.bump();
      }
    } else if (hit.kind === "ac") {
      const ac = acsMap.get(hit.id);
      if (ac) ac.toggle();
    } else if (hit.kind === "room" && callbacks.onSelectRoom) {
      callbacks.onSelectRoom(hit.id);
    }
  });

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      rig.zoom = clamp(rig.zoom * Math.exp(ev.deltaY * 0.0014), 0.55, 1.3);
      frameGoal();
    },
    { passive: false }
  );

  /* ---------- Animation Loop ---------- */

  let raf = 0;
  let last = performance.now();
  let disposed = false;

  function updateRig(dt: number, instant = false) {
    const k = instant ? 1 : 1 - Math.exp(-dt * 5.8);
    rig.az += (rig.goal.az - rig.az) * k;
    rig.el += (rig.goal.el - rig.el) * k;
    rig.dist += (rig.goal.dist - rig.dist) * k;
    rig.target.lerp(rig.goal.target, k);
    basis(rig.az, rig.el);
    camera.position.copy(rig.target).addScaledVector(fwd, -rig.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(rig.target);
  }

  function animate(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    updateRig(dt);
    for (const u of lightsMap.values()) u.update(dt);
    for (const ac of acsMap.values()) ac.update(dt);

    // Subtle customer bobbing animation
    for (const child of customerGroup.children) {
      if (child.userData?.basePos) {
        const phase = child.userData.phase as number;
        child.position.y = Math.abs(Math.sin(now * 0.003 + phase)) * 0.04;
      }
    }

    composer.render(dt);
    raf = requestAnimationFrame(animate);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    width = r.width;
    height = r.height;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameGoal();
  }

  rebuildScene();
  resize();
  updateRig(0, true);
  raf = requestAnimationFrame(animate);

  return {
    rebuild(nextDoc, nextFurniture, nextSelectedId, nextHud) {
      doc = nextDoc;
      furnitureList = nextFurniture;
      selectedItemId = nextSelectedId;
      hudState = nextHud;
      rebuildScene();
    },
    setSceneMood(mood: SceneMoodId) {
      applyMoodLighting(mood, false);
    },
    focusZone(roomId: string | null) {
      rig.focusRoomId = roomId;
      rig.zoom = 1;
      frameGoal();
    },
    toggleAllLights(on: boolean) {
      hudState.light = on;
      for (const u of lightsMap.values()) {
        u.cfg.on = on;
        u.apply({
          on,
          brightness: u.cfg.brightness ?? 0.92,
          temp: u.cfg.temp ?? 2900,
          color: u.cfg.color,
        });
      }
    },
    toggleAC() {
      let nextOn = true;
      for (const ac of acsMap.values()) {
        ac.toggle();
        nextOn = ac.goal > 0.5;
      }
      return nextOn;
    },
    resize,
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      composer.dispose();
      renderer.dispose();
    },
  };
}
