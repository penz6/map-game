import {randomBytes,createHash} from 'node:crypto';
import {check} from './rules.mjs';
// Results contain references or bounded text, never cached campaign snapshots.
export function createAIJobs({clock=Date.now,ttl=3600000,maxJobs=512,maxActive=32}={}){
 const jobs=new Map(),keys=new Map();
 const fingerprint=(route,body)=>createHash('sha256').update(JSON.stringify([route,body])).digest('hex');
 function clean(){for(const [id,j]of jobs)if(j.state!=='pending'&&clock()-j.finished>=ttl){jobs.delete(id);keys.delete(j.owner+':'+j.key);}}
 function capacity(owner){clean();check([...jobs.values()].filter(j=>j.state==='pending'&&j.owner===owner).length<4,'Your AI job queue is full. Wait for an earlier job.',429);check([...jobs.values()].filter(j=>j.state==='pending').length<maxActive,'AI job queue is full. Retry shortly.',429);if(jobs.size>=maxJobs){for(const[id,j]of jobs){if(j.state!=='pending'){jobs.delete(id);keys.delete(j.owner+':'+j.key);break;}}}check(jobs.size<maxJobs,'AI job capacity reached. Retry shortly.',429);}
 function lookup(owner,key,route,body){clean();const j=jobs.get(keys.get(owner+':'+key));if(j)check(j.fingerprint===fingerprint(route,body),'Idempotency key was already used for a different request.',409);return j;}
 return {capacity,lookup,
  get(owner,id){clean();const j=jobs.get(id);check(j&&j.owner===owner,'AI job is unavailable or expired. Refresh the campaign before retrying.',410);return j;},
  start({owner,key,route,body,roomId,seat,work}){capacity(owner);const j={id:randomBytes(24).toString('hex'),owner,key,roomId,seat,fingerprint:fingerprint(route,body),state:'pending',created:clock(),progress:{stage:'queued',elapsedMs:0}};jobs.set(j.id,j);keys.set(owner+':'+key,j.id);Promise.resolve().then(()=>work(progress=>{j.progress=progress;})).then(result=>{j.result=result;j.state='done';},error=>{j.error={message:(error.status?error.message:'AI job failed. See the server logs.')+(error.diagnosticReference?` (AI ${error.aiOperation} failed; log reference ${error.diagnosticReference})`:''),status:error.status||500,...(error.diagnosticReference?{reference:error.diagnosticReference}:{})};j.state='failed';if(!error.status)console.error(error);}).finally(()=>{j.finished=clock();});return j;},
  view:j=>({id:j.id,state:j.state,...(j.state==='pending'?{progress:j.progress,elapsedMs:clock()-j.created}:{}),...(j.error?{error:j.error}:{})})
 };
}
