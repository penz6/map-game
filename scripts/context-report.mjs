// Controlled planning/budget simulation. No model tokenizer, GPU or live Ollama is used.
import{scenario}from'../scenario.mjs';
import{adjudicateBoundedTurn}from'../turn-planner.mjs';
import{compactRequest}from'../context.mjs';
const configs=[['2 players, no policies',2,0,0],['2 players, one short policy each',2,1,100],['12 players, one 300-character policy each',12,1,300],['12 players, three 300-character policies each',12,3,300],['12 players, three maximum-length ASCII policies each',12,3,2000],['12 players, three maximum-length multibyte policies each',12,3,2000,true]];
const profile={contextLength:32768,outputTokens:3072},rows=[];
for(const mode of['wild','strategy'])for(const[label,count,policies,size,multibyte]of configs){
 const world=scenario();world.mapMode=mode;const room={id:'ABCDEF',world,round:1,months:1,phase:'planning',history:[],messages:[],players:world.countries.slice(0,count).map((c,i)=>({id:'player'+i,accountId:'account'+i,country:c.id,orders:Array.from({length:policies},()=>({type:'policy',text:multibyte?'界'.repeat(size):'Negotiate peaceful recognition of a new republic. '.repeat(50).slice(0,size)}))}))};
 let calls=0,peak=0,batches=0,compressions=0,worldPasses=0;
 try{await adjudicateBoundedTurn(room,{...profile,request:async(messages,format)=>{
  calls++;const packed=compactRequest({room,messages,format,...profile});peak=Math.max(peak,packed.inputBound);const input=JSON.parse(packed.messages[1].content);
  if(input.phase==='policyIntent'){compressions++;return JSON.stringify({summary:'Support a new republic peacefully.'});}
  if(input.phase==='policyBatch'){batches++;return JSON.stringify({policies:input.policyBatch.map(p=>({playerId:p.playerId,orderIndex:p.orderIndex,outcome:'The policy is attempted.',intent:'Support independent states peacefully. '.repeat(3).slice(0,80),treasury:0,economy:0,military:0,stability:0}))});}
  worldPasses++;return JSON.stringify({events:[{title:'A border settlement',body:'The map evolves.'}],policies:input.phase==='worldResolution'?undefined:input.players.flatMap(p=>p.orders.flatMap((o,i)=>o.type==='policy'?[{playerId:p.playerId,orderIndex:i,outcome:'The policy is attempted.',treasury:0,economy:0,military:0,stability:0}]:[])),npcOrders:[],mapChanges:mode==='wild'?[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]:[]});
 }});rows.push({mode,scenario:label,contextCeiling:32768,calls,policyBatches:batches,intentCompressionPasses:compressions,worldPasses,peakInputBound:peak,peakTotalBound:peak+profile.outputTokens+512});}
 catch(error){rows.push({mode,scenario:label,contextCeiling:32768,calls,error:error.message});}
}
console.log(JSON.stringify(rows,null,2));
