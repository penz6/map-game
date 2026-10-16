// Reproducible conservative input-budget scenarios, not tokenizer or GPU measurements.
import {scenario} from '../scenario.mjs';
import {worldContext,compactRequest,requestTokenBound,turnDiplomacy} from '../context.mjs';
import {systemPrompt} from '../prompts.mjs';
import {directorTurnSchema,turnSchema} from '../engine.mjs';
const configs=[['2 players, no policies',2,0,0],['2 players, one short policy each',2,1,100],['12 players, one 300-character policy each',12,1,300],['12 players, three 300-character policies each',12,3,300],['12 players, three maximum-length policies each',12,3,2000]];
const rows=[];
for(const mode of ['wild','strategy'])for(const[label,count,policies,size]of configs){
 const world=scenario();world.mapMode=mode;const room={id:'ABCDEF',world,round:1,months:1,history:[],messages:[],players:world.countries.slice(0,count).map((c,i)=>({id:'player'+i,accountId:'account'+i,country:c.id,orders:Array.from({length:policies},()=>({type:'policy',text:'Negotiate peaceful recognition of a new republic. '.repeat(50).slice(0,size)}))}))};
 const format=mode==='wild'?directorTurnSchema:turnSchema,input={...worldContext(room),diplomacy:turnDiplomacy(room),months:1,players:room.players.map(({id,country,orders})=>({playerId:id,country,orders}))};
 const messages=[{role:'system',content:systemPrompt(room,'turn')},{role:'user',content:JSON.stringify(input)}];let measured;
 try{const p=compactRequest({room,messages,format,contextLength:32768,outputTokens:3072});measured={inputByteBound:p.inputBound,minimumWindow:p.inputBound+3072+512,fitsDefault20K:p.inputBound<=20480-3072-512,fits16K:p.inputBound<=16384-3072-512};}catch(e){measured={inputByteBound:requestTokenBound(messages,format),minimumWindow:requestTokenBound(messages,format)+3072+512,fitsDefault20K:false,fits16K:false,rejectedAt32K:true};}
 rows.push({mode,scenario:label,...measured});
}
console.log(JSON.stringify(rows,null,2));
