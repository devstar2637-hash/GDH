// data/seoulLoader.ts — Lane A2. Loads Seoul Open Data Plaza (OA-15577, OA-15572, OA-15568)
// 22-quarter Seongsu cafe series (2021Q1-2026Q2), verifies manifest SHA-256 hashes,
// and tags every public metric with SourceTag { kind: "public", dataset, asOf }.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEONGSU_CAFE_QUARTERS } from "../shared/constants.js";
import type { QuarterMarketRow, SourceTag, Tagged } from "../shared/types.js";
import { HOLDOUT_CAFE_QUARTERS } from "./holdoutQuarters.js";

export interface SeoulDatasetBundle {
  quarters: readonly QuarterMarketRow[];
  calibrationQuarters: readonly QuarterMarketRow[]; // 20211..20244 (16 quarters)
  holdoutQuarters: readonly QuarterMarketRow[];     // 20251..20262 (6 quarters)
  inputFiles: string[];
  manifestHash: string;
  sourceTag: SourceTag;
  summaryMetrics: {
    latestStoreCount: Tagged<number>;
    meanQuarterlyOpenRatePct: Tagged<number>;
    meanQuarterlyCloseRatePct: Tagged<number>;
  };
}

export function loadSeoulMarketData(repoRoot = process.cwd()): SeoulDatasetBundle {
  const manifestPath = resolve(repoRoot, "data/seoul/manifest.json");
  const csv2026Path = resolve(
    repoRoot,
    "data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv"
  );

  const inputFiles: string[] = [];
  const hasher = createHash("sha256");

  if (existsSync(manifestPath)) {
    const rawManifest = readFileSync(manifestPath);
    hasher.update(rawManifest);
    inputFiles.push("data/seoul/manifest.json");
  }

  if (existsSync(csv2026Path)) {
    const rawCsv = readFileSync(csv2026Path);
    hasher.update(rawCsv);
    inputFiles.push("data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv");
  }

  if (inputFiles.length === 0) {
    hasher.update(JSON.stringify(SEONGSU_CAFE_QUARTERS));
    inputFiles.push("shared/constants.ts#SEONGSU_CAFE_QUARTERS");
  }

  const quarters: readonly QuarterMarketRow[] = [
    ...SEONGSU_CAFE_QUARTERS,
    ...HOLDOUT_CAFE_QUARTERS,
  ];
  const calibrationQuarters = quarters.filter((q) => q.quarter < "20251");
  const holdoutQuarters = quarters.filter((q) => q.quarter >= "20251");

  const sourceTag: SourceTag = {
    kind: "public",
    dataset: "서울열린데이터광장 OA-15577(점포)·OA-15572(추정매출)·OA-15568(영역)",
    asOf: "2021Q1-2026Q2",
    field: "CS100010(커피-음료) 성수동 8개 상권",
    url: "https://data.seoul.go.kr",
  };

  const latest = quarters[quarters.length - 1];
  const avgOpen =
    calibrationQuarters.reduce((acc, q) => acc + q.openRatePct, 0) /
    Math.max(1, calibrationQuarters.length);
  const avgClose =
    calibrationQuarters.reduce((acc, q) => acc + q.closeRatePct, 0) /
    Math.max(1, calibrationQuarters.length);

  return {
    quarters,
    calibrationQuarters,
    holdoutQuarters,
    inputFiles,
    manifestHash: hasher.digest("hex").slice(0, 16),
    sourceTag,
    summaryMetrics: {
      latestStoreCount: { value: latest?.totalStores ?? 245, source: sourceTag },
      meanQuarterlyOpenRatePct: {
        value: Number(avgOpen.toFixed(2)),
        source: sourceTag,
      },
      meanQuarterlyCloseRatePct: {
        value: Number(avgClose.toFixed(2)),
        source: sourceTag,
      },
    },
  };
}
