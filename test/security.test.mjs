import { test } from 'node:test';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server.mjs';
import { securityConfig,createIdentityStore,hashPassword,verifyPassword,digest,totp,passwordPolicy,randomToken } from '../security.mjs';
import { scenario } from '../scenario.mjs';
const password='Test-only passphrase 42!';
async function setup(t,{mfa=false,config=securityConfig({}),fetchAI,bootstrap=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'historia-security-'));let time=Date.now();
 const server=createGameServer({dataDir:dir,config,fetchAI,clock:()=>time});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(dir,{force:true,recursive:true});});
 const base=`http://127.0.0.1:${server.address().port}`,cookies=new Map();
 async function req(route,body,session,headers={},method){const response=await fetch(base+'/api'+route,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(response.status===202&&data.job){let job=data.job;for(let i=0;job.state==='pending'&&i<300;i++){await new Promise(r=>setTimeout(r,10));const poll=await fetch(base+'/api/jobs/'+job.id,{headers:{Cookie:session.cookie}});const status=await poll.json();if(!poll.ok)return{status:poll.status,data:status};job=status.job;}assert.notEqual(job.state,'pending','AI job did not finish');return job.state==='failed'?{status:job.error.status,data:{error:job.error.message}}:{status:200,data:job.result};}const cookie=response.headers.get('set-cookie')?.split(';')[0];return {status:response.status,data,headers:response.headers,...(cookie?{cookie,csrf:data.csrf}:{})};}
 let administrator,admin;
 if(bootstrap){administrator=await server.identity.createAdmin('owner','Owner',password,{mfa});admin=await req('/auth/login',{username:'owner',password,otp:mfa?totp(administrator.secret,Math.floor(time/30000)):''});assert.equal(admin.status,200);}
 async function member(name='playerone',invite){const i=invite||server.identity.newInvite(administrator.user.id).invite;const r=await req('/auth/register',{username:name,name,password,invite:i,role:'admin'});assert.equal(r.status,200);return r;}
 async function room(owner=admin,country='FR'){const r=await req('/rooms',{name:'Security test',country,mapMode:'strategy'},owner);assert.equal(r.status,201);return r.data.room;}
 async function join(r,who,country){const h=await req(`/rooms/${r.id}/invite`,{},admin);return req(`/rooms/${r.id}/join`,{country,invite:h.data.invite},who);}
 return {server,store:server.identity,dir,base,req,admin,administrator,member,room,join,clock:()=>time,advance:ms=>time+=ms};
}
test('no default account or unauthenticated setup, admin, campaign access',async t=>{
 const f=await setup(t,{bootstrap:false});
 assert.equal((await f.req('/auth/session')).data.configured,false);
 assert.equal((await f.req('/rooms',{name:'Hijack',country:'FR'})).status,401);
 assert.equal((await f.req('/admin')).status,401);
 assert.equal((await f.req('/auth/login',{username:'admin',password:'admin'})).status,401);
 assert.equal((await f.req('/setup',{username:'admin',password})).status,401);
});
test('passwords use unique salted memory-hard hashes; Unicode passphrases are supported',async()=>{
 const a=await hashPassword(password),b=await hashPassword(password);assert.notEqual(a,b);assert(a.startsWith('scrypt$32768$8$3$'));assert(!a.includes(password));assert(await verifyPassword(password,a));assert(!(await verifyPassword('incorrect',a)));
 assert.throws(()=>passwordPolicy('short'),/15/);assert.throws(()=>passwordPolicy('x'.repeat(129)),/128/);assert.throws(()=>passwordPolicy('x'.repeat(20)),/common/);assert.doesNotThrow(()=>passwordPolicy('A sentence with spaces and 🌏 642'));
});
test('invitation registration is single-use and cannot assign administrator privileges',async t=>{
 const f=await setup(t),i=await f.req('/admin/invite',{},f.admin);assert.equal(i.status,201);
 const user=await f.member('playerone',i.data.invite);assert.equal(user.data.user.role,'member');
 assert.equal((await f.req('/auth/register',{username:'playertwo',name:'Player',password,invite:i.data.invite})).status,400);
 assert.equal((await f.req('/auth/register',{username:'uninvited',name:'Player',password,invite:randomToken()})).status,400);
 const admin=await f.req('/admin',null,f.admin);assert(!JSON.stringify(admin.data).includes(i.data.invite));assert(!JSON.stringify(admin.data).includes(password));assert(!JSON.stringify(admin.data).includes('password_hash'));
 assert.equal(f.store.db.prepare('SELECT used_by FROM invites WHERE id=?').get(i.data.id).used_by,user.data.user.id);
});
test('cookies are HttpOnly/SameSite; session tokens are hashed and login/logout rotate or revoke',async t=>{
 const f=await setup(t);assert.match(f.admin.headers.get('set-cookie'),/HttpOnly/);assert.match(f.admin.headers.get('set-cookie'),/SameSite=Strict/);
 const raw=f.admin.cookie.split('=')[1],row=f.store.db.prepare('SELECT * FROM sessions').get();assert.equal(row.hash,digest(raw));assert(!JSON.stringify(row).includes(raw));
 const newLogin=await f.req('/auth/login',{username:'owner',password},f.admin);assert.equal(newLogin.status,200);assert.notEqual(newLogin.cookie,f.admin.cookie);assert.equal((await f.req('/admin',null,f.admin)).status,401);
 const bye=await f.req('/auth/logout',{},newLogin);assert.equal(bye.status,200);assert.match(bye.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await f.req('/admin',null,newLogin)).status,401);
});
test('origin, CSRF and Host checks reject forged browser requests and DNS rebinding',async t=>{
 const f=await setup(t);
 assert.equal((await f.req('/auth/login',{username:'owner',password},null,{Origin:'https://evil.example'})).status,403);
 assert.equal((await f.req('/auth/login',{username:'owner',password},null,{Origin:''})).status,403);
 assert.equal((await f.req('/admin/invite',{},f.admin,{'X-CSRF-Token':'forged'})).status,403);
 assert.equal((await f.req('/admin/invite',{},f.admin,{'Sec-Fetch-Site':'cross-site'})).status,403);
 const rawStatus=await new Promise(resolve=>{const r=http.get(f.base+'/api/auth/session',{headers:{Host:'evil.example:3000'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',()=>resolve(0));});assert.equal(rawStatus,403);
 const headers=(await f.req('/health')).headers;assert.equal(headers.get('x-frame-options'),'DENY');assert.match(headers.get('content-security-policy'),/script-src 'self'/);assert.match(headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('player, campaign host and administrator permissions stay distinct',async t=>{
 const f=await setup(t),player=await f.member();
 assert.equal((await f.req('/admin',null,player)).status,403);assert.equal((await f.req('/admin/invite',{},player)).status,403);
 assert.equal((await f.req('/admin/user-status',{id:f.administrator.user.id,disabled:true},player)).status,403);
 const r=await f.room(player);assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).status,403);
 assert.equal((await f.req(`/rooms/${r.id}/config`,{mode:'demo',endpoint:'http://localhost:11434',model:'',months:1},player)).status,200);
 assert.equal((await f.req('/admin/close-room',{id:r.id},f.admin)).status,200);assert.equal((await f.req(`/rooms/${r.id}`,null,player)).status,403);
});
test('password changes require the current password and revoke all devices',async t=>{
 const f=await setup(t),u=await f.member(),other=await f.req('/auth/login',{username:'playerone',password});
 assert.equal((await f.req('/auth/password',{currentPassword:'wrong',newPassword:'A different strong passphrase 47'},u)).status,401);
 assert.equal((await f.req('/auth/password',{currentPassword:password,newPassword:'short'},u)).status,400);
 assert.equal((await f.req('/auth/password',{currentPassword:password,newPassword:'A different strong passphrase 47'},u)).status,200);
 assert.equal((await f.req('/account/rooms',null,u)).status,401);assert.equal((await f.req('/account/rooms',null,other)).status,401);
 assert.equal((await f.req('/auth/login',{username:'playerone',password})).status,401);
 assert.equal((await f.req('/auth/login',{username:'playerone',password:'A different strong passphrase 47'})).status,200);
});
test('disabling an account and revoking sessions take effect immediately',async t=>{
 const f=await setup(t),u=await f.member();
 assert.equal((await f.req('/admin/user-status',{id:u.data.user.id,disabled:true},f.admin)).status,200);
 assert.equal((await f.req('/account/rooms',null,u)).status,401);assert.equal((await f.req('/auth/login',{username:'playerone',password})).status,401);
 assert.equal((await f.req('/admin/user-status',{id:u.data.user.id,disabled:false},f.admin)).status,200);
 const login=await f.req('/auth/login',{username:'playerone',password});assert.equal(login.status,200);
 await f.req('/admin/revoke-sessions',{id:u.data.user.id},f.admin);assert.equal((await f.req('/account/rooms',null,login)).status,401);
 assert.equal((await f.req('/admin/user-status',{id:f.administrator.user.id,disabled:true},f.admin)).status,400);
});
test('login errors do not enumerate accounts and repeated guessing is throttled across reconnects',async t=>{
 const f=await setup(t);const known=await f.req('/auth/login',{username:'owner',password:'wrong'}),unknown=await f.req('/auth/login',{username:'nobody',password:'wrong'});assert.equal(known.status,401);assert.deepEqual(known.data,unknown.data);
 for(let i=0;i<9;i++)assert.equal((await f.req('/auth/login',{username:'owner',password:'wrong'})).status,401);
 assert.equal((await f.req('/auth/login',{username:'owner',password},null,{'X-Forwarded-For':'203.0.113.55'})).status,429);
 f.advance(16*60000);assert.equal((await f.req('/auth/login',{username:'owner',password})).status,200);
});
test('authenticator codes are checked, encrypted at rest and cannot be replayed',async t=>{
 assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');
 const f=await setup(t,{mfa:true});const stored=f.store.findUser(f.administrator.user.id);assert(stored.mfa);assert(!stored.mfa.includes(f.administrator.secret));
 assert.equal((await f.req('/auth/login',{username:'owner',password})).status,401);
 const code=totp(f.administrator.secret,Math.floor(f.clock()/30000));assert.equal((await f.req('/auth/login',{username:'owner',password,otp:code})).status,401);
 f.advance(30000);assert.equal((await f.req('/auth/login',{username:'owner',password,otp:totp(f.administrator.secret,Math.floor(f.clock()/30000))})).status,200);
});
test('idle sessions expire and administrator mutations need recent identity confirmation',async t=>{
 const f=await setup(t);f.advance(11*60000);
 assert.equal((await f.req('/admin/invite',{},f.admin)).status,428);
 const confirmed=await f.req('/auth/reauth',{password},f.admin);assert.equal(confirmed.status,200);assert.notEqual(confirmed.cookie,f.admin.cookie);
 assert.equal((await f.req('/admin/invite',{},confirmed)).status,201);
 f.advance(16*60000);assert.equal((await f.req('/admin',null,confirmed)).status,401);
});
test('campaign invitations are required, expire, and rotate; another account cannot claim a seat',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room();
 assert.equal((await f.req(`/rooms/${r.id}/join`,{country:'DE'},u)).status,403);
 const old=await f.req(`/rooms/${r.id}/invite`,{},f.admin),fresh=await f.req(`/rooms/${r.id}/invite`,{},f.admin);
 assert.equal((await f.req(`/rooms/${r.id}/join`,{country:'DE',invite:old.data.invite},u)).status,403);
 assert.equal((await f.req(`/rooms/${r.id}/join`,{country:'DE',invite:fresh.data.invite},u)).status,201);
 const guestView=await f.req(`/rooms/${r.id}`,null,u);assert(!JSON.stringify(guestView.data).includes(fresh.data.invite));assert(!JSON.stringify(guestView.data).includes('inviteHash'));
 assert.equal((await f.req(`/rooms/${r.id}/join`,{country:'IT',invite:fresh.data.invite},u)).status,409);
});
test('private messages do not leak to a replacement government after a player is removed',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room(),joined=await f.join(r,u,'DE');
 await f.req(`/rooms/${r.id}/chat`,{to:'DE',text:'A confidential pact'},f.admin);
 assert.equal((await f.req(`/rooms/${r.id}`,null,u)).data.messages.length,1);
 await f.req(`/rooms/${r.id}/remove`,{playerId:joined.data.room.me},f.admin);
 const replacement=await f.member('replacement');assert.equal((await f.join(r,replacement,'DE')).status,201);
 assert.equal((await f.req(`/rooms/${r.id}`,null,replacement)).data.messages.length,0);
 assert.equal((await f.req(`/rooms/${r.id}`,null,u)).status,403);
});
test('Ollama allowlisting blocks arbitrary URLs; request payloads and methods are bounded',async t=>{
 let called=0;const f=await setup(t,{fetchAI:async()=>{called++;return Response.json({models:[]});}}),r=await f.room();
 for(const endpoint of ['http://169.254.169.254','http://localhost:22','https://attacker.example','http://localhost:11434@evil.example'])assert.equal((await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint,model:'test',months:1},f.admin)).status,endpoint.includes('@')?400:403);
 assert.equal(called,0);
 assert.equal((await f.req(`/rooms/${r.id}/chat`,{text:'x'.repeat(40000),to:'all'},f.admin)).status,413);
 assert.equal((await f.req(`/rooms/${r.id}/orders/extra`,{},f.admin)).status,404);
 assert.equal((await f.req(`/rooms/${r.id}`,{},f.admin,{},'PUT')).status,405);
});
test('public deployments retain an HTTPS browser origin and MFA key but accept plain backend HTTP',async t=>{
 assert.throws(()=>securityConfig({PUBLIC_ORIGIN:'http://game.example'}),/HTTPS/);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'historia-key-'));try{assert.throws(()=>createIdentityStore(tmp,{production:true}),/MFA_ENCRYPTION_KEY/);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 const config=securityConfig({PUBLIC_ORIGIN:'https://game.example',MFA_ENCRYPTION_KEY:randomToken()});
 const f=await setup(t,{config,bootstrap:false});
 const status=headers=>new Promise((resolve,reject)=>{const request=http.get(f.base+'/api/auth/session',{headers},res=>{res.resume();resolve(res.statusCode);});request.on('error',reject);});
 assert.equal(await status({Host:'game.example'}),200);
 assert.equal(await status({Host:'evil.example','X-Forwarded-Host':'game.example'}),400);
});
test('one account invitation cannot be redeemed by two concurrent registrations',async t=>{
 const f=await setup(t),i=f.store.newInvite(f.administrator.user.id);
 const results=await Promise.all(['firstuser','seconduser'].map(username=>f.req('/auth/register',{username,name:username,password,invite:i.invite})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});
test('Secure host-only cookies and HSTS work without trusted proxies or forwarding headers',async t=>{
 const config=securityConfig({PUBLIC_ORIGIN:'https://game.example',MFA_ENCRYPTION_KEY:randomToken()});
 const f=await setup(t,{config,bootstrap:false}),admin=await f.store.createAdmin('secureowner','Owner',password);
 const data=JSON.stringify({username:'secureowner',password,otp:totp(admin.secret,Math.floor(f.clock()/30000))});
 const result=await new Promise((resolve,reject)=>{const request=http.request(f.base+'/api/auth/login',{method:'POST',headers:{Host:'game.example',Origin:'https://game.example','Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});request.on('error',reject);request.end(data);});
 assert.equal(result.status,200);assert.match(result.headers['set-cookie'][0],/^__Host-historia_session=/);assert.match(result.headers['set-cookie'][0],/; Secure/);assert.match(result.headers['set-cookie'][0],/HttpOnly/);assert.equal(result.headers['strict-transport-security'],'max-age=31536000');
});
test('expired and revoked invitations cannot register accounts or join campaigns',async t=>{
 const f=await setup(t),old=f.store.newInvite(f.administrator.user.id),revoked=f.store.newInvite(f.administrator.user.id);
 f.store.revokeInvite(f.administrator.user.id,revoked.id);
 assert.equal((await f.req('/auth/register',{username:'revokeduser',name:'Revoked',password,invite:revoked.invite})).status,400);
 const u=await f.member(),r=await f.room(),inv=await f.req(`/rooms/${r.id}/invite`,{},f.admin);
 f.advance(26*3600000);const login=await f.req('/auth/login',{username:'playerone',password});assert.equal(login.status,200);
 assert.equal((await f.req(`/rooms/${r.id}/join`,{country:'DE',invite:inv.data.invite},login)).status,403);
 f.advance(7*86400000);assert.equal((await f.req('/auth/register',{username:'expireduser',name:'Expired',password,invite:old.invite})).status,400);
});
test('Docker secret files and AI resource settings are validated before startup',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'historia-secret-'));try{
 const file=path.join(dir,'key');fs.writeFileSync(file,'ab'.repeat(32)+'\n',{mode:0o600});
 const config=securityConfig({MFA_ENCRYPTION_KEY_FILE:file,AI_MAX_CONCURRENCY:'1',AI_CONTEXT_LENGTH:'8192',AI_TIMEOUT_SECONDS:'240',AI_THINK:'off'});
 assert.equal(config.mfaKey,'ab'.repeat(32));assert.equal(config.aiConcurrency,1);assert.equal(config.aiContext,8192);assert.equal(config.aiTimeout,240000);assert.equal(config.aiThink,false);
 assert.throws(()=>securityConfig({MFA_ENCRYPTION_KEY_FILE:file,MFA_ENCRYPTION_KEY:'cd'.repeat(32)}),/both|one/i);
 for(const bad of [{AI_MAX_CONCURRENCY:'3'},{AI_CONTEXT_LENGTH:'100'},{AI_TIMEOUT_SECONDS:'0'},{AI_THINK:'maybe'}])assert.throws(()=>securityConfig(bad));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('turn timer controls require campaign host, CSRF, valid duration and current round',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room();await f.join(r,u,'DE');const route=`/rooms/${r.id}/timer`;
 assert.equal((await f.req(route,{command:'configure',seconds:60,round:1},u)).status,403);
 assert.equal((await f.req(route,{command:'configure',seconds:60,round:1},f.admin,{'X-CSRF-Token':'wrong'})).status,403);
 for(const seconds of [-1,1,29,86401,1.5,'60',null])assert.equal((await f.req(route,{command:'configure',seconds,round:1},f.admin)).status,400);
 assert.equal((await f.req(route,{command:'configure',seconds:60,round:2},f.admin)).status,409);
 assert.equal((await f.req(route,{command:'surprise',seconds:60,round:1},f.admin)).status,400);
 assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.timer.status,'disabled');
 const started=await f.req(route,{command:'configure',seconds:60,round:1},f.admin);assert.equal(started.status,200);assert.equal(started.data.timer.deadline,f.clock()+60000);
});

test('deadline locks saved orders at the exact server boundary and host advances without missing players',async t=>{
 const f=await setup(t,{config:securityConfig({DEFAULT_MODE:'demo'})}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');const route=a=>`/rooms/${r.id}/${a}`;
 await f.req(route('timer'),{command:'configure',seconds:30,round:1},f.admin);
 await f.req(route('orders'),{orders:[{type:'invest'}]},u);
 assert.equal((await f.req(route('advance'),{},f.admin)).status,409);
 f.advance(29999);assert.equal((await f.req(route('orders'),{orders:[{type:'stabilize'}]},u)).status,200);
 f.advance(1);assert.equal((await f.req(route('orders'),{orders:[]},u)).status,409);assert.equal((await f.req(route('ready'),{ready:false},u)).status,409);
 const view=(await f.req(`/rooms/${r.id}`,null,u)).data;assert.equal(view.timer.status,'expired');assert.equal(view.timer.remainingMs,0);assert.equal(view.players.find(p=>p.id===view.me).orders[0].type,'stabilize');
 assert.equal((await f.req(route('advance'),{},u)).status,403);
 const newcomer=await f.member('newcomer');assert.equal((await f.join(r,newcomer,'IT')).status,409);
 const next=await f.req(route('advance'),{},f.admin);assert.equal(next.status,200);assert.equal(next.data.round,2);assert.equal(next.data.timer.status,'running');assert.equal(next.data.timer.deadline,f.clock()+30000);assert.equal(next.data.history[0].orders.find(p=>p.country==='DE').orders[0].type,'stabilize');assert(next.data.players.every(p=>!p.ready));
});

test('pause preserves remaining time, extensions reopen expired turns and disabling restores unlimited planning',async t=>{
 const f=await setup(t),r=await f.room(),route=`/rooms/${r.id}/timer`;
 const timer=(command,seconds)=>f.req(route,{command,seconds,round:1},f.admin);
 await timer('configure',60);f.advance(15000);const paused=await timer('pause');assert.equal(paused.data.timer.remainingMs,45000);assert.equal(paused.data.timer.deadline,null);
 f.advance(120000);const view=(await f.req(`/rooms/${r.id}`,null,f.admin)).data;assert.equal(view.timer.status,'paused');assert.equal(view.timer.remainingMs,45000);
 assert.equal((await timer('pause')).status,409);assert.equal((await timer('extend',86400)).status,400);
 const extended=await timer('extend',15);assert.equal(extended.data.timer.remainingMs,60000);assert.equal(extended.data.timer.status,'paused');
 const resumed=await timer('resume');assert.equal(resumed.data.timer.deadline,f.clock()+60000);f.advance(60000);
 assert.equal((await timer('pause')).status,409);assert.equal((await timer('resume')).status,409);
 assert.equal((await timer('extend',30)).data.timer.status,'running');assert.equal((await f.req(`/rooms/${r.id}/orders`,{orders:[]},f.admin)).status,200);
 const disabled=await timer('configure',0);assert.equal(disabled.data.timer.status,'disabled');assert.equal((await timer('extend',60)).status,409);
});

test('running deadline and saved orders survive restart even when the deadline passed offline',async t=>{
 const f=await setup(t),r=await f.room();await f.req(`/rooms/${r.id}/orders`,{orders:[{type:'invest'}]},f.admin);await f.req(`/rooms/${r.id}/timer`,{command:'configure',seconds:30,round:1},f.admin);
 await new Promise(resolve=>f.server.close(resolve));f.advance(31000);
 const server=createGameServer({dataDir:f.dir,config:securityConfig({}),clock:f.clock});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+`/api/rooms/${r.id}`,{headers:{Cookie:f.admin.cookie}});const view=await response.json();assert.equal(response.status,200);assert.equal(view.timer.status,'expired');assert.equal(view.players[0].orders[0].type,'invest');
 const rejected=await fetch(base+`/api/rooms/${r.id}/orders`,{method:'POST',headers:{Cookie:f.admin.cookie,Origin:base,'X-CSRF-Token':f.admin.csrf,'Content-Type':'application/json'},body:JSON.stringify({orders:[]})});assert.equal(rejected.status,409);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('failed AI resolution keeps the expired timer locked and preserves saved orders for retry',async t=>{
 const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake-test'}),fetchAI:async()=>Response.json({message:{content:'invalid JSON'}})}),r=await f.room();
 await f.req(`/rooms/${r.id}/orders`,{orders:[{type:'invest'}]},f.admin);await f.req(`/rooms/${r.id}/timer`,{command:'configure',seconds:30,round:1},f.admin);f.advance(30000);
 assert.equal((await f.req(`/rooms/${r.id}/advance`,{},f.admin)).status,502);
 const view=(await f.req(`/rooms/${r.id}`,null,f.admin)).data;assert.equal(view.phase,'planning');assert.equal(view.round,1);assert.equal(view.timer.status,'expired');assert.equal(view.players[0].orders[0].type,'invest');assert.deepEqual(view.world,r.world);
});

test('starting-world editor validates ownership and graph, preserves seats, and refuses changes after turn one',async t=>{
 const f=await setup(t,{config:securityConfig({DEFAULT_MODE:'demo'})}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');
 const world=structuredClone(r.world);world.name='Custom original scenario';world.countries.find(c=>c.id==='FR').name='French Federation';
 assert.equal((await f.req(`/rooms/${r.id}/scenario`,{world},u)).status,403);
 const corrupt=structuredClone(world);corrupt.regions[0].owner='MISSING';assert.equal((await f.req(`/rooms/${r.id}/scenario`,{world:corrupt},f.admin)).status,400);
 assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.world.name,r.world.name);
 const edited=await f.req(`/rooms/${r.id}/scenario`,{world},f.admin);assert.equal(edited.status,200);assert.equal(edited.data.world.name,world.name);assert.equal(edited.data.world.countries.find(c=>c.id==='FR').name,'French Federation');
 for(const who of [u,f.admin])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);assert.equal((await f.req(`/rooms/${r.id}/advance`,{},f.admin)).status,200);
 assert.equal((await f.req(`/rooms/${r.id}/scenario`,{world},f.admin)).status,409);
});
test('checkpoint rewind restores armies and politics while discarding future messages, advisor memory and orders',async t=>{
 const f=await setup(t,{config:securityConfig({DEFAULT_MODE:'demo',OLLAMA_MODEL:'fake'}),fetchAI:async()=>Response.json({message:{content:'Private future advice.'}})}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');
 await f.req(`/rooms/${r.id}/orders`,{orders:[{type:'rename',name:'Future Federation'}]},f.admin);
 for(const who of [u,f.admin])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);assert.equal((await f.req(`/rooms/${r.id}/advance`,{},f.admin)).status,200);
 await f.req(`/rooms/${r.id}/chat`,{to:'DE',text:'FUTURE SECRET'},f.admin);assert.equal((await f.req(`/rooms/${r.id}/advisor`,{text:'FUTURE ADVISOR QUESTION'},f.admin)).status,200);
 const before=(await f.req(`/rooms/${r.id}`,null,f.admin)).data;assert.equal(before.config.checkpoints.length,1);assert.equal(before.advisorMessages.length,2);
 assert.equal((await f.req(`/rooms/${r.id}/rewind`,{round:1},u)).status,403);
 const restored=await f.req(`/rooms/${r.id}/rewind`,{round:1},f.admin);assert.equal(restored.status,200);assert.equal(restored.data.round,1);assert.deepEqual(restored.data.world,r.world);assert.equal(restored.data.messages.length,0);assert.equal(restored.data.advisorMessages.length,0);assert.equal(restored.data.history.length,0);assert(restored.data.players.every(p=>!p.ready&&p.orders?.length!==undefined?p.orders.length===0:true));
});
test('advisor threads and suggested actions are persistent and isolated by account',async t=>{
 const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake'}),fetchAI:async()=>Response.json({message:{content:'Consider strengthening your borders.'}})}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');
 assert.equal((await f.req(`/rooms/${r.id}/suggestions`,{},f.admin)).status,200);
 assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.advisorMessages.length,2);
 assert.equal((await f.req(`/rooms/${r.id}`,null,u)).data.advisorMessages.length,0);
 const disk=JSON.parse(fs.readFileSync(path.join(f.dir,r.id+'.json'),'utf8'));assert.equal(disk.advisorMessages.length,2);
});

test('rewinding invalidates an in-flight advisor answer from the discarded future',async t=>{
 let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
 const f=await setup(t,{config:securityConfig({DEFAULT_MODE:'demo',OLLAMA_MODEL:'fake'}),fetchAI:async()=>{started();await gate;return Response.json({message:{content:'DISCARDED FUTURE'}});}}),r=await f.room();
 await f.req(`/rooms/${r.id}/ready`,{ready:true},f.admin);await f.req(`/rooms/${r.id}/advance`,{},f.admin);
 const pending=f.req(`/rooms/${r.id}/advisor`,{text:'What happens next?'},f.admin);await began;assert.equal((await f.req(`/rooms/${r.id}/rewind`,{round:1},f.admin)).status,200);release();assert.equal((await pending).status,409);
 assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.advisorMessages.length,0);
});

test('a pending AI reply cannot publish on behalf of a removed and rejoined government seat',async t=>{
 let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
 const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake'}),fetchAI:async()=>{started();await gate;return Response.json({message:{content:'Old government reply'}});}}),u=await f.member(),r=await f.room(),seat=await f.join(r,u,'DE');
 const pending=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'A private proposal'},u);await began;
 assert.equal((await f.req(`/rooms/${r.id}/remove`,{playerId:seat.data.room.me},f.admin)).status,200);assert.equal((await f.join(r,u,'BE')).status,201);release();assert.equal((await pending).status,409);assert.equal((await f.req(`/rooms/${r.id}`,null,u)).data.messages.length,0);
});

test('wild AI turn changes the same persisted ownership map for both players with one director request',async t=>{
 let calls=0,payload;const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake'}),fetchAI:async(url,opts)=>{calls++;payload=JSON.parse(opts.body);const input=JSON.parse(payload.messages[1].content);return Response.json({message:{content:JSON.stringify({events:[{title:'Tea declares independence',body:'A new republic appears in Britain.'}],policies:input.players.flatMap(p=>p.orders.flatMap((o,i)=>o.type==='policy'?[{playerId:p.playerId,orderIndex:i,outcome:'A tea republic gains recognition.'}]:[])),mapChanges:[{type:'secede',country:'GB',provinces:['GB1'],name:'Tiny Tea Republic',color:'#db4499'}]})}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');
 await f.req(`/rooms/${r.id}/config`,{mapMode:'wild',mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 await f.req(`/rooms/${r.id}/orders`,{orders:[{type:'policy',text:'Support a tiny tea republic in Britain.'}]},f.admin);for(const who of[f.admin,u])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);
 const next=await f.req(`/rooms/${r.id}/advance`,{},f.admin);assert.equal(next.status,200);assert.equal(calls,1);assert(payload.format.properties.mapChanges);assert(!payload.format.properties.npcOrders);
 const state=next.data.world,newNation=state.countries.find(c=>c.name==='Tiny Tea Republic');assert(newNation);assert.equal(state.regions.find(p=>p.id==='GB1').owner,newNation.id);assert.equal(newNation.color,'#db4499');assert.deepEqual(next.data.history[0].changedProvinces,['GB1']);
 assert.deepEqual((await f.req(`/rooms/${r.id}`,null,u)).data.world,state);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir,r.id+'.json'),'utf8')).world,state);
 const input=JSON.parse(payload.messages[1].content);assert.equal(input.mapMode,'wild');assert(!input.unitColumns);assert(payload.messages[0].content.includes('one world director'));
});

