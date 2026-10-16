import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFamilyDesignGenerator } from '../loop/familyBatches.js';
import { createServer } from './server.js';

// Mock provider I/O only. This verifies the actual HTTP -> validator -> expansion -> engine bridge.
const input = { mode:'ai', inputs:{budgetKrw:120000000,depositKrw:30000000,fitoutKrw:42000000,rentKrw:3000000,seats:20,floorAreaM2:45,staffFte:1,ownerHoursPerWeek:45,avgTicketKrw:5000,cupsPerDayBase:185,makeTimeSec:75,openDaysPerWeek:6,cogsRatio:.32} };
async function runWithMock(failedBatch = -1) {
  let calls = 0;
  const generateFamilyDesigns = createFamilyDesignGenerator({
    getApiKey: () => 'MOCK_ONLY_NOT_A_CREDENTIAL', getModel: () => 'MOCK_PROVIDER',
    fetchImpl: async () => {
      const index = calls++;
      if (index === failedBatch || failedBatch === -2) return new Response('', { status: 503 });
      const designs = Array.from({length:100}, (_,i) => {
        const n=index*100+i;
        return {id:`mock-family-${n}`,patches:[{path:'makeTimeSec',op:'set',value:30+n},{path:'floorAreaM2',op:'set',value:100+n/10}]};
      });
      return new Response(JSON.stringify({model:'MOCK_PROVIDER',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({designs})}]}],usage:{total_input_tokens:10+index,total_output_tokens:100+index}}));
    },
  });
  const server=createServer({generateFamilyDesigns});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=(server.address() as {port:number}).port;
    const response=await fetch(`http://127.0.0.1:${port}/run`,{method:'POST',body:JSON.stringify(input)});
    assert.equal(response.status,200);
    return {run:await response.json() as any,calls};
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}

test('five MOCK calls produce 500 validated families -> 10,000 engine results with measured usage',async()=>{
  const {run,calls}=await runWithMock();
  assert.equal(calls,5);assert.equal(run.state,'DONE');assert.equal(run.ai.requestsCompleted,5);
  assert.equal(run.ai.model,'MOCK_PROVIDER');assert.equal(run.ai.tokens.length,5);
  assert.deepEqual(run.result.status.tokenTotal,{input:60,output:510});
  assert.equal(run.generation.seedFamilies,500);assert.equal(run.generation.calculatedCandidates,10000);
  assert.equal(run.generation.uniqueDesignIds,10000);assert.equal(run.result.results.length,10000);
  assert.equal(run.result.modeLabel,'500 AI design families x 20 variations');
  assert.equal(run.result.calibration.label,'uncalibrated');assert.equal(run.result.baseline.label,'explorer');
  const leader=run.result.results.find((r:any)=>r.designId===run.result.leaderDesignId);assert.ok(leader.months.length>0);
  assert.ok(run.result.results.filter((r:any)=>r.months.length>0).length<=51);
});

test('400 valid MOCK families remain a failed partial run without preset replacement',async()=>{
  const {run,calls}=await runWithMock(2);
  assert.equal(calls,5);assert.equal(run.state,'FAIL');assert.equal(run.ai.status,'partial');
  assert.equal(run.generation.seedFamilies,400);assert.equal(run.generation.calculatedCandidates,0);
  assert.equal(run.result,null);assert.equal(run.ai.tokens.length,4);assert.match(run.reason,/400\/500/);
  assert.equal(run.validatedSeedDesigns.length,400);assert.equal(new Set(run.validatedSeedDesigns.map((d:any)=>d.id)).size,400);
});

test('zero valid provider families terminate FAIL with zero evidence rather than configuration BLOCKED',async()=>{
  const {run,calls}=await runWithMock(-2);
  assert.equal(calls,5);assert.equal(run.state,'FAIL');assert.equal(run.ai.status,'failed');
  assert.equal(run.generation.seedFamilies,0);assert.equal(run.generation.calculatedCandidates,0);
  assert.deepEqual(run.validatedSeedDesigns,[]);assert.deepEqual(run.ai.tokens,[]);assert.equal(run.result,null);
});
