import http from 'node:http';
import { createAIQueue } from './ai-queue.mjs';
import { createAIJobs } from './ai-jobs.mjs';
import { adjudicateBoundedTurn,assertWorldFits } from './turn-planner.mjs';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createIdentityStore, securityConfig, canonicalEndpoint, constantEqual, randomToken, digest } from './security.mjs';
import { scenario } from './scenario.mjs';
import { nearbyCountries } from './diplomacy.mjs';
import { validateScenario } from './scenario-editor.mjs';
import { worldContext, compactRequest, turnDiplomacy } from './context.mjs';
import { timerExpired, timerView, changeTimer, restartTimer } from './turn-timer.mjs';
import { promptDefaults, promptContracts, directorContract, editablePrompts, validatePrompts, systemPrompt } from './prompts.mjs';
import { check, GameError, validateOrders, turnSchema, directorTurnSchema, validateAI, resolveTurn } from './engine.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const token=()=>randomBytes(24).toString('hex');
const text=(x,max,label='Text')=>{check(typeof x==='string'&&x.trim().length>0&&x.length<=max,`${label} must contain 1–${max} characters.`);return x.trim();};
export function createGameServer({dataDir=process.env.DATA_DIR||path.join(root,'data'),fetchAI=fetch,config=securityConfig(),clock=Date.now}={}){
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const identity=createIdentityStore(dataDir,{production:config.production,keyHex:config.mfaKey,now:clock});
 const lockFile=path.join(dataDir,'server.lock');
 if(fs.existsSync(lockFile)){const pid=Number(fs.readFileSync(lockFile,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch(e){check(e.code==='ESRCH','Cannot verify data directory lock.');}check(!alive,'Another server already owns this data directory.');fs.unlinkSync(lockFile);}
 fs.writeFileSync(lockFile,String(process.pid),{flag:'wx',mode:0o600});
 const rooms=new Map();let requestTokens=200,requestRefill=clock();
 for(const file of fs.readdirSync(dataDir).filter(f=>/^[A-Z0-9]{6}\.json$/.test(f))){
  const r=JSON.parse(fs.readFileSync(path.join(dataDir,file),'utf8'));
  check(r.world?.version===4&&r.players.every(p=>p.accountId),'Unsupported pre-release save format. Use a fresh DATA_DIR for this build.');
  if(r.phase==='resolving'){r.phase='planning';r.error='Server restarted during resolution. Orders are intact; retry the turn.';}
  rooms.set(r.id,r);
 }
 const save=(r,previous=r)=>{check(!rooms.has(r.id)||rooms.get(r.id)===previous,'Campaign state changed. Retry using the current world.',409);const file=path.join(dataDir,r.id+'.json');const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(r),{mode:0o600});fs.renameSync(tmp,file);rooms.set(r.id,r);};
 const auth=(r,account)=>{check(!r.closed,'This campaign has been closed.',403);const p=r.players.find(p=>p.accountId===account.user.id);check(p,'You are not a member of this campaign.',403);return p;};
 const host=(r,p)=>check(r.hostId===p.id,'Only the host can do that.',403);
 const planning=r=>check(r.phase==='planning','Wait for the current world simulation to finish.',409);
 const view=(r,p)=>({epoch:r.epoch||0,revision:r.revision||0,mode:r.mode,timer:timerView(r,clock()),id:r.id,name:r.name,round:r.round,months:r.months,phase:r.phase,error:r.error,hostId:r.hostId,me:p.id,nearby:nearbyCountries(r.world,p.country),world:r.world,history:r.history,players:r.players.map(x=>({id:x.id,name:x.name,country:x.country,ready:x.ready,orders:x.id===p.id?x.orders:undefined})),advisorMessages:(r.advisorMessages||[]).filter(m=>m.accountId===p.accountId).map(({accountId,...m})=>m),messages:r.messages.filter(m=>m.to==='all'||m.audience?.includes(p.accountId)),config:r.hostId===p.id?{endpoint:r.endpoint,allowedEndpoints:config.endpoints,model:r.model,mode:r.mode,prompts:editablePrompts(r),promptDefaults,promptContracts:{...promptContracts,turn:r.world.mapMode==='wild'?directorContract:promptContracts.turn},checkpoints:(r.checkpoints||[]).map(c=>({round:c.round,date:c.world.date})),aiProfile:{contextLength:config.aiContext,batchSize:config.aiBatch,concurrency:config.aiConcurrency,contextCeiling:20000,stagedTurns:true,turnOutput:config.aiTurnOutput,chatOutput:config.aiChatOutput,compaction:true},inviteExpires:r.inviteExpires||null}:undefined});
 const checkWorldCapacity=r=>{if(r.mode==='ollama')assertWorldFits(r,{contextLength:config.aiContext,outputTokens:config.aiTurnOutput});};
 const aiQueue=createAIQueue({concurrency:config.aiConcurrency}),jobs=createAIJobs({clock,maxActive:config.aiConcurrency+32});
 async function readAIJSON(response){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;check(size<=1024*1024,'AI response exceeded the allowed size.',502);chunks.push(Buffer.from(chunk));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GameError('AI returned an invalid response.',502);}}
 async function call(r,messages,format,userId,authorize=()=>{}){
  check(r.model,'Set your Ollama model in Host settings first.');
  check(config.endpoints.includes(r.endpoint),'This AI endpoint is not approved by the server administrator.',403);
  const revision=r.revision||0,round=r.round,phase=r.phase,endpoint=r.endpoint,model=r.model;
  authorize();const current=rooms.get(r.id);check(current&&!current.closed&&(current.revision||0)===revision&&current.round===round&&current.phase===phase,'The world changed while your AI request was queued. Please retry.',409);
  const packed=compactRequest({room:current,messages:typeof messages==='function'?messages():messages,format,contextLength:config.aiContext,outputTokens:format?config.aiTurnOutput:config.aiChatOutput});
  let response;
  try{response=await fetchAI(endpoint+'/api/chat',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:packed.messages,stream:false,...(config.aiThink!==undefined?{think:config.aiThink}:{}),...(format?{format}:{}),options:{temperature:format?0.35:0.65,num_ctx:config.aiContext,num_batch:config.aiBatch,num_predict:packed.outputTokens},keep_alive:config.aiKeepAlive}),signal:AbortSignal.timeout(config.aiTimeout)});}
  catch(e){throw new GameError(`The configured Ollama service could not be reached. Ask the host to check its connection. ${e.name==='TimeoutError'?`The ${config.aiTimeout/1000}-second request timed out.`:''}`,502);}
  check(response.ok,`Ollama returned HTTP ${response.status}. Check the model name and server logs.`,502);
  const body=await readAIJSON(response);
  check(body.done_reason!=='length','AI reached its output limit. No game changes were applied. Shorten policies or raise AI_TURN_OUTPUT_TOKENS/AI_CHAT_OUTPUT_TOKENS while keeping enough context headroom.',502);
  check(typeof body.message?.content==='string'&&body.message.content.trim(),'Ollama returned no answer. Try a larger output budget or another model.',502);
  return body.message.content.trim();
 }
 function context(r,p){return worldContext(r,p,p?nearbyCountries(r.world,p.country):[]);}
 async function adjudicate(r,userId,authorize){
  if(r.mode==='demo')return {events:[{title:'A month of uncertainty',body:'Demo rules resolved this turn without an AI model. Industry, public investment and military orders use the same deterministic rules as Ollama mode.'}],policies:r.players.flatMap(p=>p.orders.flatMap((o,i)=>o.type==='policy'?[{playerId:p.id,orderIndex:i,outcome:`${r.world.countries.find(c=>c.id===p.country).name} begins preparations: ${o.text}. Demo mode grants no policy bonuses.`,treasury:0,economy:0,military:0,stability:0}]:[])),npcOrders:[]};
  return adjudicateBoundedTurn(r,{contextLength:config.aiContext,outputTokens:config.aiTurnOutput,request:(messages,format)=>call(r,messages,format,userId,authorize)});
 }
 async function body(req,max=32768){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;check(size<=max,'Request is too large.',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');check(value&&typeof value==='object'&&!Array.isArray(value),'JSON body must be an object.');return value;}catch(e){if(e.status)throw e;throw new GameError('Invalid JSON.');}}
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const cookieName=config.production?'__Host-historia_session':'historia_session';
 const getCookie=req=>{const pairs=(req.headers.cookie||'').split(';').map(x=>x.trim());return pairs.find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';};
 const setCookie=(res,value,age=8*3600)=>res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.production?'; Secure':''}`);
 const requireAccount=req=>{const a=identity.session(getCookie(req));check(a,'Sign in to continue.',401);return a;};
 const requireAdmin=a=>{check(a.user.role==='admin','Administrator permission is required.',403);check(clock()-a.session.auth_at<=10*60000,'Confirm your password and authenticator code in Account settings before this administrator action.',428);};
 const launch=(res,account,r,p,req,b,work)=>{
  const key=req.headers['idempotency-key']||token();
  check(typeof key==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(key),'Use an 8–80 character idempotency key.');
  const revision=r.revision||0,round=r.round,phase=r.phase;
  const job=jobs.start({owner:account.user.id,key,route:req.url,body:b,roomId:r.id,seat:p.id,work:async()=>{
   let release;
   try{release=await aiQueue.acquire(account.user.id);const current=rooms.get(r.id);const fresh=requireAccount(req);check(current&&auth(current,fresh).id===p.id,'Your government seat changed. Retry.',409);check((current.revision||0)===revision&&current.round===round&&current.phase===phase,'The world changed while your AI request was queued. Retry.',409);
    return await work();
   }catch(e){if(req.url.endsWith('/advance')&&rooms.get(r.id)===r&&r.phase==='resolving'&&r.round===round&&(r.revision||0)===revision){r.phase='planning';r.error=e.message;save(r);}throw e;}
   finally{release?.();}
  }});reply(res,202,{job:jobs.view(job)});
 };
 const handler=async(req,res)=>{
  try{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
   const url=new URL(req.url,'http://localhost');const parts=url.pathname.split('/').filter(Boolean);
   const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),requestHost=req.headers.host||'';
   // This non-sensitive readiness probe is loopback-only, including behind TLS.
   if(req.method==='GET'&&url.pathname==='/api/health'&&loopback&&['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+requestHost).hostname)){reply(res,200,{ok:true});return;}
   if(config.production){
    // Pangolin/Traefik owns transport security. Forwarding headers confer no authority.
    check(requestHost===new URL(config.origin).host,'Unrecognized host.',400);res.setHeader('Strict-Transport-Security','max-age=31536000');
   }else{const hostname=new URL('http://'+requestHost).hostname;check(config.insecureLAN||loopback&&['localhost','127.0.0.1','[::1]'].includes(hostname),'Network access requires HTTPS and PUBLIC_ORIGIN. Development HTTP is limited to loopback.',403);}
   if(parts[0]!=='api'){
    check(req.method==='GET','Method not allowed.',405);
    const file={'/':'index.html','/app.js':'app.js','/accounts.js':'accounts.js','/style.css':'style.css'}[url.pathname];check(file,'Not found.',404);
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',file)));return;
   }
   if(req.method==='GET'&&url.pathname==='/api/health'){reply(res,200,{ok:true});return;}
   if(req.method==='GET'&&url.pathname==='/api/scenario'){reply(res,200,scenario());return;}
   if(req.method==='POST'){
    check(req.headers['content-type']?.startsWith('application/json'),'Use application/json.',415);
    check(req.headers['sec-fetch-site']!=='cross-site','Cross-site request refused.',403);
    check(req.headers.origin===(config.origin||'http://'+requestHost),'A same-origin request is required.',403);
    const now=clock();requestTokens=Math.min(200,requestTokens+Math.max(0,now-requestRefill)*0.05);requestRefill=now;check(requestTokens>=1,'Server request capacity exceeded. Retry shortly.',429);requestTokens--;
   }
   const requestBody=req.method==='POST'?await body(req,parts[1]==='rooms'&&parts[3]==='scenario'?1024*1024:32768):undefined;
   if(req.method==='GET'&&url.pathname==='/api/auth/session'){const a=identity.session(getCookie(req));reply(res,200,{user:a?identity.publicUser(a.user):null,csrf:a?.session.csrf||null,configured:identity.hasAdmin()});return;}
   if(req.method==='POST'&&['/api/auth/login','/api/auth/register'].includes(url.pathname)){
    const b=requestBody;const user=url.pathname.endsWith('login')?await identity.credentials(b.username,b.password,b.otp,req.socket.remoteAddress):await identity.register(b,req.socket.remoteAddress);
    const old=identity.session(getCookie(req));if(old)identity.revokeSession(old.session.hash);
    const login=identity.makeSession(user);setCookie(res,login.value,user.role==='admin'?4*3600:8*3600);identity.audit(user.id,'login');reply(res,200,{user:identity.publicUser(user),csrf:login.session.csrf});return;
   }
   const account=requireAccount(req);
   identity.throttle((req.method==='POST'?'write:':'read:')+account.user.id,req.method==='POST'?120:300,60000);
   if(req.method==='POST')check(constantEqual(req.headers['x-csrf-token'],account.session.csrf),'Invalid request verification token. Reload the page.',403);
   if(req.method==='GET'&&parts[1]==='jobs'&&parts.length===3){
    const job=jobs.get(account.user.id,parts[2]),current=rooms.get(job.roomId);check(current,'Campaign unavailable.',410);const seat=auth(current,account);check(seat.id===job.seat,'Your government seat changed.',409);
    reply(res,200,{job:{...jobs.view(job),...(job.state==='done'?{result:job.result?.roomId?view(current,seat):job.result}:{})}});return;
   }
   if(req.method==='POST'&&req.headers['idempotency-key']){
    const previous=jobs.lookup(account.user.id,req.headers['idempotency-key'],req.url,requestBody);
    if(previous){const current=rooms.get(previous.roomId);check(current&&auth(current,account).id===previous.seat,'Your government seat changed.',409);reply(res,202,{job:jobs.view(previous)});return;}
   }
   if(req.method==='GET'&&url.pathname==='/api/account/rooms'){reply(res,200,{rooms:[...rooms.values()].filter(r=>!r.closed&&r.players.some(p=>p.accountId===account.user.id)).map(r=>({id:r.id,name:r.name,round:r.round,country:r.players.find(p=>p.accountId===account.user.id).country}))});return;}
   if(req.method==='POST'&&parts[1]==='auth'){
    const b=requestBody;
    if(parts[2]==='logout'){identity.revokeSession(account.session.hash);setCookie(res,'',0);identity.audit(account.user.id,'logout');reply(res,200,{ok:true});return;}
    if(parts[2]==='password'){await identity.changePassword(account.user,b.currentPassword,b.newPassword,()=>requireAccount(req));setCookie(res,'',0);reply(res,200,{ok:true});return;}
    if(parts[2]==='reauth'){await identity.credentials(account.user.username,b.password,b.otp,req.socket.remoteAddress);requireAccount(req);identity.revokeSession(account.session.hash);const login=identity.makeSession(identity.findUser(account.user.id));setCookie(res,login.value,login.user.role==='admin'?4*3600:8*3600);reply(res,200,{user:identity.publicUser(login.user),csrf:login.session.csrf});return;}
    throw new GameError('Not found.',404);
   }
   if(parts[1]==='admin'){
    check(account.user.role==='admin','Administrator permission is required.',403);
    if(req.method==='GET'&&parts.length===2){reply(res,200,{...identity.summary(),rooms:[...rooms.values()].map(r=>({id:r.id,name:r.name,players:r.players.length,phase:r.phase,closed:!!r.closed}))});return;}
    check(req.method==='POST'&&parts.length===3,'Not found.',404);requireAdmin(account);const b=requestBody;
    if(parts[2]!=='invite')check(typeof b.id==='string'&&/^[a-zA-Z0-9]{6,24}$/.test(b.id),'Invalid target identifier.');
    if(parts[2]==='invite'){reply(res,201,identity.newInvite(account.user.id));return;}
    if(parts[2]==='revoke-invite')identity.revokeInvite(account.user.id,b.id);
    else if(parts[2]==='user-status'){check(typeof b.disabled==='boolean','Invalid account status.');identity.setDisabled(account.user.id,b.id,b.disabled);}
    else if(parts[2]==='revoke-sessions'){check(identity.findUser(b.id),'Account not found.');identity.revokeUser(b.id);identity.audit(account.user.id,'sessions_revoked',b.id);}
    else if(parts[2]==='close-room'){const target=rooms.get(b.id);check(target,'Campaign not found.');planning(target);target.closed=true;save(target);identity.audit(account.user.id,'campaign_closed',b.id);}
    else throw new GameError('Not found.',404);
    reply(res,200,{ok:true});return;
   }
   if(req.method==='POST'&&url.pathname==='/api/rooms'){
    const b=requestBody;check(rooms.size<200,'Server has reached its campaign limit. Archive old campaigns on disk.');check([...rooms.values()].filter(r=>!r.closed&&r.players.find(p=>p.id===r.hostId)?.accountId===account.user.id).length<3,'An account can host at most three active campaigns.');
    const player={id:token().slice(0,12),accountId:account.user.id,name:account.user.display_name,country:text(b.country,8,'Country'),orders:[],ready:false};
    check(scenario().countries.some(c=>c.id===player.country),'Unknown country.');
    let id;do{id=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(id));
    check(b.mapMode===undefined||['wild','strategy'].includes(b.mapMode),'Choose wild or strategy map mode.');
    const room={id,name:text(b.name,60,'Campaign name'),hostId:player.id,round:1,months:1,phase:'planning',error:null,endpoint:config.endpoints[0],model:config.defaultModel,mode:config.defaultMode,prompts:{...promptDefaults},players:[player],world:scenario(),history:[],messages:[]};
    room.world.mapMode=b.mapMode||'wild';checkWorldCapacity(room);save(room);identity.audit(account.user.id,'campaign_created',id);reply(res,201,{room:view(room,player)});return;
   }
   check(parts[1]==='rooms'&&/^[A-Z0-9]{6}$/.test(parts[2]||'')&&parts.length<=4,'Not found.',404);
   let r=rooms.get(parts[2]);check(r,'Campaign not found.',404);
   const action=parts[3];
   if(req.method==='POST'&&['join','lobby'].includes(action)){
    check(!r.closed,'Campaign is unavailable.',403);
    planning(r);const b=requestBody;check(r.players.length<12,'Campaign is full (12 players).');
    check(!r.players.some(p=>p.accountId===account.user.id),'You already have a seat in this campaign.',409);
    identity.throttle('join:'+account.user.id,20);
    check(typeof b.invite==='string'&&/^[a-f0-9]{64}$/.test(b.invite)&&r.inviteExpires>clock()&&constantEqual(digest(b.invite),r.inviteHash),'A valid campaign invitation is required.',403);
    check(!timerExpired(r,clock()),'The turn deadline has passed. Wait for the next turn or ask the host to extend the timer.',409);
    if(action==='lobby'){reply(res,200,{map:r.world.name,date:r.world.date,countries:r.world.countries.map(c=>({id:c.id,name:c.name,available:!['merged','annexed'].includes(c.status)&&r.world.regions.some(x=>x.owner===c.id)&&!r.players.some(p=>p.country===c.id)}))});return;}
    check(r.world.countries.some(c=>c.id===b.country)&&r.world.regions.some(x=>x.owner===b.country),'Choose a country with territory.');
    check(!r.players.some(p=>p.country===b.country),'That country already has a player.',409);
    const p={id:token().slice(0,12),accountId:account.user.id,name:account.user.display_name,country:b.country,orders:[],ready:false};r.players.push(p);save(r);identity.audit(account.user.id,'campaign_joined',r.id);reply(res,201,{room:view(r,p)});return;
   }
   const p=auth(r,account);
   if(req.method==='GET'){
    if(!action){reply(res,200,view(r,p));return;}
    if(action==='export'){host(r,p);reply(res,200,{format:'historia-local-public-v1',name:r.name,world:r.world,history:r.history,round:r.round});return;}
    throw new GameError('Not found.',404);
   }
   check(req.method==='POST','Method not allowed.',405);const b=requestBody;
   if(action==='orders'){planning(r);check(!timerExpired(r,clock()),'The turn deadline has passed. Saved orders are locked.',409);check(!p.ready,'Unready before changing orders.',409);p.orders=validateOrders(r,p,b.orders);save(r);}
   else if(action==='ready'){planning(r);check(!timerExpired(r,clock()),'The turn deadline has passed. Saved orders are locked.',409);check(typeof b.ready==='boolean','Invalid readiness.');validateOrders(r,p,p.orders);p.ready=b.ready;save(r);}
   else if(action==='scenario'){
    host(r,p);planning(r);check(r.round===1&&r.history.length===0&&r.players.every(p=>!p.ready),'Edit the starting scenario only before the first turn, with everyone unready.',409);
    const world=validateScenario(b.world,r.players);checkWorldCapacity({...r,world});r.epoch=(r.epoch||0)+1;r.revision=(r.revision||0)+1;r.world=world;r.messages=[];r.advisorMessages=[];r.checkpoints=[];for(const player of r.players){player.orders=[];player.ready=false;}restartTimer(r,clock());save(r);identity.audit(account.user.id,'scenario_edited',r.id);
   }
   else if(action==='rewind'){
    host(r,p);planning(r);const point=(r.checkpoints||[]).find(c=>c.round===b.round);check(point,'Choose an available checkpoint.');
    check(r.players.every(p=>point.world.countries.some(c=>c.id===p.country)&&point.world.regions.some(x=>x.owner===p.country)),'Remove seats whose nations did not exist at that checkpoint before rewinding.',409);
    r.epoch=(r.epoch||0)+1;r.revision=(r.revision||0)+1;r.world=structuredClone(point.world);r.round=point.round;r.history=r.history.slice(0,point.historyLength);r.checkpoints=r.checkpoints.filter(c=>c.round<point.round);r.messages=r.messages.filter(m=>m.round<point.round);r.advisorMessages=(r.advisorMessages||[]).filter(m=>m.round<point.round);r.error=null;
    for(const player of r.players){player.orders=[];player.ready=false;}restartTimer(r,clock());save(r);identity.audit(account.user.id,'timeline_rewound',r.id);
   }
   else if(action==='timer'){
    host(r,p);planning(r);check(b.round===r.round,'The turn changed. Refresh before changing the timer.',409);
    changeTimer(r,b.command,b.seconds,clock());save(r);identity.audit(account.user.id,'turn_timer_changed',r.id);
   }
   else if(action==='config'){
    host(r,p);planning(r);check(['ollama','demo'].includes(b.mode),'Choose Ollama or demo mode.');
    const ep=canonicalEndpoint(text(b.endpoint,500,'Ollama URL'));check(config.endpoints.includes(ep),'This endpoint is not on the administrator-configured Ollama allowlist.',403);check(typeof b.model==='string'&&b.model.length<=150,'Invalid model name.');check([1,3,6].includes(b.months),'Choose 1, 3 or 6 months.');
    const nextPremise=b.premise!==undefined?text(b.premise,10000,'Simulation rules'):r.world.premise;
    const nextPrompts=b.prompts!==undefined?validatePrompts(b.prompts):editablePrompts(r);
    const nextMapMode=b.mapMode??r.world.mapMode,nextProtect=b.protectPlayers??r.world.protectPlayers;check(['wild','strategy'].includes(nextMapMode)&&typeof nextProtect==='boolean','Invalid map director settings.');
    checkWorldCapacity({...r,mode:b.mode,prompts:nextPrompts,world:{...r.world,premise:nextPremise,mapMode:nextMapMode,protectPlayers:nextProtect}});
    r.world.premise=nextPremise;r.prompts=nextPrompts;r.world.mapMode=nextMapMode;r.world.protectPlayers=nextProtect;
    r.revision=(r.revision||0)+1;r.endpoint=ep;r.model=b.model.trim();r.months=b.months;r.mode=b.mode;save(r);
   }
   else if(action==='models'){
    host(r,p);identity.throttle('models:'+account.user.id,20,60000);check(config.endpoints.includes(r.endpoint),'AI endpoint is not approved.',403);let response;try{response=await fetchAI(r.endpoint+'/api/tags',{redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new GameError('Cannot connect to the configured Ollama service.',502);}
    check(response.ok,`Ollama returned HTTP ${response.status}.`,502);const data=await readAIJSON(response);reply(res,200,{models:(data.models||[]).slice(0,100).map(x=>x.name).filter(x=>typeof x==='string'&&x.length<=150)});return;
   }
   else if(action==='advance'){
    host(r,p);planning(r);check(timerExpired(r,clock())||r.players.every(p=>p.ready),'All players must mark ready, or the turn timer must expire first.',409);
    for(const player of r.players)validateOrders(r,player,player.orders);
    jobs.capacity(account.user.id);
    check(!req.headers['idempotency-key']||typeof req.headers['idempotency-key']==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(req.headers['idempotency-key']),'Invalid idempotency key.');
    r.phase='resolving';r.error=null;save(r);
    return launch(res,account,r,p,req,b,async()=>{
    // Work continues independently; clients poll a short authenticated job request.
    try{const ai=await adjudicate(r,account.user.id,()=>auth(r,requireAccount(req)));requireAccount(req);const next=resolveTurn(r,ai);next.revision=(r.revision||0)+1;next.checkpoints=[...(r.checkpoints||[]),{round:r.round,world:structuredClone(r.world),historyLength:r.history.length}].slice(-20);restartTimer(next,clock());save(next,r);r=next;identity.audit(account.user.id,'turn_advanced',r.id);}
    catch(e){if(rooms.get(r.id)===r){r.phase='planning';r.error=e.message;save(r);}throw e;}
    return {roomId:r.id};});
   }
   else if(action==='remove'){
    host(r,p);planning(r);check(b.playerId!==p.id,'The host cannot remove themselves.');
    check(r.players.some(x=>x.id===b.playerId),'Player not found.');r.players=r.players.filter(x=>x.id!==b.playerId);save(r);
   }
   else if(action==='invite'){host(r,p);planning(r);const value=randomToken();r.inviteHash=digest(value);r.inviteExpires=clock()+86400000;save(r);identity.audit(account.user.id,'campaign_invite_rotated',r.id);reply(res,200,{invite:value,expires:r.inviteExpires});return;}
   else if(action==='chat'){
    planning(r);const message=text(b.text,2000,'Message');const to=b.to||'all';
    check(to==='all'||r.world.countries.some(c=>c.id===to),'Unknown recipient.');check(to!==p.country,'Choose another country.');check(to==='all'||!['annexed','merged'].includes(r.world.countries.find(c=>c.id===to).status),'That government no longer exists.');
    const human=r.players.some(x=>x.country===to);
    if(to!=='all'&&!human){
     return launch(res,account,r,p,req,b,async()=>{
     const sentRound=r.round,sentRevision=r.revision||0;
     const answer=await call(r,()=>[{role:'system',content:systemPrompt(r,'diplomacy',r.world.countries.find(c=>c.id===to))},{role:'user',content:JSON.stringify({...context(r,p),conversation:r.messages.filter(m=>m.audience?.includes(account.user.id)&&((m.from===p.country&&m.to===to)||(m.to===p.country&&m.from===to))),message})}],undefined,account.user.id,()=>{check(auth(rooms.get(r.id),requireAccount(req)).id===p.id,'Your government seat changed. Please retry.',409);check(!rooms.get(r.id).players.some(x=>x.country===to),'This nation now has a human government. Send the message again.',409);});
     // Resolution may have begun while awaiting AI. Do not inject stale dialogue.
     r=rooms.get(r.id);planning(r);const fresh=requireAccount(req);const current=auth(r,fresh);check(current.id===p.id,'Your government seat changed. Send this message again.',409);check((r.revision||0)===sentRevision&&r.round===sentRound&&!r.players.some(x=>x.country===to),'The world or recipient changed. Send this message again.',409);
     r.messages.push({id:token().slice(0,12),audience:[account.user.id],from:p.country,to,text:message,round:r.round,date:r.world.date},{id:token().slice(0,12),audience:[account.user.id],from:to,to:p.country,text:answer.slice(0,8000),round:r.round,date:r.world.date});
     r.messages=r.messages.slice(-1000);save(r);return {roomId:r.id};
     });
    }else r.messages.push({id:token().slice(0,12),audience:to==='all'?[]:[account.user.id,r.players.find(x=>x.country===to).accountId],from:p.country,to,text:message,round:r.round,date:r.world.date});
    r.messages=r.messages.slice(-1000);save(r);
   }
   else if(action==='advisor'||action==='suggestions'){
    return launch(res,account,r,p,req,b,async()=>{
    const q=action==='suggestions'?'Suggest three useful concrete orders for this nation with costs, current army/province IDs and political trade-offs. Do not execute anything.':text(b.text,2000,'Question'),sentRound=r.round,sentRevision=r.revision||0;
    const answer=await call(r,()=>[{role:'system',content:systemPrompt(r,'advisor')},{role:'user',content:JSON.stringify({...context(r,p),conversation:(r.advisorMessages||[]).filter(m=>m.accountId===account.user.id).map(m=>({from:m.role,to:p.country,text:m.text,date:m.date})),question:q})}],undefined,account.user.id,()=>{check(auth(rooms.get(r.id),requireAccount(req)).id===p.id,'Your government seat changed. Please retry.',409);});r=rooms.get(r.id);check(auth(r,requireAccount(req)).id===p.id,'Your government seat changed. Ask again.',409);check((r.revision||0)===sentRevision&&r.round===sentRound,'The world changed. Ask again using the new state.',409);
    r.advisorMessages=[...(r.advisorMessages||[]),{accountId:account.user.id,role:'user',text:q,round:r.round,date:r.world.date},{accountId:account.user.id,role:'advisor',text:answer,round:r.round,date:r.world.date}].slice(-1000);save(r);
    return {answer};});
   }
   else throw new GameError('Not found.',404);
   reply(res,200,view(r,r.players.find(x=>x.id===p.id)));
  }catch(e){if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Unexpected server error. See the host terminal.'});else res.end();if(!e.status)console.error(e);}
 };
 const server=config.tlsCert&&config.tlsKey?https.createServer({cert:fs.readFileSync(config.tlsCert),key:fs.readFileSync(config.tlsKey)},handler):http.createServer(handler);
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
 server.identity=identity;
 server.on('close',()=>{aiQueue.close();identity.close();try{fs.unlinkSync(lockFile);}catch{}});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const config=securityConfig();
 const port=Number(process.env.PORT||3000),host=process.env.HOST||(config.production?'0.0.0.0':'127.0.0.1');
 check(!!config.tlsCert===!!config.tlsKey,'Set both TLS_CERT and TLS_KEY, or terminate HTTPS at Pangolin/Traefik.');check(!config.tlsCert||config.production,'A TLS listener requires PUBLIC_ORIGIN set to its HTTPS origin.');check(['127.0.0.1','localhost','::1'].includes(host)||config.production||config.insecureLAN,'Network listeners require HTTPS/PUBLIC_ORIGIN. See SECURITY.md.');
 const server=createGameServer({config});server.listen(port,host,()=>console.log(`Historia Local: ${config.origin||'http://'+host+':'+port}\nCreate the first administrator with: node manage.mjs create-admin\nSaves: ${process.env.DATA_DIR||path.join(root,'data')}`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
}
