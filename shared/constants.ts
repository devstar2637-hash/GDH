// shared/constants.ts — A Thousand Stores. FROZEN at 12:15 KST.
// Seasonality table, assumption defaults with source tags, and reference market constants.

import type { Constraints, StoreDesign, SourceTag, QuarterMarketRow } from "./types.js";

/**
 * 12-month cafe demand seasonality index (1-indexed: month 1..12 mapped via (m - 1) % 12).
 * Tagged as 'assumed' in default runs.
 */
export const DEFAULT_SEASONALITY: readonly number[] = [
  0.86, // Jan (winter dip)
  0.88, // Feb
  0.98, // Mar (spring recovery)
  1.05, // Apr
  1.10, // May (peak spring)
  1.08, // Jun
  1.04, // Jul
  1.02, // Aug
  1.06, // Sep (autumn peak)
  1.09, // Oct
  0.96, // Nov
  0.88, // Dec (winter dip)
];

export const DEFAULT_ASSUMPTION_TAGS: Record<string, SourceTag> = {
  wagePerStaffKrw: { kind: "assumed", note: "월 인건비 2,400,000원/명 (SPEC §5 기본 가정)", field: "wagePerStaffKrw" },
  otherExpenseRatio: { kind: "assumed", note: "공과금·마케팅비 매출의 6% (SPEC §5 기본 가정)", field: "otherExpenseRatio" },
  cogsRatio: { kind: "assumed", note: "식음료 원가율 32% (메뉴 티어별 기본 가정)", field: "cogsRatio" },
  seasonality: { kind: "assumed", note: "서울 카페 12개월 계절성 지수 (0.86~1.10)", field: "seasonality" },
  reserveRatioMin: { kind: "computed", by: "oracle", field: "reserveRatioMin" },
};

export const DEFAULT_CONSTRAINTS: Constraints = {
  budgetKrw: 120_000_000,
  reserveRatioMin: 0.10,
  horizonMonths: 36,
  district: "성수동",
  trade: "cafe",
  seed: 20261016,
};

export const DEFAULT_BASE_STORE_DESIGN: StoreDesign = {
  id: "base-seongsu-cafe",
  seats: 22,
  floorAreaM2: 49.5,
  deposit: {
    value: 35_000_000,
    source: { kind: "onsite", field: "deposit", note: "성수동 1층 15평형 보증금 현장 호가" },
  },
  monthlyRent: {
    value: 3_200_000,
    source: { kind: "onsite", field: "monthlyRent", note: "성수동 1층 15평형 월세 현장 호가" },
  },
  fitoutCost: {
    value: 62_000_000,
    source: { kind: "onsite", field: "fitoutCost", note: "인테리어 4,200만 + 에스프레소/제빙 장비 2,000만 현장 견적" },
  },
  staffFte: 1.5,
  ownerHoursPerWeek: 54,
  menuTier: 2,
  avgTicketKrw: 4_800,
  makeTimeSec: 95,
  openDaysPerWeek: 6,
  equipmentKrw: 20_000_000,
  cupsPerDayBase: 185,
  cogsRatio: 0.32,
  openingMonth: 3,
  wagePerStaffKrw: 2_400_000,
  otherExpenseRatio: 0.06,
  familyId: "fam-000",
};

/**
 * 22-quarter Seongsu cafe (CS100010, 8 trade areas) official series from OA-15577 & OA-15572.
 * Calibration: 20211..20244 (16 quarters). Holdout: 20251..20262 (6 quarters).
 */
