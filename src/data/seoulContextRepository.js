import fs from "node:fs";
import path from "node:path";

/**
 * Attributed Public Seoul Commercial-Area Context Repository
 *
 * Enforces:
 * - Raw area_name preserved verbatim (e.g., "종로?청계 관광특구"), with optional display_name and normalization_note.
 * - Raw sales fields labeled as rawReportedSalesKrw / rawReportedTransactions (당월_매출_금액 / 당월_매출_건수 in quarter-keyed table),
 *   with period_semantics_status = "unconfirmed_raw_dangwol_in_quarterly_table". Never divided by 3 or used as individual store revenue.
 * - Missing sales rows in OA-15572 stay null (never replaced with 0) and cannot produce a data-derived cashflow or rank.
 */

const DEFAULT_SAMPLE_PATH = path.resolve(process.cwd(), "data/seoul/context_2026_sample.json");
const CSV_STORES_2026_PATH = path.resolve(process.cwd(), "data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv");
const CSV_SALES_2026_PATH = path.resolve(process.cwd(), "data/seoul/2026/OA-15572_2026Q1-Q2_utf8.csv");

export function normalizeObservedAreaRecord(rawArea) {
  const rawSalesObj = rawArea.observed_sales;
  const rawSalesAmount =
    rawSalesObj !== null && rawSalesObj !== undefined
      ? (rawSalesObj.raw_reported_sales_krw ?? rawSalesObj.quarterly_estimated_sales_krw)
      : null;
  const rawTxCount =
    rawSalesObj !== null && rawSalesObj !== undefined
      ? (rawSalesObj.raw_reported_transactions ?? rawSalesObj.quarterly_estimated_transactions)
      : null;

  const hasObservedSales =
    rawSalesObj !== null &&
    rawSalesObj !== undefined &&
    Number.isFinite(rawSalesAmount);

  return {
    quarterCode: String(rawArea.quarter_code || "20262"),
    quarterLabel: rawArea.quarter_code === "20261" ? "2026Q1" : "2026Q2",
    areaTypeCode: rawArea.area_type_code,
    areaTypeName: rawArea.area_type_name,
    areaCode: String(rawArea.area_code),
    areaName: rawArea.area_name, // Preserved verbatim from source CSV
    displayName: rawArea.display_name || rawArea.area_name,
    normalizationNote: rawArea.normalization_note || null,
    serviceCode: rawArea.service_code || "CS100010",
    serviceName: rawArea.service_name || "커피-음료",
    sourceTrace: {
      storeDatasetId: "OA-15577",
      storeFile: "data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv",
      storeRowLine: rawArea.store_row_line ?? null,
      salesDatasetId: "OA-15572",
      salesFile: "data/seoul/2026/OA-15572_2026Q1-Q2_utf8.csv",
      salesRowLine: hasObservedSales ? (rawArea.sales_row_line ?? null) : null
    },
    observedStores: {
      totalStores: Number(rawArea.stores.total_stores),
      ordinaryStores: Number(rawArea.stores.ordinary_stores),
      franchiseStores: Number(rawArea.stores.franchise_stores),
      openingRatePct: Number(rawArea.stores.opening_rate_pct),
      openingStores: Number(rawArea.stores.opening_stores),
      closureRatePct: Number(rawArea.stores.closure_rate_pct),
      closedStores: Number(rawArea.stores.closed_stores),
      closureRateBoundaryNote: "Area-level closure rate is NOT an individual store survival probability."
    },
    salesDataStatus: hasObservedSales ? "observed_area_raw_estimate" : "missing_in_source",
    observedSales: hasObservedSales
      ? {
          rawReportedSalesKrw: Number(rawSalesAmount),
          rawReportedTransactions: Number(rawTxCount),
          weekdaySalesKrw: Number(rawSalesObj.weekday_sales_krw),
          weekendSalesKrw: Number(rawSalesObj.weekend_sales_krw),
          weekdayTransactions: Number(rawSalesObj.weekday_transactions),
          weekendTransactions: Number(rawSalesObj.weekend_transactions),
          weekdaySalesSharePct:
            Number(rawSalesAmount) > 0
              ? Number(((Number(rawSalesObj.weekday_sales_krw) / Number(rawSalesAmount)) * 100).toFixed(1))
              : null,
          observedAreaAvgTicketKrw:
            Number(rawTxCount) > 0 ? Math.round(Number(rawSalesAmount) / Number(rawTxCount)) : null,
          periodSemanticsStatus: "unconfirmed_raw_dangwol_in_quarterly_table",
          interpretationBoundary:
            "Raw source columns 당월_매출_금액 / 당월_매출_건수 keyed by quarter (기준_년분기_코드). Period semantics are unconfirmed; values are never divided by 3 or by store count to infer an individual store's revenue or transactions."
        }
      : null,
    canProduceDataDerivedCashflow: false,
    canProduceDataDerivedSalesRank: hasObservedSales,
    missingSalesPolicy:
      "Missing sales rows in OA-15572 remain null (unknown/unavailable) and are never replaced with zero."
  };
}

