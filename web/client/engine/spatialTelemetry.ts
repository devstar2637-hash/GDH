import type { Scene, SceneObject, SimResult } from "./rehearsalCore.ts";

type SpatialResult = Pick<SimResult, "routeBlocked" | "meanWaitSec" | "completed" | "walkDistance">;

export function spatialWaitLabel(result: SpatialResult | null | undefined): string {
  if (result?.routeBlocked) return "Blocked";
  const wait = result?.meanWaitSec;
  return typeof wait === "number" && Number.isFinite(wait) ? `${Math.round(wait)}s` : "N/A";
}

export function spatialMetricSummary(result: SpatialResult | null | undefined): string {
  const walk = result?.walkDistance;
  const walkLabel = typeof walk === "number" && Number.isFinite(walk) ? `${walk.toFixed(1)}m` : "N/A";
  return `Wait ${spatialWaitLabel(result)} · 10m Served ${result?.completed ?? "N/A"} · Walk ${walkLabel} [spatial model]`;
}

export function spatialWaitDelta(base: SpatialResult | null | undefined, plan: SpatialResult | null | undefined): string {
  if (!base || !plan || base.routeBlocked || plan.routeBlocked ||
      !Number.isFinite(base.meanWaitSec) || !Number.isFinite(plan.meanWaitSec)) return "comparison unavailable";
  const delta = Math.round(plan.meanWaitSec! - base.meanWaitSec!);
  return delta < 0 ? `${Math.abs(delta)}s faster` : `${delta}s slower`;
}

// This is a point-to-fixture distance, not the minimum route clearance.
export function entranceFixtureGap(scene: Scene, fixture: SceneObject): number {
  const nearestX = Math.max(fixture.x, Math.min(scene.entrance.x, fixture.x + fixture.w));
  const nearestY = Math.max(fixture.y, Math.min(scene.entrance.y, fixture.y + fixture.h));
  return Math.hypot(scene.entrance.x - nearestX, scene.entrance.y - nearestY);
}
