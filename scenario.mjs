import fs from 'node:fs';
const geography=JSON.parse(fs.readFileSync(new URL('./data-maps/europe-interwar.json',import.meta.url),'utf8'));
// Legacy sketches retained only to recognize and upgrade existing default saves.
export const countries = [
  ['GB','United Kingdom','#c2945e',[-3,55]],['FR','France','#6d95b7',[2,47]],
  ['DE','Germany','#b77b78',[10,51]],['IT','Italy','#7eaa8c',[12,43]],
  ['ES','Spain','#d0aa5e',[-4,40]],['PT','Portugal','#729e9a',[-8,39]],
  ['IE','Ireland','#96ae72',[-8,53]],['BE','Belgium','#a48eb4',[4.5,50.7]],
  ['NL','Netherlands','#ce9871',[5,52.3]],['CH','Switzerland','#bf8c9c',[8,46.6]],
  ['AT','Austria','#c5b398',[14,47.5]],['PL','Poland','#c28798',[20,52]],
  ['CZ','Czechoslovakia','#999dc2',[16,49]],['HU','Hungary','#a2aa77',[19,47]],
  ['RO','Romania','#b8a465',[25,46]],['YU','Yugoslavia','#8aa9b5',[19,43]],
  ['GR','Greece','#83b1bf',[23,39]],['BG','Bulgaria','#b0b886',[25,42.5]],
  ['TR','Turkey','#b78061',[32,39]],['SU','Soviet Union','#a76f69',[36,55]],
  ['SE','Sweden','#a0afbb',[16,62]],['NO','Norway','#aeb9a0',[8,63]],
  ['FI','Finland','#9baca7',[27,65]],['DK','Denmark','#b58c9d',[9,56]],
  ['EE','Estonia','#a3adb9',[25.5,59]],['LV','Latvia','#a9a17e',[25,57]],
  ['LT','Lithuania','#a2b89c',[24,55.5]],['AL','Albania','#bd9582',[20,41]]
].map(([id,name,color,label])=>({id,name,color,label,treasury:65,economy:40,military:35,stability:70}));
const shape = (id, name, owner, points, neighbors) => ({id,name,owner,points:points.split(' ').map(p=>p.split(',').map(Number)),neighbors:neighbors.split(' ')});
export const regions = [
shape('britain','Great Britain','GB','-6,50 -5,54 -6,58 -3,59 0,57 -1,54 2,52 0,51','ireland france'),
shape('ireland','Ireland','IE','-10,51.5 -10.5,54 -8,55.5 -6,54 -6,52','britain'),
shape('france','France','FR','-5,48.5 -2,48 0,50 2.5,51 5,50 8,49 7.5,47.5 6,46 7,44 3,42.5 0,43 -1.5,46','britain belgium germany swiss italy spain'),
shape('spain','Spain','ES','-9,43 -2,43.5 0,43 3,42.5 0,40 -1,38 -5,36 -7.5,37 -7,39.5 -9,42','portugal france'),
shape('portugal','Portugal','PT','-9,42 -7,42 -7,39.5 -7.5,37 -9,37 -9.5,39','spain'),
shape('belgium','Belgium','BE','2.5,51 3.5,51.5 5.5,51.5 6,50 5,50','france netherlands germany'),
shape('netherlands','Netherlands','NL','3.5,51.5 4,53 6.5,53.5 7,53 6,51.5','belgium germany'),
shape('germany','Germany','DE','6,50 6,51.5 7,53 8.5,54 10,54.5 12,54.5 14.5,54 15,51 12.5,50 12,48 10,47.5 8,47.5 8,49','france belgium netherlands denmark poland czech austria swiss'),
shape('swiss','Switzerland','CH','6,46 7.5,47.5 10,47.5 10.5,46.5 9,46 7,46','france germany austria italy'),
shape('italy','Italy','IT','7,44 7,46 9,46 10.5,46.5 12.5,46.5 13.5,45.5 12,44.5 13,43 16,41.5 18,40 17,39 16,40 16,38 15,38 14,40 12,42 10,44','france swiss austria yugoslavia'),
shape('austria','Austria','AT','10,47.5 12,48 13.5,48.5 16,48.7 17,48 16,46.5 13.5,46.5 12.5,46.5 10.5,46.5','germany swiss italy czech hungary yugoslavia'),
shape('czech','Czechoslovakia','CZ','12.5,50 15,51 16,50.5 18,50 19,49.5 22.5,49 22,48 19,48 17,48 16,48.7 13.5,48.5','germany poland austria hungary romania'),
shape('poland','Poland','PL','14.5,54 18,54.5 21,55 24,54 27,53 27,51 24,50 22.5,49 19,49.5 18,50 16,50.5 15,51','germany czech romania soviet lithuania'),
shape('hungary','Hungary','HU','17,48 19,48 22,48 23,47 21,46 18,45.8 16,46.5','austria czech romania yugoslavia'),
shape('romania','Romania','RO','22,48 22.5,49 24,50 27,49 29.5,46 29,44 27,44 25,43.8 22,44.5 21,46 23,47','czech poland hungary yugoslavia bulgaria soviet'),
shape('yugoslavia','Yugoslavia','YU','13.5,45.5 13.5,46.5 16,46.5 18,45.8 21,46 22,44.5 22.5,42 21,41 20,42 19,42 17,43 15,44','italy austria hungary romania bulgaria greece albania'),
shape('albania','Albania','AL','19,42 20,42 21,41 20.5,39.5 19.5,40','yugoslavia greece'),
shape('greece','Greece','GR','20.5,39.5 21,41 22.5,42 24,41.5 26,41 26,40.5 24,40 23,39 24,38 23,37 22,36.5 21,38','albania yugoslavia bulgaria turkey'),
shape('bulgaria','Bulgaria','BG','22,44.5 25,43.8 27,44 28,43 27,42 26,41 24,41.5 22.5,42','romania yugoslavia greece turkey'),
shape('turkey','Turkey','TR','26,41 27,42 29,41 33,42 37,41 41,41 44,40 44,37 40,37 36,36 33,36 29,36.5 27,38 26,40.5','greece bulgaria soviet'),
shape('soviet','Soviet Union','SU','29.5,46 27,49 27,51 27,53 28,56 28,59 30,60 31,63 29,66 29,69 35,70 44,68 44,40 41,41 37,41 33,42 29,41 30,44','poland romania turkey estonia latvia finland'),
shape('denmark','Denmark','DK','8,54.5 8,56.5 10,57.7 10.5,56 10,54.5','germany sweden'),
shape('norway','Norway','NO','5,58 4.5,61 6,63 10,65 14,67 18,69 23,71 29,71 29,69 25,69 21,68 18,66 15,64 13,61 12,59 10,58','sweden finland'),
shape('sweden','Sweden','SE','12,55.5 11,58 12,59 13,61 15,64 18,66 21,68 25,69 24,66 22,65 21,63 19,61 18,59 16,58 15,56','norway finland denmark'),
shape('finland','Finland','FI','24,66 25,69 29,69 29,66 31,63 30,60 27,60 24,60 22,63 22,65','norway sweden soviet'),
shape('estonia','Estonia','EE','24,59.5 28,59 28,58 25,57.5 23,58','soviet latvia'),
shape('latvia','Latvia','LV','23,58 25,57.5 28,58 28,56 26,55.5 23,56 21,56.5 21,57.5','estonia lithuania soviet'),
shape('lithuania','Lithuania','LT','21,56.5 23,56 26,55.5 24,54 21,55','latvia poland')
];
// Normalize adjacency to a symmetric graph.
for (const r of regions) for(const id of r.neighbors) { const n=regions.find(x=>x.id===id); if(n&&!n.neighbors.includes(r.id))n.neighbors.push(r.id); }
export function scenario() {
 const cs=structuredClone(countries);
 for (const c of cs) { if(['GB','FR','DE','SU'].includes(c.id)){c.economy=65;c.military=60;c.treasury=90;} if(['IT','ES','PL','TR'].includes(c.id)){c.economy=50;c.military=45;} }
 return expandWorld({name:'Europe · 1936',date:'1936-01-01',premise:'An alternate-history sandbox beginning in January 1936. Historical conditions matter, but outcomes after the start date are not predetermined. Countries act in their own interests. Respect time, logistics, limited resources and player sovereignty.',countries:cs,regions:structuredClone(regions)});
}