export class SeoulContextRepository {
  constructor(options = {}) {
    this.samplePath = options.samplePath || DEFAULT_SAMPLE_PATH;
    this.storesCsvPath = options.storesCsvPath || CSV_STORES_2026_PATH;
    this.salesCsvPath = options.salesCsvPath || CSV_SALES_2026_PATH;
    this._cache = null;
  }

  loadContext() {
    if (this._cache) return this._cache;

    let sampleData = null;
    if (fs.existsSync(this.samplePath)) {
      const rawJson = fs.readFileSync(this.samplePath, "utf8");
      sampleData = JSON.parse(rawJson);
    }

    if (!sampleData || !Array.isArray(sampleData.areas)) {
      this._cache = {
        status: "context_selection_pending",
        schemaVersion: "none",
        attribution: {
          copyright_holder: "Seoul Metropolitan Government (서울특별시)",
          provider: "Seoul Credit Guarantee Foundation (서울신용보증재단)",
          license: "Korea Open Government License Type 1 (attribution required)"
        },
        areas: []
      };
      return this._cache;
    }

    const normalizedAreas = sampleData.areas.map(normalizeObservedAreaRecord);

    this._cache = {
      status: "ready",
      schemaVersion: sampleData.schema_version || "1.1.0",
      quarterCode: sampleData.quarter_code,
      quarterLabel: sampleData.quarter_label,
      serviceCode: sampleData.service_code,
      serviceName: sampleData.service_name,
      periodSemanticsNote: sampleData.period_semantics_note,
      attribution: sampleData.attribution,
      csvFilesPresentOnDisk: {
        stores2026Csv: fs.existsSync(this.storesCsvPath),
        sales2026Csv: fs.existsSync(this.salesCsvPath)
      },
      areas: normalizedAreas
    };

    return this._cache;
  }

  getAreaByCode(areaCode, quarterCode = "20262") {
    const ctx = this.loadContext();
    if (!areaCode) return null;
    return (
      ctx.areas.find(
        (a) => String(a.areaCode) === String(areaCode) && String(a.quarterCode) === String(quarterCode)
      ) || null
    );
  }
}

export function evaluateObservedContextAndUserSimulation({ areaRecord, userSimulationInputs }) {
  if (!areaRecord) {
    return {
      contextStatus: "context_selection_pending",
      observedContext: null,
      observedSalesMissing: true,
      observedSalesValue: null,
      dataDerivedRankAvailable: false,
      dataDerivedCashflowAvailable: false,
      userAssumptionRequiredForSimulation: true,
      userSimulationInputsProvided: Boolean(userSimulationInputs)
    };
  }

  const hasObservedSales = areaRecord.observedSales !== null;

  return {
    contextStatus: "attributed_public_seoul_data",
    observedContext: areaRecord,
    observedSalesMissing: !hasObservedSales,
    observedSalesValue: areaRecord.observedSales, // strictly null when missing, never 0
    dataDerivedRankAvailable: hasObservedSales,
    dataDerivedCashflowAvailable: false,
    userAssumptionRequiredForSimulation: true,
    userSimulationInputsProvided: Boolean(userSimulationInputs)
  };
}
