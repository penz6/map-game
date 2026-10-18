import{test}from'node:test';import assert from'node:assert/strict';
import{scenario,europeScenario,upgradeDefaultGeography}from'../scenario.mjs';
import{validateScenario}from'../scenario-editor.mjs';import{mapViewport,projectPoint,nationCamera}from'../public/map-view.js';
import{adjudicateBoundedTurn}from'../turn-planner.mjs';import{compactRequest,requestTokenBound}from'../context.mjs';
const ringContains=(ring,[x,y])=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const[a,b]=ring[i],[c,d]=ring[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;};
const owns=(world,id,point)=>world.regions.some(r=>r.owner===id&&r.polygons.some(p=>ringContains(p[0],point)&&!p.slice(1).some(h=>ringContains(h,point))));
test('world covers every inhabited continent, Pacific islands and neutral Antarctica',()=>{
 const w=scenario();assert.equal(w.countries.length,47);assert.equal(w.regions.length,122);assert.equal(w.units.length,47);
 for(const[id,point]of[['US',[-100,40]],['US',[-155.5,19.6]],['CA',[-106,57]],['MX',[-99,19.4]],['BR',[-52,-12]],['AR',[-64,-36]],['FR',[2.35,48.85]],['SU',[90,60]],['CN',[105,35]],['JP',[139.7,35.6]],['IN',[77,28]],['EG',[31,30]],['ET',[38.7,9]],['ZA',[25,-28]],['AU',[135,-25]],['NZ',[172,-43]],['NL',[108,-7]]])assert(owns(w,id,point),id+' must include '+point);
 assert(w.neutralPolygons.some(p=>ringContains(p[0],[0,-85])));
 const roundtrip=validateScenario(w,[{country:'US'}]);assert.equal(roundtrip.mapScope,'world');assert.deepEqual(roundtrip.neutralPolygons,w.neutralPolygons);assert.deepEqual(roundtrip.regions,w.regions);
 assert.equal(upgradeDefaultGeography(w),false);assert.equal(europeScenario().regions.length,84,'existing European campaigns stay European');
 const visited=new Set(),visit=id=>{if(visited.has(id))return;visited.add(id);w.regions.find(r=>r.id===id).neighbors.forEach(visit);};visit('US0');assert.equal(visited.size,w.regions.length,'all regions are reachable through land and abstract sea routes');
});
test('world overview and nation focus frame both hemispheres without clipping',()=>{
 const w=scenario();assert.deepEqual(projectPoint(w,[-100,40]),[-100,-40]);assert.deepEqual(projectPoint(w,[135,-25]),[135,25]);const v=mapViewport(w);assert.equal(v.width,360);assert.equal(v.height,180);
 for(const id of['US','JP','AU','NZ','FR','BR']){const camera=nationCamera(w,w.countries.find(c=>c.id===id));assert(camera.scale>1&&camera.scale<=40);assert(Number.isFinite(camera.pan.x)&&Number.isFinite(camera.pan.y));}
 assert.equal(mapViewport(europeScenario()).global,false);
});
for(const mode of['wild','strategy'])test(`global twelve-player maximum multibyte policies fit 32K in ${mode}`,async()=>{
 const world=scenario();world.mapMode=mode;const room={id:'WORLD1',world,round:1,months:1,history:[],messages:[],players:world.countries.slice(0,12).map((c,i)=>({id:'p'+i,accountId:'a'+i,country:c.id,orders:Array.from({length:3},()=>({type:'policy',text:'界'.repeat(2000)}))}))};
 const seen=new Set();let calls=0;
 const result=await adjudicateBoundedTurn(room,{contextLength:32768,outputTokens:3072,request:async(messages,format)=>{
  calls++;const packed=compactRequest({room,messages,format,contextLength:32768,outputTokens:3072});assert(requestTokenBound(packed.messages,format)+3584<=32768);const input=JSON.parse(packed.messages[1].content);
  if(input.phase==='policyBatch'){for(const p of input.policyBatch)seen.add(p.playerId+':'+p.orderIndex);return JSON.stringify({policies:input.policyBatch.map(p=>({playerId:p.playerId,orderIndex:p.orderIndex,intent:'Negotiate peacefully.',outcome:'The proposal is considered.',treasury:0,economy:0,military:0,stability:0}))});}
  assert.equal(input.phase,'worldResolution');assert.equal(input.policyIntents.length,36);return JSON.stringify({events:[{title:'A border settlement',body:'The governments agree to a transfer.'}],npcOrders:[],mapChanges:mode==='wild'?[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]:[]});
 }});assert.equal(seen.size,36);assert.equal(result.policies.length,36);assert(calls>1);
});
