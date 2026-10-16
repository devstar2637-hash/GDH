import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, validateRequest } from './server.js';

const good = () => ({mode:'preview',variantCount:1000,seed:42,inputs:{budgetKrw:120000000,depositKrw:30000000,fitoutKrw:42000000,rentKrw:3000000,seats:20,floorAreaM2:45,staffFte:1,ownerHoursPerWeek:45,avgTicketKrw:5000,cupsPerDayBase:185,makeTimeSec:75,openDaysPerWeek:6,cogsRatio:.32}});
test('web input rejects blank, null, invalid strings, arrays, nonfinite numbers and invalid shock',()=>{
  for(const invalid of ['',null,'NaN',[],{},Infinity]) { const input: any = good(); input.inputs.depositKrw=invalid; assert.throws(()=>validateRequest(input)); }
  const zero: any=good();zero.inputs.cupsPerDayBase=0;assert.equal(validateRequest(zero).design.cupsPerDayBase,0);
  assert.throws(()=>validateRequest({...good(),shocks:[{kind:'demand_drop',startMonth:0,durationMonths:1,magnitude:.2}]}));
  assert.throws(()=>validateRequest({...good(),shocks:[{kind:'bad',startMonth:1,durationMonths:1,magnitude:.2}]}));
});
test('web HTTP has real engine result, replay retrieval, no-key terminal state and private static scope',async()=>{
 const priorKey=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
 const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as {port:number}).port;const origin=`http://127.0.0.1:${port}`;
 try{
  assert.equal((await fetch(origin+'/health')).status,200);
  assert.equal((await fetch(origin+'/package.json')).status,404);
  const invalid=await fetch(origin+'/run',{method:'POST',body:JSON.stringify({inputs:null})});assert.equal(invalid.status,400);
  const tooLarge=await fetch(origin+'/run',{method:'POST',body:JSON.stringify({padding:'x'.repeat(129*1024)})});assert.equal(tooLarge.status,413);
  const result=await fetch(origin+'/run',{method:'POST',body:JSON.stringify(good())});assert.equal(result.status,200);const run:any=await result.json();
  assert.ok(['DONE','FAIL'].includes(run.state));assert.equal(run.result.results.length,1000);assert.equal(run.result.results[0].designId,'user-base');assert.equal(run.calibrationStatus,'unverified');assert.equal(run.ai.tokens.length,0);assert.match(run.inputHash,/^[a-f0-9]{64}$/);
  const replay:any=await (await fetch(origin+'/runs/'+run.runId)).json();assert.equal(replay.replay,true);assert.equal(replay.runId,run.runId);
  const tenkResponse=await fetch(origin+'/run',{method:'POST',body:JSON.stringify({...good(),variantCount:undefined})});
  assert.equal(tenkResponse.headers.get('content-encoding'),'gzip');const tenk:any=await tenkResponse.json();
  assert.equal(tenk.result.results.length,10000);assert.equal(tenk.result.mode,10000);assert.equal(tenk.generation.seedFamilies,500);assert.equal(tenk.generation.uniqueDesignIds,10000);assert.equal(tenk.result.results[0].designId,'user-base');assert.ok(tenk.generation.uniqueAssumptionSets<=10000);assert.equal(tenk.ai.tokens.length,0);
  const leader=tenk.result.results.find((r:any)=>r.designId===tenk.result.leaderDesignId);assert.ok(leader.months.length>0);
  const blocked:any=await (await fetch(origin+'/run',{method:'POST',body:JSON.stringify({...good(),mode:'ai'})})).json();assert.equal(blocked.state,'BLOCKED');assert.equal(blocked.ai.status,'unconfigured');assert.equal(blocked.result,null);
  const patches=await fetch(origin+'/patches',{method:'POST',body:JSON.stringify(good())});assert.equal(patches.status,503);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(priorKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=priorKey;}
});
