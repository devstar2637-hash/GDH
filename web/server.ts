import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from '../shared/constants.js';
import type { Constraints, StoreDesign, Shock, RunResult, TokenUsage } from '../shared/types.js';
import { checkStoreConstraints, runOrchestration, generateStructuredStoreDesigns, expandDesignFamiliesTo10k } from '../engine/index.js';
import { generateDesigns } from '../loop/index.js';
import { generateFamilyDesigns } from '../loop/familyBatches.js';
import { loadSeoulMarketData } from '../data/seoulLoader.js';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const clientDir = resolve('dist/web/client');
const runsDir = resolve(process.env.RUNS_DIR || 'runs');
let busy = false;
const runs = new Map<string, RunEnvelope>();
let marketContext: ReturnType<typeof presentationContext> | null = null;
function presentationContext() {
  const market = loadSeoulMarketData();
  return {
    seoulSummary: {
      latestStoreCount: market.summaryMetrics.latestStoreCount.value,
      meanQuarterlyOpenRatePct: market.summaryMetrics.meanQuarterlyOpenRatePct.value,
      meanQuarterlyCloseRatePct: market.summaryMetrics.meanQuarterlyCloseRatePct.value,
      datasetName: market.sourceTag.kind === 'public' ? market.sourceTag.dataset : '보관된 상권 요약',
      asOf: market.sourceTag.kind === 'public' ? market.sourceTag.asOf : '미확인',
      sourceNote: '보관된 공공자료 요약입니다. 원본 CSV 재집계 및 개별 가게 현금흐름 검증은 미완료입니다.',
    },
    inputFiles: market.inputFiles,
    byteFingerprint: market.manifestHash,
    rawReconciliationVerified: false,
  };
}
type RunEnvelope = {
  runId: string; state: 'DONE' | 'FAIL' | 'BLOCKED'; reason: string | null;
  inputHash: string; engineSha: string; createdAt: string; replay: boolean;
  mode: 'preview' | 'ai'; ai: { status: string; model: string | null; tokens: TokenUsage[]; reason: string | null; requestsCompleted?: number };
  calibrationStatus: 'unverified'; calibrationNote: string; inputSnapshot: Record<string, unknown>;
  validatedSeedDesigns?: StoreDesign[];
  generation: { kind: 'deterministic_presets' | 'live_model_proposals'; requestedCandidates: number; calculatedCandidates: number; uniqueDesignIds: number; uniqueAssumptionSets: number; seedFamilies: number | null };
  result: RunResult | null;
};
class BadRequest extends Error { constructor(message: string, public status = 400) { super(message); } }
type ServerAdapters = { generateFamilyDesigns?: typeof generateFamilyDesigns; generateDesigns?: typeof generateDesigns };
function json(res: http.ServerResponse, status: number, value: unknown) {
  const raw = Buffer.from(JSON.stringify(value));
  const compress = raw.length > 65536 && /\bgzip\b/.test(String(res.req.headers['accept-encoding'] ?? ''));
  const bytes = compress ? gzipSync(raw, { level: 1 }) : raw;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Accept-Encoding', 'Content-Length': bytes.length, ...(compress ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(bytes);
}
function object(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BadRequest(`${label} must be an object`);
  return v as Record<string, unknown>;
}
async function body(req: http.IncomingMessage) {
  return new Promise<Record<string, unknown>>((accept, reject) => {
    const chunks: Buffer[] = []; let size = 0; let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; chunks.length = 0; reject(new BadRequest('Request body timed out', 408)); req.resume(); } }, 10_000);
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > 128 * 1024) { settled = true; clearTimeout(timer); chunks.length = 0; reject(new BadRequest('Request body exceeds 128 KiB', 413)); return; }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      clearTimeout(timer); if (settled) return; settled = true;
      try { accept(object(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'body')); }
      catch (e) { reject(e instanceof BadRequest ? e : new BadRequest('Invalid JSON')); }
    });
    req.on('error', () => { clearTimeout(timer); if (!settled) { settled = true; reject(new BadRequest('Request interrupted')); } });
  });
}
function number(v: unknown, key: string, min: number, max: number, integer = false) {
  if ((typeof v !== 'number' && typeof v !== 'string') || (typeof v === 'string' && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(v.trim()))) throw new BadRequest(`${key}: enter a number`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new BadRequest(`${key}: expected ${min}..${max}${integer ? ' integer' : ''}`);
  return n;
}
export function validateRequest(raw: Record<string, unknown>) {
  const input = object(raw.inputs, 'inputs');
  const n = (k: string, lo: number, hi: number, integer = false) => number(input[k], k, lo, hi, integer);
  const snapshot = {
    variantCount: number(raw.variantCount ?? 10000, 'variantCount', 1000, 10000, true),
    budgetKrw: n('budgetKrw', 1_000_000, 10_000_000_000, true),
    depositKrw: n('depositKrw', 0, 10_000_000_000, true),
    fitoutKrw: n('fitoutKrw', 0, 10_000_000_000, true),
    rentKrw: n('rentKrw', 0, 1_000_000_000, true),
    seats: n('seats', 0, 500, true), floorAreaM2: n('floorAreaM2', 1, 2000),
    staffFte: n('staffFte', 0, 30), ownerHoursPerWeek: n('ownerHoursPerWeek', 0, 100),
    avgTicketKrw: n('avgTicketKrw', 1500, 200000, true), cupsPerDayBase: n('cupsPerDayBase', 0, 20000),
    makeTimeSec: n('makeTimeSec', 25, 1800), openDaysPerWeek: n('openDaysPerWeek', 1, 7),
    cogsRatio: n('cogsRatio', 0, .85), seed: number(raw.seed ?? 20261016, 'seed', 0, 4294967295, true)
  };
  if (snapshot.variantCount !== 1000 && snapshot.variantCount !== 10000) throw new BadRequest('variantCount: 10000 default or 1000 spike only');
  const tag = (field: string) => ({ kind: 'assumed' as const, field, note: 'Explicit user scenario assumption; no on-site verification claimed.' });
  const constraints: Constraints = { ...DEFAULT_CONSTRAINTS, budgetKrw: snapshot.budgetKrw, seed: snapshot.seed, horizonMonths: 36, reserveRatioMin: .10 };
  const design: StoreDesign = {
    ...DEFAULT_BASE_STORE_DESIGN, id: 'user-base', seats: snapshot.seats, floorAreaM2: snapshot.floorAreaM2,
    deposit: { value: snapshot.depositKrw, source: tag('deposit') }, monthlyRent: { value: snapshot.rentKrw, source: tag('monthlyRent') }, fitoutCost: { value: snapshot.fitoutKrw, source: tag('fitoutCost') },
    staffFte: snapshot.staffFte, ownerHoursPerWeek: snapshot.ownerHoursPerWeek, avgTicketKrw: snapshot.avgTicketKrw,
    cupsPerDayBase: snapshot.cupsPerDayBase, makeTimeSec: snapshot.makeTimeSec, openDaysPerWeek: snapshot.openDaysPerWeek,
    cogsRatio: snapshot.cogsRatio, openingMonth: 3, wagePerStaffKrw: 2400000, otherExpenseRatio: .06, equipmentKrw: 0
  };
  const check = checkStoreConstraints(design, constraints);
  if (!check.ok) throw new BadRequest(check.rejectedReason || 'Budget/reserve constraint rejected');
  const shocks: Shock[] = [];
  if (raw.shocks !== undefined) {
    if (!Array.isArray(raw.shocks) || raw.shocks.length > 5) throw new BadRequest('shocks: maximum 5');
    const allowed = new Set(['offseason','franchise_entry','rate_hike','fitout_delay','make_time_drift','rent_increase','demand_drop','rentUp','demandDown','competitorOpen','staffLoss','supplyCostUp','closureWeek']);
    for (const [i, value] of raw.shocks.entries()) {
      const s = object(value, 'shock');
      if (typeof s.kind !== 'string' || !allowed.has(s.kind)) throw new BadRequest('Unknown shock kind');
      shocks.push({ id: `shock-${i}`, kind: s.kind as Shock['kind'], startMonth: number(s.startMonth, 'startMonth', 1, 36, true), durationMonths: number(s.durationMonths, 'durationMonths', 1, 36, true), magnitude: number(s.magnitude, 'magnitude', 0, 1) });
    }
  }
  return { snapshot: { ...snapshot, shocks }, design, constraints, shocks };
}
function engineSha() {
  if (process.env.ENGINE_SHA && /^[a-f0-9]{7,40}$/i.test(process.env.ENGINE_SHA)) return process.env.ENGINE_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return 'unavailable'; }
}
async function persist(run: RunEnvelope) {
  const dir = resolve(runsDir, run.runId);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'web-result.json'), JSON.stringify(run), { flag: 'wx' });
  runs.set(run.runId, run);
  if (runs.size > 20) runs.delete(runs.keys().next().value!);
}
async function execute(raw: Record<string, unknown>, adapters: ServerAdapters = {}): Promise<RunEnvelope> {
  const v = validateRequest(raw);
  const mode = raw.mode === 'ai' ? 'ai' : 'preview';
  if (raw.mode !== undefined && raw.mode !== 'ai' && raw.mode !== 'preview') throw new BadRequest('mode: preview or ai');
  const inputHash = createHash('sha256').update(JSON.stringify({ mode, ...v.snapshot })).digest('hex');
  const run: RunEnvelope = { runId: `run-${randomUUID()}`, state: 'BLOCKED', reason: null, inputHash, engineSha: engineSha(), createdAt: new Date().toISOString(), replay: false, mode,
    ai: { status: 'not_invoked', model: null, tokens: [], reason: null }, calibrationStatus: 'unverified', calibrationNote: '보정 미검증. 상권 개·폐업률 비교는 개별 점포의 현금흐름·미래 결과를 검증하지 않습니다.', inputSnapshot: v.snapshot,
    generation: { kind: mode === 'ai' ? 'live_model_proposals' : 'deterministic_presets', requestedCandidates: v.snapshot.variantCount, calculatedCandidates: 0, uniqueDesignIds: 0, uniqueAssumptionSets: 0, seedFamilies: null }, result: null };
  try {
    let designs: StoreDesign[] | undefined;
    if (mode === 'ai') {
      const generated = v.snapshot.variantCount === 10000
        ? await (adapters.generateFamilyDesigns ?? generateFamilyDesigns)(v.design, v.constraints)
        : await (adapters.generateDesigns ?? generateDesigns)(v.design, v.constraints, { maxDesigns: 4, signal: AbortSignal.timeout(20_000) });
      run.ai = { status: generated.status, model: generated.model, tokens: generated.tokens, reason: generated.reason };
      if ('requestsCompleted' in generated && typeof generated.requestsCompleted === 'number') run.ai.requestsCompleted = generated.requestsCompleted;
      if (v.snapshot.variantCount === 10000) {
        run.generation.seedFamilies = generated.designs.length;
        if (generated.status !== 'generated' || generated.designs.length !== 500) {
          run.validatedSeedDesigns = generated.designs;
          run.state = 'FAIL';
          run.reason = `유효한 AI 설계군 ${generated.designs.length}/500 — 미완료, 기본 후보로 대체하지 않음${generated.reason ? ` · ${generated.reason}` : ''}`;
          await persist(run); return run;
        }
        designs = expandDesignFamiliesTo10k(generated.designs, v.constraints, 20);
      } else {
        if (!generated.designs.length) { run.state = 'FAIL'; run.reason = generated.reason || 'AI returned no valid designs'; await persist(run); return run; }
        designs = generated.designs;
      }
    }
    // Keep the exact user case. The other seeds and variations are explicitly local assumptions.
    if (!designs) {
      if (v.snapshot.variantCount === 10000) {
        const seeds = [v.design, ...generateStructuredStoreDesigns(v.design, v.constraints, 499)]
          .map((design, i) => ({ ...design, familyId: `preview-seed-${i + 1}` }));
        designs = expandDesignFamiliesTo10k(seeds, v.constraints, 20);
        designs[0] = { ...v.design, familyId: seeds[0].familyId };
        run.generation.seedFamilies = seeds.length;
      } else {
        designs = [v.design, ...generateStructuredStoreDesigns(v.design, v.constraints, 999)];
        run.generation.seedFamilies = designs.length;
      }
    }
    const assumptionKey = (d: StoreDesign) => JSON.stringify([d.seats,d.floorAreaM2,d.deposit.value,d.monthlyRent.value,d.fitoutCost.value,d.staffFte,d.ownerHoursPerWeek,d.menuTier,d.avgTicketKrw,d.makeTimeSec,d.openDaysPerWeek,d.equipmentKrw,d.cupsPerDayBase,d.cogsRatio,d.openingMonth,d.wagePerStaffKrw,d.otherExpenseRatio]);
    run.generation.calculatedCandidates = designs.length;
    run.generation.uniqueDesignIds = new Set(designs.map(d => d.id)).size;
    run.generation.uniqueAssumptionSets = new Set(designs.map(assumptionKey)).size;
    const engineMode = v.snapshot.variantCount === 10000 ? 10000 : 1000;
    const result = runOrchestration({ runId: run.runId, baseDesign: v.design, constraints: v.constraints, mode: engineMode, customDesigns: designs, scenarios: [{ id: 'user-scenario', shocks: v.shocks }], runAdversarial: false, persistToDisk: false, inputHash, engineSha: run.engineSha, tokens: run.ai.tokens, inputFiles: ['explicit-user-assumptions'] });
    if (mode === 'ai' && run.ai.status === 'generated' && run.generation.seedFamilies === 500) result.modeLabel = '500 AI design families x 20 variations';
    run.result = result; run.state = result.status.endState || 'FAIL'; run.reason = result.status.endReason || null;
    // Retain the actual engine report; the surrounding unverified label prevents a macro-fit claim being presented as validation of this individual store.
    await persist(run); return run;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    run.state = ['UNCONFIGURED','BUSY','CALL_LIMIT','CANCELLED'].includes(code) ? 'BLOCKED' : 'FAIL';
    run.reason = code === 'UNCONFIGURED' ? 'AI 미연결: 서버 GEMINI_API_KEY 설정이 필요합니다.' : code || 'Run failed; no final computed result is available.';
    run.ai.status = code === 'UNCONFIGURED' ? 'unconfigured' : 'unavailable';
    run.ai.reason = run.reason; await persist(run); return run;
  }
}
export function createServer(adapters: ServerAdapters = {}) {
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) return json(res, 200, { ok: true, busy, aiConfigured: Boolean(process.env.GEMINI_API_KEY), engineSha: engineSha(), calibrationStatus: 'unverified' });
      if (req.method === 'GET' && pathname === '/api/context') {
        marketContext ??= presentationContext();
        return json(res, 200, marketContext);
      }
      if (req.method === 'POST' && (pathname === '/run' || pathname === '/patches')) {
        if (busy) return json(res, 429, { error: 'Another run is in progress. Please wait.' });
        busy = true;
        try {
          const input = await body(req);
          if (pathname === '/patches') {
            const v = validateRequest(input);
            try { return json(res, 200, v.snapshot.variantCount === 10000
              ? await (adapters.generateFamilyDesigns ?? generateFamilyDesigns)(v.design, v.constraints)
              : await (adapters.generateDesigns ?? generateDesigns)(v.design, v.constraints, { maxDesigns: 4, signal: AbortSignal.timeout(20_000) })); }
            catch (e) { const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : 'PROVIDER_ERROR'; return json(res, 503, { status: 'BLOCKED', code, reason: code === 'UNCONFIGURED' ? 'AI 미연결' : 'AI proposal unavailable' }); }
          }
          return json(res, 200, await execute(input, adapters));
        } finally { busy = false; }
      }
      if (req.method === 'GET' && /^\/runs\/run-[a-f0-9-]{36}$/.test(pathname)) {
        const id = pathname.slice('/runs/'.length);
        let run = runs.get(id);
        if (!run) { try { run = JSON.parse(await readFile(resolve(runsDir, id, 'web-result.json'), 'utf8')); } catch { return json(res, 404, { error: 'Run not found' }); } }
        return json(res, 200, { ...run, replay: true });
      }
      if (req.method === 'GET' && pathname === '/rehearsal') {
        res.writeHead(302, { Location: '/rehearsal/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const assets: Record<string, [string,string]> = { '/': ['index.html','text/html; charset=utf-8'], '/app.js': ['app.js','application/javascript; charset=utf-8'], '/styles.css': ['styles.css','text/css; charset=utf-8'], '/rehearsal/': ['index.html','text/html; charset=utf-8'], '/rehearsal/app.js': ['app.js','application/javascript; charset=utf-8'], '/rehearsal/styles.css': ['styles.css','text/css; charset=utf-8'] };
      if (req.method === 'GET' && assets[pathname]) {
        const [name, mime] = assets[pathname];
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        return res.end(await readFile(resolve(pathname.startsWith('/rehearsal/') ? clientDir : publicDir, name)));
      }
      return json(res, 404, { error: 'Not found' });
    } catch (e) { return json(res, e instanceof BadRequest ? e.status : 500, { error: e instanceof BadRequest ? e.message : 'Request failed' }); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createServer().listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('A Thousand Stores ready'));
