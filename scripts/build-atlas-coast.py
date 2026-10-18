"""Refine display coastlines with public-domain Natural Earth 1:10m land.
Gameplay IDs, inland boundaries, ownership, routes and saved geometry are untouched.
Usage: build-atlas-coast.py world-interwar.json land-10m.geojson output.geojson
Build-time only: Shapely 2. Output display meshes are used only when their original
scenario geometry fingerprint matches; custom worlds keep their own polygons.
"""
import json,sys,math,gzip,hashlib
from pathlib import Path
from shapely.geometry import shape,Polygon,MultiPolygon,mapping
from shapely.ops import unary_union
from shapely import make_valid
from shapely.strtree import STRtree
world,landfile,out=sys.argv[1:];data=json.load(open(world));regions=data['regions']
def polys(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 if hasattr(g,'geoms'):return [p for c in g.geoms for p in polys(c)]
 return []
def mesh(r):return make_valid(MultiPolygon([Polygon(p[0],p[1:]) for p in r['polygons']]))
def fingerprint(coords):
 text='|'.join(';'.join(','.join(f'{(v or 0):.5f}' for point in ring for v in point) for ring in polygon) for polygon in coords)
 result=2166136261
 for ch in text:result=((result^ord(ch))*16777619)&0xffffffff
 return format(result,'08x')
land=unary_union([make_valid(shape(f['geometry'])) for f in json.load(open(landfile))['features']]).simplify(.004,preserve_topology=True)
original={r['id']:mesh(r) for r in regions};all_original=unary_union(list(original.values()));extra=make_valid(land.difference(all_original));refined={key:[make_valid(g.intersection(land))] for key,g in original.items()}
# Index individual island components instead of worldwide colonial bounding boxes.
# Each missing coastal patch is partitioned locally, avoiding repeated whole-world differences.
indexed=[(key,p) for key,g in original.items() for p in polys(g)];tree=STRtree([p for key,p in indexed])
patches=polys(extra);print('Coastal patches:',len(patches),flush=True)
for count,island in enumerate(patches):
 if island.representative_point().y < -60 or island.area<.000002:continue
 candidates=sorted({indexed[int(i)][0] for i in tree.query(island.buffer(.5))},key=lambda key:original[key].distance(island.representative_point()))
 if len(candidates)==1:refined[candidates[0]].append(island);continue
 remainder=island
 if candidates:
  for tolerance in [.025,.075,.2,.5]:
   for key in candidates:
    part=remainder.intersection(original[key].buffer(tolerance))
    if part.is_empty:continue
    refined[key].append(part);remainder=make_valid(remainder.difference(part))
    if remainder.is_empty:break
   if remainder.is_empty:break
 if not remainder.is_empty:
  key=indexed[int(tree.nearest(remainder))][0];refined[key].append(remainder)
 if count and count%1000==0:print('Patched',count,flush=True)
features=[]
for r in regions:
 key=r['id'];parts=polys(make_valid(unary_union(refined[key])));geometry=mapping(MultiPolygon(parts))
 # Round only after topological clipping; preserve closed rings and holes.
 def round_coords(value):
  if isinstance(value,(int,float)):return round(value,5)
  return [round_coords(v) for v in value]
 geometry={'type':'MultiPolygon','coordinates':round_coords(geometry['coordinates'])}
 features.append({'type':'Feature','properties':{'id':key,'sourceHash':fingerprint(r['polygons'])},'geometry':geometry})
raw=json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')).encode()
Path(out).write_bytes(gzip.compress(raw,compresslevel=9,mtime=0) if out.endswith('.gz') else raw)
Path(out).with_name('coast-build.json').write_text(json.dumps({'license':'Historical Basemaps adaptation GPL-3.0-only; Natural Earth land public domain','scenarioSHA256':hashlib.sha256(Path(world).read_bytes()).hexdigest(),'landInputSHA256':hashlib.sha256(Path(landfile).read_bytes()).hexdigest(),'displaySHA256':hashlib.sha256(raw).hexdigest(),'simplificationDegrees':.004,'sourceFingerprint':'FNV-1a over canonical five-decimal coordinate serialization; a display cache key, not a security boundary'},indent=2)+'\n')
print('Display meshes:',len(features),'vertices:',sum(len(ring) for f in features for poly in f['geometry']['coordinates'] for ring in poly))
