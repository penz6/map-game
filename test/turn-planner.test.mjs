import{test}from'node:test';import assert from'node:assert/strict';
import{scenario}from'../scenario.mjs';import{adjudicateBoundedTurn,worldResolutionInput,assertWorldFits}from'../turn-planner.mjs';import{compactRequest,requestTokenBound}from'../context.mjs';import{resolveTurn}from'../engine.mjs';
const profile={contextLength:20000,outputTokens:3072};
function room(mode='wild',players=12,textSize=2000,unicode=false){const world=scenario();world.mapMode=mode;return{id:'ABCDEF',world,months:1,round:1,phase:'planning',history:[],messages:[],players:world.countries.slice(0,players).map((c,i)=>({id:'player'+i,accountId:'account'+i,country:c.id,orders:Array.from({length:3},(_,j)=>({type:'policy',text:unicode?(i+'-'+j+'界'.repeat(2000)).slice(0,textSize):(`Policy ${i}-${j}: `+'Negotiate recognition peacefully. '.repeat(100)).slice(0,textSize)}))}))};}
const answer=(r,input)=>input.phase==='policyIntent'?{summary:'Support a small independent republic.'}:input.phase==='policyBatch'?{policies:input.policyBatch.map(p=>({playerId:p.playerId,orderIndex:p.orderIndex,outcome:'The proposal is attempted.',intent:'Support a small independent republic.',treasury:0,economy:0,military:0,stability:0}))}:{events:[{title:'Borders evolve',body:'A border settlement takes place.'}],policies:input.phase==='worldResolution'?undefined:input.players.flatMap(p=>p.orders.flatMap((o,i)=>o.type==='policy'?[{playerId:p.playerId,orderIndex:i,outcome:'The proposal is attempted.',treasury:0,economy:0,military:0,stability:0}]:[])),npcOrders:[],mapChanges:r.world.mapMode==='wild'?[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]:[]};
for(const mode of['wild','strategy'])for(const unicode of[false,true])test(`20K cap preserves all 36 maximum-length ${unicode?'multibyte':'ASCII'} policies in ${mode}`,async()=>{
 const r=room(mode,12,2000,unicode),before=structuredClone(r),seen=new Map(),phases=[];let max=0;
 const ai=await adjudicateBoundedTurn(r,{...profile,request:async(messages,format)=>{
  const packed=compactRequest({room:r,messages,format,...profile});assert(requestTokenBound(packed.messages,format)+profile.outputTokens+512<=20000);max=Math.max(max,packed.inputBound);const input=JSON.parse(packed.messages[1].content);phases.push(input.phase);
  for(const p of input.phase==='policyIntent'?[input.policy]:input.policyBatch||[])if(!p.compacted)seen.set(`${p.playerId}:${p.orderIndex}`,p.text);
  return JSON.stringify(answer(r,input));
 }});
 assert(phases.includes('policyBatch'));assert.equal(phases.at(-1),'worldResolution');assert(max<=20000-3584);assert.equal(seen.size,36);for(const p of r.players)for(let i=0;i<3;i++)assert.equal(seen.get(`${p.id}:${i}`),p.orders[i].text);assert.equal(ai.policies.length,36);assert.deepEqual(r,before);const next=resolveTurn(r,ai);assert.equal(next.history[0].orders.flatMap(p=>p.orders).length,36);if(mode==='wild')assert.equal(next.world.regions.find(p=>p.id==='GB1').owner,'IE');
});
test('small turns keep one request and unsupported context increases are refused locally',async()=>{
 const r=room('wild',2,40);let calls=0;const ai=await adjudicateBoundedTurn(r,{...profile,request:async(messages)=>{calls++;const input=JSON.parse(messages[1].content);assert(!input.phase);return JSON.stringify(answer(r,input));}});assert.equal(calls,1);assert.equal(ai.policies.length,6);await assert.rejects(adjudicateBoundedTurn(r,{...profile,contextLength:20001,request:async()=>{throw Error('Must not call model');}}),e=>e.status===413);
});
test('failed middle batch leaves every original order and world unchanged',async()=>{
 const r=room(),before=structuredClone(r);let calls=0,failed=0;
 await assert.rejects(adjudicateBoundedTurn(r,{...profile,request:async(messages,format)=>{calls++;const input=JSON.parse(compactRequest({room:r,messages,format,...profile}).messages[1].content);if(calls>=2){failed++;return JSON.stringify({policies:[]});}return JSON.stringify(answer(r,input));}}));assert.equal(failed,2);assert.deepEqual(r,before);
});
test('staged policy identity forgery and policy overwrites are rejected',async()=>{
 const r=room();let calls=0;await assert.rejects(adjudicateBoundedTurn(r,{...profile,request:async(messages,format)=>{calls++;const input=JSON.parse(compactRequest({room:r,messages,format,...profile}).messages[1].content);const value=answer(r,input);value.policies[0].playerId='another-account';return JSON.stringify(value);}}),/unknown policy/);assert.equal(calls,2);
});
test('oversized escaped text is read in its own bounded compression pass, not silently truncated',async()=>{
 const r=room('wild',2);r.players[0].orders[0].text='\0'.repeat(2000);let rawSeen=false,summarySeen=false;
 const ai=await adjudicateBoundedTurn(r,{...profile,request:async(messages,format)=>{const input=JSON.parse(compactRequest({room:r,messages,format,...profile}).messages[1].content);if(input.phase==='policyIntent')rawSeen=input.policy.text===r.players[0].orders[0].text;if(input.phase==='policyBatch')summarySeen||=input.policyBatch.some(p=>p.compacted);return JSON.stringify(answer(r,input));}});assert(rawSeen);assert(summarySeen);assert.equal(ai.policies.length,6);assert.equal(r.players[0].orders[0].text.length,2000);
});
test('world compaction preserves complete ownership, issuing resources and undirected routes',()=>{
 const r=room('strategy'),input=worldResolutionInput(r,[],[]);assert.equal(input.territories.length,r.world.regions.length);for(const p of r.world.regions){const row=input.territories.findIndex(x=>x[0]===p.id);assert.equal(input.territories[row][2],p.owner);const adjacent=input.routes.filter(pair=>pair.includes(row)).map(pair=>input.territories[pair.find(i=>i!==row)][0]);assert.deepEqual(adjacent.sort(),p.neighbors.slice().sort());}assertWorldFits(r,profile);
});
