import { check,GameError } from './rules.mjs';
import { validateOrders,resolveTurn as resolveStrategyTurn } from './strategy.mjs';
import { applyMapChanges,mapChangeSchema,MAX_MAP_CHANGES } from './map-director.mjs';
export { GameError, check, clamp } from './rules.mjs';
export { validateOrders, costs, governments, ideologies } from './strategy.mjs';
const actionSchema={type:'object',additionalProperties:false,required:['country','type'],properties:{country:{type:'string'},type:{type:'string',enum:['invest','mobilize','stabilize','recruit','move','attack','government','rename','release','cede','annex','merge','treaty','breakTreaty']},target:{type:'string'},unit:{type:'string'},name:{type:'string'},targetCountry:{type:'string'},terms:{type:'string',enum:['trade','nonaggression','alliance']},government:{type:'string',enum:['republic','monarchy','dictatorship','council']},ideology:{type:'string',enum:['liberal','conservative','socialist','nationalist','nonaligned']},leader:{type:'string'}}};
export const turnSchema={type:'object',additionalProperties:false,required:['events','policies','npcOrders','mapChanges'],properties:{
 events:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['title','body'],properties:{title:{type:'string',minLength:1,maxLength:160},body:{type:'string',minLength:1,maxLength:3000}}}},
 policies:{type:'array',maxItems:60,items:{type:'object',additionalProperties:false,required:['playerId','orderIndex','outcome','treasury','economy','military','stability'],properties:{playerId:{type:'string'},orderIndex:{type:'integer'},outcome:{type:'string',minLength:1,maxLength:600,description:'Brief plain-text result, not an object or array.'},treasury:{type:'integer',minimum:-8,maximum:8},economy:{type:'integer',minimum:-5,maximum:5},military:{type:'integer',minimum:-5,maximum:5},stability:{type:'integer',minimum:-8,maximum:8},actions:{type:'array',maxItems:2,items:{$ref:'#/$defs/action'}}}}},
 mapChanges:{type:'array',maxItems:0},
 npcOrders:{type:'array',maxItems:8,items:{$ref:'#/$defs/action'}}
},$defs:{action:actionSchema}};
export const directorTurnSchema={type:'object',additionalProperties:false,required:['events','policies','mapChanges'],properties:{events:turnSchema.properties.events,policies:{type:'array',maxItems:36,items:{type:'object',additionalProperties:false,required:['playerId','orderIndex','outcome'],properties:{playerId:{type:'string'},orderIndex:{type:'integer'},outcome:{type:'string',minLength:1,maxLength:600,description:'Brief plain-text result, not an object or array.'}}}},mapChanges:{type:'array',minItems:1,maxItems:MAX_MAP_CHANGES,items:mapChangeSchema},agreements:{type:'array',maxItems:8,items:{...actionSchema,properties:{country:actionSchema.properties.country,type:{type:'string',enum:['treaty','merge','breakTreaty']},targetCountry:actionSchema.properties.targetCountry,terms:actionSchema.properties.terms}}}}};
export function validateAI(room,ai){
 check(ai&&Array.isArray(ai.events)&&ai.events.length>=1&&ai.events.length<=8,'AI returned invalid events.',502);
 const events=ai.events.map(e=>{check(e&&typeof e.title==='string'&&e.title.length>0&&e.title.length<=160&&typeof e.body==='string'&&e.body.length>0&&e.body.length<=3000,'AI event is invalid.',502);return {title:e.title,body:e.body};});
 const wild=room.world.mapMode==='wild';
 check(!wild||!ai.npcOrders?.length,'Wild mode uses one world director; use agreements for NPC diplomatic responses.',502);
 check(wild||!ai.agreements?.length,'Strategy uses npcOrders for diplomatic responses.',502);
 const npcInput=(wild?ai.agreements:ai.npcOrders)??[];
 if(wild)check(Array.isArray(npcInput)&&npcInput.every(o=>o&&['treaty','merge','breakTreaty'].includes(o.type)),'Director agreements support only treaty, merge or breakTreaty.',502);
 check(Array.isArray(ai.policies)&&Array.isArray(npcInput)&&npcInput.length<=8,'AI returned invalid orders.',502);
 const policies=validatePolicies(room,ai.policies);
 const mapChanges=ai.mapChanges||[];check(wild||Array.isArray(mapChanges)&&mapChanges.length===0,'Strategy mode cannot bypass orders/combat with director mapChanges.',502);const preview=applyMapChanges(room.world,mapChanges,room.players,{limitHumanGains:true,requireOwnershipChange:room.world.mapMode==='wild',seed:room.id+':'+room.round});
 const reserved=new Set(room.players.flatMap(p=>p.orders.filter(o=>['attack','move','cede','release'].includes(o.type)).map(o=>o.target)));check(!preview.changedProvinces.some(id=>reserved.has(id)),'Choose other provinces: a human movement, attack or territorial order already targets one of these provinces.',502);
 const used=new Set();
 const npcOrders=npcInput.map(o=>{
  check(o&&!room.players.some(p=>p.country===o.country)&&!used.has(o.country),'AI tried to control a human country or repeat an NPC.',502);used.add(o.country);
  const fake={country:o.country};const order=validateOrders(room,fake,[o])[0];check(order.type!=='policy','NPC policy is unsupported.',502);
  return {country:o.country,...order};
 });
 const proposal={events,policies,npcOrders,mapChanges};
 // Validate against the post-order world too, so conflicts receive the same bounded repair.
 resolveTurn({...room,history:room.history||[],months:room.months||1},proposal);
 return proposal;
}

