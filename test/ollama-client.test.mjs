import {test} from 'node:test';import assert from 'node:assert/strict';
import {readOllama,defaultThinking} from '../ollama-client.mjs';
const encoder=new TextEncoder();
function streamFetch(parts,{delay=0,close=true}={}){return async(url,options)=>{const body=new ReadableStream({async start(controller){let aborted=false;options.signal.addEventListener('abort',()=>{aborted=true;controller.error(new DOMException('Aborted','AbortError'));},{once:true});for(const part of parts){if(delay)await new Promise(r=>setTimeout(r,delay));if(aborted)return;controller.enqueue(encoder.encode(part));}if(close&&!aborted)controller.close();}});return new Response(body,{headers:{'content-type':'application/x-ndjson'}});};}
const args={url:'http://ollama.test/api/chat',payload:{model:'qwen3.5:9b',messages:[]}};
test('streamed split UTF-8 NDJSON returns only completed content and private counter-only progress',async()=>{
 const progress=[];const fetchAI=async(url,options)=>{assert.equal(JSON.parse(options.body).stream,true);const bytes=encoder.encode(JSON.stringify({message:{thinking:'PRIVATE REASON',content:'Bonjour 🌍'},done:false})+'\n'+JSON.stringify({message:{content:'!'},done:true,done_reason:'stop',eval_count:7,load_duration:2000000})+'\n');return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});};
 const result=await readOllama({...args,fetchAI,onProgress:p=>progress.push(p)});assert.equal(result.content,'Bonjour 🌍!');assert.equal(result.evalCount,7);assert.equal(result.loadDurationMs,2);assert(result.thinkingCharacters>0);assert(!JSON.stringify(progress).includes('PRIVATE'));assert(!JSON.stringify(progress).includes('Bonjour'));
});
test('active token streaming can exceed the idle timeout in total duration',async()=>{
 const parts=Array.from({length:7},()=>JSON.stringify({message:{content:'x'},done:false})+'\n').concat(JSON.stringify({done:true,done_reason:'stop'})+'\n');
 const result=await readOllama({...args,fetchAI:streamFetch(parts,{delay:12}),idleMs:50,maxDurationMs:1000});assert.equal(result.content,'xxxxxxx');assert(result.elapsedMs>50);
});
test('a stalled stream reports stage, elapsed time and no partial answer',async()=>{
 await assert.rejects(readOllama({...args,fetchAI:streamFetch([JSON.stringify({message:{thinking:'private'},done:false})+'\n'],{close:false}),idleMs:20,maxDurationMs:1000}),e=>e.failureType==='timeout'&&e.timeoutStage==='thinking'&&e.generation.thinkingCharacters===7&&e.generation.elapsedMs>=15);
});
test('the hard duration ceiling stops an endless but active stream',async()=>{
 const parts=Array.from({length:50},()=>JSON.stringify({message:{content:'x'},done:false})+'\n');
 await assert.rejects(readOllama({...args,fetchAI:streamFetch(parts,{delay:10}),idleMs:100,maxDurationMs:35}),e=>e.failureType==='timeout'&&e.timeoutStage==='total_duration');
});
test('an incomplete stream, malformed JSON and terminal upstream errors cannot become answers',async()=>{
 for(const part of [JSON.stringify({message:{content:'partial'},done:false})+'\n','not json\n',JSON.stringify({error:'PRIVATE ENGINE ERROR'})+'\n'])await assert.rejects(readOllama({...args,fetchAI:streamFetch([part])}),e=>e.status===502&&!e.message.includes('PRIVATE'));
});
test('complete non-streaming JSON is accepted for compatible servers',async()=>{assert.equal((await readOllama({...args,fetchAI:async()=>Response.json({done:true,message:{content:'Done'}})})).content,'Done');});
test('model-aware thinking defaults respect explicit preferences and mandatory-thinking models',()=>{
 assert.equal(defaultThinking('qwen3.5:9b'),false);assert.equal(defaultThinking('qwen3:14b'),false);assert.equal(defaultThinking('qwen2.5:7b'),undefined);assert.equal(defaultThinking('gpt-oss:20b'),undefined);assert.equal(defaultThinking('qwen3:30b-thinking'),undefined);assert.equal(defaultThinking('qwen3.5:9b',true),true);
});
test('cold load grace permits slow first data without weakening the answer inactivity limit',async()=>{
 const result=await readOllama({...args,fetchAI:streamFetch([JSON.stringify({message:{content:'Loaded'},done:true})+'\n'],{delay:30}),idleMs:10,loadMs:200,maxDurationMs:1000});assert.equal(result.content,'Loaded');
 await assert.rejects(readOllama({...args,fetchAI:streamFetch([JSON.stringify({message:{content:'Started'},done:false})+'\n'],{close:false}),idleMs:20,loadMs:200,maxDurationMs:1000}),e=>e.timeoutStage==='responding'&&e.generation.elapsedMs<180);
});

test('unexpected tool calls reject even mixed content without exposing arguments',async()=>{
 for(const fetchAI of [streamFetch([JSON.stringify({message:{content:'partial',tool_calls:[{function:{name:'PRIVATE_TOOL',arguments:{secret:'PRIVATE_ARGS'}}}]},done:true})+'\n']),async()=>Response.json({message:{content:'partial',tool_calls:[{function:{name:'PRIVATE_TOOL'}}]},done:true})]){
  await assert.rejects(readOllama({...args,fetchAI}),e=>e.failureType==='unexpected_tool_call'&&e.generation.toolCallCount===1&&!e.message.includes('PRIVATE'));
 }
});