test('narrative-only director output gets one bounded correction attempt, and rejected fiction never enters history',async t=>{
 let calls=0,second;const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake'}),fetchAI:async(url,opts)=>{calls++;const payload=JSON.parse(opts.body);if(calls===2)second=JSON.parse(payload.messages[1].content);return Response.json({message:{content:JSON.stringify({events:[{title:calls===1?'UNAPPLIED FICTION':'Actual border settlement',body:'The map should change.'}],policies:[],mapChanges:calls===1?[]:[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]})}});}}),r=await f.room();
 await f.req(`/rooms/${r.id}/config`,{mapMode:'wild',mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);await f.req(`/rooms/${r.id}/ready`,{ready:true},f.admin);
 const next=await f.req(`/rooms/${r.id}/advance`,{},f.admin);assert.equal(next.status,200);assert.equal(calls,2);assert(second.repairInstruction.includes('actual province ownership'));assert(!JSON.stringify(next.data.history).includes('UNAPPLIED FICTION'));assert.equal(next.data.world.regions.find(p=>p.id==='GB1').owner,'IE');
});

test('two invalid map proposals leave world, orders, date and expired timer unchanged without scripted fallback',async t=>{
 let calls=0;const f=await setup(t,{config:securityConfig({OLLAMA_MODEL:'fake'}),fetchAI:async()=>{calls++;return Response.json({message:{content:JSON.stringify({events:[{title:'Nothing really changed',body:'A grand headline.'}],policies:[],mapChanges:[]})}});}}),r=await f.room();
 await f.req(`/rooms/${r.id}/config`,{mapMode:'wild',mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);await f.req(`/rooms/${r.id}/orders`,{orders:[{type:'invest'}]},f.admin);await f.req(`/rooms/${r.id}/timer`,{command:'configure',seconds:30,round:1},f.admin);f.advance(30000);
 const result=await f.req(`/rooms/${r.id}/advance`,{},f.admin);assert.equal(result.status,502);assert.equal(calls,2);const state=(await f.req(`/rooms/${r.id}`,null,f.admin)).data;assert.deepEqual(state.world,{...r.world,mapMode:'wild'});assert.equal(state.history.length,0);assert.equal(state.round,1);assert.equal(state.timer.status,'expired');assert.equal(state.players[0].orders[0].type,'invest');
});

test('concurrent NPC chat requests queue on one model slot and both complete',async t=>{
 let start,release;const started=new Promise(r=>start=r),gate=new Promise(r=>release=r);let calls=0,active=0,peak=0;
 const f=await setup(t,{fetchAI:async()=>{calls++;active++;peak=Math.max(peak,active);try{if(calls===1){start();await gate;}return Response.json({message:{content:'We will consider your offer.'}});}finally{active--;}}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const a=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'First negotiation'},f.admin);await started;const b=f.req(`/rooms/${r.id}/chat`,{to:'GB',text:'Second negotiation'},u);
 await new Promise(r=>setTimeout(r,40));assert.equal(calls,1);release();const replies=await Promise.all([a,b]);assert(replies.every(r=>r.status===200));assert.equal(calls,2);assert.equal(peak,1);
 assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.messages.length,2);assert.equal((await f.req(`/rooms/${r.id}`,null,u)).data.messages.length,2);
});

test('NPC negotiations inform map resolution without including human DMs or advisor text',async t=>{
 let turnInput;const f=await setup(t,{fetchAI:async(url,opts)=>{const payload=JSON.parse(opts.body);if(!payload.format)return Response.json({message:{content:'Italy proposes an independent tea republic in Britain.'}});turnInput=JSON.parse(payload.messages[1].content);return Response.json({message:{content:JSON.stringify({events:[{title:'A new republic',body:'A territorial settlement is announced.'}],policies:[],mapChanges:[{type:'secede',country:'GB',provinces:['GB1'],name:'Tea Accord Republic',color:'#aa44bb'}]})}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mapMode:'wild',mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 await f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'PRIVATE NPC TEA OFFER'},f.admin);await f.req(`/rooms/${r.id}/chat`,{to:'DE',text:'HUMAN DM EXCLUDE'},f.admin);await f.req(`/rooms/${r.id}/advisor`,{text:'ADVISOR EXCLUDE'},f.admin);
 for(const who of[f.admin,u])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);const next=await f.req(`/rooms/${r.id}/advance`,{},f.admin);assert.equal(next.status,200);assert.equal(turnInput.diplomacy.length,2);assert(turnInput.diplomacy.some(m=>m.text==='PRIVATE NPC TEA OFFER'));assert(turnInput.diplomacy.some(m=>m.text.includes('Italy proposes')));assert(!JSON.stringify(turnInput).includes('HUMAN DM EXCLUDE'));assert(!JSON.stringify(turnInput).includes('ADVISOR EXCLUDE'));assert(!JSON.stringify(turnInput.diplomacy).includes('audience'));assert.equal(next.data.world.countries.find(c=>c.name==='Tea Accord Republic').color,'#aa44bb');
 const guest=(await f.req(`/rooms/${r.id}`,null,u)).data;assert(!JSON.stringify(guest.messages).includes('PRIVATE NPC TEA OFFER'));
});

test('queued generation rechecks session authorization before contacting Ollama',async t=>{
 let started,release;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);let calls=0;
 const f=await setup(t,{fetchAI:async()=>{calls++;started();await gate;return Response.json({message:{content:'An answer.'}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const a=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'Hold the model'},f.admin);await began;const b=f.req(`/rooms/${r.id}/chat`,{to:'GB',text:'Queued'},u);await new Promise(r=>setTimeout(r,40));await f.req('/auth/logout',{},u);release();assert.equal((await a).status,200);assert.equal((await b).status,401);assert.equal(calls,1);
});

test('queued request for a changed world is discarded before model execution',async t=>{
 let started,release,calls=0;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const f=await setup(t,{fetchAI:async()=>{calls++;started();await gate;return Response.json({message:{content:'Stale advice'}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'demo',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const a=f.req(`/rooms/${r.id}/advisor`,{text:'Hold model'},f.admin);await began;const b=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'Queued for old world'},u);await new Promise(r=>setTimeout(r,40));for(const who of[f.admin,u])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);const advance=await fetch(f.base+`/api/rooms/${r.id}/advance`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base,Cookie:f.admin.cookie,'X-CSRF-Token':f.admin.csrf},body:'{}'});assert.equal(advance.status,202);release();assert.equal((await a).status,200);assert.equal((await b).status,409);assert.equal(calls,1);let state;for(let i=0;i<50;i++){state=(await f.req(`/rooms/${r.id}`,null,u)).data;if(state.round===2)break;await pause(10);}assert.equal(state.round,2);assert.equal(state.messages.length,0);
});

test('failed model generation releases its slot so the next queued player succeeds',async t=>{
 let started,release,calls=0;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const f=await setup(t,{fetchAI:async()=>{calls++;if(calls===1){started();await gate;throw new Error('Offline');}return Response.json({message:{content:'Second request succeeds'}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const a=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'First'},f.admin);await began;const b=f.req(`/rooms/${r.id}/chat`,{to:'GB',text:'Second'},u);await new Promise(r=>setTimeout(r,40));release();assert.equal((await a).status,502);assert.equal((await b).status,200);assert.equal(calls,2);
});

test('account write limits isolate players on the same proxy and cannot be bypassed with forwarded IPs',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room();await f.join(r,u,'DE');let limited;
 for(let i=0;i<125;i++){limited=await f.req(`/rooms/${r.id}/orders`,{orders:[]},u,{'X-Forwarded-For':'198.51.100.'+(i%200+1)});if(limited.status===429)break;}
 assert.equal(limited.status,429);assert.equal((await f.req(`/rooms/${r.id}/orders`,{orders:[]},f.admin)).status,200);
 f.advance(61000);assert.equal((await f.req(`/rooms/${r.id}/orders`,{orders:[]},u)).status,200);
});
test('more than thirty distinct login attempts from one proxy do not lock out an unrelated account',async t=>{
 const f=await setup(t);for(let i=0;i<31;i++)assert.equal((await f.req('/auth/login',{username:'unknown'+i,password:'wrong'})).status,401);
 assert.equal((await f.req('/auth/login',{username:'owner',password},null,{'X-Forwarded-For':'203.0.113.8'})).status,200);
});
test('registration invitation limits allow more than ten different invited players behind one proxy',async t=>{
 const f=await setup(t);for(let i=0;i<11;i++)assert.equal((await f.member('member'+i)).status,200);
});
test('global request burst protection refills quickly and does not depend on forwarded headers',async t=>{
 const f=await setup(t);let response;for(let i=0;i<205;i++){response=await f.req('/unknown',{},null,{'X-Forwarded-For':'198.51.100.'+(i%200+1)});if(response.status===429)break;}
 assert.equal(response.status,429);f.advance(1000);assert.equal((await f.req('/unknown',{},null)).status,401);
});

function slowMutation(f,route,value,who){
 const data=JSON.stringify(value);let finish;const done=new Promise((resolve,reject)=>{const request=http.request(f.base+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),Origin:f.base,Cookie:who.cookie,'X-CSRF-Token':who.csrf}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(body)}));});request.on('error',reject);request.write(data.slice(0,1));finish=()=>request.end(data.slice(1));});return{finish,done};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('delayed join uses the latest committed room and cannot rewind or overwrite it',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room(),invite=(await f.req(`/rooms/${r.id}/invite`,{},f.admin)).data.invite;await f.req(`/rooms/${r.id}/config`,{mode:'demo',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const delayed=slowMutation(f,`/rooms/${r.id}/join`,{country:'DE',invite},u);await pause(30);await f.req(`/rooms/${r.id}/ready`,{ready:true},f.admin);assert.equal((await f.req(`/rooms/${r.id}/advance`,{},f.admin)).data.round,2);delayed.finish();assert.equal((await delayed.done).status,201);
 const state=(await f.req(`/rooms/${r.id}`,null,f.admin)).data;assert.equal(state.round,2);assert.equal(state.phase,'planning');assert.equal(state.history.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,r.id+'.json'))).round,2);
});
test('body completion rechecks account revocation and removed campaign membership',async t=>{
 const f=await setup(t),u=await f.member(),r=await f.room();const seat=await f.join(r,u,'DE');const pending=slowMutation(f,`/rooms/${r.id}/chat`,{to:'all',text:'AFTER REVOKE'},u);await pause(30);await f.req('/admin/user-status',{id:u.data.user.id,disabled:true},f.admin);pending.finish();assert.equal((await pending.done).status,401);assert.equal((await f.req(`/rooms/${r.id}`,null,f.admin)).data.messages.length,0);
 await f.req('/admin/user-status',{id:u.data.user.id,disabled:false},f.admin);const login=await f.req('/auth/login',{username:'playerone',password});const removed=slowMutation(f,`/rooms/${r.id}/chat`,{to:'all',text:'AFTER REMOVAL'},login);await pause(30);await f.req(`/rooms/${r.id}/remove`,{playerId:seat.data.room.me},f.admin);removed.finish();assert.equal((await removed.done).status,403);
});
test('queued follow-up receives the preceding committed NPC exchange',async t=>{
 let start,release,calls=0,second;const began=new Promise(r=>start=r),gate=new Promise(r=>release=r);const f=await setup(t,{fetchAI:async(url,opts)=>{calls++;if(calls===1){start();await gate;}else second=JSON.parse(JSON.parse(opts.body).messages[1].content);return Response.json({message:{content:'FIRST OFFER ACCEPTED'}});}}),r=await f.room();await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const first=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'FIRST OFFER'},f.admin);await began;const next=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'Confirm the terms'},f.admin);await pause(30);release();assert.equal((await first).status,200);assert.equal((await next).status,200);assert(second.conversation.some(m=>m.text==='FIRST OFFER'));assert(second.conversation.some(m=>m.text==='FIRST OFFER ACCEPTED'));
});
test('AI work returns a job immediately, is account-private, and replays idempotently',async t=>{
 let start,release,calls=0;const began=new Promise(r=>start=r),gate=new Promise(r=>release=r);const f=await setup(t,{fetchAI:async()=>{calls++;start();await gate;return Response.json({message:{content:'A private reply'}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const send=async text=>{const response=await fetch(f.base+`/api/rooms/${r.id}/chat`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base,Cookie:f.admin.cookie,'X-CSRF-Token':f.admin.csrf,'Idempotency-Key':'audit-job-idempotent'},body:JSON.stringify({to:'IT',text})});return {status:response.status,data:await response.json()};};
 const submitted=await send('Private terms');assert.equal(submitted.status,202);await began;
 try{const replay=await send('Private terms');assert.equal(replay.data.job.id,submitted.data.job.id);assert.equal((await send('Different terms')).status,409);assert.equal((await f.req('/jobs/'+submitted.data.job.id,null,u)).status,410);assert.equal((await f.req('/jobs/'+submitted.data.job.id,null,f.admin)).data.job.state,'pending');}finally{release();}
 let job;for(let i=0;i<100;i++){job=(await f.req('/jobs/'+submitted.data.job.id,null,f.admin)).data.job;if(job.state!=='pending')break;await pause(10);}assert.equal(job.state,'done');assert.equal(calls,1);assert.equal(job.result.messages.length,2);assert.equal((await send('Private terms')).data.job.id,job.id);
});
test('a queued turn unlocks planning if its initiating session is revoked before admission',async t=>{
 let started,release;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);const f=await setup(t,{fetchAI:async()=>{started();await gate;return Response.json({message:{content:'A reply'}});}}),u=await f.member(),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'demo',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const first=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'Hold the slot'},u);await began;for(const who of[f.admin,u])await f.req(`/rooms/${r.id}/ready`,{ready:true},who);
 const response=await fetch(f.base+`/api/rooms/${r.id}/advance`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base,Cookie:f.admin.cookie,'X-CSRF-Token':f.admin.csrf},body:'{}'});assert.equal(response.status,202);await f.req('/auth/logout',{},f.admin);release();await first;let view;for(let i=0;i<50;i++){view=(await f.req(`/rooms/${r.id}`,null,u)).data;if(view.phase==='planning')break;await pause(10);}assert.equal(view.phase,'planning');assert.equal(view.round,1);
});

