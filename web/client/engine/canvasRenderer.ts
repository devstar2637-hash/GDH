// src/engine/canvasRenderer.ts
import {
  sample,
  type Point2D,
  type Scene,
  type SceneObject,
  type SimResult,
} from "./rehearsalCore.ts";

export interface IsoView {
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  mode?: "3d" | "2d";
  yawRad?: number;
  pitchRatio?: number;
  sceneW?: number;
  sceneH?: number;
}

export interface InteriorStyle {
  id: string;
  canvasBgTop: string;
  canvasBgBottom: string;
  floorBase: string;
  floorAlt: string;
  floorSide: string;
  floorStroke: string;
  barZoneFloor: string;
  wallLeft: string;
  wallRight: string;
  wallTrim: string;
  baseboard: string;
  counterFront: string;
  counterSide: string;
  counterTop: string;
  showcaseFront: string;
  showcaseSide: string;
  showcaseTop: string;
  tableTop: string;
  tableSide: string;
  chairColor: string;
  rugColor: string;
  accentColor: string;
}

export const INTERIOR_STYLES: Record<string, InteriorStyle> = {
  coffee: {
    id: "coffee",
    canvasBgTop: "#ececeb",
    canvasBgBottom: "#e4e4e2",
    floorBase: "#f5f5f4",
    floorAlt: "#eeeeec",
    floorSide: "#d4d4d0",
    floorStroke: "#dcdcd8",
    barZoneFloor: "#e7e5e4",
    wallLeft: "#f8f8f7",
    wallRight: "#eeeeec",
    wallTrim: "#71717a",
    baseboard: "#27272a",
    counterFront: "#27272a",
    counterSide: "#18181b",
    counterTop: "#fafaf9",
    showcaseFront: "#ea580c",
    showcaseSide: "#c2410c",
    showcaseTop: "#fff7ed",
    tableTop: "#f4f4f2",
    tableSide: "#a1a1aa",
    chairColor: "#3f3f46",
    rugColor: "rgba(234, 88, 12, 0.09)",
    accentColor: "#ea580c",
  },
  bakery: {
    id: "bakery",
    canvasBgTop: "#eeece9",
    canvasBgBottom: "#e5e2dc",
    floorBase: "#f6f5f2",
    floorAlt: "#edeae4",
    floorSide: "#d6d1c7",
    floorStroke: "#dedad0",
    barZoneFloor: "#e7e2d8",
    wallLeft: "#faf9f6",
    wallRight: "#efece6",
    wallTrim: "#78716c",
    baseboard: "#292524",
    counterFront: "#44403c",
    counterSide: "#292524",
    counterTop: "#fafaf9",
    showcaseFront: "#ea580c",
    showcaseSide: "#c2410c",
    showcaseTop: "#ffedd5",
    tableTop: "#f5f5f4",
    tableSide: "#a8a29e",
    chairColor: "#44403c",
    rugColor: "rgba(234, 88, 12, 0.11)",
    accentColor: "#ea580c",
  },
  matcha: {
    id: "matcha",
    canvasBgTop: "#ececeb",
    canvasBgBottom: "#e2e2e0",
    floorBase: "#f4f4f3",
    floorAlt: "#ebebe9",
    floorSide: "#d1d1cd",
    floorStroke: "#dadad6",
    barZoneFloor: "#e5e5e2",
    wallLeft: "#f8f8f7",
    wallRight: "#ededeb",
    wallTrim: "#71717a",
    baseboard: "#18181b",
    counterFront: "#27272a",
    counterSide: "#18181b",
    counterTop: "#ffffff",
    showcaseFront: "#f97316",
    showcaseSide: "#ea580c",
    showcaseTop: "#fff7ed",
    tableTop: "#f8f8f7",
    tableSide: "#a1a1aa",
    chairColor: "#27272a",
    rugColor: "rgba(249, 115, 22, 0.10)",
    accentColor: "#ea580c",
  },
  wine: {
    id: "wine",
    canvasBgTop: "#e8e6e3",
    canvasBgBottom: "#dedbd6",
    floorBase: "#efedea",
    floorAlt: "#e5e2dc",
    floorSide: "#c7c2b8",
    floorStroke: "#d5d0c6",
    barZoneFloor: "#dedad2",
    wallLeft: "#f5f3f0",
    wallRight: "#eae6e0",
    wallTrim: "#57534e",
    baseboard: "#1c1917",
    counterFront: "#292524",
    counterSide: "#1c1917",
    counterTop: "#f5f5f4",
    showcaseFront: "#c2410c",
    showcaseSide: "#9a3412",
    showcaseTop: "#ffedd5",
    tableTop: "#e7e5e4",
    tableSide: "#78716c",
    chairColor: "#292524",
    rugColor: "rgba(194, 65, 12, 0.12)",
    accentColor: "#ea580c",
  },
};

export function project(
  view: IsoView,
  x: number,
  y: number,
  z = 0
): Point2D {
  if (view.mode === "2d") {
    return {
      x: view.ox + x * view.s,
      y: view.oy + y * view.s,
    };
  }
  const yaw = view.yawRad || 0;
  const pitch = view.pitchRatio ?? 0.5;
  const cx = (view.sceneW ?? 12) * 0.5;
  const cy = (view.sceneH ?? 9) * 0.5;
  let rx = x;
  let ry = y;
  if (Math.abs(yaw) > 0.0001) {
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    rx = cx + dx * cos - dy * sin;
    ry = cy + dx * sin + dy * cos;
  }
  return {
    x: view.ox + (rx - ry) * view.s,
    y: view.oy + (rx + ry) * view.s * pitch - z * view.s * 0.68,
  };
}

