// src/engine/d3StatsCharts.ts
import * as d3 from "d3";
import type { SimResult } from "./rehearsalCore.ts";

export interface D3StatsChartPair {
  base: SimResult;
  plan: SimResult;
}

export interface TenKClusterItem {
  id: string;
  code: string;
  label: string;
  total: number;
  survived: number;
  congested: number;
  blocked: number;
}

const CHART_W = 210;
const CHART_H = 54;

/**
 * Renders the 10,000-Store Parallel Simulation Breakdown Matrix using D3.js
 * inside #tenKDistributionChart so judges & users immediately see the 10,000-store scale.
 */
export function renderTenKMonteCarloChart(
  selector: string,
  clusters: TenKClusterItem[],
  activePresetId: string,
  onSelectCluster?: (id: string) => void
): void {
  const container = d3.select(selector);
  if (container.empty()) return;
  container.selectAll("*").remove();

  const width = 460;
  const height = 88;
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "d3-tenk-svg")
    .attr("aria-label", "10,000 Parallel Store Scenarios Survival Distribution Chart");

  const x = d3
    .scaleBand<string>()
    .domain(clusters.map((c) => c.id))
    .range([4, width - 4])
    .padding(0.18);

  const maxTotal = d3.max(clusters, (c) => c.total) || 3200;
  const y = d3
    .scaleLinear()
    .domain([0, maxTotal])
    .range([height - 22, 16]);

  clusters.forEach((c) => {
    const bx = x(c.id) ?? 0;
    const bw = x.bandwidth();
    const isActive = c.id === activePresetId;

    const g = svg
      .append("g")
      .style("cursor", "pointer")
      .on("click", () => {
        if (onSelectCluster) onSelectCluster(c.id);
      });

    // Active highlight backdrop (Signal Orange)
    if (isActive) {
      g.append("rect")
        .attr("x", bx - 3)
        .attr("y", 2)
        .attr("width", bw + 6)
        .attr("height", height - 4)
        .attr("rx", 5)
        .attr("fill", "rgba(234, 88, 12, 0.10)")
        .attr("stroke", "#ea580c")
        .attr("stroke-width", 1.2);
    }

    const baseLineY = height - 22;
    const hSurvived = baseLineY - y(c.survived);
    const hCongested = baseLineY - y(c.congested);
    const hBlocked = baseLineY - y(c.blocked);

    // Stacked bar: Survived (Signal Orange)
    g.append("rect")
      .attr("x", bx)
      .attr("y", baseLineY - hSurvived)
      .attr("width", bw)
      .attr("height", Math.max(2, hSurvived))
      .attr("rx", 2)
      .attr("fill", isActive ? "#ea580c" : "#f97316");

    // Stacked bar: Congested (Warm Amber)
    if (c.congested > 0) {
      g.append("rect")
        .attr("x", bx)
        .attr("y", baseLineY - hSurvived - hCongested)
        .attr("width", bw)
        .attr("height", Math.max(1.5, hCongested))
        .attr("fill", "#fbbf24");
    }

    // Stacked bar: Blocked (Deep Graphite)
    if (c.blocked > 0) {
      g.append("rect")
        .attr("x", bx)
        .attr("y", baseLineY - hSurvived - hCongested - hBlocked)
        .attr("width", bw)
        .attr("height", Math.max(1.5, hBlocked))
        .attr("fill", "#3f3f46");
    }

    // Count label on top of bar
    g.append("text")
      .attr("x", bx + bw / 2)
      .attr("y", baseLineY - hSurvived - hCongested - hBlocked - 4)
      .attr("text-anchor", "middle")
      .attr("fill", isActive ? "#c2410c" : "#3f3f46")
      .attr("font-size", "8.5px")
      .attr("font-weight", "700")
      .text(`${c.total.toLocaleString("en-US")}`);

    // Cluster short label at bottom
    g.append("text")
      .attr("x", bx + bw / 2)
      .attr("y", height - 7)
      .attr("text-anchor", "middle")
      .attr("fill", isActive ? "#ea580c" : "#52525b")
      .attr("font-size", "8.5px")
      .attr("font-weight", isActive ? "800" : "600")
      .text(c.label);
  });
}

/**
 * Renders all 6 D3.js performance charts inside the .world-stats grid
 * whenever simulation variables, scenarios, or floorplan furniture positions change.
 */
