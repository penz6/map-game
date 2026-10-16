import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
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
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTOTPSecret(){const b=randomBytes(20);let bits=0,value=0,result='';for(const byte of b){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}return result;}
function decodeBase32(s){let bits=0,value=0,out=[];for(const c of s){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,counter=Math.floor(Date.now()/30000)){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=createHmac('sha1',decodeBase32(secret)).update(b).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
export function canonicalEndpoint(value){let u;try{u=new URL(value);}catch{throw new GameError('Enter a complete Ollama URL.');}check(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Use an HTTP(S) Ollama URL without credentials, query or fragment.');return u.href.replace(/\/$/,'').replace(/\/api(?:\/chat|\/tags)?$/,'').replace(/\/v1$/,'');}
export function securityConfig(env=process.env){
 const publicOrigin=env.PUBLIC_ORIGIN||'';let origin='';if(publicOrigin){const u=new URL(publicOrigin);check(u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password,'PUBLIC_ORIGIN must be an HTTPS origin such as https://game.example.com.');origin=u.origin;}
 check(!(env.MFA_ENCRYPTION_KEY&&env.MFA_ENCRYPTION_KEY_FILE),'Set either MFA_ENCRYPTION_KEY or MFA_ENCRYPTION_KEY_FILE, not both.');
 const mfaKey=env.MFA_ENCRYPTION_KEY_FILE?fs.readFileSync(env.MFA_ENCRYPTION_KEY_FILE,'utf8').trim():env.MFA_ENCRYPTION_KEY;
 const integer=(key,fallback,min,max)=>{const value=env[key]===undefined?fallback:Number(env[key]);check(Number.isInteger(value)&&value>=min&&value<=max,`${key} must be an integer from ${min} to ${max}.`);return value;};
 check(['default','on','off'].includes(env.AI_THINK||'default'),'AI_THINK must be default, on or off.');
 const result={origin,production:!!origin,mfaKey,aiConcurrency:integer('AI_MAX_CONCURRENCY',1,1,2),aiContext:integer('AI_CONTEXT_LENGTH',32768,4096,32768),aiBatch:integer('AI_BATCH_SIZE',128,32,512),aiTurnOutput:integer('AI_TURN_OUTPUT_TOKENS',3072,512,8192),aiChatOutput:integer('AI_CHAT_OUTPUT_TOKENS',768,128,2048),aiKeepAlive:integer('AI_KEEP_ALIVE_SECONDS',300,0,3600),aiTimeout:integer('AI_TIMEOUT_SECONDS',180,30,600)*1000,aiThink:env.AI_THINK==='on'?true:env.AI_THINK==='off'?false:undefined,insecureLAN:env.DEV_ALLOW_INSECURE_LAN==='true',endpoints:[...new Set([env.OLLAMA_URL||'http://localhost:11434',...(env.OLLAMA_ENDPOINTS||'').split(',').filter(Boolean)].map(canonicalEndpoint))],defaultModel:env.OLLAMA_MODEL||'',defaultMode:env.DEFAULT_MODE==='demo'?'demo':'ollama',tlsCert:env.TLS_CERT||'',tlsKey:env.TLS_KEY||''};
 check(result.aiTurnOutput+1024<result.aiContext&&result.aiChatOutput+1024<result.aiContext,'AI output reserves must leave more than 1,024 tokens for input within AI_CONTEXT_LENGTH.');
 return result;
}
export function createIdentityStore(dataDir,{production=false,keyHex=process.env.MFA_ENCRYPTION_KEY,now=Date.now}={}){
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 fs.chmodSync(dataDir,0o700);
 const keyFile=path.join(dataDir,'.mfa-key');
 if(production)check(typeof keyHex==='string'&&/^[a-f0-9]{64}$/i.test(keyHex),'Public mode requires MFA_ENCRYPTION_KEY (64 hexadecimal characters) in the server environment.');
 let key;if(keyHex){check(/^[a-f0-9]{64}$/i.test(keyHex),'MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters.');key=Buffer.from(keyHex,'hex');}
 else {if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'});key=fs.readFileSync(keyFile);check(key.length===32,'Invalid local MFA encryption key.');}
 const dbFile=path.join(dataDir,'identity.sqlite');const db=new DatabaseSync(dbFile);fs.chmodSync(dbFile,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),disabled INTEGER NOT NULL DEFAULT 0,mfa TEXT,mfa_counter INTEGER NOT NULL DEFAULT -1,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,created INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires INTEGER NOT NULL,auth_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created INTEGER NOT NULL,expires INTEGER NOT NULL,used_by TEXT REFERENCES users(id),revoked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,target TEXT NOT NULL);`);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const audit=(actor,event,target='')=>{db.prepare('INSERT INTO audit(at,actor,event,target) VALUES(?,?,?,?)').run(now(),actor,event,String(target).slice(0,120));db.prepare('DELETE FROM audit WHERE id <= (SELECT MAX(id)-10000 FROM audit)').run();};
 const encrypt=secret=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('hex')).join(':');};
 const decrypt=value=>{const [iv,tag,data]=value.split(':').map(x=>Buffer.from(x,'hex'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');};
 const findUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const publicUser=u=>({id:u.id,username:u.username,name:u.display_name,role:u.role,disabled:!!u.disabled,mfa:!!u.mfa});
 const throttle=(key,max=10,window=15*60000)=>{const id=digest(key),at=now();transaction(()=>{db.prepare('DELETE FROM attempts WHERE expires<?').run(at);const old=db.prepare('SELECT * FROM attempts WHERE key=?').get(id);check(old||db.prepare('SELECT COUNT(*) n FROM attempts').get().n<10000,'Server rate-limit capacity reached. Retry later.',429);check(!old||old.count<max,`Too many requests of this type. Retry after the ${Math.ceil(window/60000)}-minute limit window.`,429);db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(id,at+window);});};
 const revokeUser=id=>db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
 function validateMFA(user,code){
  if(!user?.mfa)return !production||user?.role!=='admin';
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return false;
  const base=Math.floor(now()/30000),secret=decrypt(user.mfa);
  for(const c of [base-1,base,base+1])if(c>user.mfa_counter&&constantEqual(totp(secret,c),code)){return db.prepare('UPDATE users SET mfa_counter=? WHERE id=? AND mfa_counter<?').run(c,user.id,c).changes===1;}
  return false;
 }
 async function credentials(name,password,code,ip){
  const normalized=typeof name==='string'&&/^[a-z][a-z0-9_-]{2,31}$/i.test(name)?name.toLowerCase():'';
  throttle('login-user:'+normalized,10);
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(normalized);
  const good=await verifyPassword(password,user?.password_hash||dummy);
  const fresh=user?findUser(user.id):null;
  if(!good||!fresh||fresh.password_hash!==user.password_hash||fresh.disabled||!validateMFA(fresh,code)){audit('anonymous','login_failed');throw new GameError('Invalid username, password or authenticator code.',401);}
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
 async function createAdmin(name,displayName,password,{mfa=true}={}){
  name=username(name);passwordPolicy(password);check(!db.prepare('SELECT id FROM users WHERE username=?').get(name),'Username is unavailable.');
  check(!production||mfa,'Public administrators require authenticator MFA.');const secret=mfa?newTOTPSecret():null,id=randomToken().slice(0,24),hash=await hashPassword(password);
  db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,mfa,created) VALUES(?,?,?,?,?,?,?)').run(id,name,String(displayName||name).slice(0,30),hash,'admin',secret?encrypt(secret):null,now());audit('console','admin_created',id);return {user:publicUser(findUser(id)),secret};
 }
 async function register(b,ip){
  const name=username(b.username),pw=passwordPolicy(b.password);check(typeof b.name==='string'&&b.name.trim().length>=1&&b.name.length<=30,'Display name must contain 1–30 characters.');
  const validInvite=db.prepare('SELECT * FROM invites WHERE hash=? AND expires>? AND revoked=0 AND used_by IS NULL').get(digest(typeof b.invite==='string'?b.invite:''),now());
  check(validInvite&&!db.prepare('SELECT id FROM users WHERE username=?').get(name),'Registration could not be completed. Check your invitation and choose an available username.');
  throttle('register-invite:'+validInvite.id,10);
  const hash=await hashPassword(pw),id=randomToken().slice(0,24);
  transaction(()=>{
   check(!db.prepare('SELECT id FROM users WHERE username=?').get(name),'Registration could not be completed. Check your invitation and choose an available username.');
   const changed=db.prepare('UPDATE invites SET used_by=? WHERE id=? AND used_by IS NULL AND revoked=0 AND expires>?');
   // Insert first to satisfy the invitation's foreign key; rollback if another request consumed it.
   db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created) VALUES(?,?,?,?,?,?)').run(id,name,b.name.trim(),hash,'member',now());
   check(changed.run(id,validInvite.id,now()).changes===1,'This invitation is no longer valid.');
  });audit(id,'registered');return findUser(id);
 }
 function newInvite(actor){check(db.prepare('SELECT COUNT(*) n FROM invites WHERE revoked=0 AND used_by IS NULL AND expires>?').get(now()).n<100,'Too many outstanding invitations.');const value=randomToken(),id=randomToken().slice(0,16);db.prepare('INSERT INTO invites(id,hash,created_by,created,expires) VALUES(?,?,?,?,?)').run(id,digest(value),actor,now(),now()+7*86400000);audit(actor,'invite_created',id);return {id,invite:value,expires:now()+7*86400000};}
 async function changePassword(user,current,next,authorize=()=>{}){throttle('password:'+user.id,10);check(await verifyPassword(current,user.password_hash),'Current password is incorrect.',401);passwordPolicy(next);const hash=await hashPassword(next);authorize();transaction(()=>{const fresh=findUser(user.id);check(fresh&&!fresh.disabled&&fresh.password_hash===user.password_hash,'Your account changed. Sign in again.',401);db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);revokeUser(user.id);});audit(user.id,'password_changed');return findUser(user.id);}
 async function resetPassword(name,next){const user=db.prepare('SELECT * FROM users WHERE username=?').get(username(name));check(user,'Account not found.');passwordPolicy(next);const hash=await hashPassword(next);transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);revokeUser(user.id);});audit('console','password_reset',user.id);}
 function resetMFA(name){const user=db.prepare('SELECT * FROM users WHERE username=?').get(username(name));check(user,'Account not found.');const secret=newTOTPSecret();transaction(()=>{db.prepare('UPDATE users SET mfa=?,mfa_counter=-1 WHERE id=?').run(encrypt(secret),user.id);revokeUser(user.id);});audit('console','mfa_reset',user.id);return secret;}
 function setDisabled(actor,id,disabled){check(actor!==id,'You cannot disable your own administrator account.');const user=findUser(id);check(user,'Account not found.');if(disabled&&user.role==='admin')check(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").get().n>1,'Cannot disable the last administrator.');transaction(()=>{db.prepare('UPDATE users SET disabled=? WHERE id=?').run(disabled?1:0,id);revokeUser(id);});audit(actor,disabled?'user_disabled':'user_enabled',id);}
 return {db,close:()=>db.close(),findUser,publicUser,session,makeSession,credentials,createAdmin,register,newInvite,changePassword,resetPassword,resetMFA,setDisabled,revokeUser,audit,throttle,
  hasAdmin:()=>db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND disabled=0").get().n>0,
  revokeSession:hash=>db.prepare('DELETE FROM sessions WHERE hash=?').run(hash),
  summary:()=>({users:db.prepare('SELECT * FROM users ORDER BY created').all().map(publicUser),invites:db.prepare('SELECT id,created,expires,used_by,revoked FROM invites ORDER BY created DESC LIMIT 100').all(),audit:db.prepare('SELECT at,actor,event,target FROM audit ORDER BY id DESC LIMIT 100').all()}),
  revokeInvite:(actor,id)=>{db.prepare('UPDATE invites SET revoked=1 WHERE id=?').run(id);audit(actor,'invite_revoked',id);}
 };
}
