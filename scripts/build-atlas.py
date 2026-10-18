"""Build local cartography from public-domain Natural Earth data (no source code executed).
Usage: python3 scripts/build-atlas.py relief.tif rivers.geojson lakes.geojson public/atlas
Requires Pillow and NumPy only; build-time dependencies, never server dependencies.
"""
import sys,json,math,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
source,rivers,lakes,dest=sys.argv[1:];dest=Path(dest);dest.mkdir(parents=True,exist_ok=True)
im=Image.open(source).convert('RGB');width,height=im.size
size=4096
# Each destination row is evenly spaced in Web Mercator, not in latitude.
y=np.arange(size,dtype=np.float64);latitude=np.arctan(np.sinh(math.pi*(1-2*(y+.5)/size)))
rows=np.clip((.5-latitude/math.pi)*height-.5,0,height-1)
original=np.asarray(im.resize((size,height),Image.Resampling.LANCZOS));lo=rows.astype(int);hi=np.minimum(lo+1,height-1);weight=(rows-lo)[:,None,None]
output=(original[lo]*(1-weight)+original[hi]*weight).astype('uint8')
Image.fromarray(output).save(dest/'relief.webp',quality=88,method=6)
def simplify(points,tolerance=.018):
 if len(points)<3:return points
 a,b=points[0],points[-1];dx,dy=b[0]-a[0],b[1]-a[1];length=dx*dx+dy*dy
 best,index=0,0
 for i,p in enumerate(points[1:-1],1):
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
  distance=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
  if distance>best:best,index=distance,i
 if best>tolerance*tolerance:return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)
 return [a,b]
def clean(coords,depth):
 if depth==0:return [[round(p[0],4),round(p[1],4)] for p in simplify(coords)]
 return [clean(c,depth-1) for c in coords]
for label,file,rank in [('rivers',rivers,5),('lakes',lakes,4)]:
 features=[]
 for f in json.load(open(file))['features']:
  props=f['properties'];scale=props.get('scalerank',0)
  if scale is not None and scale>rank:continue
  g=f['geometry'];depth={'LineString':0,'MultiLineString':1,'Polygon':1,'MultiPolygon':2}[g['type']]
  coords=clean(g['coordinates'],depth)
  if not coords:continue
  if g['type']=='LineString' and len(coords)<2:continue
  if g['type']=='MultiLineString':
   coords=[line for line in coords if len(line)>=2]
   if not coords:continue
  def valid(c,d):
   if d==0:return len(c)>=4 and c[0]==c[-1]
   return all(valid(x,d-1) for x in c)
  if 'Polygon' in g['type'] and not valid(coords,2 if g['type']=='MultiPolygon' else 1):continue
  features.append({'type':'Feature','properties':{'name':props.get('name') or '', 'rank':scale or 0},'geometry':{'type':g['type'],'coordinates':coords}})
 (dest/(label+'.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
metadata={'sourceCommit':'f04832c819e7a203d159dffe93cd9245332d6b33','projection':'EPSG:3857; raster bounds +/-180 longitude, +/-85.05112878 latitude','resolution':[size,size],'sources':{Path(p).name:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [source,rivers,lakes]}}
(dest/'build.json').write_text(json.dumps(metadata,indent=2)+'\n')
print({p.name:p.stat().st_size for p in dest.iterdir()})