export const SEONGSU_CAFE_QUARTERS: readonly QuarterMarketRow[] = [
  { quarter: "20211", tradeAreas: 8, totalStores: 184, opens: 7, closes: 3, openRatePct: 3.804, closeRatePct: 1.630, estSalesKrw: 4_820_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2021년.zip"] },
  { quarter: "20212", tradeAreas: 8, totalStores: 194, opens: 19, closes: 9, openRatePct: 9.794, closeRatePct: 4.639, estSalesKrw: 5_410_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2021년.zip"] },
  { quarter: "20213", tradeAreas: 8, totalStores: 195, opens: 7, closes: 6, openRatePct: 3.590, closeRatePct: 3.077, estSalesKrw: 5_390_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2021년.zip"] },
  { quarter: "20214", tradeAreas: 8, totalStores: 199, opens: 13, closes: 9, openRatePct: 6.533, closeRatePct: 4.523, estSalesKrw: 5_680_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2021년.zip"] },
  { quarter: "20221", tradeAreas: 8, totalStores: 208, opens: 15, closes: 6, openRatePct: 7.212, closeRatePct: 2.885, estSalesKrw: 5_720_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2022년.zip"] },
  { quarter: "20222", tradeAreas: 8, totalStores: 222, opens: 16, closes: 2, openRatePct: 7.207, closeRatePct: 0.901, estSalesKrw: 6_350_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2022년.zip"] },
  { quarter: "20223", tradeAreas: 8, totalStores: 223, opens: 9, closes: 8, openRatePct: 4.036, closeRatePct: 3.587, estSalesKrw: 6_410_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2022년.zip"] },
  { quarter: "20224", tradeAreas: 8, totalStores: 233, opens: 23, closes: 13, openRatePct: 9.871, closeRatePct: 5.579, estSalesKrw: 6_590_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2022년.zip"] },
  { quarter: "20231", tradeAreas: 8, totalStores: 237, opens: 12, closes: 8, openRatePct: 5.063, closeRatePct: 3.376, estSalesKrw: 6_480_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2023년.zip"] },
  { quarter: "20232", tradeAreas: 8, totalStores: 240, opens: 10, closes: 7, openRatePct: 4.167, closeRatePct: 2.917, estSalesKrw: 6_820_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2023년.zip"] },
  { quarter: "20233", tradeAreas: 8, totalStores: 243, opens: 12, closes: 9, openRatePct: 4.938, closeRatePct: 3.704, estSalesKrw: 6_790_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2023년.zip"] },
  { quarter: "20234", tradeAreas: 8, totalStores: 243, opens: 9, closes: 9, openRatePct: 3.704, closeRatePct: 3.704, estSalesKrw: 6_850_000_000, sourceFiles: ["서울시_상권분석서비스(점포-상권)_2023년.zip"] },
  { quarter: "20241", tradeAreas: 8, totalStores: 246, opens: 15, closes: 12, openRatePct: 6.098, closeRatePct: 4.878, estSalesKrw: 6_610_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2024년.zip"] },
  { quarter: "20242", tradeAreas: 8, totalStores: 256, opens: 13, closes: 3, openRatePct: 5.078, closeRatePct: 1.172, estSalesKrw: 6_940_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2024년.zip"] },
  { quarter: "20243", tradeAreas: 8, totalStores: 251, opens: 8, closes: 13, openRatePct: 3.187, closeRatePct: 5.179, estSalesKrw: 6_810_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2024년.zip"] },
  { quarter: "20244", tradeAreas: 8, totalStores: 248, opens: 6, closes: 9, openRatePct: 2.419, closeRatePct: 3.629, estSalesKrw: 6_756_659_695, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2024년.zip"] },
  // Holdout quarters (20251..20262) — never read by calibration parameter fitting
  { quarter: "20251", tradeAreas: 8, totalStores: 246, opens: 7, closes: 8, openRatePct: 2.846, closeRatePct: 3.252, estSalesKrw: 6_690_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20252", tradeAreas: 8, totalStores: 245, opens: 6, closes: 7, openRatePct: 2.449, closeRatePct: 2.857, estSalesKrw: 6_880_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20253", tradeAreas: 8, totalStores: 251, opens: 14, closes: 8, openRatePct: 5.578, closeRatePct: 3.187, estSalesKrw: 6_910_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20254", tradeAreas: 8, totalStores: 247, opens: 7, closes: 10, openRatePct: 2.834, closeRatePct: 4.049, estSalesKrw: 6_780_000_000, sourceFiles: ["서울시 상권분석서비스(점포-상권)_2025년.zip"] },
  { quarter: "20261", tradeAreas: 8, totalStores: 249, opens: 6, closes: 4, openRatePct: 2.410, closeRatePct: 1.606, estSalesKrw: 6_720_000_000, sourceFiles: ["OA-15577_2026Q1-Q2_utf8.csv"] },
  { quarter: "20262", tradeAreas: 8, totalStores: 245, opens: 3, closes: 7, openRatePct: 1.224, closeRatePct: 2.857, estSalesKrw: 6_840_000_000, sourceFiles: ["OA-15577_2026Q1-Q2_utf8.csv"] },
];
