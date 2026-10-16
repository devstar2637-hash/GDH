// shared/types.ts — A Thousand Stores. FROZEN at 12:15 KST (AGENTS.md > Changing shared types).
// Every number that reaches a screen carries a SourceTag. Scenario frequencies are never shown as probabilities.

export type SourceTag =
  | { kind: "public"; dataset: string; asOf: string }   // e.g. Seoul Open Data OA-15577, 2021Q1-2026Q2
  | { kind: "onsite" }                                   // typed by the user at the venue
  | { kind: "computed"; by: "engine" | "oracle" }
  | { kind: "assumed"; note: string }
  | { kind: "synthetic"; note: string };

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
}

export type ShockKind = "offseason" | "franchise_entry" | "rate_hike" | "fitout_delay" | "make_time_drift" | "rent_increase" | "demand_drop";
export interface Shock { kind: ShockKind; startMonth: number; durationMonths: number; magnitude: number; note?: string }
export interface Scenario { id: string; shocks: Shock[] }

export type DeathCause = "rent" | "capacity" | "offseason" | "fitout_overrun" | "demand" | "reserve_breach" | "other";
export interface MonthRow { month: number; revenue: number; cogs: number; rent: number; labour: number; other: number; cashEnd: number }
export interface VariantResult {
  designId: string; scenarioId: string;
  constraintsOk: boolean; rejectedReason?: string;         // AT-03: violations are rejected, not counted as deaths
  survivedMonths: number; deathMonth: number | null; deathCause: DeathCause | null;
  breakEvenMonth: number | null; cashMin: number; months: MonthRow[];
}

export interface Cliff { variable: keyof StoreDesign | ShockKind; boundaryValue: number; leaderBelow: string; leaderAbove: string; unit: string }
export interface NextMeasurement { variable: string; why: string; howToMeasureOnsite: string }

export interface GateLogEntry { gate: "backtest" | "budget_reserve" | "pnl_recompute" | "holdout" | "baseline" | "G1" | "G2"; passed: boolean | null; detail: string; at: string }
export interface TokenUsage { model: string; call: string; inputTokens: number; outputTokens: number }
export interface StatusBar { runId: string; inputFiles: string[]; tokens: TokenUsage[]; tokenTotal: { input: number; output: number }; gateLog: GateLogEntry[] }

export interface AdversarialRound { round: 1 | 2 | 3; shocksAdded: number; deaths: number; newFailureFamilies: number; nonDominatedSurvivors: number; changed: "S" | "P"; stopReason?: string }

export interface RunResult {
  runId: string;
  constraints: Constraints;
  designs: StoreDesign[]; scenarios: Scenario[];
  results: VariantResult[];
  landscape: { axis: (keyof StoreDesign)[]; points: { designId: string; survivedMonths: number; x: number; y: number }[] };
  deathCauses: Record<DeathCause, number>;
  cliff: Cliff | null;                      // exactly one, or null when no flip exists (AT-07)
  nextMeasurement: NextMeasurement | null;
  calibration: { label: "calibrated" | "uncalibrated"; errorPp: number | null; holdoutErrorPp: number | null; overfitSuspect: boolean };
  baseline: { label: "ai-native" | "explorer"; argonNewFamilies: number; randomNewFamilies: number; argonNonDominated: number; randomNonDominated: number } | null;
  rounds: AdversarialRound[];
  status: StatusBar;
  decision: { choice: "proceed" | "hold" | "measure" | null; reason?: string };
}
