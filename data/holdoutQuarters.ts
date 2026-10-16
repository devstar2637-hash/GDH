// data/holdoutQuarters.ts — Lane A2. Quarters after the calibration window.
// Kept out of shared/ so parameter fitting cannot import them from the frozen contract.
// The backtest gate reads this module only when scoring the separate check.

import type { QuarterMarketRow } from "../shared/types.js";

export const HOLDOUT_CAFE_QUARTERS: readonly QuarterMarketRow[] = [
  { quarter: "20251", tradeAreas: 8, totalStores: 246, opens: 7, closes: 8, openRatePct: 2.846, closeRatePct: 3.252, estSalesKrw: 6_690_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20252", tradeAreas: 8, totalStores: 245, opens: 6, closes: 7, openRatePct: 2.449, closeRatePct: 2.857, estSalesKrw: 6_880_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20253", tradeAreas: 8, totalStores: 251, opens: 14, closes: 8, openRatePct: 5.578, closeRatePct: 3.187, estSalesKrw: 6_910_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20254", tradeAreas: 8, totalStores: 247, opens: 7, closes: 10, openRatePct: 2.834, closeRatePct: 4.049, estSalesKrw: 6_780_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20261", tradeAreas: 8, totalStores: 249, opens: 6, closes: 4, openRatePct: 2.410, closeRatePct: 1.606, estSalesKrw: 6_720_000_000, sourceFiles: ["OA-15577_2026Q1-Q2_utf8.csv"] },
  { quarter: "20262", tradeAreas: 8, totalStores: 245, opens: 3, closes: 7, openRatePct: 1.224, closeRatePct: 2.857, estSalesKrw: 6_840_000_000, sourceFiles: ["OA-15577_2026Q1-Q2_utf8.csv"] },
];