export function unproject(view: IsoView, px: number, py: number): Point2D {
  if (view.mode === "2d") {
    return {
      x: (px - view.ox) / view.s,
      y: (py - view.oy) / view.s,
    };
  }
  const yaw = view.yawRad || 0;
  const pitch = view.pitchRatio ?? 0.5;
  const cx = (view.sceneW ?? 12) * 0.5;
  const cy = (view.sceneH ?? 9) * 0.5;

  const a = (px - view.ox) / view.s;
  const b = (py - view.oy) / (view.s * pitch);
  const rx = (a + b) / 2;
  const ry = (b - a) / 2;

  if (Math.abs(yaw) > 0.0001) {
    const dx = rx - cx;
    const dy = ry - cy;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      x: cx + dx * cos + dy * sin,
      y: cy - dx * sin + dy * cos,
    };
  }
  return {
    x: rx,
    y: ry,
  };
}

function poly(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  fill?: string,
  stroke?: string,
  lineWidth = 1
): void {
  if (!pts.length) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(
  ctx: CanvasRenderingContext2D,
  a: Point2D,
  b: Point2D,
  color: string,
  width = 1
): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawPrism(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  x: number,
  y: number,
  w: number,
  h: number,
  z0: number,
  z1: number,
  frontFill: string,
  sideFill: string,
  topFill: string,
  stroke = "rgba(15, 23, 42, 0.16)",
  strokeWidth = 0.8
): void {
  const p = (px: number, py: number, pz = 0) => project(v, px, py, pz);
  if (v.mode === "2d") {
    const tl = p(x, y);
    const br = p(x + w, y + h);
    ctx.fillStyle = topFill;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    return;
  }
  const a = p(x, y, z0);
  const b = p(x + w, y, z0);
  const c = p(x + w, y + h, z0);
  const d = p(x, y + h, z0);

  const at = p(x, y, z1);
  const bt = p(x + w, y, z1);
  const ct = p(x + w, y + h, z1);
  const dt = p(x, y + h, z1);

  const faces = [
    { pts: [a, b, bt, at], fill: sideFill, depth: (a.y + b.y) * 0.5 },
    { pts: [b, c, ct, bt], fill: sideFill, depth: (b.y + c.y) * 0.5 },
    { pts: [c, d, dt, ct], fill: frontFill, depth: (c.y + d.y) * 0.5 },
    { pts: [d, a, at, dt], fill: frontFill, depth: (d.y + a.y) * 0.5 },
  ];
  faces.sort((f1, f2) => f1.depth - f2.depth);
  // Draw the two front-most vertical faces so rotated views always render cleanly
  poly(ctx, faces[2].pts, faces[2].fill, stroke, strokeWidth);
  poly(ctx, faces[3].pts, faces[3].fill, stroke, strokeWidth);
  poly(ctx, [at, bt, ct, dt], topFill, stroke, strokeWidth);
}

function drawPottedPlant(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  x: number,
  y: number
): void {
  const p = (px: number, py: number, pz = 0) => project(v, px, py, pz);
  drawPrism(
    ctx,
    v,
    x - 0.22,
    y - 0.22,
    0.44,
    0.44,
    0,
    0.42,
    "#c27d56",
    "#9c5d3b",
    "#78350f"
  );
  const top = p(x, y, 0.68);
  const leaves = [
    { dx: 0, dy: 0, r: 8.5, c: "#15803d" },
    { dx: -5.5, dy: 2, r: 6.5, c: "#16a34a" },
    { dx: 5.5, dy: 2, r: 6.5, c: "#166534" },
    { dx: 0, dy: -4.5, r: 6.5, c: "#22c55e" },
  ];
  for (const lf of leaves) {
    ctx.fillStyle = lf.c;
    ctx.beginPath();
    ctx.arc(top.x + lf.dx, top.y + lf.dy, lf.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBaristaStaff(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  x: number,
  y: number,
  apronColor: string
): void {
  const pp = project(v, x, y, 0);
  if (v.mode === "2d") {
    ctx.fillStyle = apronColor;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.ellipse(pp.x, pp.y + 1, 4.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
  ctx.fill();

  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(pp.x - 3.6, pp.y - 11, 7.2, 9.5, 3);
  ctx.fill();

  ctx.fillStyle = apronColor;
  ctx.beginPath();
  ctx.roundRect(pp.x - 2.6, pp.y - 9.5, 5.2, 7.5, 2);
  ctx.fill();

  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(pp.x, pp.y - 14, 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = apronColor;
  ctx.beginPath();
  ctx.ellipse(pp.x, pp.y - 16.5, 4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function draw2DCadFloorplan(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  scene: Scene,
  result: SimResult | null | undefined,
  worldIndex: 0 | 1,
  currentTimeSec: number,
  bodyWidth: number,
  selectedObjectId: string | null,
  pickupStaffCount: number
): void {
  const p = (x: number, y: number) => project(v, x, y, 0);
  const tl = p(0, 0);
  const br = p(scene.width, scene.height);
  const rw = br.x - tl.x;
  const rh = br.y - tl.y;

  // Blueprint background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(tl.x, tl.y, rw, rh);

  // 1m & 0.5m CAD grid
  for (let x = 0; x <= scene.width; x += 0.5) {
    const px = p(x, 0).x;
    line(
      ctx,
      { x: px, y: tl.y },
      { x: px, y: br.y },
      x % 1 === 0 ? "#e2e8f0" : "#f1f5f9",
      x % 1 === 0 ? 1 : 0.6
    );
  }
  for (let y = 0; y <= scene.height; y += 0.5) {
    const py = p(0, y).y;
    line(
      ctx,
      { x: tl.x, y: py },
      { x: br.x, y: py },
      y % 1 === 0 ? "#e2e8f0" : "#f1f5f9",
      y % 1 === 0 ? 1 : 0.6
    );
  }

  // Thick architectural wall border
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(tl.x, tl.y, rw, rh);

  // Dimension rulers on top & left
  ctx.fillStyle = "#475569";
  ctx.font = "700 10px 'JetBrains Mono', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`WIDTH ${scene.width.toFixed(1)}m`, tl.x + rw / 2, tl.y - 7);
  ctx.save();
  ctx.translate(tl.x - 9, tl.y + rh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`DEPTH ${scene.height.toFixed(1)}m`, 0, 0);
  ctx.restore();

  // A* path with bodyWidth corridor clearance band
  if (result?.route?.length) {
    ctx.beginPath();
    result.route.forEach((pt, i) => {
      const pp = p(pt.x, pt.y);
      if (i) ctx.lineTo(pp.x, pp.y);
      else ctx.moveTo(pp.x, pp.y);
    });
    ctx.strokeStyle =
      worldIndex === 1
        ? "rgba(234, 88, 12, 0.22)"
        : "rgba(82, 82, 91, 0.18)";
    ctx.lineWidth = Math.max(6, bodyWidth * v.s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    result.route.forEach((pt, i) => {
      const pp = p(pt.x, pt.y);
      if (i) ctx.lineTo(pp.x, pp.y);
      else ctx.moveTo(pp.x, pp.y);
    });
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = worldIndex === 1 ? "#ea580c" : "#52525b";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Furniture blocks with exact meter dimensions
  for (const o of scene.objects) {
    const otl = p(o.x, o.y);
    const obr = p(o.x + o.w, o.y + o.h);
    const ow = obr.x - otl.x;
    const oh = obr.y - otl.y;
    const isSel = worldIndex === 1 && o.id === selectedObjectId;

    ctx.fillStyle =
      o.kind === "desk"
        ? "#e7e5e4"
        : o.kind === "display"
        ? "#ffedd5"
        : "#f5f5f4";
    ctx.strokeStyle = isSel
      ? "#ea580c"
      : o.kind === "desk"
      ? "#27272a"
      : o.kind === "display"
      ? "#ea580c"
      : "#71717a";
    ctx.lineWidth = isSel ? 2.5 : 1.4;
    ctx.fillRect(otl.x, otl.y, ow, oh);
    ctx.strokeRect(otl.x, otl.y, ow, oh);

    ctx.fillStyle = "#18181b";
    ctx.font = "700 9.5px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(o.label || o.koLabel || o.id, otl.x + ow / 2, otl.y + oh / 2 - 1);
    ctx.fillStyle = "#52525b";
    ctx.font = "600 8.5px 'JetBrains Mono', sans-serif";
    ctx.fillText(
      `${o.w.toFixed(1)}×${o.h.toFixed(1)}m`,
      otl.x + ow / 2,
      otl.y + oh / 2 + 10
    );
  }

  // Entrance & Exit CAD markers
  for (const [key, label, col] of [
    ["entrance", "ENTRANCE (IN)", "#ea580c"],
    ["exit", "EXIT (OUT)", "#27272a"],
  ] as const) {
    const pt = p(scene[key].x, scene[key].y);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(pt.x - 36, pt.y - 9, 72, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 9px 'JetBrains Mono', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, pt.x, pt.y + 3.5);
  }

  // Staff dots positioned at top-right corner of bars so they don't overlap text
  drawBaristaStaff(ctx, v, 5.45, 0.45, "#27272a");
  for (let i = 0; i < pickupStaffCount; i++) {
    drawBaristaStaff(ctx, v, 9.55 - i * 0.42, 0.45, "#ea580c");
  }

  // Customers
  const f = result
    ? sample(result, Math.max(0, Math.min(result.duration, currentTimeSec)))
    : { people: [], queue: 0, orderQueue: 0, pickupQueue: 0, completed: 0 };

  for (const person of f.people) {
    const pp = p(person.x, person.y);
    ctx.fillStyle =
      person.state === "queue"
        ? "#ea580c"
        : person.state === "service"
        ? "#f97316"
        : "#27272a";
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArchitecturalRoom(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  scene: Scene,
  style: InteriorStyle,
  categoryId: string,
  designId: string,
  lightsOn: boolean,
  acOn: boolean,
  animTime: number,
  pickupStaffCount: number,
  presetId: string
): void {
  const p = (x: number, y: number, z = 0) => project(v, x, y, z);
  const W = scene.width;
  const H = scene.height;
  const wallH = 2.25;

  const corners = [p(0, 0), p(W, 0), p(W, H), p(0, H)];
  poly(
    ctx,
    [
      corners[3],
      corners[2],
      { x: corners[2].x, y: corners[2].y + 10 },
      { x: corners[3].x, y: corners[3].y + 10 },
    ],
    style.floorSide
  );
  poly(
    ctx,
    [
      corners[1],
      corners[2],
      { x: corners[2].x, y: corners[2].y + 10 },
      { x: corners[1].x, y: corners[1].y + 10 },
    ],
    style.floorSide
  );
  poly(ctx, corners, style.floorBase, style.floorStroke, 1.5);

  if (categoryId === "bakery") {
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if ((x + y) % 2 === 0) {
          poly(
            ctx,
            [p(x, y), p(x + 1, y), p(x + 1, y + 1), p(x, y + 1)],
            style.floorAlt
          );
        }
      }
    }
  } else {
    for (let x = 1; x < W; x++) {
      line(ctx, p(x, 0), p(x, H), style.floorStroke, 0.7);
    }
    for (let y = 1; y < H; y++) {
      line(ctx, p(0, y), p(W, y), style.floorStroke, 0.55);
    }
  }

  // Barista / Kitchen Service Zone Floor Tile
  poly(
    ctx,
    [p(2.6, 0.05), p(10.2, 0.05), p(10.2, 1.85), p(2.6, 1.85)],
    style.barZoneFloor,
    "rgba(15, 23, 42, 0.12)",
    1
  );

  // Design-specific central feature rug/zone
  if (designId === "island" || categoryId === "matcha") {
    poly(
      ctx,
      [p(3.6, 3.4), p(8.2, 3.4), p(8.2, 6.0), p(3.6, 6.0)],
      style.rugColor,
      style.accentColor,
      1.2
    );
  } else if (designId === "lounge") {
    poly(
      ctx,
      [p(0.5, 1.8), p(3.2, 1.8), p(3.2, 6.6), p(0.5, 6.6)],
      style.rugColor,
      style.accentColor,
      1
    );
  }

  // Cutaway 3D Walls
  poly(
    ctx,
    [p(0, 0, 0), p(W, 0, 0), p(W, 0, wallH), p(0, 0, wallH)],
    style.wallRight,
    style.wallTrim,
    1.2
  );
  poly(
    ctx,
    [p(0, 0, 0), p(0, H, 0), p(0, H, wallH), p(0, 0, wallH)],
    style.wallLeft,
    style.wallTrim,
    1.2
  );

  poly(
    ctx,
    [p(0, 0, 0), p(W, 0, 0), p(W, 0, 0.14), p(0, 0, 0.14)],
    style.baseboard
  );
  poly(
    ctx,
    [p(0, 0, 0), p(0, H, 0), p(0, H, 0.14), p(0, 0, 0.14)],
    style.baseboard
  );

  // Large Window on Left Wall
  const isRainy = presetId === "rainy";
  poly(
    ctx,
    [
      p(0.02, 1.2, 0.55),
      p(0.02, 5.8, 0.55),
      p(0.02, 5.8, 1.85),
      p(0.02, 1.2, 1.85),
    ],
    isRainy
      ? "rgba(148, 163, 184, 0.65)"
      : lightsOn
      ? "rgba(186, 230, 253, 0.55)"
      : "rgba(203, 213, 225, 0.4)",
    style.baseboard,
    2
  );
  line(ctx, p(0.02, 2.7, 0.55), p(0.02, 2.7, 1.85), style.baseboard, 1.4);
  line(ctx, p(0.02, 4.3, 0.55), p(0.02, 4.3, 1.85), style.baseboard, 1.4);
  line(ctx, p(0.02, 1.2, 1.2), p(0.02, 5.8, 1.2), style.baseboard, 1.2);

  // Rain streaks on window when preset === "rainy"
  if (isRainy) {
    ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const ry = 1.5 + i * 0.52;
      const rz = 1.75 - ((animTime * 2 + i * 0.3) % 0.9);
      const r0 = p(0.03, ry, rz);
      const r1 = p(0.03, ry + 0.15, rz - 0.25);
      line(ctx, r0, r1, "rgba(37, 99, 235, 0.55)", 1.4);
    }
  } else if (lightsOn) {
    poly(
      ctx,
      [p(0.1, 1.4, 0.01), p(2.4, 1.8, 0.01), p(2.4, 5.9, 0.01), p(0.1, 5.6, 0.01)],
      "rgba(254, 249, 195, 0.28)"
    );
  }

  // Back Wall Menu Board & Shelving
  poly(
    ctx,
    [
      p(3.2, 0.03, 1.25),
      p(5.5, 0.03, 1.25),
      p(5.5, 0.03, 1.9),
      p(3.2, 0.03, 1.9),
    ],
    categoryId === "wine" ? "#292524" : "#1e293b",
    style.baseboard,
    1.5
  );
  const menuCenter = p(4.35, 0.04, 1.55);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 8.5px 'JetBrains Mono', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    categoryId === "bakery"
      ? "SALT BREAD & PASTRY"
      : categoryId === "matcha"
      ? "SEONGSU MATCHA POP-UP"
      : categoryId === "wine"
      ? "NATURAL WINE & GROCERY"
      : "SPECIALTY ROASTERY",
    menuCenter.x,
    menuCenter.y + 3
  );

  if (categoryId === "wine") {
    drawPrism(
      ctx,
      v,
      7.2,
      0.04,
      2.6,
      0.3,
      0.4,
      1.95,
      "#432818",
      "#2b1810",
      "#582f0e"
    );
  } else {
    line(ctx, p(7.2, 0.05, 1.25), p(9.7, 0.05, 1.25), style.baseboard, 3);
    line(ctx, p(7.2, 0.05, 1.6), p(9.7, 0.05, 1.6), style.baseboard, 3);
  }

  // Smart AC Unit
  drawPrism(
    ctx,
    v,
    5.7,
    0.04,
    1.3,
    0.25,
    1.65,
    1.98,
    "#f8fafc",
    "#e2e8f0",
    "#ffffff",
    "#94a3b8",
    1
  );
  if (acOn) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const sx = 5.85 + i * 0.32;
      const phase = (animTime * 1.3 + i * 0.25) % 1;
      const len = 1.1 + phase * 2.6;
      const p0 = p(sx, 0.25, 1.62);
      const p1 = p(sx + (i - 1.5) * 0.22, 0.25 + len, Math.max(0.3, 1.62 - len * 0.22));
      const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      grad.addColorStop(0, "rgba(14, 165, 233, 0.55)");
      grad.addColorStop(1, "rgba(14, 165, 233, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Staff behind Order & Pickup Bars
  const apron = style.accentColor;
  drawBaristaStaff(ctx, v, 4.3, 0.45, apron);
  for (let sIdx = 0; sIdx < pickupStaffCount; sIdx++) {
    drawBaristaStaff(ctx, v, 7.6 + sIdx * 0.78, 0.45, apron);
  }

  drawPottedPlant(ctx, v, 0.55, 0.55);
  drawPottedPlant(ctx, v, 11.3, 0.55);
  drawPottedPlant(ctx, v, 0.55, 8.2);

  for (const [key, label, matColor] of [
    ["entrance", "ENTRANCE (IN)", "#ea580c"],
    ["exit", "EXIT (OUT)", "#3f3f46"],
  ] as const) {
    const pt = scene[key];
    poly(
      ctx,
      [
        p(pt.x - 0.65, pt.y - 0.35),
        p(pt.x + 0.65, pt.y - 0.35),
        p(pt.x + 0.65, pt.y + 0.35),
        p(pt.x - 0.65, pt.y + 0.35),
      ],
      "rgba(24, 24, 27, 0.12)",
      matColor,
      1.3
    );
    const lp = p(pt.x, pt.y + 0.45);
    ctx.fillStyle = "#18181b";
    ctx.font =
      "700 10px 'JetBrains Mono', 'Plus Jakarta Sans', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, lp.x, lp.y + 11);
  }
}

function drawDetailedFurniture(
  ctx: CanvasRenderingContext2D,
  v: IsoView,
  o: SceneObject,
  isSelected: boolean,
  isHovered: boolean,
  style: InteriorStyle,
  categoryId: string,
  lightsOn: boolean
): void {
  const p = (x: number, y: number, z = 0) => project(v, x, y, z);
  const a = p(o.x, o.y);
  const b = p(o.x + o.w, o.y);
  const c = p(o.x + o.w, o.y + o.h);
  const d = p(o.x, o.y + o.h);

  poly(
    ctx,
    [
      { x: a.x, y: a.y + 3 },
      { x: b.x + 3, y: b.y + 4 },
      { x: c.x + 3, y: c.y + 5 },
      { x: d.x, y: d.y + 4 },
    ],
    "rgba(24, 24, 27, 0.14)"
  );

  if (o.movable && (isSelected || isHovered)) {
    poly(
      ctx,
      [
        p(o.x - 0.08, o.y - 0.08),
        p(o.x + o.w + 0.08, o.y - 0.08),
        p(o.x + o.w + 0.08, o.y + o.h + 0.08),
        p(o.x - 0.08, o.y + o.h + 0.08),
      ],
      isSelected ? "rgba(234, 88, 12, 0.18)" : "rgba(249, 115, 22, 0.12)",
      isSelected ? "#ea580c" : "#f97316",
      isSelected ? 2.4 : 1.6
    );
  }

  let labelZ = 0.85;

  if (o.id === "order-desk") {
    drawPrism(
      ctx,
      v,
      o.x,
      o.y,
      o.w,
      o.h,
      0,
      0.82,
      style.counterFront,
      style.counterSide,
      style.counterTop
    );
    for (let sx = o.x + 0.3; sx < o.x + o.w - 0.1; sx += 0.35) {
      line(
        ctx,
        p(sx, o.y + o.h, 0.05),
        p(sx, o.y + o.h, 0.76),
        "rgba(0,0,0,0.22)",
        1
      );
    }
    drawPrism(
      ctx,
      v,
      o.x + 0.45,
      o.y + 0.25,
      0.38,
      0.28,
      0.82,
      1.08,
      "#1e293b",
      "#0f172a",
      "#38bdf8"
    );
    drawPrism(
      ctx,
      v,
      o.x + 1.25,
      o.y + 0.15,
      0.95,
      0.48,
      0.82,
      1.18,
      "rgba(255,255,255,0.55)",
      "rgba(226,232,240,0.65)",
      "rgba(255,255,255,0.75)",
      "#94a3b8",
      1
    );
    labelZ = 1.32;
  } else if (o.id === "pickup-desk") {
    drawPrism(
      ctx,
      v,
      o.x,
      o.y,
      o.w,
      o.h,
      0,
      0.82,
      style.counterFront,
      style.counterSide,
      style.counterTop
    );
    if (categoryId === "bakery") {
      drawPrism(
        ctx,
        v,
        o.x + 0.2,
        o.y + 0.1,
        1.05,
        0.55,
        0.82,
        1.42,
        "#334155",
        "#1e293b",
        "#64748b"
      );
      poly(
        ctx,
        [
          p(o.x + 0.3, o.y + 0.66, 0.95),
          p(o.x + 1.15, o.y + 0.66, 0.95),
          p(o.x + 1.15, o.y + 0.66, 1.25),
          p(o.x + 0.3, o.y + 0.66, 1.25),
        ],
        "#fbbf24"
      );
    } else {
      drawPrism(
        ctx,
        v,
        o.x + 0.25,
        o.y + 0.15,
        0.95,
        0.48,
        0.82,
        1.26,
        "#cbd5e1",
        "#94a3b8",
        "#f8fafc",
        "#475569",
        1
      );
      drawPrism(
        ctx,
        v,
        o.x + 1.35,
        o.y + 0.2,
        0.24,
        0.24,
        0.82,
        1.35,
        "#1e293b",
        "#0f172a",
        "#475569"
      );
    }
    drawPrism(
      ctx,
      v,
      o.x + 1.75,
      o.y + 0.22,
      0.6,
      0.38,
      0.82,
      0.88,
      "#0f766e",
      "#115e59",
      "#ccfbf1"
    );
    labelZ = 1.45;
  } else if (
    o.id === "display" ||
    o.id.startsWith("custom-") ||
    o.id.startsWith("manual-")
  ) {
    drawPrism(
      ctx,
      v,
      o.x,
      o.y,
      o.w,
      o.h,
      0,
      0.68,
      style.showcaseFront,
      style.showcaseSide,
      style.showcaseTop,
      isSelected ? "#059669" : "rgba(15,23,42,0.22)",
      isSelected ? 1.8 : 1
    );

    if (categoryId === "bakery") {
      drawPrism(
        ctx,
        v,
        o.x + 0.08,
        o.y + 0.08,
        o.w - 0.16,
        o.h - 0.16,
        0.68,
        1.04,
        "rgba(255, 251, 235, 0.45)",
        "rgba(254, 243, 199, 0.55)",
        "rgba(255, 255, 255, 0.65)",
        "#d97706",
        1
      );
      const cols = Math.max(2, Math.floor(o.w / 0.65));
      for (let i = 0; i < cols; i++) {
        const bx = o.x + 0.35 + i * ((o.w - 0.5) / cols);
        const by = o.y + o.h / 2;
        const bp = p(bx, by, 0.78);
        ctx.fillStyle = "#d97706";
        ctx.beginPath();
        ctx.ellipse(bp.x, bp.y, 6, 3.8, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.ellipse(bp.x - 1, bp.y - 1, 4, 2.2, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (categoryId === "matcha") {
      drawPrism(
        ctx,
        v,
        o.x + 0.2,
        o.y + 0.15,
        o.w * 0.45,
        o.h - 0.3,
        0.68,
        0.96,
        "#bbf7d0",
        "#86efac",
        "#ffffff",
        "#16a34a",
        1
      );
      const cols = Math.max(2, Math.floor(o.w / 0.7));
      for (let i = 0; i < cols; i++) {
        const mx = o.x + 0.35 + i * ((o.w - 0.5) / cols);
        const mp = p(mx, o.y + o.h / 2, 0.98);
        ctx.fillStyle = "#15803d";
        ctx.beginPath();
        ctx.roundRect(mp.x - 3.5, mp.y - 6, 7, 8, 2);
        ctx.fill();
      }
    } else if (categoryId === "wine") {
      const cols = Math.max(3, Math.floor(o.w / 0.55));
      for (let i = 0; i < cols; i++) {
        const wx = o.x + 0.3 + i * ((o.w - 0.4) / cols);
        const wp = p(wx, o.y + o.h / 2, 0.72);
        ctx.fillStyle = i % 2 === 0 ? "#4c0519" : "#14532d";
        ctx.beginPath();
        ctx.roundRect(wp.x - 2.2, wp.y - 9, 4.4, 10, 1.5);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(wp.x - 2, wp.y - 5, 4, 3);
      }
    } else {
      drawPrism(
        ctx,
        v,
        o.x + 0.12,
        o.y + 0.12,
        o.w - 0.24,
        o.h - 0.24,
        0.68,
        0.92,
        "rgba(255,255,255,0.5)",
        "rgba(241,245,249,0.6)",
        "#ffffff",
        "#cbd5e1",
        1
      );
      const cols = Math.max(3, Math.floor(o.w / 0.65));
      for (let i = 0; i < cols; i++) {
        const cx = o.x + 0.35 + i * ((o.w - 0.5) / cols);
        const cp = p(cx, o.y + o.h / 2, 0.94);
        ctx.fillStyle = i % 2 === 0 ? "#0f766e" : "#b45309";
        ctx.beginPath();
        ctx.roundRect(cp.x - 3.5, cp.y - 6, 7, 7.5, 1.5);
        ctx.fill();
      }
    }
    labelZ = 1.18;
  } else if (o.kind === "table") {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;

    drawPrism(
      ctx,
      v,
      o.x + 0.04,
      cy - 0.22,
      0.32,
      0.44,
      0,
      0.42,
      style.chairColor,
      "#1e293b",
      style.chairColor
    );
    drawPrism(
      ctx,
      v,
      o.x + o.w - 0.36,
      cy - 0.22,
      0.32,
      0.44,
      0,
      0.42,
      style.chairColor,
      "#1e293b",
      style.chairColor
    );

    drawPrism(
      ctx,
      v,
      cx - 0.12,
      cy - 0.12,
      0.24,
      0.24,
      0,
      0.56,
      "#475569",
      "#334155",
      "#64748b"
    );

    drawPrism(
      ctx,
      v,
      o.x + 0.12,
      o.y + 0.1,
      o.w - 0.24,
      o.h - 0.2,
      0.56,
      0.66,
      style.tableSide,
      style.tableSide,
      style.tableTop,
      isSelected ? "#059669" : "rgba(15,23,42,0.2)",
      isSelected ? 1.8 : 0.9
    );

    const tp = p(cx, cy, 0.68);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(tp.x - 4, tp.y, 2.8, 0, Math.PI * 2);
    ctx.arc(tp.x + 4, tp.y + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    labelZ = 0.85;
  } else {
    drawPrism(
      ctx,
      v,
      o.x,
      o.y,
      o.w,
      o.h,
      0,
      0.42,
      style.showcaseFront,
      style.showcaseSide,
      style.tableTop
    );
    drawPrism(
      ctx,
      v,
      o.x + 0.08,
      o.y + 0.08,
      o.w - 0.16,
      o.h - 0.16,
      0.42,
      0.52,
      "#cbd5e1",
      "#94a3b8",
      "#f8fafc"
    );
    labelZ = 0.72;
  }

  if (lightsOn && (o.id === "display" || o.id === "order-desk" || o.id === "pickup-desk")) {
    const lampTop = p(o.x + o.w / 2, o.y + o.h / 2, 1.95);
    const lampShade = p(o.x + o.w / 2, o.y + o.h / 2, 1.58);
    line(ctx, lampTop, lampShade, "#64748b", 1.2);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(lampShade.x, lampShade.y, 4.5, Math.PI, 0);
    ctx.fill();

    const cone = ctx.createRadialGradient(
      lampShade.x,
      lampShade.y + 16,
      3,
      lampShade.x,
      lampShade.y + 24,
      44
    );
    cone.addColorStop(0, "rgba(253, 224, 71, 0.32)");
    cone.addColorStop(1, "rgba(253, 224, 71, 0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.arc(lampShade.x, lampShade.y + 24, 44, 0, Math.PI * 2);
    ctx.fill();
  }

  const labelPos = p(o.x + o.w / 2, o.y + o.h / 2, labelZ);
  const displayName = o.koLabel || o.label || o.id;
  ctx.font =
    "700 10px 'Plus Jakarta Sans', 'Noto Sans KR', -apple-system, sans-serif";
  const tw = ctx.measureText(displayName).width + 10;
  const th = 16;

  const isPrimary =
    o.id === "display" ||
    o.id.startsWith("custom-") ||
    o.id.startsWith("manual-");
  ctx.fillStyle = isPrimary
    ? "rgba(15, 23, 42, 0.88)"
    : "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = isSelected
    ? "#10b981"
    : isPrimary
    ? "rgba(255,255,255,0.25)"
    : "rgba(15, 23, 42, 0.15)";
  ctx.lineWidth = isSelected ? 1.5 : 1;
  ctx.beginPath();
  ctx.roundRect(labelPos.x - tw / 2, labelPos.y - th / 2, tw, th, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isPrimary ? "#ffffff" : "#0f172a";
  ctx.textAlign = "center";
  ctx.fillText(displayName, labelPos.x, labelPos.y + 3.5);
}

export interface DrawWorldOptions {
  canvas: HTMLCanvasElement;
  scene: Scene;
  result: SimResult | null | undefined;
  worldIndex: 0 | 1;
  currentTimeSec: number;
  walkMode: boolean;
  playerPos: Point2D;
  bodyWidth: number;
  selectedObjectId: string | null;
  hoveredObjectId: string | null;
  themeKey?: string;
  categoryId?: string;
  lightsOn?: boolean;
  acOn?: boolean;
  showHeatmap?: boolean;
  pickupStaffCount?: number;
  presetId?: string;
  viewMode?: "3d" | "2d";
  yawRad?: number;
  pitchRatio?: number;
  zoomScale?: number;
}

export function drawWorldCanvas(opts: DrawWorldOptions): IsoView {
  const {
    canvas,
    scene,
    result,
    worldIndex,
    currentTimeSec,
    walkMode,
    playerPos,
    bodyWidth,
    selectedObjectId,
    hoveredObjectId,
    themeKey = "express",
    categoryId = "coffee",
    lightsOn = true,
    acOn = true,
    showHeatmap = true,
    pickupStaffCount = 2,
    presetId = "both",
    viewMode = "3d",
    yawRad = 0,
    pitchRatio = 0.5,
    zoomScale = 1,
  } = opts;

  const style = INTERIOR_STYLES[categoryId] || INTERIOR_STYLES.coffee;

  const bounds = canvas.getBoundingClientRect();
  const w = Math.max(bounds.width, 280);
  const h = Math.max(bounds.height, 260);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, style.canvasBgTop);
  bgGrad.addColorStop(1, style.canvasBgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  if (viewMode === "2d") {
    const s2 =
      Math.min((w - 80) / scene.width, (h - 76) / scene.height) * zoomScale;
    const v2: IsoView = {
      s: s2,
      ox: (w - scene.width * s2) / 2,
      oy: (h - scene.height * s2) / 2 + 8,
      w,
      h,
      mode: "2d",
      sceneW: scene.width,
      sceneH: scene.height,
    };
    draw2DCadFloorplan(
      ctx,
      v2,
      scene,
      result,
      worldIndex,
      currentTimeSec,
      bodyWidth,
      selectedObjectId,
      pickupStaffCount
    );
    return v2;
  }

  const baseS = Math.min(
    (w - 56) / (scene.width + scene.height),
    (h - 90) / ((scene.width + scene.height) * 0.5)
  );
  const s = baseS * zoomScale;
  const v: IsoView = {
    s,
    ox: (w - (scene.width + scene.height) * s) / 2 + scene.height * s,
    oy: (h - (scene.width + scene.height) * s * pitchRatio) / 2 + 28,
    w,
    h,
    mode: "3d",
    yawRad,
    pitchRatio,
    sceneW: scene.width,
    sceneH: scene.height,
  };

  const p = (x: number, y: number, z = 0) => project(v, x, y, z);

  drawArchitecturalRoom(
    ctx,
    v,
    scene,
    style,
    categoryId,
    themeKey,
    lightsOn,
    acOn,
    currentTimeSec * 0.15,
    pickupStaffCount,
    presetId
  );

  if (result?.route?.length) {
    ctx.beginPath();
    result.route.forEach((a, i) => {
      const pp = p(a.x, a.y);
      if (i) ctx.lineTo(pp.x, pp.y);
      else ctx.moveTo(pp.x, pp.y);
    });
    ctx.strokeStyle =
      worldIndex === 1
        ? "rgba(234, 88, 12, 0.24)"
        : "rgba(82, 82, 91, 0.18)";
    ctx.lineWidth = Math.max(5, bodyWidth * v.s * 0.65);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    result.route.forEach((a, i) => {
      const pp = p(a.x, a.y);
      if (i) ctx.lineTo(pp.x, pp.y);
      else ctx.moveTo(pp.x, pp.y);
    });
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = worldIndex === 1 ? "#ea580c" : "#52525b";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const f = result
    ? sample(result, Math.max(0, Math.min(result.duration, currentTimeSec)))
    : { people: [], queue: 0, orderQueue: 0, pickupQueue: 0, completed: 0 };

  // Spatial Bottleneck Thermal Heatmap Overlay on Floor
  if (showHeatmap && result) {
    const drawHeatSpot = (
      hx: number,
      hy: number,
      radiusPx: number,
      intensity: number,
      isHot: boolean
    ) => {
      if (intensity <= 0.05) return;
      const hp = p(hx, hy, 0.02);
      const grad = ctx.createRadialGradient(
        hp.x,
        hp.y,
        3,
        hp.x,
        hp.y,
        radiusPx
      );
      const alpha = Math.min(0.46, 0.14 + intensity * 0.32);
      if (isHot) {
        grad.addColorStop(0, `rgba(234, 88, 12, ${alpha})`);
        grad.addColorStop(0.55, `rgba(249, 115, 22, ${alpha * 0.6})`);
        grad.addColorStop(1, "rgba(249, 115, 22, 0)");
      } else {
        grad.addColorStop(0, `rgba(251, 146, 60, ${alpha * 0.7})`);
        grad.addColorStop(1, "rgba(251, 146, 60, 0)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(hp.x, hp.y, radiusPx, radiusPx * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const orderLoad = Math.min(1, (f.orderQueue || 0) / 5);
    const pickupLoad = Math.min(1, (f.pickupQueue || 0) / 5);
    drawHeatSpot(
      scene.order.x,
      scene.order.y + 0.3,
      38,
      Math.max(0.25, orderLoad),
      orderLoad > 0.35
    );
    drawHeatSpot(
      scene.pickup.x,
      scene.pickup.y + 0.3,
      44,
      Math.max(0.25, pickupLoad),
      pickupLoad > 0.3
    );

    // Entrance choke heat spot in Baseline when display blocks direct entry
    const disp = scene.objects.find((o) => o.id === "display");
    if (disp && disp.y > 5.2 && disp.y < 7.0 && disp.x < 4.8) {
      drawHeatSpot(4.5, 7.1, 42, 0.85, true);
    }
  }

  type RenderItem =
    | { sort: number; object: SceneObject; person?: undefined }
    | { sort: number; person: (typeof f.people)[number]; object?: undefined };

  const items: RenderItem[] = [
    ...scene.objects.map((o) => ({ sort: o.x + o.y + o.w / 2 + o.h / 2, object: o })),
    ...f.people.map((person) => ({ sort: person.x + person.y, person })),
  ];
  items.sort((a, b) => a.sort - b.sort);

  for (const item of items) {
    if (item.object) {
      const obj = item.object;
      drawDetailedFurniture(
        ctx,
        v,
        obj,
        worldIndex === 1 && obj.id === selectedObjectId,
        worldIndex === 1 && obj.id === hoveredObjectId,
        style,
        categoryId,
        lightsOn
      );
      continue;
    }
    const person = item.person;
    const pp = p(person.x, person.y);
    const coatColor =
      person.state === "queue"
        ? "#ea580c"
        : person.state === "service"
        ? "#f97316"
        : "#27272a";

    ctx.beginPath();
    ctx.ellipse(pp.x, pp.y + 1, 4.2, 2.0, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.2)";
    ctx.fill();

    ctx.fillStyle = coatColor;
    ctx.beginPath();
    ctx.roundRect(pp.x - 2.8, pp.y - 8.5, 5.6, 7.2, 2.4);
    ctx.fill();

    ctx.fillStyle = "#fed7aa";
    ctx.beginPath();
    ctx.arc(pp.x, pp.y - 11.2, 3.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#18181b";
    ctx.beginPath();
    ctx.arc(pp.x, pp.y - 12.0, 2.8, Math.PI, 0);
    ctx.fill();
  }

  if (walkMode && playerPos) {
    const r = bodyWidth / 2;
    poly(
      ctx,
      [
        p(playerPos.x - r, playerPos.y - r),
        p(playerPos.x + r, playerPos.y - r),
        p(playerPos.x + r, playerPos.y + r),
        p(playerPos.x - r, playerPos.y + r),
      ],
      "rgba(234, 88, 12, 0.25)",
      "#ea580c",
      2
    );
    const here = p(playerPos.x, playerPos.y, 0.5);
    ctx.fillStyle = "#ea580c";
    ctx.beginPath();
    ctx.arc(here.x, here.y, 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font =
      "700 11px 'JetBrains Mono', 'Plus Jakarta Sans', -apple-system, sans-serif";
    ctx.fillStyle = "#9a3412";
    ctx.textAlign = "center";
    ctx.fillText(`YOU (${bodyWidth.toFixed(2)}m)`, here.x, here.y - 12);
  }

  for (const key of ["order", "pickup"] as const) {
    const count = f.people.filter(
      (a) => a.state === "queue" && a.stage === key
    ).length;
    if (count > 0) {
      const q = p(scene[key].x, scene[key].y + 0.55, 0.25);
      const text = `${key === "order" ? "POS" : "PICKUP"} QUEUE: ${count}`;
      ctx.font =
        "700 10px 'JetBrains Mono', 'Plus Jakarta Sans', -apple-system, sans-serif";
      const tw = ctx.measureText(text).width + 14;
      ctx.fillStyle = "#fff7ed";
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(q.x - tw / 2, q.y - 10, tw, 19, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#9a3412";
      ctx.textAlign = "center";
      ctx.fillText(text, q.x, q.y + 3.5);
    }
  }

  // Active Scenario Status Pill on Bottom-Left of Canvas
  const scnLabelMap: Record<string, string> = {
    both: "SCN-01 · Standard Peak (4.0/min)",
    rainy: "SCN-02 · Rainy Surge (6.5/min)",
    layout: "SCN-03 · Solo Barista (1 Staff)",
    influencer: "SCN-04 · Viral Drop (7.5/min · 3 Staff)",
    staff: "SCN-05 · Baseline + Extra Staff",
    stroller: "SCN-06 · Stroller / Group (1.20m Width)",
    custom: "CUSTOM · User Edited Floorplan",
  };
  const scnText = scnLabelMap[presetId] || scnLabelMap.custom;
  ctx.textAlign = "left";
  ctx.fillStyle = "#3f3f46";
  ctx.font =
    "700 10px 'JetBrains Mono', 'Plus Jakarta Sans', -apple-system, sans-serif";
  ctx.fillText(scnText, 14, h - 12);

  ctx.textAlign = "right";
  ctx.font =
    "600 10px 'JetBrains Mono', -apple-system, sans-serif";
  ctx.fillText(
    `STAFF ${pickupStaffCount} · DONE ${f.completed || 0} · QUEUE ${f.queue || 0}`,
    w - 14,
    h - 12
  );

  if (result?.routeBlocked) {
    ctx.fillStyle = "rgba(254, 242, 242, 0.95)";
    ctx.fillRect(0, h / 2 - 24, w, 48);
    ctx.strokeStyle = "#f87171";
    ctx.strokeRect(0, h / 2 - 24, w, 48);
    ctx.fillStyle = "#991b1b";
    ctx.font =
      "700 11.5px 'JetBrains Mono', 'Plus Jakarta Sans', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `ROUTE BLOCKED (Clearance ${bodyWidth.toFixed(2)}m) — Entrance Display Choke`,
      w / 2,
      h / 2 + 4
    );
  }

  return v;
}

export function generateSampleBlueprintCanvas(): HTMLCanvasElement {
  const off = document.createElement("canvas");
  const W = 840;
  const H = 340;
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d")!;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 12; x++) {
    const px = (x / 12) * W;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
  }
  for (let y = 0; y <= 9; y++) {
    const py = (y / 9) * H;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
  }

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  const drawRectM = (
    mx: number,
    my: number,
    mw: number,
    mh: number,
    label: string,
    fill: string,
    stroke: string
  ) => {
    const rx = (mx / 12) * W;
    const ry = (my / 9) * H;
    const rw = (mw / 12) * W;
    const rh = (mh / 9) * H;
    ctx.fillStyle = fill;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 11.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, rx + rw / 2, ry + rh / 2 + 4);
  };

  drawRectM(3.0, 0.4, 2.6, 1.1, "ORDER BAR", "#dbeafe", "#3b82f6");
  drawRectM(7.1, 0.4, 2.6, 1.1, "PICKUP BAR", "#d1fae5", "#10b981");
  drawRectM(0.4, 5.8, 2.0, 1.1, "WINDOW BENCH", "#f1f5f9", "#64748b");
  drawRectM(4.3, 3.6, 3.0, 1.5, "DRAG BOOTH ZONE", "#fef3c7", "#f59e0b");

  ctx.fillStyle = "#475569";
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText("CAD 12.0m × 9.0m", 14, H - 12);

  return off;
}
