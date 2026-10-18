import {GameError,check} from './rules.mjs';
// Read Ollama incrementally. Only the completed answer can leave this module.
// Progress contains counters and stages, never private text or reasoning.
export async function readOllama({fetchAI=fetch,url,payload,idleMs=600000,loadMs=idleMs,maxDurationMs=1800000,onProgress=()=>{},now=Date.now}){
 const start=now(),controller=new AbortController();let idle,total,lastTimeoutMs=idleMs,timeoutStage='',bytes=0,answer='',thinkingCharacters=0,chunks=0,toolCallCount=0,finished=false,lastProgress=0;
 const metrics=()=>({elapsedMs:Math.max(0,now()-start),responseBytes:bytes,answerCharacters:answer.length,thinkingCharacters,chunks,toolCallCount});
 const stage=()=>answer?'responding':thinkingCharacters?'thinking':'loading';
 const arm=()=>{clearTimeout(idle);lastTimeoutMs=stage()==='loading'?Math.max(idleMs,loadMs):idleMs;idle=setTimeout(()=>{timeoutStage=stage();controller.abort();},lastTimeoutMs);};
 arm();total=setTimeout(()=>{timeoutStage='total_duration';controller.abort();},maxDurationMs);
 const progress=force=>{if(force||now()-lastProgress>=500){lastProgress=now();onProgress({stage:stage(),...metrics()});}};
 let reader;
 try{
  progress(true);
  const response=await fetchAI(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:true}),signal:controller.signal});
  arm();
  if(!response.ok){let raw='';for await(const chunk of response.body||[]){bytes+=chunk.length;check(bytes<=65536,'Ollama error response exceeded the allowed size.',502);raw+=new TextDecoder().decode(chunk);arm();}
   let message='';try{message=String(JSON.parse(raw).error||'');}catch{}
   const reason=/not found/i.test(message)?'Model or endpoint not found':/out of memory|unable to allocate|insufficient.*memory/i.test(message)?'Insufficient model memory':/load.*model|model.*load/i.test(message)?'Model failed to load':/does not support|unsupported/i.test(message)?'Unsupported model capability':'';
   const e=new GameError(`Ollama returned HTTP ${response.status}.${reason?' '+reason+'.':''} Check the model name and server logs.`,502);e.failureType='upstream_http';e.upstreamStatus=response.status;throw e;
  }
  check(response.body,'Ollama returned no response body.',502);reader=response.body.getReader();const decoder=new TextDecoder();let pending='',completion;
  const ndjson=/ndjson|json-seq/.test(response.headers.get('content-type')||'');
  function accept(item){
   check(item&&typeof item==='object'&&!Array.isArray(item),'Ollama returned an invalid response.',502);
   if(item.error){const e=new GameError('Ollama stopped generation with an error. Check its container logs for model or memory failures.',502);e.failureType='upstream_stream';throw e;}
   if(Array.isArray(item.message?.tool_calls))toolCallCount+=item.message.tool_calls.length;
   if(typeof item.message?.content==='string')answer+=item.message.content;
   if(typeof item.message?.thinking==='string')thinkingCharacters+=item.message.thinking.length;
   chunks++;if(item.done===true){finished=true;completion=item;}arm();progress(false);
  }
  while(true){
   const part=await reader.read();if(part.done)break;arm();bytes+=part.value.length;check(bytes<=2*1024*1024,'AI response exceeded the allowed size.',502);pending+=decoder.decode(part.value,{stream:true});
   if(ndjson){let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index).trim();pending=pending.slice(index+1);if(line){check(!finished,'Ollama returned data after its completion record.',502);accept(JSON.parse(line));}}}
  }
  pending+=decoder.decode();
  if(ndjson){if(pending.trim()){check(!finished,'Ollama returned data after its completion record.',502);accept(JSON.parse(pending));}check(finished,'Ollama stream ended before completion. No game changes were applied.',502);}
  else{const body=JSON.parse(pending);accept(body);completion=body;}
  progress(true);
  if(toolCallCount){const e=new GameError('The model returned tool calls, but this game requires a direct answer or the supplied JSON schema. No tools were executed and no game changes were applied.',502);e.failureType='unexpected_tool_call';throw e;}
  return {content:answer.trim(),doneReason:completion?.done_reason,...metrics(),evalCount:completion?.eval_count||0,promptEvalCount:completion?.prompt_eval_count||0,loadDurationMs:Math.round((completion?.load_duration||0)/1e6),evalDurationMs:Math.round((completion?.eval_duration||0)/1e6)};
 }catch(error){
  let e=error;
  if(timeoutStage||error.name==='TimeoutError'){if(!timeoutStage)timeoutStage=stage();e=new GameError(timeoutStage==='total_duration'?`Ollama exceeded the ${Math.round(maxDurationMs/60000)} minute generation ceiling. No game changes were applied.`:`Ollama sent no data for ${lastTimeoutMs/1000} seconds while ${timeoutStage==='loading'?'loading the model or processing input':timeoutStage==='thinking'?'thinking':'generating its answer'}. Check Ollama logs and available memory.`,502);e.failureType='timeout';e.timeoutStage=timeoutStage;}
  else if(!e.status){e=new GameError(error instanceof SyntaxError?'Ollama returned malformed response data. No game changes were applied.':'The configured Ollama service could not be reached or disconnected while responding. Check its service logs.',502);e.failureType=error instanceof SyntaxError?'malformed_stream':'connection';e.networkCode=error.cause?.code||error.code;}
  e.generation=metrics();throw e;
 }finally{clearTimeout(idle);clearTimeout(total);try{await reader?.cancel();}catch{}}
}
export function defaultThinking(model,configured){if(configured!==undefined)return configured;return /(?:^|\/)qwen3(?:[.:_-]|$)/i.test(model)&&!/thinking/i.test(model)?false:undefined;}
