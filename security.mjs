import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { check, GameError } from './engine.mjs';
const derive=promisify(scrypt);
export const randomToken=()=>randomBytes(32).toString('hex');
export const digest=x=>createHash('sha256').update(x).digest('hex');
export function constantEqual(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function username(value){check(typeof value==='string'&&/^[a-z][a-z0-9_-]{2,31}$/i.test(value),'Username must be 3–32 letters, numbers, underscores or hyphens, starting with a letter.');return value.toLowerCase();}
export function passwordPolicy(value){
 check(typeof value==='string'&&[...value].length>=15&&[...value].length<=128&&Buffer.byteLength(value)<=1024,'Use a password or passphrase of 15–128 characters.');
 check(!/^(.)\1+$/u.test(value)&&!['passwordpassword','password1234567','123456789012345','qwertyuiopasdfgh','letmeinletmeinletmein','correcthorsebatterystaple'].includes(value.toLowerCase()),'Choose a less common password.');
 return value;
}
let hashing=0;
export async function hashPassword(value,salt=randomBytes(16).toString('hex')){
 check(hashing<2,'Authentication is busy. Try again shortly.',429);hashing++;
 try{const hash=await derive(value,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;}finally{hashing--;}
}
const dummy='scrypt$32768$8$3$00000000000000000000000000000000$'+'0'.repeat(64);
export async function verifyPassword(value,stored=dummy){
 if(typeof value!=='string'||Buffer.byteLength(value)>1024)return false;
 const [,N,r,p,salt,expected]=stored.split('$');
 if(N!=='32768'||r!=='8'||p!=='3'||!salt||!expected)return false;
 const actual=await hashPassword(value,salt);return constantEqual(actual,stored);
}
export function canonicalEndpoint(value){let u;try{u=new URL(value);}catch{throw new GameError('Enter a complete Ollama URL.');}check(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Use an HTTP(S) Ollama URL without credentials, query or fragment.');return u.href.replace(/\/$/,'').replace(/\/api(?:\/chat|\/tags)?$/,'').replace(/\/v1$/,'');}
export function securityConfig(env=process.env){
 const publicOrigin=env.PUBLIC_ORIGIN||'';let origin='';if(publicOrigin){const u=new URL(publicOrigin);check(u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password,'PUBLIC_ORIGIN must be an HTTPS origin such as https://game.example.com.');origin=u.origin;}
 const integer=(key,fallback,min,max)=>{const value=env[key]===undefined?fallback:Number(env[key]);check(Number.isInteger(value)&&value>=min&&value<=max,`${key} must be an integer from ${min} to ${max}.`);return value;};
 check(['default','on','off'].includes(env.AI_THINK||'default'),'AI_THINK must be default, on or off.');
 const result={origin,production:!!origin,aiConcurrency:integer('AI_MAX_CONCURRENCY',1,1,2),aiContext:integer('AI_CONTEXT_LENGTH',32768,4096,32768),aiBatch:integer('AI_BATCH_SIZE',128,32,512),aiTurnOutput:integer('AI_TURN_OUTPUT_TOKENS',3072,512,8192),aiChatOutput:integer('AI_CHAT_OUTPUT_TOKENS',1536,128,4096),aiKeepAlive:integer('AI_KEEP_ALIVE_SECONDS',300,0,3600),aiTimeout:integer('AI_TIMEOUT_SECONDS',600,30,1800)*1000,aiLoadTimeout:integer('AI_LOAD_TIMEOUT_SECONDS',600,30,1800)*1000,aiMaxDuration:integer('AI_MAX_DURATION_SECONDS',1800,60,3600)*1000,aiThink:env.AI_THINK==='on'?true:env.AI_THINK==='off'?false:undefined,insecureLAN:env.DEV_ALLOW_INSECURE_LAN==='true',endpoints:[...new Set([env.OLLAMA_URL||'http://localhost:11434',...(env.OLLAMA_ENDPOINTS||'').split(',').filter(Boolean)].map(canonicalEndpoint))],defaultModel:env.OLLAMA_MODEL||'',defaultMode:env.DEFAULT_MODE==='demo'?'demo':'ollama',tlsCert:env.TLS_CERT||'',tlsKey:env.TLS_KEY||''};
 check(result.aiTurnOutput+1024<result.aiContext&&result.aiChatOutput+1024<result.aiContext,'AI output reserves must leave more than 1,024 tokens for input within AI_CONTEXT_LENGTH.');
 return result;
}
export function createIdentityStore(dataDir,{now=Date.now}={}){
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 fs.chmodSync(dataDir,0o700);
 const dbFile=path.join(dataDir,'identity.sqlite');const db=new DatabaseSync(dbFile);fs.chmodSync(dbFile,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),disabled INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,created INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires INTEGER NOT NULL,auth_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,target TEXT NOT NULL);`);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const audit=(actor,event,target='')=>{db.prepare('INSERT INTO audit(at,actor,event,target) VALUES(?,?,?,?)').run(now(),actor,event,String(target).slice(0,120));db.prepare('DELETE FROM audit WHERE id <= (SELECT MAX(id)-10000 FROM audit)').run();};
 const findUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const publicUser=u=>({id:u.id,username:u.username,name:u.display_name,role:u.role,disabled:!!u.disabled});
 const throttle=(key,max=10,window=15*60000)=>{const id=digest(key),at=now();transaction(()=>{db.prepare('DELETE FROM attempts WHERE expires<?').run(at);const old=db.prepare('SELECT * FROM attempts WHERE key=?').get(id);check(old||db.prepare('SELECT COUNT(*) n FROM attempts').get().n<10000,'Server rate-limit capacity reached. Retry later.',429);check(!old||old.count<max,`Too many requests of this type. Retry after the ${Math.ceil(window/60000)}-minute limit window.`,429);db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(id,at+window);});};
 const revokeUser=id=>db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
 async function credentials(name,password,code,ip){
  const normalized=typeof name==='string'&&/^[a-z][a-z0-9_-]{2,31}$/i.test(name)?name.toLowerCase():'';
  throttle('login-user:'+normalized,10);
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(normalized);
  const good=await verifyPassword(password,user?.password_hash||dummy);
  const fresh=user?findUser(user.id):null;
  if(!good||!fresh||fresh.password_hash!==user.password_hash||fresh.disabled){audit('anonymous','login_failed');throw new GameError('Invalid username or password.',401);}
  db.prepare('DELETE FROM attempts WHERE key=?').run(digest('login-user:'+normalized));return findUser(user.id);
 }
 function makeSession(user){
  check(user&&!user.disabled,'Account is unavailable.',401);const value=randomToken(),at=now(),hours=user.role==='admin'?4:8;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(at);
  const old=db.prepare('SELECT hash FROM sessions WHERE user_id=? ORDER BY created DESC').all(user.id);for(const s of old.slice(4))db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);
  db.prepare('INSERT INTO sessions(hash,user_id,csrf,created,last_seen,expires,auth_at) VALUES(?,?,?,?,?,?,?)').run(digest(value),user.id,randomToken(),at,at,at+hours*3600000,at);
  return {value,session:db.prepare('SELECT * FROM sessions WHERE hash=?').get(digest(value)),user};
 }
 function session(value){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return null;
  const s=db.prepare('SELECT * FROM sessions WHERE hash=?').get(digest(value));if(!s)return null;const user=findUser(s.user_id),at=now();
  if(!user||user.disabled||at>s.expires||at-s.last_seen>(user.role==='admin'?15:30)*60000){db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);return null;}
  if(at-s.last_seen>60000)db.prepare('UPDATE sessions SET last_seen=? WHERE hash=?').run(at,s.hash);
  return {session:s,user};
 }
 async function createAdmin(name,displayName,password){
  name=username(name);passwordPolicy(password);check(!db.prepare('SELECT id FROM users WHERE username=?').get(name),'Username is unavailable.');
  const id=randomToken().slice(0,24),hash=await hashPassword(password);
  db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created) VALUES(?,?,?,?,?,?)').run(id,name,String(displayName||name).slice(0,30),hash,'admin',now());audit('console','admin_created',id);return {user:publicUser(findUser(id))};
 }
 async function register(b){
  const name=username(b.username),pw=passwordPolicy(b.password);check(typeof b.name==='string'&&b.name.trim().length>=1&&b.name.length<=30,'Display name must contain 1–30 characters.');
  // No client/proxy IP trust: a bounded global signup budget protects the expensive
  // password work, with an additional username budget to constrain repeated races.
  throttle('register-global',30,60000);throttle('register-user:'+name,5);
  const available=()=>check(!db.prepare('SELECT id FROM users WHERE username=?').get(name),'Registration could not be completed. Choose an available username.');available();
  const hash=await hashPassword(pw),id=randomToken().slice(0,24);
  transaction(()=>{available();db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created) VALUES(?,?,?,?,?,?)').run(id,name,b.name.trim(),hash,'member',now());});
  audit(id,'registered');return findUser(id);
 }
 async function changePassword(user,current,next,authorize=()=>{}){throttle('password:'+user.id,10);check(await verifyPassword(current,user.password_hash),'Current password is incorrect.',401);passwordPolicy(next);const hash=await hashPassword(next);authorize();transaction(()=>{const fresh=findUser(user.id);check(fresh&&!fresh.disabled&&fresh.password_hash===user.password_hash,'Your account changed. Sign in again.',401);db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);revokeUser(user.id);});audit(user.id,'password_changed');return findUser(user.id);}
 async function resetPassword(name,next){const user=db.prepare('SELECT * FROM users WHERE username=?').get(username(name));check(user,'Account not found.');passwordPolicy(next);const hash=await hashPassword(next);transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);revokeUser(user.id);});audit('console','password_reset',user.id);}
 function setDisabled(actor,id,disabled){check(actor!==id,'You cannot disable your own administrator account.');const user=findUser(id);check(user,'Account not found.');if(disabled&&user.role==='admin')check(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").get().n>1,'Cannot disable the last administrator.');transaction(()=>{db.prepare('UPDATE users SET disabled=? WHERE id=?').run(disabled?1:0,id);revokeUser(id);});audit(actor,disabled?'user_disabled':'user_enabled',id);}
 return {db,close:()=>db.close(),findUser,publicUser,session,makeSession,credentials,createAdmin,register,changePassword,resetPassword,setDisabled,revokeUser,audit,throttle,
  hasAdmin:()=>db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").get().n>0,
  revokeSession:hash=>db.prepare('DELETE FROM sessions WHERE hash=?').run(hash),
  summary:()=>({users:db.prepare('SELECT * FROM users ORDER BY created').all().map(publicUser),audit:db.prepare('SELECT at,actor,event,target FROM audit ORDER BY id DESC LIMIT 100').all()}),

 };
}