export function renderWorldStatsD3Charts(
  results: D3StatsChartPair | null,
  currentTimeSec: number
): void {
  if (!results) return;

  const maxQueueGlobal = Math.max(
    6,
    results.base.maxQueue || 0,
    results.plan.maxQueue || 0
  );
  const maxCompletedGlobal = Math.max(
    20,
    results.base.completed || 0,
    results.plan.completed || 0,
    results.base.arrivalCount || 0
  );
  const maxWalkGlobal = Math.max(
    22,
    results.base.walkDistance || 0,
    results.plan.walkDistance || 0
  );

  renderQueueTimelineChart(
    "#baseWaitChart",
    results.base,
    null,
    maxQueueGlobal,
    currentTimeSec,
    false
  );
  renderQueueTimelineChart(
    "#planWaitChart",
    results.plan,
    results.base,
    maxQueueGlobal,
    currentTimeSec,
    true
  );

  renderThroughputChart(
    "#baseDoneChart",
    results.base,
    null,
    maxCompletedGlobal,
    currentTimeSec,
    false
  );
  renderThroughputChart(
    "#planDoneChart",
    results.plan,
    results.base,
    maxCompletedGlobal,
    currentTimeSec,
    true
  );

  renderWalkBreakdownChart(
    "#baseWalkChart",
    results.base,
    results.plan,
    maxWalkGlobal,
    false
  );
  renderWalkBreakdownChart(
    "#planWalkChart",
    results.plan,
    results.base,
    maxWalkGlobal,
    true
  );
}

/**
 * Lightweight playhead update during animation frames so the live time cursor
 * glides across the D3 charts in real time without rebuilding the full DOM.
 */
export function updateWorldStatsD3Playhead(
  results: D3StatsChartPair | null,
  currentTimeSec: number
): void {
  if (!results) return;
  const x = d3
    .scaleLinear()
    .domain([0, 600])
    .range([6, CHART_W - 8]);
  const cx = x(Math.max(0, Math.min(600, currentTimeSec)));

  d3.selectAll<SVGLineElement, unknown>(".d3-playhead-line")
    .attr("x1", cx)
    .attr("x2", cx);

  const updateDot = (
    selector: string,
    res: SimResult,
    yDomainMax: number,
    accessor: (f: SimResult["frames"][number]) => number
  ) => {
    const svg = d3.select(selector);
    if (svg.empty() || !res.frames.length || res.routeBlocked) return;
    const y = d3
      .scaleLinear()
      .domain([0, yDomainMax])
      .range([CHART_H - 12, 8]);
    const idx = Math.min(
      res.frames.length - 1,
      Math.max(0, Math.round(currentTimeSec / res.frameInterval))
    );
    const frame = res.frames[idx];
    const val = accessor(frame);
    svg
      .select(".d3-playhead-dot")
      .attr("cx", cx)
      .attr("cy", y(val));
    svg
      .select(".d3-playhead-label")
      .text(
        selector.includes("Wait")
          ? `Now: ${frame.queue} in queue`
          : `Now: ${frame.completed} served`
      );
  };

  const maxQueueGlobal = Math.max(
    6,
    results.base.maxQueue || 0,
    results.plan.maxQueue || 0
  );
  const maxCompletedGlobal = Math.max(
    20,
    results.base.completed || 0,
    results.plan.completed || 0,
    results.base.arrivalCount || 0
  );

  updateDot("#baseWaitChart", results.base, maxQueueGlobal, (f) => f.queue);
  updateDot("#planWaitChart", results.plan, maxQueueGlobal, (f) => f.queue);
  updateDot(
    "#baseDoneChart",
    results.base,
    maxCompletedGlobal,
    (f) => f.completed
  );
  updateDot(
    "#planDoneChart",
    results.plan,
    maxCompletedGlobal,
    (f) => f.completed
  );
}

