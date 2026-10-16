import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createGameServer } from '../server.mjs';
import { validateAI, validateOrders, resolveTurn } from '../engine.mjs';
import { scenario } from '../scenario.mjs';
import { securityConfig } from '../security.mjs';

const ai={events:[{title:'Diplomatic uncertainty',body:'Governments consider their next steps.'}],policies:[],npcOrders:[]};
async function fixture(t,fetchAI){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'historia-test-'));const config=securityConfig({OLLAMA_ENDPOINTS:'http://127.0.0.1:11434'});const server=createGameServer({dataDir,fetchAI,config});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(dataDir,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}`,sessions=new Map();
 async function req(route,body,cookie,headers={}){const res=await fetch(url+'/api'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':url}:{}),...(cookie?{Cookie:cookie,'X-CSRF-Token':sessions.get(cookie)||''}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json(),setCookie=res.headers.get('set-cookie')?.split(';')[0];if(setCookie&&data.csrf)sessions.set(setCookie,data.csrf);return {status:res.status,body:data,cookie:setCookie};}
 const password='A long unique passphrase 938!';
 const admin=await server.identity.createAdmin('alice','Alice',password,{mfa:false});
 const login=await req('/auth/login',{username:'alice',password});assert.equal(login.status,200);
 const host=(await req('/rooms',{name:'Test campaign',country:'FR',mapMode:'strategy'},login.cookie)).body;host.token=login.cookie;
 const id=host.room.id;
 const joinInvite=(await req(`/rooms/${id}/invite`,{},host.token)).body.invite;
 async function member(name,country){const i=server.identity.newInvite(admin.user.id);const reg=await req('/auth/register',{username:name.toLowerCase(),name,password,invite:i.invite});assert.equal(reg.status,200);const joined=await req(`/rooms/${id}/join`,{country,invite:joinInvite},reg.cookie);assert.equal(joined.status,201);return {...joined.body,token:reg.cookie,user:reg.body.user};}
 const guest=await member('Bob','DE');
 return {req,host,guest,id,dataDir,server,url,config,member,joinInvite,sessions,password,route:action=>`/rooms/${id}${action?'/'+action:''}`};
}
test('separate identities, private orders, host authority and readiness gate',async t=>{
 const f=await fixture(t);const {req,host,guest,route}=f;
 assert.equal((await req(route())).status,401);
 assert.equal((await req(route('join'),{country:'DE',invite:f.joinInvite},guest.token)).status,409);
 assert.equal((await req(route('orders'),{orders:[{type:'invest'}]},host.token)).status,200);
 const other=(await req(route(),null,guest.token)).body;
 assert.equal(other.players[0].orders,undefined);assert.equal(other.config,undefined);assert(!JSON.stringify(other).includes(host.token));
 assert.equal((await req(route('advance'),{},guest.token)).status,403);
 assert.equal((await req(route('config'),{mode:'demo',endpoint:'http://localhost:11434',model:'test',months:1},guest.token)).status,403);
 assert.equal((await req(route('advance'),{},host.token)).status,409);
 await req(route('ready'),{ready:true},host.token);
 assert.equal((await req(route('orders'),{orders:[]},host.token)).status,409);
 await req(route('config'),{mode:'demo',endpoint:'http://localhost:11434',model:'test',months:1},host.token);
 await req(route('ready'),{ready:true},guest.token);
 const result=await req(route('advance'),{},host.token);
 assert.equal(result.status,200);assert.equal(result.body.round,2);assert.equal(result.body.world.date,'1936-02-01');
 assert.equal(result.body.world.countries.find(c=>c.id==='FR').economy,71);assert.equal(result.body.world.countries.find(c=>c.id==='FR').treasury,89);
 assert(result.body.players.every(p=>!p.ready));assert.equal(result.body.history[0].orders[0].orders[0].type,'invest');
 const disk=JSON.parse(fs.readFileSync(path.join(f.dataDir,f.id+'.json')));assert.equal(disk.round,2);
});
test('Ollama uses the configured server endpoint and strict schema; locks concurrent advances',async t=>{
 let release,started;const start=new Promise(r=>started=r);const gate=new Promise(r=>release=r);let payload,called;
 const f=await fixture(t,async(url,opts)=>{called=url;payload=JSON.parse(opts.body);started();await gate;return Response.json({message:{content:JSON.stringify(ai)}});});
 const {req,host,guest,route}=f;
 await req(route('config'),{mode:'ollama',endpoint:'http://127.0.0.1:11434/',model:'local-test:7b',months:3},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const first=req(route('advance'),{},host.token);await start;
 assert.equal((await req(route('advance'),{},host.token)).status,409);
 assert.equal((await req(route('orders'),{orders:[]},guest.token)).status,409);
 assert.equal((await req(route('join'),{country:'IT'},guest.token)).status,409);
 release();const result=await first;assert.equal(result.status,200);assert.equal(result.body.world.date,'1936-04-01');
 assert.equal(called,'http://127.0.0.1:11434/api/chat');assert.equal(payload.model,'local-test:7b');assert.equal(payload.format.type,'object');assert.equal(payload.stream,false);
 assert.equal((await req(route(),null,guest.token)).body.round,2);
});
test('invalid AI response rolls back every resource, world, date and order',async t=>{
 const f=await fixture(t,async()=>Response.json({message:{content:'{"events": "bad"}'}}));const {req,host,guest,route}=f;
 await req(route('config'),{mode:'ollama',endpoint:'http://localhost:11434',model:'test',months:1},host.token);
 await req(route('orders'),{orders:[{type:'invest'}]},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const before=(await req(route(),null,host.token)).body;assert.equal((await req(route('advance'),{},host.token)).status,502);
 const after=(await req(route(),null,host.token)).body;assert.deepEqual(after.world,before.world);assert.equal(after.round,1);assert.equal(after.players[0].orders[0].type,'invest');assert(after.players.every(x=>x.ready));assert.equal(after.phase,'planning');assert(after.error);
});
test('unreachable Ollama leaves the campaign retryable',async t=>{
 const f=await fixture(t,async()=>{throw new Error('unreachable');});const {req,host,guest,route}=f;
 await req(route('config'),{mode:'ollama',endpoint:'http://localhost:11434',model:'test',months:1},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const result=await req(route('advance'),{},host.token);assert.equal(result.status,502);assert.match(result.body.error,/could not be reached/);assert.equal((await req(route(),null,guest.token)).body.phase,'planning');
});
test('private diplomacy only reaches its participants; public congress reaches everyone',async t=>{
 const f=await fixture(t);const {req,host,guest,route}=f;
 const third=await f.member('Carol','IT');
 await req(route('chat'),{to:'DE',text:'Private pact'},host.token);
 await req(route('chat'),{to:'all',text:'Public statement'},guest.token);
 const alice=(await req(route(),null,host.token)).body.messages,bob=(await req(route(),null,guest.token)).body.messages,carol=(await req(route(),null,third.token)).body.messages;
 assert.equal(alice.length,2);assert.equal(bob.length,2);assert.deepEqual(carol.map(m=>m.text),['Public statement']);
});
test('session and orders survive restart; interrupted resolution safely resets',async t=>{
 const f=await fixture(t);const {req,host,route,dataDir}=f;
 await req(route('orders'),{orders:[{type:'stabilize'}]},host.token);
 const file=path.join(dataDir,f.id+'.json'),r=JSON.parse(fs.readFileSync(file));r.phase='resolving';fs.writeFileSync(file,JSON.stringify(r));
 await new Promise(r=>f.server.close(r));const second=createGameServer({dataDir,config:f.config});await new Promise(r=>second.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>second.close(r)));
 const res=await fetch(`http://127.0.0.1:${second.address().port}/api${route()}`,{headers:{Cookie:host.token}});const data=await res.json();assert.equal(res.status,200);assert.equal(data.phase,'planning');assert.match(data.error,/restarted/);assert.equal(data.players[0].orders[0].type,'stabilize');
});
test('server rejects cross-origin mutations and exports omit credentials and private chat',async t=>{
 const {req,host,route}=await fixture(t);
 assert.equal((await req(route('ready'),{ready:true},host.token,{Origin:'https://unrelated.example'})).status,403);
 await req(route('chat'),{to:'DE',text:'secret'},host.token);
 const ex=(await req(route('export'),null,host.token)).body;
 assert(!JSON.stringify(ex).includes('secret'));assert(!JSON.stringify(ex).includes(host.token));assert.equal(ex.format,'historia-local-public-v1');
});
test('host can remove a disconnected player without exposing their orders',async t=>{
 const {req,host,guest,route}=await fixture(t);
 assert.equal((await req(route('remove'),{playerId:host.room.me},guest.token)).status,403);
 const result=await req(route('remove'),{playerId:guest.room.me},host.token);assert.equal(result.body.players.length,1);
 assert.equal((await req(route(),null,guest.token)).status,403);
});
test('validates order budgets, adjacency, AI policy bounds and human sovereignty',()=>{
 const r={id:'ABCDEF',round:1,months:1,world:{...scenario(),mapMode:'strategy'},players:[{id:'p1',name:'Alice',country:'FR',orders:[{type:'policy',text:'Help industry'}]}],history:[]};
 assert.throws(()=>validateOrders(r,r.players[0],[{type:'attack',unit:'U2',target:'SU0'}]),/neighboring/);
 r.world.countries.find(c=>c.id==='FR').treasury=4;assert.throws(()=>validateOrders(r,r.players[0],[{type:'policy',text:'Policy'}]),/cost/);
 r.world.countries.find(c=>c.id==='FR').treasury=90;
 const policy={playerId:'p1',orderIndex:0,outcome:'Industry improves',treasury:0,economy:4,military:0,stability:0};
 assert.equal(validateAI(r,{...ai,policies:[policy]}).policies.length,1);
 assert.throws(()=>validateAI(r,{...ai,policies:[]}),/omitted/);
 assert.throws(()=>validateAI(r,{...ai,policies:[{...policy,economy:1000}]}),/exceed/);
 assert.throws(()=>validateAI(r,{...ai,policies:[policy,policy]}),/duplicated/);
 assert.throws(()=>validateAI(r,{...ai,policies:[policy],npcOrders:[{country:'FR',type:'mobilize',target:''}]}),/human/);
});
test('simultaneous combat does not depend on order submission or player ordering',()=>{
 const r={id:'ABCDEF',round:1,months:1,world:{...scenario(),mapMode:'strategy'},players:[{id:'p1',name:'Alice',country:'FR',orders:[{type:'attack',unit:'U2',target:'DE0'}]},{id:'p2',name:'Bob',country:'DE',orders:[{type:'attack',unit:'U3',target:'FR0'}]}],history:[]};
 const before=structuredClone(r);const first=resolveTurn(r,ai);r.players.reverse();const second=resolveTurn(r,ai);
 assert.deepEqual(first.world,second.world);assert.deepEqual(r.world,before.world);assert.equal(first.world.units.find(u=>u.id==='U2').strength,22);
});
test('map graph is valid and symmetric and starting ownership is complete',()=>{
 const w=scenario();for(const r of w.regions){assert(w.countries.some(c=>c.id===r.owner));for(const n of r.neighbors){const target=w.regions.find(x=>x.id===n);assert(target,`${r.id} missing ${n}`);assert(target.neighbors.includes(r.id));}}
});
test('native HTTP Ollama adapter discovers models and keeps NPC dialogue private',async t=>{
 const received=[];
 const ollama=http.createServer(async(req,res)=>{
  if(req.url==='/api/tags'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:[{name:'test:7b'}]}));return;}
  let input='';for await(const c of req)input+=c;received.push(JSON.parse(input));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'We are willing to discuss a trade agreement.'}}));
 });
 await new Promise(r=>ollama.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>ollama.close(r)));
 const f=await fixture(t);const {req,host,guest,route}=f;
 const endpoint=`http://127.0.0.1:${ollama.address().port}/v1`;f.config.endpoints.push(endpoint.replace('/v1',''));
 await req(route('config'),{mode:'ollama',endpoint,model:'test:7b',months:1},host.token);
 const models=await req(route('models'),{},host.token);assert.deepEqual(models.body.models,['test:7b']);
 const chat=await req(route('chat'),{to:'IT',text:'Let us negotiate.'},host.token);assert.equal(chat.status,200);assert.equal(chat.body.messages.length,2);
 assert.equal((await req(route(),null,guest.token)).body.messages.length,0);
 const answer=await req(route('advisor'),{text:'Assess our situation.'},host.token);assert.equal(answer.status,200);assert.match(answer.body.answer,/trade agreement/);
 assert.equal(received[0].model,'test:7b');assert.equal(received[0].stream,false);assert(!JSON.stringify(received).includes(host.token));
});
test('policy adjudication commits exactly once, and host URL validation is actionable',async t=>{
 const {req,host,guest,route}=await fixture(t,async(url,opts)=>{
  const payload=JSON.parse(opts.body),ctx=JSON.parse(payload.messages[1].content);
  const player=ctx.players.find(p=>p.orders.some(o=>o.type==='policy'));
  return Response.json({message:{content:JSON.stringify({...ai,policies:[{playerId:player.playerId,orderIndex:0,outcome:'Research capacity improves.',treasury:0,economy:3,military:0,stability:2}]})}});
 });
 assert.equal((await req(route('config'),{mode:'ollama',endpoint:'not-a-url',model:'test',months:1},host.token)).status,400);
 await req(route('config'),{mode:'ollama',endpoint:'http://localhost:11434',model:'test',months:1},host.token);
 await req(route('orders'),{orders:[{type:'policy',text:'Fund research'}]},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const result=await req(route('advance'),{},host.token),fr=result.body.world.countries.find(c=>c.id==='FR');
 assert.equal(result.status,200);assert.equal(fr.economy,68);assert.equal(fr.stability,72);assert.equal(fr.treasury,99);
 assert.equal(result.body.history[0].events.filter(e=>e.title.includes('policy outcome')).length,1);
 assert.equal((await req(route('advance'),{},host.token)).status,409);
});

test('editable prompts are host-only, atomic, persisted and supplied to private AI diplomacy',async t=>{
 const {promptDefaults,promptContracts}=await import('../prompts.mjs');let payload;
 const f=await fixture(t,async(url,opts)=>{payload=JSON.parse(opts.body);return Response.json({message:{content:'Our government is willing to discuss trade.'}});});
 const {req,host,guest,route}=f;
 const prompts={...promptDefaults,diplomacy:'Represent {{countryName}} ({{countryId}}). Prefer peaceful trade.'};
 const config={mode:'ollama',endpoint:'http://localhost:11434',model:'fake-test',months:1,prompts,premise:'A peaceful starting point.'};
 assert.equal((await req(route('config'),config,guest.token)).status,403);
 assert.equal((await req(route('config'),config,host.token)).status,200);
 assert.equal((await req(route('config'),{...config,premise:'Should not commit',prompts:{...prompts,turn:'x'.repeat(6001)}},host.token)).status,400);
 const view=(await req(route(),null,host.token)).body;assert.equal(view.world.premise,config.premise);assert.deepEqual(view.config.prompts,prompts);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dataDir,f.id+'.json'))).prompts,prompts);
 await req(route('orders'),{orders:[{type:'policy',text:'SECRET UNCOMMITTED POLICY'}]},guest.token);
 await req(route('chat'),{to:'DE',text:'SECRET HUMAN CONVERSATION'},host.token);
 const answer=await req(route('chat'),{to:'IT',text:'Would you discuss trade?'},host.token);assert.equal(answer.status,200);
 assert(payload.messages[0].content.startsWith('Represent Italy (IT). Prefer peaceful trade.'));assert(payload.messages[0].content.includes(promptContracts.diplomacy));
 assert(!JSON.stringify(payload).includes('SECRET UNCOMMITTED POLICY'));assert(!JSON.stringify(payload).includes('SECRET HUMAN CONVERSATION'));
 assert(payload.messages[1].content.includes('nearby'));
 assert.equal((await req(route(),null,guest.token)).body.messages.filter(m=>m.from==='IT'||m.to==='IT').length,0);
 assert.equal((await req(route(),null,guest.token)).body.config,undefined);
});

