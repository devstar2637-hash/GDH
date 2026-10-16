// shared/types.ts — A Thousand Stores. FROZEN at 12:15 KST (AGENTS.md > Changing shared types).
// Every number that reaches a screen carries a SourceTag. Scenario frequencies are never shown as probabilities.

export type SourceTag =
  | { kind: "public"; dataset: string; asOf: string; field?: string; url?: string }   // e.g. Seoul Open Data OA-15577, 2021Q1-2026Q2
  | { kind: "onsite"; field?: string; note?: string }                                  // typed by the user at the venue
  | { kind: "computed"; by: "engine" | "oracle"; field?: string }
  | { kind: "assumed"; note: string; field?: string }
  | { kind: "synthetic"; note: string; field?: string };

export interface Tagged<T = number> { value: T; source: SourceTag }

export interface Constraints {
  budgetKrw: number;            // total cash available, e.g. 120_000_000
  reserveRatioMin: number;      // >= 0.10 of budget stays as reserve (oracle-owned)
  horizonMonths: 36;
  district: string;             // e.g. "성수동"
  trade: "cafe";
  seed: number;                 // fixed per run
}

export interface StoreDesign {
  id: string;
  seats: number;
  floorAreaM2: number;
  deposit: Tagged;              // locked cash, returned at the last month — never an expense
  monthlyRent: Tagged;
  fitoutCost: Tagged;           // construction + equipment
  staffFte: number;             // paid staff; owner labour excluded
  ownerHoursPerWeek: number;
  menuTier: 1 | 2 | 3;          // 1 = drinks only, 3 = drinks + food
  avgTicketKrw: number;
  makeTimeSec: number;          // time to make one drink (peak-hour capacity driver)
  openDaysPerWeek: number;
  // Optional SPEC.md §4/§5 explicit fields (mapped deterministically with defaults)
  equipmentKrw?: number;
  cupsPerDayBase?: number;
  cogsRatio?: number;
  openingMonth?: number;
  wagePerStaffKrw?: number;
  otherExpenseRatio?: number;
  familyId?: string;
}

export type ShockKind =
  | "offseason"
  | "franchise_entry"
  | "rate_hike"
  | "fitout_delay"
  | "make_time_drift"
  | "rent_increase"
  | "demand_drop"
  | "rentUp"
  | "demandDown"
  | "competitorOpen"
  | "staffLoss"
  | "supplyCostUp"
  | "closureWeek";

export interface Shock {
  id?: string;
  kind: ShockKind;
  startMonth: number;
  durationMonths: number;
  magnitude: number;
  note?: string;
}

export interface Scenario { id: string; shocks: Shock[] }

export type DeathCause =
  | "rent"
  | "capacity"
  | "offseason"
  | "fitout_overrun"
  | "demand"
  | "reserve_breach"
  | "other"
  | "cashBelowZero"
  | "reserveBreach"
  | "constraintReject";

export interface MonthRow {
  month: number;
  revenue: number;
  cogs: number;
  rent: number;
  labour: number;
  other: number;
  cashEnd: number;
  cumPnL?: number;
}

export interface VariantResult {
  designId: string;
  scenarioId: string;
  constraintsOk: boolean;
  rejectedReason?: string;         // AT-03: violations are rejected, not counted as deaths
  survivedMonths: number;
  deathMonth: number | null;
  deathCause: DeathCause | null;
  breakEvenMonth: number | null;
  cashMin: number;
  months: MonthRow[];
  cumPnL?: number;
  failureFamily?: string;
  nonDominated?: boolean;
}

export interface Patch {
  path: string;
  op: "set" | "add" | "mul" | "replace";
  value: number | string;
  by: "StoreDesigner" | "BankruptcyDesigner" | "Random";
}

export interface VariantPatchBundle {
  id: string;
  parentId?: string;
  patches: Patch[];
}

export interface Cliff {
  variable: keyof StoreDesign | ShockKind | string;
  boundaryValue: number;
  relativeDelta?: number;
  leaderBelow: string;
  leaderAbove: string;
  unit: string;
}

export interface NextMeasurement {
  variable: string;
  why: string;
  howToMeasureOnsite: string;
  priorityScore?: number;
  uncertaintyWidth?: number;
}

export interface GateLogEntry {
  gate: "backtest" | "budget_reserve" | "pnl_recompute" | "holdout" | "baseline" | "G1" | "G2";
  passed: boolean | null;
  detail: string;
  value?: number;
  threshold?: number;
  at: string;
}

export interface TokenUsage {
  model: string;
  call: string;
  inputTokens: number;
  outputTokens: number;
}

export type RunEndState = "DONE" | "FAIL" | "BLOCKED";

export interface StatusBar {
  runId: string;
  inputFiles: string[];
  inputHash?: string;
  engineSha?: string;
  endState?: RunEndState;
  endReason?: string;
  replay?: boolean;
  tokens: TokenUsage[];
  tokenTotal: { input: number; output: number };
  gateLog: GateLogEntry[];
}

export interface AdversarialRound {
  round: 1 | 2 | 3;
  shocksAdded: number;
  shocks?: Shock[];
  deaths: number;
  newFailureFamilies: number;
  nonDominatedSurvivors: number;
  changed: "S" | "P";
  stopReason?: "roundCap" | "timeCap" | "noNewFamily" | "allSurvivorsKilled" | "error" | string;
  elapsedMs?: number;
}

export interface SaturationPoint {
  n: 1000 | 3000 | 10000;
  failureFamilies: number;
  nonDominated: number;
}

export interface QuarterMarketRow {
  quarter: string;              // e.g. "20211" or "2021Q1"
  tradeAreas: number;
  totalStores: number;
  opens: number;
  closes: number;
  openRatePct: number;
  closeRatePct: number;
  estSalesKrw?: number;
  sourceFiles: string[];
}

export interface RunResult {
  runId: string;
  constraints: Constraints;
  designs: StoreDesign[];
  scenarios: Scenario[];
  results: VariantResult[];
  landscape: {
    axis: (keyof StoreDesign | string)[];
    points: {
      designId: string;
      survivedMonths: number;
      x: number;
      y: number;
      cashMin?: number;
      cumPnL?: number;
      failureFamily?: string;
      nonDominated?: boolean;
      familyId?: string;
    }[];
  };
  deathCauses: Record<string, number>;
  cliff: Cliff | null;                      // exactly one, or null when no flip exists (AT-07)
  nextMeasurement: NextMeasurement | null;
  calibration: {
    label: "calibrated" | "uncalibrated";
    koLabel?: "보정됨" | "미보정";
    errorPp: number | null;
    holdoutErrorPp: number | null;
    overfitSuspect: boolean;
    yearlyErrors?: { year: number; openErrorPp: number; closeErrorPp: number; simOpenRatePct: number; simCloseRatePct: number; refOpenRatePct: number; refCloseRatePct: number }[];
  };
  baseline: {
    label: "ai-native" | "explorer";
    koLabel?: "AI-native" | "탐색기";
    argonNewFamilies: number;
    randomNewFamilies: number;
    argonNonDominated: number;
    randomNonDominated: number;
  } | null;
  rounds: AdversarialRound[];
  status: StatusBar;
  decision: { choice: "proceed" | "hold" | "measure" | null; reason?: string };
  mode?: 1000 | 10000;
  modeLabel?: "1,000 variants" | "500 AI design families x 20 variations";
  saturationCurve?: SaturationPoint[];
  leaderDesignId?: string;
  computeMs?: number;
  rejectedCount?: number;
  rejectedReasons?: { patchIndex: number; reason: string; path?: string }[];
}
