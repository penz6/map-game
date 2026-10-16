import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const exec=promisify(execFile),image=process.argv[2]||'historia:ci',id=randomBytes(6).toString('hex'),name=`historia-test-${id}`,second=name+'-second',volume=name+'-data';
const docker=async(...args)=>(await exec('docker',[...(process.env.HISTORIA_DOCKER_HOST?['--host='+process.env.HISTORIA_DOCKER_HOST]:[]),...args],{timeout:120000,maxBuffer:1024*1024})).stdout.trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await docker('volume','create',volume);
 await docker('run','--detach','--name',name,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--mount',`type=volume,source=${volume},target=/data`,'-p','127.0.0.1::3000','-e','DEV_ALLOW_INSECURE_LAN=true','-e','DEFAULT_MODE=demo',image);
 let base='http://'+(await docker('port',name,'3000/tcp')).split('\n')[0];
 async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await pause(250);}throw new Error('Container did not become ready.');}
 await ready();assert.equal(await docker('exec',name,'id','-u'),'1000');
 await docker('exec',name,'node','docker/healthcheck.mjs');
 await docker('exec',name,'node','--input-type=module','-e',`import fs from 'node:fs';try{fs.writeFileSync('/app/readonly-smoke','x');process.exit(1);}catch(e){if(!['EROFS','EACCES'].includes(e.code))throw e;}`);
 // Disposable smoke-test identity only; no real credentials are baked in the image.
 await docker('exec',name,'node','--input-type=module','-e',`import {createIdentityStore} from './security.mjs';const s=createIdentityStore('/data');try{await s.createAdmin('smoketest','Smoke test','Smoke test only passphrase 268');}finally{s.close();}`);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({username:'smoketest',password:'Smoke test only passphrase 268'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0],identity=await login.json();
 const created=await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie,'X-CSRF-Token':identity.csrf},body:JSON.stringify({name:'Container persistence',country:'FR'})});assert.equal(created.status,201);const campaign=(await created.json()).room;
 await docker('run','--detach','--name',second,'--mount',`type=volume,source=${volume},target=/data`,'-e','DEV_ALLOW_INSECURE_LAN=true',image);
 assert.notEqual(await docker('wait',second),'0','Second container must not acquire the same data volume.');
 assert.equal(await docker('inspect','--format','{{.State.Running}}',name),'true');
 await docker('kill','--signal=KILL',name);await docker('start',name);
 // Docker can allocate a different ephemeral host port when restarting.
 base='http://'+(await docker('port',name,'3000/tcp')).split('\n')[0];await ready();
 const resumed=await fetch(base+'/api/rooms/'+campaign.id,{headers:{Cookie:cookie}});assert.equal(resumed.status,200);assert.equal((await resumed.json()).name,'Container persistence');
 console.log('Container smoke passed: non-root, read-only filesystem, health, login, persistence after SIGKILL/restart, and shared-volume exclusion.');
}catch(e){try{console.error(await docker('logs','--tail','30',name));}catch{}throw e;}
finally{for(const n of [second,name])try{await docker('rm','--force',n);}catch{}try{await docker('volume','rm',volume);}catch{}}