// Gameplay sectors retain stable IDs; their outlines now follow geographic data.
function clipX(points, boundary, keepRight) {
 const result=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],inside=p=>keepRight?p[0]>=boundary:p[0]<=boundary;
  if(inside(a))result.push(a);
  if(inside(a)!==inside(b)){const t=(boundary-a[0])/(b[0]-a[0]);result.push([boundary,a[1]+t*(b[1]-a[1])]);}
 }
 return result;
}
function expandWorld(world,geographic=true){
 const old=world.regions,next=[];
 for(const r of old){
  const xs=r.points.map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs),a=min+(max-min)/3,b=min+2*(max-min)/3;
  const pieces=[clipX(clipX(r.points,a,true),b,false),clipX(r.points,a,false),clipX(r.points,b,true)];
  pieces.forEach((points,i)=>next.push({id:r.owner+i,name:r.name+[' · Central',' · West',' · East'][i],owner:r.owner,points,neighbors:i===0?[r.owner+'1',r.owner+'2',...r.neighbors.map(id=>old.find(n=>n.id===id).owner+'0')]:[r.owner+'0']}));
 }
 world.regions=next;world.version=4;world.mapMode='wild';world.protectPlayers=true;world.name='Europe · 1936 · Province sandbox';world.treaties=[];world.nextNation=1;world.nextUnit=29;
 const republics=new Set(['FR','IE','CH','PT','CZ','AT','PL','TR','EE','LV','LT']);
 world.countries.forEach(c=>{c.government=['DE','IT','PT'].includes(c.id)?'dictatorship':c.id==='SU'?'council':republics.has(c.id)?'republic':'monarchy';c.ideology=c.id==='SU'?'socialist':['DE','IT'].includes(c.id)?'nationalist':'conservative';c.leader='National cabinet';c.capital=c.id+'0';c.homeCapital=c.capital;c.status='active';});
 world.units=world.countries.map((c,i)=>({id:'U'+(i+1),country:c.id,name:c.name+' Army',province:c.capital,strength:30}));
 if(geographic)for(const r of world.regions)Object.assign(r,structuredClone(geography[r.owner][Number(r.id.slice(-1))]));
 return world;
}

// Upgrade only the untouched legacy default geometry. Custom maps are left alone;
// ownership, nation identities, orders, units and province routes are preserved.
export function upgradeDefaultGeography(world){
 const legacy=expandWorld({countries:structuredClone(countries),regions:structuredClone(regions)},false);
 if(world.regions?.length!==legacy.regions.length||!legacy.regions.every(r=>JSON.stringify(world.regions.find(p=>p.id===r.id)?.points)===JSON.stringify(r.points)))return false;
 for(const r of world.regions)Object.assign(r,structuredClone(geography[r.id.slice(0,-1)][Number(r.id.slice(-1))]));
 return true;
}
