// Pure geographic data adapters. Ownership comes from the live campaign, never basemap borders.
const closed=polygons=>polygons.map(p=>p.map(r=>{const first=r[0],last=r.at(-1);return first&&last&&(first[0]!==last[0]||first[1]!==last[1])?[...r,first]:r;}));
export const featureCollection=features=>({type:'FeatureCollection',features});
export function geometryFingerprint(polygons){
 const text=polygons.map(p=>p.map(r=>r.flatMap(point=>point.map(v=>(v===0?0:v).toFixed(5))).join(',')).join(';')).join('|');let result=2166136261;
 for(let i=0;i<text.length;i++)result=Math.imul(result^text.charCodeAt(i),16777619)>>>0;return result.toString(16).padStart(8,'0');
}
const regionCoordinates=(r,meshes)=>{const source=r.polygons||[[r.points]],mesh=meshes?.get(r.id);return mesh&&mesh.properties.sourceHash===geometryFingerprint(source)?mesh.geometry.coordinates:source;};
export function atlasRegions(world,meshes){return featureCollection(world.regions.map(r=>({type:'Feature',id:r.id,properties:{id:r.id,name:r.name,owner:r.owner,color:world.countries.find(c=>c.id===r.owner)?.color||'#b8b5a1'},geometry:{type:'MultiPolygon',coordinates:closed(regionCoordinates(r,meshes))}})));}
const nationPaint=color=>/^#[a-f0-9]{6}$/i.test(color)?'#'+color.slice(1).match(/../g).map(channel=>Math.round(parseInt(channel,16)*.8).toString(16).padStart(2,'0')).join(''):color;
export function atlasCountries(world,union,meshes){
 return featureCollection(world.countries.flatMap(c=>{
  const polygons=world.regions.filter(r=>r.owner===c.id).flatMap(r=>regionCoordinates(r,meshes));if(!polygons.length)return [];
  let coordinates=polygons;
  try{coordinates=union(...polygons.map(p=>[p]));}catch{ /* Invalid custom topology retains selectable land; borders still follow original outlines. */ }
  return [{type:'Feature',id:c.id,properties:{id:c.id,name:c.name,color:c.color,mapColor:nationPaint(c.color),land:world.regions.filter(r=>r.owner===c.id).length},geometry:{type:'MultiPolygon',coordinates:closed(coordinates)}}];
 }));
}
export function homeBounds(world,id){
 const c=world.countries.find(c=>c.id===id);if(!c)return null;const [lon,lat]=c.label;
 const polygons=world.regions.filter(r=>r.owner===id).flatMap(r=>r.polygons||[[r.points]]);
 const bounds=polygons.map(p=>p[0]).filter(r=>r.length).map(r=>r.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[180,90,-180,-90]));
 if(!bounds.length)return null;
 const distance=b=>Math.max(b[0]-lon,0,lon-b[2])**2+Math.max(b[1]-lat,0,lat-b[3])**2;
 bounds.sort((a,b)=>distance(a)-distance(b)||(a[2]-a[0])*(a[3]-a[1])-(b[2]-b[0])*(b[3]-b[1]));
 let home=bounds[0];const included=new Set([home]);let added=true;
 while(added){added=false;for(const b of bounds){if(included.has(b))continue;const dx=Math.max(home[0]-b[2],b[0]-home[2],0),dy=Math.max(home[1]-b[3],b[1]-home[3],0);if(dx*dx+dy*dy<.0001){included.add(b);home=[Math.min(home[0],b[0]),Math.min(home[1],b[1]),Math.max(home[2],b[2]),Math.max(home[3],b[3])];added=true;}}}
 return [[home[0],Math.max(-80,home[1])],[home[2],Math.min(80,home[3])]];
}
export const geographicLabels=[
 ['NORTH ATLANTIC OCEAN',-38,33,'ocean'],['SOUTH ATLANTIC OCEAN',-15,-28,'ocean'],['NORTH PACIFIC OCEAN',-151,28,'ocean'],['SOUTH PACIFIC OCEAN',-125,-25,'ocean'],['INDIAN OCEAN',76,-25,'ocean'],['ARCTIC OCEAN',20,78,'ocean'],['Mediterranean Sea',16,35,'sea'],['Black Sea',34,43,'sea'],['North Sea',3,56,'sea'],['Baltic Sea',19,57,'sea'],['Red Sea',38,20,'sea'],['Caribbean Sea',-73,15,'sea'],['Arabian Sea',64,15,'sea'],['Bay of Bengal',88,14,'sea'],['South China Sea',114,13,'sea'],['Sea of Japan',135,41,'sea'],['Tasman Sea',160,-37,'sea'],['H I M A L A Y A',85,29,'range'],['A L P S',9,46,'range'],['A N D E S',-70,-22,'range'],['R O C K Y  M T S',-112,44,'range'],['S A H A R A',15,25,'range']
];
export const cities=[
 ['London',-.1276,51.5072],['Paris',2.3522,48.8566],['Berlin',13.405,52.52],['Rome',12.4964,41.9028],['Madrid',-3.7038,40.4168],['Lisbon',-9.1393,38.7223],['Dublin',-6.2603,53.3498],['Brussels',4.3517,50.8503],['Amsterdam',4.9041,52.3676],['Bern',7.4474,46.948],['Vienna',16.3738,48.2082],['Warsaw',21.0122,52.2297],['Prague',14.4378,50.0755],['Budapest',19.0402,47.4979],['Bucharest',26.1025,44.4268],['Belgrade',20.4489,44.7866],['Athens',23.7275,37.9838],['Sofia',23.3219,42.6977],['Ankara',32.8597,39.9334],['Istanbul',28.9784,41.0082],['Moscow',37.6173,55.7558],['Leningrad',30.3351,59.9343],['Stockholm',18.0686,59.3293],['Oslo',10.7522,59.9139],['Helsinki',24.9384,60.1699],['Copenhagen',12.5683,55.6761],['Tallinn',24.7536,59.437],['Riga',24.1052,56.9496],['Kaunas',23.9036,54.8985],['Tirana',19.8187,41.3275],['Washington',-77.0369,38.9072],['New York',-74.006,40.7128],['Ottawa',-75.6972,45.4215],['Mexico City',-99.1332,19.4326],['Rio de Janeiro',-43.1729,-22.9068],['Buenos Aires',-58.3816,-34.6037],['Santiago',-70.6693,-33.4489],['Lima',-77.0428,-12.0464],['Bogotá',-74.0721,4.711],['Tokyo',139.6917,35.6895],['Nanjing',118.7969,32.0603],['Shanghai',121.4737,31.2304],['Peking',116.4074,39.9042],['Delhi',77.209,28.6139],['Bombay',72.8777,19.076],['Tehran',51.389,35.6892],['Kabul',69.2075,34.5553],['Baghdad',44.3661,33.3152],['Riyadh',46.6753,24.7136],['Cairo',31.2357,30.0444],['Addis Ababa',38.7578,8.9806],['Pretoria',28.2293,-25.7479],['Canberra',149.13,-35.2809],['Sydney',151.2093,-33.8688],['Wellington',174.7762,-41.2866],['Bangkok',100.5018,13.7563],['Batavia',106.8456,-6.2088]
];
