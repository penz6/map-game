import { check } from './rules.mjs';
import { governments,ideologies } from './strategy.mjs';
export function validateScenario(input,players){
 check(input&&typeof input==='object'&&!Array.isArray(input),'Provide a scenario object.');
 const text=(s,max,label)=>{check(typeof s==='string'&&s.trim().length>0&&s.length<=max,`Invalid ${label}.`);return s.trim();};
 const number=(n,min,max,label)=>{check(Number.isFinite(n)&&n>=min&&n<=max,`Invalid ${label}.`);return n;};
 const integer=(n,min,max,label)=>{number(n,min,max,label);check(Number.isInteger(n),`Invalid ${label}.`);return n;};
 const id=(s,max=40)=>{check(typeof s==='string'&&new RegExp('^[A-Za-z][A-Za-z0-9_-]{0,'+(max-1)+'}$').test(s),'Invalid stable ID.');return s;};
 check(Array.isArray(input.countries)&&input.countries.length>=2&&input.countries.length<=64,'Provide 2–64 nations.');
 check(Array.isArray(input.regions)&&input.regions.length>=2&&input.regions.length<=512,'Provide 2–512 provinces.');
 check(Array.isArray(input.units)&&input.units.length<=256,'Provide at most 256 armies.');
 const countries=input.countries.map(c=>({id:id(c.id,8),name:text(c.name,50,'nation name'),color:(check(/^#[0-9a-f]{6}$/i.test(c.color),'Use a hexadecimal nation color.'),c.color),label:[number(c.label?.[0],-180,180,'longitude'),number(c.label?.[1],-90,90,'latitude')],treasury:integer(c.treasury,0,999,'treasury'),economy:integer(c.economy,0,100,'economy'),military:integer(c.military,0,100,'military'),stability:integer(c.stability,0,100,'stability'),government:(check(governments.includes(c.government),'Invalid government.'),c.government),ideology:(check(ideologies.includes(c.ideology),'Invalid ideology.'),c.ideology),leader:text(c.leader,60,'leader'),capital:c.capital===null?null:id(c.capital),homeCapital:id(c.homeCapital||c.capital),status:'active'}));
 const countryIds=new Set(countries.map(c=>c.id));check(countryIds.size===countries.length,'Nation IDs must be unique.');check(new Set(countries.map(c=>c.name.toLowerCase())).size===countries.length,'Nation names must be unique.');
 const ring=points=>{
  check(Array.isArray(points)&&points.length>=3&&points.length<=512,'A polygon ring needs 3–512 points.');
  const result=points.map(p=>[number(p?.[0],-180,180,'longitude'),number(p?.[1],-90,90,'latitude')]);
  const area=Math.abs(result.reduce((sum,p,i)=>{const q=result[(i+1)%result.length];return sum+p[0]*q[1]-q[0]*p[1];},0));
  check(area>1e-8,'Province polygons need a non-zero area.');return result;
 };
 const regions=input.regions.map(r=>{
  check(Array.isArray(r.neighbors)&&r.neighbors.length<=64,'Invalid province adjacency.');check(countryIds.has(r.owner),'Every province must have an existing owner.');
  const points=ring(r.points),region={id:id(r.id),name:text(r.name,80,'province name'),owner:r.owner,points,neighbors:[...new Set(r.neighbors.map(x=>id(x)))]};
  if(r.polygons!==undefined){
   check(Array.isArray(r.polygons)&&r.polygons.length>=1&&r.polygons.length<=128,'Provide 1–128 polygon components.');
   let vertices=0;
   region.polygons=r.polygons.map(p=>{check(Array.isArray(p)&&p.length>=1&&p.length<=16,'A polygon needs an outer ring and at most 15 holes.');return p.map(p=>{const result=ring(p);vertices+=result.length;check(vertices<=4096,'A province has too many polygon points.');return result;});});
   check(JSON.stringify(region.polygons[0][0])===JSON.stringify(points),'Province points must match its first polygon ring.');
  }
  return region;
 });
 const regionIds=new Set(regions.map(r=>r.id));check(regionIds.size===regions.length,'Province IDs must be unique.');for(const r of regions)for(const n of r.neighbors)check(n!==r.id&&regions.find(p=>p.id===n)?.neighbors.includes(r.id),'Province routes must reference existing provinces and be symmetric.');
 for(const c of countries){check(regionIds.has(c.homeCapital),'Original capital must reference a province.');const owned=regions.filter(r=>r.owner===c.id);check(c.capital===null&&!owned.length||owned.some(r=>r.id===c.capital),'A capital must be in its own nation.');c.status=owned.length?'active':'exile';}
 const units=input.units.map(u=>{check(countryIds.has(u.country),'Army owner does not exist.');check(regions.some(r=>r.id===u.province&&r.owner===u.country),'Army must be located in an owned province.');return{id:id(u.id,16),name:text(u.name,60,'army name'),country:u.country,province:u.province,strength:integer(u.strength,1,100,'army strength')};});
 check(new Set(units.map(u=>u.id)).size===units.length,'Army IDs must be unique.');for(const c of countries)check(units.filter(u=>u.country===c.id).length<=12,'At most 12 armies per nation.');
 for(const p of players)check(countryIds.has(p.country)&&regions.some(r=>r.owner===p.country),'Keep every seated human nation and at least one of its provinces.');
 const date=text(input.date,10,'start date');check(/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date,'Use a real YYYY-MM-DD date.');
 check(input.mapMode===undefined||['wild','strategy'].includes(input.mapMode),'Invalid map mode.');check(input.protectPlayers===undefined||typeof input.protectPlayers==='boolean','Invalid human map protection.');
 check(input.mapScope===undefined||['world','europe'].includes(input.mapScope),'Invalid map scope.');
 let neutralPolygons;
 if(input.neutralPolygons!==undefined){
  check(Array.isArray(input.neutralPolygons)&&input.neutralPolygons.length<=128,'Too many neutral polygons.');let vertices=0;
  neutralPolygons=input.neutralPolygons.map(p=>{check(Array.isArray(p)&&p.length>=1&&p.length<=16,'Invalid neutral polygon.');return p.map(p=>{const result=ring(p);vertices+=result.length;check(vertices<=8192,'Too many neutral polygon points.');return result;});});
 }
 return {version:4,...(input.mapScope?{mapScope:input.mapScope}:{}),...(neutralPolygons?{neutralPolygons}:{}),mapMode:input.mapMode||'wild',protectPlayers:input.protectPlayers!==false,name:text(input.name,100,'scenario name'),date,premise:text(input.premise,10000,'scenario premise'),countries,regions,units,treaties:[],nextNation:1,nextUnit:Math.max(0,...units.map(u=>/^U\d+$/.test(u.id)?Number(u.id.slice(1)):0))+1};
}
