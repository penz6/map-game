import { createHash } from 'node:crypto';
import { check, clamp } from './rules.mjs';
export const costs={invest:15,mobilize:15,stabilize:10,policy:5,recruit:20,move:0,attack:10,government:10,rename:5,release:20,cede:0,annex:15,merge:10,treaty:5,breakTreaty:5};
export const governments=['republic','monarchy','dictatorship','council'];
export const ideologies=['liberal','conservative','socialist','nationalist','nonaligned'];
const short=(s,max,label)=>{check(typeof s==='string'&&s.trim().length>0&&s.length<=max,`${label} must contain 1–${max} characters.`);return s.trim();};
export function validateOrders(room,player,orders,{max=3}={}){
 const w=room.world,c=w.countries.find(c=>c.id===player.country);check(c&&!['annexed','merged'].includes(c.status),'This nation is no longer active.');
 check(Array.isArray(orders)&&orders.length<=max,`Submit up to ${max} orders.`);
 const units=new Set(),regions=new Set(),politics=new Set();let total=0,recruits=0,releases=0;
 const clean=orders.map(o=>{
  check(o&&Object.hasOwn(costs,o.type),'Unknown order type.');total+=costs[o.type];const out={type:o.type};
  const target=w.regions.find(r=>r.id===o.target),other=w.countries.find(n=>n.id===o.targetCountry);
  if(o.type==='policy')out.text=short(o.text,2000,'Policy');
  if(['move','attack'].includes(o.type)){
   const u=w.units.find(u=>u.id===o.unit&&u.country===c.id);check(u,'Choose one of your armies.');check(!units.has(u.id),'An army can receive only one movement or attack order per turn.');units.add(u.id);
   check(target&&w.regions.find(r=>r.id===u.province)?.neighbors.includes(target.id),'Army movement requires a neighboring province or listed sea route.');
   check(o.type!=='attack'||!w.treaties.some(t=>t.until>=room.round&&t.parties.includes(c.id)&&t.parties.includes(target.owner)&&['nonaggression','alliance'].includes(t.kind)),'A nonaggression or alliance treaty blocks this attack. Break it in a prior turn.');
   check(o.type==='move'?target.owner===c.id:target.owner!==c.id,o.type==='move'?'Move only into your own provinces; use attack for foreign land.':'Choose a foreign province.');out.unit=u.id;out.target=target.id;
  }
  if(o.type==='recruit'){check(target?.owner===c.id,'Recruit in a province you own.');check(w.units.filter(u=>u.country===c.id).length+(++recruits)<=12,'A nation may have at most 12 armies.');out.target=target.id;out.name=typeof o.name==='string'&&o.name.trim()?short(o.name,60,'Army name'):c.name+' Army';}
  if(['release','cede'].includes(o.type)){
   check(target?.owner===c.id,'You can transfer only your own province.');check(!regions.has(target.id),'A province can have only one political transfer order.');regions.add(target.id);out.target=target.id;
   if(o.type==='release'){check(w.regions.filter(r=>r.owner===c.id).length>1&&target.id!==c.capital,'Release a non-capital province while retaining your capital.');check(w.countries.length+(++releases)<=64,'The scenario supports up to 64 nations.');out.name=short(o.name,50,'New nation name');check(!w.countries.some(n=>n.name.toLowerCase()===out.name.toLowerCase()),'A nation already uses that name.');}
   else {check(other&&other.id!==c.id&&!['annexed','merged'].includes(other.status),'Choose an active recipient nation.');out.targetCountry=other.id;}
  }
  if(['treaty','breakTreaty'].includes(o.type)){check(other&&other.id!==c.id&&!['merged','annexed'].includes(other.status),'Choose an active treaty partner.');out.targetCountry=other.id;if(o.type==='treaty'){check(['trade','nonaggression','alliance'].includes(o.terms),'Choose valid treaty terms.');out.terms=o.terms;}}
  if(['government','rename','annex','merge'].includes(o.type)){
   check(!politics.has(o.type),'Do not duplicate the same political order.');politics.add(o.type);
   if(o.type==='rename'){out.name=short(o.name,50,'Nation name');check(!w.countries.some(n=>n.id!==c.id&&n.name.toLowerCase()===out.name.toLowerCase()),'A nation already uses that name.');}
   if(o.type==='government'){check(governments.includes(o.government)&&ideologies.includes(o.ideology),'Choose a valid government and ideology.');out.government=o.government;out.ideology=o.ideology;out.leader=short(o.leader,60,'Leader');}
   if(['annex','merge'].includes(o.type)){
    check(other&&other.id!==c.id&&!['annexed','merged'].includes(other.status),'Choose another active nation.');out.targetCountry=other.id;
    if(o.type==='annex'){check(!room.players.some(p=>p.country===other.id),'Human-controlled nations cannot be removed by an annex order.');check(!w.regions.some(r=>r.owner===other.id)&&w.regions.some(r=>r.id===other.homeCapital&&r.owner===c.id),'Annex only a landless NPC after controlling its original capital.');}
   }
  }
  return out;
 });
 check(w.units.length+recruits<=256,'The world supports at most 256 armies.');
 check(!(politics.has('merge')&&clean.some(o=>['release','cede','annex'].includes(o.type))),'Do not combine unification with territorial political orders.');
 check(total<=c.treasury,`These orders cost ${total}; your treasury has ${c.treasury}.`);return clean;
}
export function resolveTurn(room,ai){
 const result=structuredClone(room),w=result.world,byId=id=>w.countries.find(c=>c.id===id),province=id=>w.regions.find(r=>r.id===id),events=[];
 const all=[...result.players.flatMap(p=>p.orders.map(o=>({country:p.country,...o}))),...ai.policies.flatMap(p=>(p.actions||[]).map(o=>({country:result.players.find(x=>x.id===p.playerId).country,...o}))),...ai.npcOrders].sort((a,b)=>a.country.localeCompare(b.country)||a.type.localeCompare(b.type)||String(a.unit||a.target||'').localeCompare(String(b.unit||b.target||'')));
 const event=(title,body)=>events.push({title,body});
 for(const o of all){
  const c=byId(o.country);c.treasury-=costs[o.type];
  if(o.type==='invest')c.economy=clamp(c.economy+6);
  if(o.type==='mobilize'){c.military=clamp(c.military+8);c.stability=clamp(c.stability-2);}
  if(o.type==='stabilize')c.stability=clamp(c.stability+10);
  if(o.type==='recruit'){if(w.units.length>=256||w.units.filter(u=>u.country===c.id).length>=12){c.treasury+=costs.recruit;event(c.name+': recruitment postponed','Army capacity was reached; cost refunded.');continue;}while(w.units.some(u=>u.id==='U'+w.nextUnit))w.nextUnit++;const id='U'+w.nextUnit++;w.units.push({id,country:c.id,name:o.name,province:o.target,strength:30});event(c.name+': army recruited',`${o.name} (${id}) forms in ${province(o.target).name}.`);}
  if(['invest','mobilize','stabilize'].includes(o.type))event(c.name+': '+o.type,`National development: ${o.type}. Treasury −${costs[o.type]}.`);
 }
 for(const p of ai.policies){const c=byId(result.players.find(x=>x.id===p.playerId).country);for(const k of ['treasury','economy','military','stability'])c[k]=clamp(c[k]+p[k],0,k==='treasury'?999:100);event(c.name+': policy outcome',p.outcome);}
 const moved=all.filter(o=>o.type==='move');for(const o of moved){const u=w.units.find(u=>u.id===o.unit);u.province=o.target;event(byId(o.country).name+': army moves',`${u.name} moves to ${province(o.target).name}.`);}
 const attacks=all.filter(o=>o.type==='attack');
 const hostile=new Set(attacks.map(o=>[o.country,province(o.target).owner].sort().join(':')));w.treaties=w.treaties.filter(t=>!hostile.has(t.parties.slice().sort().join(':')));
 const committed=new Set(attacks.map(o=>o.unit));
 const snapshot=structuredClone(w.units),losses=new Map(),wins=new Map(),success=new Set();
 for(const targetId of [...new Set(attacks.map(o=>o.target))].sort()){
  const target=province(targetId),defenders=snapshot.filter(u=>u.province===targetId&&u.country===target.owner&&!committed.has(u.id));
  const allied=w.treaties.filter(t=>t.kind==='alliance'&&t.until>=room.round&&t.parties.includes(target.owner)).length;
  const defense=8+Math.min(9,allied*3)+defenders.reduce((s,u)=>s+u.strength,0)*(0.5+byId(target.owner).military/100)*1.1;
  const candidates=[];
  for(const country of [...new Set(attacks.filter(o=>o.target===targetId).map(o=>o.country))].sort()){
   const orders=attacks.filter(o=>o.target===targetId&&o.country===country),army=orders.map(o=>snapshot.find(u=>u.id===o.unit));
   const random=createHash('sha256').update(`${room.id}:${room.round}:${country}:${targetId}`).digest().readUInt32BE()/4294967295;
   const power=army.reduce((s,u)=>s+u.strength,0)*(0.5+byId(country).military/100)*(0.9+random*0.2);
   army.forEach(u=>losses.set(u.id,Math.ceil(u.strength*0.25)));candidates.push({country,power,orders});
  }
  candidates.sort((a,b)=>b.power-a.power||a.country.localeCompare(b.country));
  defenders.forEach(u=>losses.set(u.id,Math.ceil(u.strength*0.3)));
  const winner=candidates[0];if(winner.power>defense){wins.set(targetId,winner.country);winner.orders.forEach(o=>success.add(o.unit));}
  event('Battle for '+target.name,`${candidates.map(a=>byId(a.country).name).join(', ')} attack. ${winner.power>defense?byId(winner.country).name+' takes control.':byId(target.owner).name+' holds.'} Attacking armies lose 25% strength; local defending armies lose 30%.`);
 }
 for(const [id,owner]of wins)province(id).owner=owner;
 for(const u of w.units)u.strength-=losses.get(u.id)||0;
 for(const o of attacks)if(success.has(o.unit))w.units.find(u=>u.id===o.unit).province=o.target;
 for(const u of w.units){if(province(u.province).owner!==u.country){const retreat=province(u.province).neighbors.filter(id=>province(id).owner===u.country).sort()[0];if(retreat)u.province=retreat;else u.strength=0;}}
 w.units=w.units.filter(u=>u.strength>0);
 const usedPolitical=new Set();
 for(const o of all.filter(o=>['government','rename','release','cede','annex','merge'].includes(o.type))){
  if(o.type==='merge'&&usedPolitical.has([o.country,o.targetCountry].sort().join(':')))continue;
  const c=byId(o.country);const refund=reason=>{c.treasury+=costs[o.type];event(c.name+': order not completed',reason+' Cost refunded.');};
  if(['annexed','merged'].includes(c.status)){refund('The issuing nation no longer exists.');continue;}
  if(o.type==='government'){c.government=o.government;c.ideology=o.ideology;c.leader=o.leader;c.stability=clamp(c.stability-5);event(c.name+': government changed',`${c.leader} leads a ${c.ideology} ${c.government}. Stability −5.`);}
  if(o.type==='rename'){if(w.countries.some(n=>n.id!==c.id&&n.name.toLowerCase()===o.name.toLowerCase())){refund('That name is now in use.');continue;}const old=c.name;c.name=o.name;event('Nation renamed',`${old} becomes ${c.name}. Its stable identity and ownership are unchanged.`);}
  if(['release','cede'].includes(o.type)){
   const r=province(o.target);if(r.owner!==c.id){refund('Control of the province changed during combat.');continue;}
   if(o.type==='release'){
    if(r.id===c.capital||w.regions.filter(p=>p.owner===c.id).length<2||w.countries.length>=64||w.countries.some(n=>n.name.toLowerCase()===o.name.toLowerCase())){refund('The release conditions no longer hold.');continue;}
    while(w.countries.some(n=>n.id==='N'+String(w.nextNation).padStart(3,'0')))w.nextNation++;
    const id='N'+String(w.nextNation++).padStart(3,'0'),economy=Math.floor(c.economy*0.2),military=Math.floor(c.military*0.2);c.economy-=economy;c.military-=military;
    const center=r.points.reduce((p,q)=>[p[0]+q[0]/r.points.length,p[1]+q[1]/r.points.length],[0,0]);
    w.countries.push({id,name:o.name,color:'#'+createHash('sha256').update(id+room.id).digest('hex').slice(0,6),label:center,treasury:20,economy,military,stability:60,government:'republic',ideology:c.ideology,leader:'Interim cabinet',capital:r.id,homeCapital:r.id,status:'active'});
    r.owner=id;for(const u of w.units)if(u.province===r.id&&u.country===c.id)u.country=id;
    event('New nation: '+o.name,`${o.name} becomes independent in ${r.name}; local armies transfer allegiance.`);
   }else{const recipient=byId(o.targetCountry);if(['merged','annexed'].includes(recipient.status)){refund('The recipient no longer exists.');continue;}r.owner=recipient.id;for(const u of w.units)if(u.province===r.id&&u.country===c.id)u.country=recipient.id;event('Territorial cession',`${c.name} transfers ${r.name} and local armies to ${recipient.name}.`);}
  }
  if(o.type==='annex'){const other=byId(o.targetCountry);if(w.regions.some(r=>r.owner===other.id)||!w.regions.some(r=>r.id===other.homeCapital&&r.owner===c.id)){refund('Annexation conditions changed.');continue;}other.status='annexed';other.capital=null;event('Nation annexed',`${c.name} formally annexes the defeated ${other.name}.`);}
  if(o.type==='merge'){
   const pair=[c.id,o.targetCountry].sort().join(':');if(usedPolitical.has(pair))continue;
   const matching=all.find(x=>x.type==='merge'&&x.country===o.targetCountry&&x.targetCountry===c.id);
   if(!matching){refund('The other nation did not submit reciprocal unification consent.');continue;}
   const humans=result.players.filter(p=>[c.id,o.targetCountry].includes(p.country));if(humans.length>1){refund('Two human governments cannot occupy the same seat.');continue;}
   const survivor=humans[0]?.country||[c.id,o.targetCountry].sort()[0],absorbed=survivor===c.id?o.targetCountry:c.id,a=byId(survivor),b=byId(absorbed);
   if(['merged','annexed'].includes(b.status)||['merged','annexed'].includes(a.status)){refund('One party is no longer active.');continue;}
   usedPolitical.add(pair);w.regions.filter(r=>r.owner===b.id).forEach(r=>r.owner=a.id);w.units.filter(u=>u.country===b.id).forEach(u=>u.country=a.id);a.treasury=clamp(a.treasury+b.treasury,0,999);b.treasury=0;a.economy=clamp(a.economy+b.economy);a.military=Math.max(a.military,b.military);b.status='merged';b.capital=null;event('Nations unified',`${b.name} joins ${a.name} after reciprocal consent.`);
  }
 }
 const broken=new Set();
 for(const o of all.filter(o=>o.type==='breakTreaty')){const pair=[o.country,o.targetCountry].sort().join(':');broken.add(pair);w.treaties=w.treaties.filter(t=>![o.country,o.targetCountry].every(id=>t.parties.includes(id)));byId(o.country).stability=clamp(byId(o.country).stability-8);event('Treaty broken',`${byId(o.country).name} ends treaties with ${byId(o.targetCountry).name}. Stability −8.`);}
 for(const o of all.filter(o=>o.type==='treaty')){
  const pair=[o.country,o.targetCountry].sort().join(':'),reciprocal=all.find(x=>x.type==='treaty'&&x.country===o.targetCountry&&x.targetCountry===o.country&&x.terms===o.terms);
  if(broken.has(pair)||!reciprocal||[o.country,o.targetCountry].some(id=>['annexed','merged'].includes(byId(id).status))){byId(o.country).treasury+=costs.treaty;event('Treaty not concluded','Reciprocal consent was absent or revoked; cost refunded.');continue;}
  if(!w.treaties.some(t=>t.parties.every(id=>[o.country,o.targetCountry].includes(id))&&t.kind===o.terms&&t.until>=room.round)){w.treaties.push({parties:[o.country,o.targetCountry].sort(),kind:o.terms,until:room.round+12});event('Treaty concluded',`${byId(o.country).name} and ${byId(o.targetCountry).name}: ${o.terms}, valid for 12 further turns.`);}
 }
 w.treaties=w.treaties.filter(t=>t.until>=room.round&&t.parties.every(id=>!['annexed','merged'].includes(byId(id).status)));
 for(const c of w.countries){if(w.regions.some(r=>r.owner===c.id))c.treasury+=w.treaties.filter(t=>t.kind==='trade'&&t.parties.includes(c.id)&&t.parties.every(id=>w.regions.some(r=>r.owner===id))).length*3;}
 for(const c of w.countries){const owned=w.regions.filter(r=>r.owner===c.id);if(!owned.some(r=>r.id===c.capital))c.capital=owned[0]?.id||null;if(!['merged','annexed'].includes(c.status))c.status=owned.length?'active':'exile';c.treasury=clamp(c.treasury+(owned.length?Math.max(2,Math.round(c.economy/5)):0),0,999);}
 // A transferred army above the recipient's limit is demobilized deterministically.
 for(const c of w.countries){const excess=w.units.filter(u=>u.country===c.id).sort((a,b)=>b.strength-a.strength||a.id.localeCompare(b.id)).slice(12);w.units=w.units.filter(u=>!excess.includes(u));}
 const d=new Date(w.date+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+room.months);w.date=d.toISOString().slice(0,10);result.round++;
 result.history.push({round:room.round,date:w.date,events:[...ai.events,...events],orders:room.players.map(p=>({name:p.name,country:p.country,orders:p.orders}))});for(const p of result.players){p.orders=[];p.ready=false;}result.phase='planning';result.error=null;return result;
}