test('nearby nations follow current territory ownership and invited lobbies expose only seat choices',async t=>{
 const {nearbyCountries}=await import('../diplomacy.mjs');const world={regions:[{id:'a',owner:'A',neighbors:['b','c','d']},{id:'b',owner:'B',neighbors:['a']},{id:'c',owner:'B',neighbors:['a']},{id:'d',owner:'A',neighbors:['a']}]};
 assert.deepEqual(nearbyCountries(world,'A'),['B']);world.regions[1].owner='C';assert.deepEqual(nearbyCountries(world,'A'),['B','C']);assert.deepEqual(nearbyCountries(world,'Z'),[]);
 const f=await fixture(t),i=f.server.identity.newInvite(f.server.identity.db.prepare('SELECT id FROM users WHERE username=?').get('alice').id);
 const signup=await f.req('/auth/register',{username:'newcomer',name:'Newcomer',password:f.password,invite:i.invite});assert.equal(signup.status,200);
 assert.equal((await f.req(f.route('lobby'),{invite:'bad'},signup.cookie)).status,403);
 const lobby=await f.req(f.route('lobby'),{invite:f.joinInvite},signup.cookie);assert.equal(lobby.status,200);assert.equal(lobby.body.countries.length,28);
 assert.equal(lobby.body.countries.find(c=>c.id==='FR').available,false);assert.equal(lobby.body.countries.find(c=>c.id==='DE').available,false);assert.equal(lobby.body.countries.find(c=>c.id==='IT').available,true);
 assert.deepEqual(Object.keys(lobby.body).sort(),['countries','date','map']);
 assert.equal((await f.req(f.route('join'),{invite:f.joinInvite,country:'FR'},signup.cookie)).status,409);
});

