# Data adaptation by Historia Local contributors; GPL-3.0, see data-maps/LICENSE.
# Build-time only: requires Python 3 and Shapely 2.
import json,sys
from shapely.geometry import shape,box,Polygon
from shapely.ops import unary_union
from shapely import make_valid
if len(sys.argv)!=4:raise SystemExit('Usage: python scripts/build-geography.py world_1930.geojson world_1938.geojson output.json')
old=json.load(open(sys.argv[1]))['features']; newer=json.load(open(sys.argv[2]))['features']
ids={'GB':'United Kingdom','FR':'France','DE':'Germany','IT':'Italy','ES':'Spain','PT':'Portugal','IE':'Ireland','BE':'Belgium','NL':'Netherlands','CH':'Switzerland','AT':'Austria','PL':'Poland','CZ':'Czechoslovakia','HU':'Hungary','RO':'Romania','YU':'Yugoslavia','GR':'Greece','BG':'Bulgaria','TR':'Turkey','SU':'USSR','SE':'Sweden','NO':'Norway','FI':'Finland','DK':'Denmark','EE':'Estonia','LV':'Latvia','LT':'Lithuania','AL':'Albania'}
def polys(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for sub in g.geoms for p in polys(sub)]
def union(fs):return unary_union([make_valid(shape(f['geometry'])) for f in fs])
out={}; clip=box(-12,34,45,72)
for id,name in ids.items():
 source=old if id in ['DE','AT','PL','CZ','HU','RO'] else newer
 fs=[f for f in source if f['properties'].get('NAME')==name]
 if id=='DE':fs += [f for f in old if f['properties'].get('NAME')=='East Prussia']
 if id=='GB':fs += [f for f in newer if not f['properties'].get('NAME') and -11<shape(f['geometry']).centroid.x<2 and 50<shape(f['geometry']).centroid.y<61]
 if id=='EE':fs += [f for f in newer if not f['properties'].get('NAME') and 21<shape(f['geometry']).centroid.x<24 and 57<shape(f['geometry']).centroid.y<60]
 if id=='FI':fs += [f for f in newer if not f['properties'].get('NAME') and 19<shape(f['geometry']).centroid.x<21 and 59<shape(f['geometry']).centroid.y<61]
 g=union(fs).intersection(clip)
 # Simplify all countries to the same small tolerance, preserving islands and holes.
 g=g.simplify(.018,preserve_topology=True)
 ps=polys(g);assert ps,id
 mainland=max(ps,key=lambda p:p.area);x0,_,x1,_=mainland.bounds;a=x0+(x1-x0)/3;b=x0+2*(x1-x0)/3
 sectors=[box(a,30,b,75),box(-20,30,a,75),box(b,30,50,75)]
 parts=[]
 for sector in sectors:
  pieces=sorted(polys(g.intersection(sector)),key=lambda p:-p.area);assert pieces,id
  coords=[]
  for p in pieces:
   if p.area<.001:continue
   rings=[[[round(x,5),round(y,5)] for x,y in list(r.coords)[:-1]] for r in [p.exterior,*p.interiors]]
   coords.append(rings)
  assert coords,id
  parts.append({'points':coords[0][0],'polygons':coords})
 out[id]=parts
json.dump(out,open(sys.argv[3],'w'),separators=(',',':'))
print('countries',len(out),'vertices',sum(len(r) for c in out.values() for p in c for poly in p['polygons'] for r in poly))