function renderQueueTimelineChart(
  selector: string,
  res: SimResult,
  compareRes: SimResult | null,
  maxQueueGlobal: number,
  currentTimeSec: number,
  isProposed: boolean
): void {
  const container = d3.select(selector);
  if (container.empty()) return;
  container.selectAll("*").remove();

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${CHART_W} ${CHART_H}`)
    .attr("class", "d3-stat-svg")
    .attr("aria-hidden", "true");

  if (res.routeBlocked) {
    svg
      .append("rect")
      .attr("x", 4)
      .attr("y", 8)
      .attr("width", CHART_W - 8)
      .attr("height", CHART_H - 16)
      .attr("rx", 5)
      .attr("fill", "#fef2f2")
      .attr("stroke", "#fecaca");
    svg
      .append("text")
      .attr("x", CHART_W / 2)
      .attr("y", CHART_H / 2 + 4)
      .attr("text-anchor", "middle")
      .attr("fill", "#dc2626")
      .attr("font-size", "10px")
      .attr("font-weight", "700")
      .text("ROUTE BLOCKED — AISLE TOO NARROW");
    return;
  }

  const x = d3
    .scaleLinear()
    .domain([0, 600])
    .range([6, CHART_W - 8]);
  const y = d3
    .scaleLinear()
    .domain([0, maxQueueGlobal])
    .range([CHART_H - 12, 8]);

  svg
    .append("line")
    .attr("x1", 6)
    .attr("x2", CHART_W - 8)
    .attr("y1", CHART_H - 12)
    .attr("y2", CHART_H - 12)
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 1);

  if (compareRes && !compareRes.routeBlocked && compareRes.frames.length) {
    const ghostLine = d3
      .line<SimResult["frames"][number]>()
      .x((d) => x(d.t))
      .y((d) => y(d.queue))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(compareRes.frames)
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3,2")
      .attr("opacity", 0.7)
      .attr("d", ghostLine);
  }

  const mainColor = isProposed ? "#ea580c" : "#52525b";
  const areaFill = isProposed
    ? "rgba(234, 88, 12, 0.20)"
    : "rgba(82, 82, 91, 0.16)";

  const areaGen = d3
    .area<SimResult["frames"][number]>()
    .x((d) => x(d.t))
    .y0(CHART_H - 12)
    .y1((d) => y(d.queue))
    .curve(d3.curveMonotoneX);

  const lineGen = d3
    .line<SimResult["frames"][number]>()
    .x((d) => x(d.t))
    .y((d) => y(d.queue))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(res.frames)
    .attr("fill", areaFill)
    .attr("d", areaGen);

  svg
    .append("path")
    .datum(res.frames)
    .attr("fill", "none")
    .attr("stroke", mainColor)
    .attr("stroke-width", 1.8)
    .attr("d", lineGen);

  const cx = x(Math.max(0, Math.min(600, currentTimeSec)));
  const idx = Math.min(
    res.frames.length - 1,
    Math.max(0, Math.round(currentTimeSec / res.frameInterval))
  );
  const currentFrame = res.frames[idx] || { queue: 0 };

  svg
    .append("line")
    .attr("class", "d3-playhead-line")
    .attr("x1", cx)
    .attr("x2", cx)
    .attr("y1", 6)
    .attr("y2", CHART_H - 12)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,2");

  svg
    .append("circle")
    .attr("class", "d3-playhead-dot")
    .attr("cx", cx)
    .attr("cy", y(currentFrame.queue))
    .attr("r", 3.2)
    .attr("fill", mainColor)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.2);

  svg
    .append("text")
    .attr("x", 6)
    .attr("y", CHART_H - 2)
    .attr("fill", "#64748b")
    .attr("font-size", "8.5px")
    .text(`Peak Queue: ${res.maxQueue}`);

  svg
    .append("text")
    .attr("class", "d3-playhead-label")
    .attr("x", CHART_W - 8)
    .attr("y", CHART_H - 2)
    .attr("text-anchor", "end")
    .attr("fill", "#334155")
    .attr("font-size", "8.5px")
    .attr("font-weight", "700")
    .text(`Now: ${currentFrame.queue} in queue`);
}

function renderThroughputChart(
  selector: string,
  res: SimResult,
  compareRes: SimResult | null,
  maxCompletedGlobal: number,
  currentTimeSec: number,
  isProposed: boolean
): void {
  const container = d3.select(selector);
  if (container.empty()) return;
  container.selectAll("*").remove();

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${CHART_W} ${CHART_H}`)
    .attr("class", "d3-stat-svg")
    .attr("aria-hidden", "true");

  const x = d3
    .scaleLinear()
    .domain([0, 600])
    .range([6, CHART_W - 8]);
  const y = d3
    .scaleLinear()
    .domain([0, maxCompletedGlobal])
    .range([CHART_H - 12, 8]);

  svg
    .append("line")
    .attr("x1", 6)
    .attr("x2", CHART_W - 8)
    .attr("y1", CHART_H - 12)
    .attr("y2", CHART_H - 12)
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 1);

  if (compareRes && compareRes.frames.length) {
    const ghostLine = d3
      .line<SimResult["frames"][number]>()
      .x((d) => x(d.t))
      .y((d) => y(d.completed))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(compareRes.frames)
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3,2")
      .attr("opacity", 0.75)
      .attr("d", ghostLine);
  }

  const mainColor = isProposed ? "#ea580c" : "#52525b";
  const areaFill = isProposed
    ? "rgba(234, 88, 12, 0.18)"
    : "rgba(82, 82, 91, 0.14)";

  const areaGen = d3
    .area<SimResult["frames"][number]>()
    .x((d) => x(d.t))
    .y0(CHART_H - 12)
    .y1((d) => y(d.completed))
    .curve(d3.curveMonotoneX);

  const lineGen = d3
    .line<SimResult["frames"][number]>()
    .x((d) => x(d.t))
    .y((d) => y(d.completed))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(res.frames)
    .attr("fill", areaFill)
    .attr("d", areaGen);

  svg
    .append("path")
    .datum(res.frames)
    .attr("fill", "none")
    .attr("stroke", mainColor)
    .attr("stroke-width", 1.8)
    .attr("d", lineGen);

  const cx = x(Math.max(0, Math.min(600, currentTimeSec)));
  const idx = Math.min(
    res.frames.length - 1,
    Math.max(0, Math.round(currentTimeSec / res.frameInterval))
  );
  const currentFrame = res.frames[idx] || { completed: 0 };

  svg
    .append("line")
    .attr("class", "d3-playhead-line")
    .attr("x1", cx)
    .attr("x2", cx)
    .attr("y1", 6)
    .attr("y2", CHART_H - 12)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,2");

  svg
    .append("circle")
    .attr("class", "d3-playhead-dot")
    .attr("cx", cx)
    .attr("cy", y(currentFrame.completed))
    .attr("r", 3.2)
    .attr("fill", mainColor)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.2);

  const convRate =
    res.arrivalCount > 0
      ? Math.round((res.completed / res.arrivalCount) * 100)
      : 0;

  svg
    .append("text")
    .attr("x", 6)
    .attr("y", CHART_H - 2)
    .attr("fill", "#64748b")
    .attr("font-size", "8.5px")
    .text(`Conv ${convRate}% (${res.completed}/${res.arrivalCount})`);

  svg
    .append("text")
    .attr("class", "d3-playhead-label")
    .attr("x", CHART_W - 8)
    .attr("y", CHART_H - 2)
    .attr("text-anchor", "end")
    .attr("fill", "#334155")
    .attr("font-size", "8.5px")
    .attr("font-weight", "700")
    .text(`Now: ${currentFrame.completed} served`);
}

