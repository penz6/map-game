# Adapted Historical Basemaps data, GPL-3.0; see data-maps/LICENSE.
# Build-time only: Python 3 + Shapely 2. No downloaded code is executed.
import json,sys,math
from collections import defaultdict
from shapely.geometry import shape,box,Point
from shapely.ops import unary_union
from shapely import make_valid
if len(sys.argv)!=5:raise SystemExit('Usage: build-world.py world_1930.geojson world_1938.geojson europe-interwar.json output.json')
old=json.load(open(sys.argv[1]))['features'];src=json.load(open(sys.argv[2]))['features'];europe=json.load(open(sys.argv[3]))
# Preserve the existing European identities; add larger global powers and groups.
new=[('US','United States','#6c9bb8',[-100,39]),('CA','Canada','#c99886',[-106,57]),('MX','Mexico & Central America','#a5b27b',[-102,23]),('BR','Brazil','#97b876',[-52,-12]),('AR','Argentina & Uruguay','#8bbbc7',[-64,-36]),('CO','Colombia & Venezuela','#cead70',[-69,7]),('PE','Peru & Bolivia','#ba927e',[-71,-13]),('CL','Chile','#bb8798',[-71,-35]),('JP','Japan','#c88683',[137,37]),('CN','China & Mongolia','#c8ad70',[105,35]),('IN','British India & South Asia','#c9a27a',[79,23]),('IR','Iran & Afghanistan','#b997af',[57,32]),('SA','Arabian states','#bcae7d',[45,24]),('TH','Siam & mainland SE Asia','#a8bc99',[101,16]),('AU','Australia & Pacific islands','#89b2af',[135,-25]),('NZ','New Zealand','#9fadd0',[173,-41]),('ZA','Southern Africa','#a6a78c',[25,-28]),('EG','Egypt & Sudan','#bba675',[30,22]),('ET','Ethiopia','#b89677',[39,9])]
by_name={k:v for k,v in [('Luxembourg','BE'),('Andorra','ES'),('United Kingdom','GB'),('France','FR'),('Germany','DE'),('Italy','IT'),('Spain','ES'),('Portugal','PT'),('Ireland','IE'),('Belgium','BE'),('Netherlands','NL'),('Switzerland','CH'),('Austria','AT'),('Poland','PL'),('Czechoslovakia','CZ'),('Hungary','HU'),('Romania','RO'),('Yugoslavia','YU'),('Greece','GR'),('Bulgaria','BG'),('Turkey','TR'),('USSR','SU'),('Sweden','SE'),('Norway','NO'),('Finland','FI'),('Denmark','DK'),('Estonia','EE'),('Latvia','LV'),('Lithuania','LT'),('Albania','AL')]}
groups={'US':['United States','Philippines','Puerto Rico','United States Virgin Islands','Guam','American Samoa','Cuba','Haiti','Dominican Republic','Turks and Caicos Islands','Bahamas'], 'CA':['Canada','Dominion of Newfoundland'], 'MX':['Mexico','Nicaragua','Costa Rica','Panama','Belize','Guatemala','Honduras','El Salvador'], 'BR':['Brazil'], 'AR':['Argentina','Uruguay','Paraguay'], 'CO':['Colombia','Venezuela','Guyana','Suriname','Trinidad'], 'PE':['Peru','Bolivia','Ecuador'], 'CL':['Chile','Rapa Nui'], 'JP':['Empire of Japan','Saipan'], 'CN':['Chinese warlords','Tibet','Xinjiang','Mongolia'], 'IN':['India','British Raj','Ceylon','Bhutan','Nepal'], 'IR':['Iran','Afghanistan'], 'SA':['Saudi Arabia','Qatar','Trucial Oman','Kuwait','Jordan','Israel','Mandatory Palestine (GB)','Yemen','Yemen (UK)','Muscat and Oman','Oman (British Raj)','Mesopotamia (GB)',"Emirate of Bin Shal'an",'Hejaz','Hail'], 'TH':['Siam','Laos','Cambodia','Cochin China','French Indo-China'], 'AU':['Australia','Fiji','Niue','Tonga','Samoa','Wallis and Futuna Islands','Gilbert and Ellice Islands','New Hebrides','New Caledonia','Brunei','Malaysia'], 'NZ':['New Zealand'], 'ZA':['Union of South Africa','Botswana','Swaziland','Lesotho','Northern Rhodesia','Southern Rhodesia','Malawi','Walbis Bay'], 'EG':['Egypt','Sudan'], 'ET':['Ethiopia (Italy)','Eritrea (Italy)'], 'GB':['Sierra Leone','Gambia, The','Liberia','Jamaica','Antigua and Barbuda','Barbados','Dominica','Grenada','Montserrat','Anguilla','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines'], 'FR':['Tunisia','Togo','French Somaliland','French Guiana','Martinique','Guadeloupe','Saint Martin','Saint Barthelemy'], 'PT':['Guinea-Bissau'], 'BE':['Burundi'], 'IT':['Libya'], 'NL':['Netherlands Antilles']}
for owner,names in groups.items():by_name.update({n:owner for n in names})
subject={'United Kingdom':'GB','United Kingdom of Great Britain and Ireland':'GB','France':'FR','Italy':'IT','Belgium':'BE','Portugal':'PT','Spain':'ES','Netherlands':'NL','Empire of Japan':'JP','United States':'US','USSR':'SU'}
land=defaultdict(list);neutral=[];assigned=[]
def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for child in g.geoms for p in polygons(child)]
# Reject invalid coordinates; repair polygon topology, never run source scripts.
for f in src:
 p=f['properties'];g=make_valid(shape(f['geometry']));name=p.get('NAME');owner=by_name.get(name) or subject.get(p.get('SUBJECTO'))
 if not owner:
  x,y=g.representative_point().coords[0]
  if y < -60:neutral.append(g);continue
  if not name:
   if -12<x<2 and 50<y<61:owner='GB'
   elif -12<x<2 and 61<y<64:owner='DK'
   elif 12<x<15 and 53<y<56:owner='DE'
   elif 21<x<24 and 57<y<60:owner='EE'
   elif 19<x<21 and 59<y<61:owner='FI'
   elif 34<x<49 and 25<y<34:owner='SA'
   elif 120<x<180 and y>0:owner='JP'
   elif 120<x<180 and y<0:owner='AU'
  if not owner:raise ValueError(f'Unassigned feature: {name} at {x,y}')
 land[owner].append(g);assigned.append({'name':name or 'Unnamed island','owner':owner})
