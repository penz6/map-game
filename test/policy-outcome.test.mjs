import{test}from'node:test';import assert from'node:assert/strict';
import{scenario}from'../scenario.mjs';import{validateAI,resolveTurn,turnSchema,directorTurnSchema}from'../engine.mjs';import{adjudicateBoundedTurn}from'../turn-planner.mjs';
const room=()=>({id:'OUTCOM',world:scenario(),round:1,months:1,history:[],messages:[],players:[{id:'seat-france',country:'FR',name:'Player',orders:[{type:'policy',text:'Negotiate recognition peacefully.'}]}]});
const response=outcome=>({events:[{title:'Border settlement',body:'The agreed transfer takes place.'}],policies:[{playerId:'seat-france',orderIndex:0,outcome}],mapChanges:[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]});
for(const outcome of[undefined,null,'','   ','x'.repeat(2500),'界'.repeat(2500),'😀'.repeat(1100)])test('display-only outcome length or omission does not roll back a valid turn: '+(outcome===undefined?'missing':outcome===null?'null':outcome.length),async()=>{
 const r=room(),before=structuredClone(r);let calls=0;
 const ai=await adjudicateBoundedTurn(r,{contextLength:32768,outputTokens:3072,request:async(messages,format)=>{calls++;const field=format.properties.policies.items.properties.outcome;assert.equal(field.minLength,1);assert.equal(field.maxLength,600);return JSON.stringify(response(outcome));}});
 assert.equal(calls,1);assert(ai.policies[0].outcome.trim().length>0);assert(ai.policies[0].outcome.length<=2000);assert(!/[\uD800-\uDBFF]$/.test(ai.policies[0].outcome.slice(0,-1)));
 const next=resolveTurn(r,ai);assert.equal(next.round,2);assert.equal(next.world.regions.find(p=>p.id==='GB1').owner,'IE');assert.deepEqual(r,before);
});
test('wrong outcome types still receive a repair attempt and typed diagnostics',async()=>{
 const r=room();let calls=0;
 await assert.rejects(adjudicateBoundedTurn(r,{contextLength:32768,outputTokens:3072,request:async()=>{calls++;return JSON.stringify(response({text:'do not infer a string'}));}}),e=>e.status===502&&e.validation.field==='policy.outcome'&&e.validation.receivedType==='object');assert.equal(calls,2);
 const invalid=response('');invalid.mapChanges[0].provinces=['MISSING'];assert.throws(()=>validateAI(r,invalid));const forged=response('');forged.policies[0].playerId='FR';assert.throws(()=>validateAI(r,forged),/unknown policy/);
});
test('both generation schemas constrain event prose and policy outcomes',()=>{for(const schema of[turnSchema,directorTurnSchema]){assert.equal(schema.properties.policies.items.properties.outcome.minLength,1);assert.equal(schema.properties.events.items.properties.title.maxLength,160);assert.equal(schema.properties.events.items.properties.body.maxLength,3000);}});
