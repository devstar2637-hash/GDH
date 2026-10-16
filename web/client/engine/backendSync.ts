export interface BackendRunSummary {
  runId: string;
  total: number;
  survived: number;
  replay: boolean;
}

export function summarizeBackendRun(data: unknown): BackendRunSummary {
  const run = (data as { run?: {
    runId?: string;
    results?: Array<{ constraintsOk: boolean; deathMonth: number | null; survivedMonths: number }>;
    status?: { replay?: boolean };
  } })?.run;
  if (!run?.runId || !Array.isArray(run.results) || run.results.length === 0) {
    throw new Error("Backend response has no measured scenario results");
  }
  return {
    runId: run.runId,
    total: run.results.length,
    survived: run.results.filter((r) =>
      r.constraintsOk && r.deathMonth === null && r.survivedMonths >= 36
    ).length,
    replay: run.status?.replay === true,
  };
}