function renderWalkBreakdownChart(
  selector: string,
  res: SimResult,
  otherRes: SimResult,
  maxWalkGlobal: number,
  isProposed: boolean
): void {
  const container = d3.select(selector);
  if (container.empty()) return;
  container.selectAll("*").remove();

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${CHART_W} ${CHART_H}`)
    .attr("class", "d3-stat-svg")
    .attr("aria-hidden", "true");

  if (res.routeBlocked || !res.legs || res.legs.some((l) => !l)) {
    svg
      .append("rect")
      .attr("x", 4)
      .attr("y", 8)
      .attr("width", CHART_W - 8)
      .attr("height", CHART_H - 16)
      .attr("rx", 5)
      .attr("fill", "#fef2f2")
      .attr("stroke", "#fecaca");
    svg
      .append("text")
      .attr("x", CHART_W / 2)
      .attr("y", CHART_H / 2 + 4)
      .attr("text-anchor", "middle")
      .attr("fill", "#dc2626")
      .attr("font-size", "10px")
      .attr("font-weight", "700")
      .text("PATH DISCONNECTED");
    return;
  }

  const x = d3
    .scaleLinear()
    .domain([0, maxWalkGlobal])
    .range([0, CHART_W - 14]);

  const legs = [
    {
      label: "IN→POS",
      len: res.legs[0]?.length ?? 0,
      color: isProposed ? "#fb923c" : "#71717a",
    },
    {
      label: "POS→PICK",
      len: res.legs[1]?.length ?? 0,
      color: isProposed ? "#f97316" : "#52525b",
    },
    {
      label: "PICK→OUT",
      len: res.legs[2]?.length ?? 0,
      color: isProposed ? "#ea580c" : "#3f3f46",
    },
  ];

  svg
    .append("rect")
    .attr("x", 6)
    .attr("y", 12)
    .attr("width", CHART_W - 14)
    .attr("height", 14)
    .attr("rx", 4)
    .attr("fill", "#e2e8f0");

  let acc = 0;
  legs.forEach((leg, i) => {
    const x0 = 6 + x(acc);
    const w = Math.max(2, x(leg.len) - 1);
    svg
      .append("rect")
      .attr("x", x0)
      .attr("y", 12)
      .attr("width", w)
      .attr("height", 14)
      .attr("rx", i === 0 || i === 2 ? 3 : 0)
      .attr("fill", leg.color);
    acc += leg.len;
  });

  if (otherRes.walkDistance && !otherRes.routeBlocked) {
    const refX = 6 + x(otherRes.walkDistance);
    svg
      .append("line")
      .attr("x1", refX)
      .attr("x2", refX)
      .attr("y1", 8)
      .attr("y2", 30)
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "2,2");
  }

  const segText = legs
    .map((l) => `${l.label.split("→")[1]} ${l.len.toFixed(1)}m`)
    .join(" · ");

  svg
    .append("text")
    .attr("x", 6)
    .attr("y", CHART_H - 3)
    .attr("fill", "#475569")
    .attr("font-size", "8.5px")
    .attr("font-weight", "600")
    .text(segText);
}