export function resolveTurn(room,ai){
 const result=resolveStrategyTurn(room,ai);
 if(ai.mapChanges?.length){
  const patch=applyMapChanges(result.world,ai.mapChanges,result.players,{limitHumanGains:true,requireOwnershipChange:room.world.mapMode==='wild',seed:room.id+':'+room.round});
  result.world=patch.world;const history=result.history.at(-1);history.events.push(...patch.events);history.mapChanges=patch.records;history.changedProvinces=patch.changedProvinces;
 }
 return result;
}

// Outcome prose is a display field; it never authorizes actions or map changes.
// Tolerate absent/blank prose and bound oversized prose, while rejecting a
// wrong structured type and retaining every simulation/identity validation.
export function policyOutcome(value){
 if(value==null||typeof value==='string'&&!value.trim())return 'See world events for this action’s outcome.';
 if(typeof value!=='string'){
  const error=new GameError('AI policy outcome must be text.',502);
  error.validation={field:'policy.outcome',receivedType:Array.isArray(value)?'array':typeof value,expected:'string'};throw error;
 }
 const text=value.trim();if(text.length<=2000)return text;
 let end=1999;const last=text.charCodeAt(end-1);if(last>=0xD800&&last<=0xDBFF)end--;
 return text.slice(0,end)+'…';
}

export function validatePolicies(room,input,{requireAll=true}={}){
 const wild=room.world.mapMode==='wild';check(Array.isArray(input),'AI policies must be an array.',502);
 const seen=new Set();
 const policies=input.map(p=>{
  check(p&&typeof p==='object','AI policy must be an object.',502);
  const player=room.players.find(x=>x.id===p.playerId);
  check(player&&Number.isInteger(p.orderIndex)&&player.orders[p.orderIndex]?.type==='policy','AI referenced an unknown policy.',502);
  const key=`${p.playerId}:${p.orderIndex}`;check(!seen.has(key),'AI duplicated a policy.',502);seen.add(key);
  const outcome=policyOutcome(p.outcome);
  if(wild){check(!p.actions?.length,'Wild mode uses mapChanges, not per-player concrete action plans.',502);p={...p,treasury:0,economy:0,military:0,stability:0};}
  for(const [k,limit] of Object.entries({treasury:8,economy:5,military:5,stability:8})) check(Number.isInteger(p[k])&&Math.abs(p[k])<=limit,'AI policy effects exceed the rules.',502);
  check(p.actions===undefined||Array.isArray(p.actions)&&p.actions.length<=2,'A policy may execute at most two structured actions.',502);const actions=(p.actions||[]).map(o=>{check(o&&o.type!=='policy'&&o.country===player.country,'A policy cannot issue actions for another nation.',502);return validateOrders(room,player,[o])[0];});
  return {playerId:p.playerId,orderIndex:p.orderIndex,outcome,treasury:p.treasury,economy:p.economy,military:p.military,stability:p.stability,actions};
 });
 if(requireAll)for(const p of room.players)for(let i=0;i<p.orders.length;i++)if(p.orders[i].type==='policy')check(seen.has(`${p.id}:${i}`),'AI omitted a policy. Retry this turn.',502);
 for(const player of room.players)validateOrders(room,player,[...player.orders,...policies.filter(p=>p.playerId===player.id).flatMap(p=>p.actions)],{max:9});
 return policies;
}
