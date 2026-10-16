// Bounded FIFO admission. One account cannot consume multiple model slots.
export function createAIQueue({concurrency=1,maxWaiting=32,maxPerUser=4,waitMs=600000}={}) {
 const waiting=[],activeUsers=new Set();let active=0,closed=false;
 const error=(message,status)=>Object.assign(new Error(message),{status});
 function drain(){
  if(closed)return;
  while(active<concurrency){
   const index=waiting.findIndex(job=>!activeUsers.has(job.user));if(index<0)return;
   const job=waiting.splice(index,1)[0];clearTimeout(job.timer);active++;activeUsers.add(job.user);let released=false;
   job.resolve(()=>{if(released)return;released=true;active--;activeUsers.delete(job.user);drain();});
  }
 }
 return {
  acquire(user){
   if(closed)return Promise.reject(error('AI service is shutting down. Retry after restart.',503));
   if(waiting.length>=maxWaiting)return Promise.reject(error('AI request queue is full. Please retry shortly.',429));
   if(waiting.filter(job=>job.user===user).length+(activeUsers.has(user)?1:0)>=maxPerUser)return Promise.reject(error('Your AI request queue is full. Wait for your earlier requests.',429));
   return new Promise((resolve,reject)=>{
    const job={user,resolve,reject};job.timer=setTimeout(()=>{const i=waiting.indexOf(job);if(i>=0){waiting.splice(i,1);reject(error('AI request waited too long in the queue. Please retry.',504));drain();}},waitMs);job.timer.unref?.();waiting.push(job);drain();
   });
  },
  status:()=>({active,waiting:waiting.length}),
  close(){closed=true;for(const job of waiting.splice(0)){clearTimeout(job.timer);job.reject(error('AI service is shutting down. Retry after restart.',503));}}
 };
}
