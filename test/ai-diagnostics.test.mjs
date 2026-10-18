import{test}from'node:test';import assert from'node:assert/strict';import{reportAIFailure}from'../ai-diagnostics.mjs';
test('diagnostics are single-line JSON, redact credentials and keep stable references',()=>{
 const logs=[],logger={error:s=>logs.push(s)},e=new Error('fetch https://user:password@example.test?token=hidden Bearer secret');e.status=502;e.stack+='\nPRIVATE_RESPONSE';
 const room={id:'ABCDEF',round:3,model:'example',endpoint:'http://localhost:11434'};const ref=reportAIFailure(e,{room,operation:'advisor'},logger);assert.equal(reportAIFailure(e,{room,operation:'advisor'},logger),ref);assert.equal(logs.length,1);const data=JSON.parse(logs[0]);assert.equal(data.reference,ref);assert(!logs[0].includes('password'));assert(!logs[0].includes('hidden'));assert(!logs[0].includes('Bearer secret'));assert(!logs[0].includes('PRIVATE_RESPONSE'));assert(!logs[0].includes('\n'));
});