# Undo 1938 European annexations with pre-annexation national outlines.
for owner,name in [('DE','Germany'),('AT','Austria'),('PL','Poland'),('CZ','Czechoslovakia'),('HU','Hungary'),('RO','Romania')]:
 land[owner]=[make_valid(shape(f['geometry'])) for f in old if f['properties'].get('NAME')==name or owner=='DE' and f['properties'].get('NAME')=='East Prussia']
# All territorial groups are scenario abstractions, not claims of historical union.
shapes={k:unary_union(gs).simplify(.035,preserve_topology=True) for k,gs in land.items()}
# Eliminate overlapping source polygons deterministically, retaining no water bridges.
# Smaller polities take precedence; large imperial features fill the remainder.
occupied=None
for k in sorted(shapes,key=lambda k:shapes[k].area):
 g=shapes[k]
 if occupied is not None:g=make_valid(g.difference(occupied))
 shapes[k]=g;occupied=g if occupied is None else unary_union([occupied,g])

def encode(g):
 result=[]
 for p in sorted(polygons(g),key=lambda p:-p.area):
  if p.area<.00002:continue
  tolerance=.035
  while max(len(r.coords) for r in [p.exterior,*p.interiors])>512:
   tolerance*=1.5;p=p.simplify(tolerance,preserve_topology=True)
  rings=[]
  for ring in [p.exterior,*p.interiors]:
   points=[[round(x,5),round(y,5)] for x,y in list(ring.coords)[:-1]]
   if len(points)>=3 and abs(sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points))))>1e-8:rings.append(points)
  if rings:result.append(rings)
 return result
regions=[]
for owner,g in shapes.items():
 if owner in europe:
  # Original homeland cut positions keep GB0/FR0/etc around the same home area.
  a=min(x for poly in europe[owner][0]['polygons'] for x,y in poly[0]);b=max(x for poly in europe[owner][0]['polygons'] for x,y in poly[0])
  sectors=[box(a,-90,b,90),box(-180,-90,a,90),box(b,-90,180,90)];names=['Central','West','East']
 else:
  biggest=max(polygons(g),key=lambda p:p.area);left,_,right,_=biggest.bounds;middle=(left+right)/2
  sectors=[box(-180,-90,middle,90),box(middle,-90,180,90)];names=['West','East']
 for i,sector in enumerate(sectors):
  part=g.intersection(sector);coords=encode(part)
  if not coords:raise ValueError(f'Empty province {owner}{i}')
  regions.append({'id':owner+str(i),'owner':owner,'name':owner+' '+names[i],'points':coords[0][0],'polygons':coords,'neighbors':[],'_shape':part})
# Within-country links preserve playability across island components. Border links
# are computed from the actual sector geometry; sea routes are explicit below.
def link(a,b):
 if b['id'] not in a['neighbors']:a['neighbors'].append(b['id'])
 if a['id'] not in b['neighbors']:b['neighbors'].append(a['id'])
for i,a in enumerate(regions):
 for b in regions[i+1:]:
  if (a['owner']==b['owner'] and (a['id'].endswith('0') or b['id'].endswith('0'))) or a['_shape'].distance(b['_shape'])<.06:link(a,b)
sea=[('GB','IE'),('GB','FR'),('GB','US'),('GB','CA'),('US','JP'),('US','AU'),('JP','CN'),('JP','AU'),('AU','NZ'),('IN','AU'),('PT','BR'),('ES','MX'),('ZA','AR'),('DK','SE')]
for a,b in sea:link(next(r for r in regions if r['id']==a+'0'),next(r for r in regions if r['id']==b+'0'))
for r in regions:del r['_shape'];r['neighbors'].sort()
result={'newCountries':[{'id':i,'name':n,'color':c,'label':p} for i,n,c,p in new],'regions':regions,'neutral':encode(unary_union(neutral)),'assignments':assigned,'seaRoutes':sea}
json.dump(result,open(sys.argv[4],'w'),separators=(',',':'))
print(json.dumps({'countries':len(shapes),'regions':len(regions),'largestRing':max(len(r) for p in regions for poly in p['polygons'] for r in poly),'largestComponents':max(len(p['polygons']) for p in regions),'largestProvincePoints':max(sum(len(r) for poly in p['polygons'] for r in poly) for p in regions),'edges':sum(len(r['neighbors']) for r in regions)//2}))
