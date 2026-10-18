import {randomBytes} from 'node:crypto';
const clean=(value,max=1000)=>String(value??'').replace(/(Bearer\s+)[^\s]+/gi,'$1[redacted]').replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi,'$1[redacted]@').replace(/([?&](?:token|key|password|secret|signature)=)[^&\s]+/gi,'$1[redacted]').slice(0,max);
export function reportAIFailure(error,{operation,room},logger=console){
 if(error.diagnosticReference)return error.diagnosticReference;
 const reference=randomBytes(6).toString('hex');error.diagnosticReference=reference;error.aiOperation=operation;
 let endpoint;try{endpoint=new URL(room.endpoint).origin;}catch{endpoint='unconfigured';}
 // No prompts, policies, conversations, account credentials, request bodies or
 // raw model output. Stack frames locate the failing code without the payload.
 logger.error(JSON.stringify({event:'ai_failure',reference,time:new Date().toISOString(),operation,campaign:room.id,round:room.round,model:clean(room.model,150),endpoint,phase:error.aiPhase||'job',attempt:error.aiAttempt||null,status:error.status||500,upstreamStatus:error.upstreamStatus||null,networkCode:clean(error.networkCode,60)||null,errorType:error.failureType||error.name||'Error',reason:clean(error.message),frames:(error.stack||'').split('\n').filter(s=>/^\s+at /.test(s)).slice(0,6).map(s=>clean(s,250))}));
 return reference;
}