test('revocation during password hashing prevents the pending password change from committing',async t=>{
 const f=await setup(t),u=await f.member();const pending=f.req('/auth/password',{currentPassword:password,newPassword:'A different secure passphrase 890'},u);const key=digest('password:'+u.data.user.id);for(let i=0;i<100;i++){if(f.store.db.prepare('SELECT key FROM attempts WHERE key=?').get(key))break;await pause(2);}await f.req('/admin/revoke-sessions',{id:u.data.user.id},f.admin);assert.equal((await pending).status,401);assert.equal((await f.req('/auth/login',{username:'playerone',password})).status,200);
});
test('a queued NPC message is rejected before generation when a human claims that recipient',async t=>{
 let release,started,calls=0;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);const f=await setup(t,{fetchAI:async()=>{calls++;started();await gate;return Response.json({message:{content:'A reply'}});}}),u=await f.member(),v=await f.member('newgovernment'),r=await f.room();await f.join(r,u,'DE');await f.req(`/rooms/${r.id}/config`,{mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const first=f.req(`/rooms/${r.id}/advisor`,{text:'Hold slot'},f.admin);await began;const pending=f.req(`/rooms/${r.id}/chat`,{to:'IT',text:'To the NPC'},u);await pause(30);assert.equal((await f.join(r,v,'IT')).status,201);release();assert.equal((await first).status,200);assert.equal((await pending).status,409);assert.equal(calls,1);
});

test('twelve-player maximum-policy turn is staged through Ollama with every request under 32K',async t=>{
 let calls=0,finals=0;const seen=new Map();const {requestTokenBound}=await import('../context.mjs');
 const f=await setup(t,{fetchAI:async(url,opts)=>{calls++;const payload=JSON.parse(opts.body);assert.equal(payload.options.num_ctx,32768);assert(requestTokenBound(payload.messages,payload.format)+payload.options.num_predict+512<=32768);const input=JSON.parse(payload.messages[1].content);let result;
  if(input.phase==='policyBatch'){for(const p of input.policyBatch)seen.set(`${p.playerId}:${p.orderIndex}`,p.text);result={policies:input.policyBatch.map(p=>({playerId:p.playerId,orderIndex:p.orderIndex,outcome:'Recognition is sought.',intent:'Support independent tea states.'}))};}
  else {assert.equal(input.phase,'worldResolution');finals++;result={events:[{title:'The tea border',body:'A settlement changes British territory.'}],mapChanges:[{type:'transfer',country:'GB',targetCountry:'IE',provinces:['GB1']}]};}
  return Response.json({message:{content:JSON.stringify(result)}});
 }}),r=await f.room();await f.req(`/rooms/${r.id}/config`,{mapMode:'wild',mode:'ollama',endpoint:'http://localhost:11434',model:'fake',months:1},f.admin);
 const sessions=[f.admin];for(const [i,c]of r.world.countries.filter(c=>c.id!=='FR').slice(0,11).entries()){const u=await f.member('contextuser'+i);await f.join(r,u,c.id);sessions.push(u);}
 for(let i=0;i<sessions.length;i++){const orders=Array.from({length:3},(_,j)=>({type:'policy',text:(`Plan ${i}-${j}: `+'Recognize a small independent republic peacefully. '.repeat(80)).slice(0,2000)}));assert.equal((await f.req(`/rooms/${r.id}/orders`,{orders},sessions[i])).status,200);await f.req(`/rooms/${r.id}/ready`,{ready:true},sessions[i]);}
 const next=await f.req(`/rooms/${r.id}/advance`,{},f.admin);assert.equal(next.status,200);assert.equal(next.data.round,2);assert.equal(seen.size,36);assert.equal(finals,1);assert(calls>1);for(const p of next.data.history[0].orders)for(let j=0;j<p.orders.length;j++)assert.equal(seen.get(`${next.data.players.find(x=>x.country===p.country).id}:${j}`),p.orders[j].text);assert.equal(next.data.world.regions.find(p=>p.id==='GB1').owner,'IE');
});