test('VRAM profile reaches Ollama and output-limit failures preserve the committed turn',async t=>{
 let payload;const f=await fixture(t,async(url,opts)=>{payload=JSON.parse(opts.body);return Response.json({done_reason:'length',message:{content:JSON.stringify(ai)}});});
 const {req,host,guest,route}=f;
 await req(route('config'),{mode:'ollama',endpoint:'http://localhost:11434',model:'qwen2.5:7b',months:1},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const before=(await req(route(),null,host.token)).body;
 const result=await req(route('advance'),{},host.token);assert.equal(result.status,502);assert.match(result.body.error,/output limit/);
 assert.equal(payload.options.num_ctx,20480);assert.equal(payload.options.num_batch,128);assert.equal(payload.options.num_predict,3072);assert.equal(payload.keep_alive,300);
 const after=(await req(route(),null,host.token)).body;assert.deepEqual(after.world,before.world);assert.equal(after.round,1);assert(after.players.every(p=>p.ready));
 // Failure releases the generation slot for the next request.
 assert.equal((await req(route('advisor'),{text:'What now?'},host.token)).status,502);
});

test('oversized required policy fails locally before Ollama with no partial world commit',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return Response.json({message:{content:JSON.stringify(ai)}});});
 const {req,host,guest,route}=f;
 await req(route('config'),{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1,premise:'Oversized exact premise. '.repeat(300)},host.token);
 for(const p of [host,guest])await req(route('ready'),{ready:true},p.token);
 const before=(await req(route(),null,host.token)).body;const result=await req(route('advance'),{},host.token);assert.equal(result.status,413);assert.match(result.body.error,/Essential AI input/);assert.equal(calls,0);
 const after=(await req(route(),null,host.token)).body;assert.deepEqual(after.world,before.world);assert.equal(after.round,1);assert.equal(after.phase,'planning');
});
