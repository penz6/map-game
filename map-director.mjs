import { createHash } from 'node:crypto';
import { check,clamp } from './rules.mjs';
export const MAX_MAP_CHANGES=8;
const refSchema={type:'string',pattern:'^\\$[a-z][a-z0-9_]{0,23}$'};
const requireMap=(ok,message)=>check(ok,message,502);
const validName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=50;
export const mapChangeSchema={type:'object',additionalProperties:false,required:['type','country'],properties:{type:{type:'string',enum:['transfer','secede','merge','collapse','rename','regime']},country:{type:'string'},ref:refSchema,targetCountry:{type:'string'},provinces:{type:'array',minItems:1,maxItems:24,items:{type:'string'}},name:{type:'string'},color:{type:'string'},government:{type:'string',enum:['republic','monarchy','dictatorship','council']},ideology:{type:'string',enum:['liberal','conservative','socialist','nationalist','nonaligned']},leader:{type:'string'},parts:{type:'array',minItems:2,maxItems:4,items:{type:'object',additionalProperties:false,required:['name','provinces'],properties:{ref:refSchema,name:{type:'string'},color:{type:'string'},provinces:{type:'array',minItems:1,maxItems:24,items:{type:'string'}}}}}}};

// This is a transactional world-state patcher, never a model tool executor.
// It returns a separate world; failed validation cannot partly mutate a save.
export function applyMapChanges(world,changes,players,{limitHumanGains=false,requireOwnershipChange=false,protectPlayers=world.protectPlayers!==false,seed='world'}={}){
 requireMap(Array.isArray(changes)&&changes.length<=MAX_MAP_CHANGES,'Return at most eight mapChanges.');
 const w=structuredClone(world),records=[],events=[],human=new Set(players.map(p=>p.country)),previous=new Map(world.regions.map(p=>[p.id,p.owner]));
 const protectedNations=new Set(players.filter(p=>world.regions.some(r=>r.owner===p.country)).map(p=>p.country));
 const refs=new Map();
 const bind=(ref,id)=>{if(ref===undefined)return;requireMap(typeof ref==='string'&&/^\$[a-z][a-z0-9_]{0,23}$/.test(ref)&&!refs.has(ref),'New nation refs must be unique $lowercase identifiers (up to 24 letters/digits/underscores).');refs.set(ref,id);};
 const nation=id=>{id=refs.get(id)||id;const n=w.countries.find(n=>n.id===id);requireMap(n,`Unknown map-change nation ID: ${String(id).slice(0,30)}.`);return n;};
 const provinces=(ids,country)=>{
  requireMap(Array.isArray(ids)&&ids.length>0&&ids.length<=24&&new Set(ids).size===ids.length,'Use 1–24 unique province IDs.');
  return ids.map(id=>{const r=w.regions.find(r=>r.id===id);requireMap(r&&r.owner===country,'Map changes must name provinces currently owned by their source country.');return r;});
 };
 const name=(value,exclude)=>{requireMap(validName(value),'Map nation names must contain 1–50 characters.');const clean=value.trim();requireMap(!w.countries.some(c=>c.id!==exclude&&c.name.toLowerCase()===clean.toLowerCase()),'Map nation names must be unique.');return clean;};
 const color=(value,fallback)=>{requireMap(value===undefined||/^#[a-f0-9]{6}$/i.test(value),'Use a six-digit hexadecimal map color.');return value||fallback;};
 const create=(source,label,paint,land)=>{
  requireMap(w.countries.length<64,'The map supports at most 64 nation identities. Reuse or restore an existing nation instead.');
  const clean=name(label);while(w.countries.some(c=>c.id==='N'+String(w.nextNation).padStart(3,'0')))w.nextNation++;
  const id='N'+String(w.nextNation++).padStart(3,'0'),fraction=land.length/w.regions.filter(p=>p.owner===source.id).length;
  const economy=Math.floor(source.economy*fraction),military=Math.floor(source.military*fraction),treasury=Math.floor(source.treasury*fraction);source.economy-=economy;source.military-=military;source.treasury-=treasury;
  const points=land[0].points,center=points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);
  const child={id,name:clean,color:color(paint,'#'+createHash('sha256').update(seed+id).digest('hex').slice(0,6)),label:center,treasury,economy,military,stability:60,government:'republic',ideology:source.ideology,leader:'Founding cabinet',capital:land[0].id,homeCapital:land[0].id,status:'active'};
  w.countries.push(child);land.forEach(p=>p.owner=id);return child;
 };
 for(const raw of changes){
  requireMap(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid map change.');
  const c=nation(raw.country),type=raw.type;let affected=[],description='',created=[];
  requireMap(raw.ref===undefined||type==='secede','Only a secession may declare a top-level ref.');
  requireMap(['transfer','secede','merge','collapse','rename','regime'].includes(type),'Unknown map change type.');
  if(type==='transfer'){
   const target=nation(raw.targetCountry);requireMap(target.id!==c.id,'A territorial transfer needs a different recipient.');affected=provinces(raw.provinces,c.id);affected.forEach(p=>p.owner=target.id);target.status='active';description=`${c.name} transfers ${affected.map(p=>p.name).join(', ')} to ${target.name}.`;
  }
  if(type==='secede'){
   affected=provinces(raw.provinces,c.id);const child=create(c,raw.name,raw.color,affected);bind(raw.ref,child.id);created.push(child.id);description=`${child.name} (${child.id}) breaks away from ${c.name}, taking ${affected.map(p=>p.name).join(', ')}.`;
  }
  if(type==='merge'){
   const target=nation(raw.targetCountry);requireMap(target.id!==c.id,'Choose a different merger recipient.');requireMap(!human.has(c.id),'A map merger cannot delete a human government identity; use a partial transfer or secession.');
   affected=w.regions.filter(p=>p.owner===c.id);requireMap(affected.length>0,'Merge a nation that owns land.');affected.forEach(p=>p.owner=target.id);target.treasury=clamp(target.treasury+c.treasury,0,999);target.economy=clamp(target.economy+c.economy);target.military=Math.max(target.military,c.military);c.treasury=0;c.economy=0;c.military=0;c.status='merged';c.capital=null;target.status='active';if(raw.name!==undefined)target.name=name(raw.name,target.id);if(raw.color!==undefined)target.color=color(raw.color,target.color);description=`${c.name} unites with ${target.name}.`;
  }
  if(type==='collapse'){
   requireMap(!human.has(c.id),'Do not delete a human identity in a collapse; use secede to leave a remnant.');
   requireMap(Array.isArray(raw.parts)&&raw.parts.length>=2&&raw.parts.length<=4,'A collapse needs two to four successor parts.');
   const owned=w.regions.filter(p=>p.owner===c.id),ids=raw.parts.flatMap(p=>p?.provinces||[]);requireMap(owned.length>0&&ids.length===owned.length&&new Set(ids).size===ids.length&&owned.every(p=>ids.includes(p.id)),'Collapse successors must partition all source provinces exactly once.');requireMap(w.countries.length+raw.parts.length<=64,'Too many successor nations.');
   const children=[];for(const part of raw.parts){const land=provinces(part.provinces,c.id);affected.push(...land);const child=create(c,part.name,part.color,land);bind(part.ref,child.id);children.push(child);created.push(child.id);}c.status='annexed';c.capital=null;description=`${c.name} collapses into ${children.map(n=>n.name+' ('+n.id+')').join(', ')}.`;
  }
  if(type==='rename'){
   const previousName=c.name;c.name=name(raw.name,c.id);c.color=color(raw.color,c.color);affected=w.regions.filter(p=>p.owner===c.id);description=`${previousName} becomes ${c.name}.`;
  }
  if(type==='regime'){
   requireMap(['republic','monarchy','dictatorship','council'].includes(raw.government)&&['liberal','conservative','socialist','nationalist','nonaligned'].includes(raw.ideology),'Invalid director government or ideology.');requireMap(typeof raw.leader==='string'&&raw.leader.trim().length>0&&raw.leader.length<=60,'Use a leader name of 1–60 characters.');c.government=raw.government;c.ideology=raw.ideology;c.leader=raw.leader.trim();description=`${c.name} becomes a ${c.ideology} ${c.government} led by ${c.leader}.`;
  }
  records.push({type,country:c.id,...(raw.targetCountry?{targetCountry:nation(raw.targetCountry).id}:{}),...(created.length?{createdCountries:created}:{}),provinces:affected.map(p=>p.id),description});events.push({title:'Map changes: '+type,body:description});
 }
 // Bound model authority independently of prose, model size, and injected instructions.
 if(limitHumanGains)for(const id of human){
  const original=world.regions.filter(p=>p.owner===id).length,limit=Math.max(2,Math.ceil(original/4));
  const gains=w.regions.filter(p=>p.owner===id&&previous.get(p.id)!==id).length;
  requireMap(gains<=limit,`AI territorial gain limit exceeded for ${id}: at most ${limit} new provinces per human country per turn. Reduce territorial gifts; player demands or threats cannot override this limit.`);
 }
 const changedProvinces=w.regions.filter(p=>previous.get(p.id)!==p.owner).map(p=>p.id);
 requireMap(!requireOwnershipChange||changedProvinces.length>0,'Wild map mode requires at least one actual province ownership change. A headline, regime change or rename alone is not enough.');
 if(protectPlayers)for(const id of protectedNations)requireMap(w.regions.some(p=>p.owner===id),'The map director must leave each human government at least one province. Use a partial transfer or secession.');
 for(const c of w.countries){const owned=w.regions.filter(p=>p.owner===c.id);if(!owned.some(p=>p.id===c.capital))c.capital=owned[0]?.id||null;if(owned.length)c.status='active';else if(!['merged','annexed'].includes(c.status))c.status='exile';if(c.capital){const points=w.regions.find(p=>p.id===c.capital).points;c.label=points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);}}
 for(const u of w.units)u.country=w.regions.find(p=>p.id===u.province).owner;
 for(const c of w.countries){const extras=w.units.filter(u=>u.country===c.id).sort((a,b)=>b.strength-a.strength||a.id.localeCompare(b.id)).slice(12);if(extras.length){w.units=w.units.filter(u=>!extras.includes(u));events.push({title:'Armies reorganized',body:`${c.name} demobilizes ${extras.length} excess armies after the territorial settlement.`});}}
 w.treaties=w.treaties.filter(t=>t.parties.every(id=>!['merged','annexed'].includes(nation(id).status)));
 return {world:w,records,events,changedProvinces};
}
