// Local map math; no remote scripts, tile requests or runtime map dependencies.
export function mapViewport(world){
 const global=world.mapScope==='world'||world.regions.some(r=>r.points.some(([x,y])=>Math.abs(x)>60||y<0));
 return global?{x:-180,y:-90,width:360,height:180,cx:0,cy:0,global:true,maxZoom:40}:{x:-12,y:2,width:58,height:66,cx:16,cy:31,global:false,maxZoom:12};
}
export function projectPoint(world,[x,y]){return mapViewport(world).global?[x,-y]:[x,(74-y)*1.65];}
export function polygonPath(world,polygons){
 const global=mapViewport(world).global;
 return polygons.map(p=>p.map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x},${global?-y:(74-y)*1.65}`).join(' ')+'Z').join(' ')).join(' ');
}
export function nationCamera(world,country){
 const view=mapViewport(world),[lon,lat]=country.label;
 const rings=world.regions.filter(r=>r.owner===country.id).flatMap(r=>(r.polygons||[[r.points]]).map(p=>p[0]));
 if(!rings.length)return {scale:1,pan:{x:0,y:0}};
 const bounds=r=>({left:Math.min(...r.map(p=>p[0])),right:Math.max(...r.map(p=>p[0])),bottom:Math.min(...r.map(p=>p[1])),top:Math.max(...r.map(p=>p[1]))});
 const distance=b=>Math.max(b.left-lon,0,lon-b.right)**2+Math.max(b.bottom-lat,0,lat-b.top)**2;
 const boxes=rings.map(bounds);let home=boxes.sort((a,b)=>distance(a)-distance(b)||(a.right-a.left)*(a.top-a.bottom)-(b.right-b.left)*(b.top-b.bottom))[0];
 // Rejoin the bounding boxes of adjacent homeland sectors before framing them.
 // Distant colonies and islands do not force an almost-worldwide camera.
 const joined=new Set([home]);let changed=true;while(changed){changed=false;for(const b of boxes){if(joined.has(b))continue;const dx=Math.max(home.left-b.right,b.left-home.right,0),dy=Math.max(home.bottom-b.top,b.bottom-home.top,0);if(dx*dx+dy*dy<.0001){joined.add(b);home={left:Math.min(home.left,b.left),right:Math.max(home.right,b.right),bottom:Math.min(home.bottom,b.bottom),top:Math.max(home.top,b.top)};changed=true;}}}
 const a=projectPoint(world,[home.left,home.bottom]),b=projectPoint(world,[home.right,home.top]);
 const scale=Math.max(1,Math.min(view.maxZoom,view.width/Math.max(4,Math.abs(b[0]-a[0])*1.5),view.height/Math.max(4,Math.abs(b[1]-a[1])*1.5)));
 const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
 return {scale,pan:{x:(view.cx-x)*scale,y:(view.cy-y)*scale}};
}
