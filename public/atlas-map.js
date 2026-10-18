import {atlasRegions,atlasCountries,featureCollection,homeBounds,geographicLabels,cities} from './atlas-data.js';
const feature=(coordinates,properties)=>({type:'Feature',geometry:{type:'Point',coordinates},properties});
// Locally rasterized labels avoid a remote glyph/font server and handle Unicode names.
function labelImage(text,{size=14,color='#293d3c',italic=false,capital=false}={}){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),ratio=2;
 const words=text.split(' '),lines=[];let line='';for(const w of words){if((line+' '+w).length>23&&line){lines.push(line);line=w;}else line+=(line?' ':'')+w;}if(line)lines.push(line);
 ctx.font=`${italic?'italic ':''}${size}px Georgia,serif`;const width=Math.ceil(Math.max(...lines.map(l=>ctx.measureText(l).width))+18),height=lines.length*(size+4)+10;
 canvas.width=width*ratio;canvas.height=height*ratio;ctx.scale(ratio,ratio);ctx.font=`${italic?'italic ':''}${size}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 lines.forEach((l,i)=>{const y=(i+.5)*(size+4)+5;ctx.strokeStyle=capital?'#ede9d9dd':'#f3f0dfaa';ctx.lineWidth=3;ctx.strokeText(l,width/2,y);ctx.fillStyle=color;ctx.fillText(l,width/2,y);});
 return {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};
}
export function createAtlas({container,world,onSelect,onError}){
 const gl=globalThis.maplibregl;let current=world,selected='',changed=[],map,ready=false,signature='',disposed=false,mode='political',meshes=new Map();
 const meshPromise=fetch('/atlas/coast-regions.geojson').then(r=>{if(!r.ok)throw Error('Display mesh unavailable');return r.json();}).then(data=>{meshes=new Map(data.features.map(f=>[f.properties.id,f]));}).catch(()=>{});
 if(!gl?.Map){onError('Your browser could not start the map renderer. Enable hardware acceleration or use a WebGL-capable browser.');return null;}
 gl.setWorkerUrl('/vendor/maplibre-worker.js');
 try{map=new gl.Map({container,style:{version:8,projection:{type:'mercator'},sources:{relief:{type:'image',url:'/atlas/relief.webp',coordinates:[[-180,85.05112878],[180,85.05112878],[180,-85.05112878],[-180,-85.05112878]]},rivers:{type:'geojson',data:'/atlas/rivers.geojson'},lakes:{type:'geojson',data:'/atlas/lakes.geojson'}},layers:[{id:'ocean',type:'background',paint:{'background-color':'#8baeb8'}},{id:'relief',type:'raster',source:'relief',paint:{'raster-opacity':1,'raster-saturation':-.2,'raster-fade-duration':0}}]},center:[14,46],zoom:3.5,minZoom:.5,maxZoom:8,attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,renderWorldCopies:true,fadeDuration:0,maxTileCacheSize:128,pixelRatio:Math.min(devicePixelRatio,1.5),canvasContextAttributes:{antialias:true},preserveDrawingBuffer:false});}
 catch{onError('The geographic renderer could not initialize. Enable hardware acceleration and reload.');return null;}
 map.addControl(new gl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
 const attribution=document.createElement('a');attribution.className='atlas-attribution';attribution.href='/atlas/credits.txt';attribution.target='_blank';attribution.rel='noopener';attribution.textContent='MapLibre · Natural Earth · Historical Basemaps';container.parentNode.append(attribution);
 const status=document.createElement('div');status.className='atlas-loading';status.textContent='Loading the atlas…';status.setAttribute('role','status');container.parentNode.append(status);
 function addImage(id,text,options){if(map.hasImage(id))map.removeImage(id);map.addImage(id,labelImage(text,options),{pixelRatio:2});}
 function update(data,{selection='',changes=[]}={}){
  current=data;selected=selection;changed=changes;if(!ready)return;
  const next=JSON.stringify([data.regions.map(r=>[r.id,r.owner,r.polygons||r.points]),data.countries.map(c=>[c.id,c.name,c.color,c.label])]);
  if(next!==signature){signature=next;map.getSource('regions').setData(atlasRegions(data,meshes));map.getSource('countries').setData(atlasCountries(data,globalThis.polygonClipping.union,meshes));
   const labels=data.countries.filter(c=>data.regions.some(r=>r.owner===c.id)).map(c=>{addImage('nation-'+c.id,c.name.toUpperCase(),{size:c.name.length>25?13:15});return feature(c.label,{id:c.id,image:'nation-'+c.id,priority:-data.regions.filter(r=>r.owner===c.id).length});});map.getSource('nation-labels').setData(featureCollection(labels));
  }
  map.setFilter('selected-region',['==',['get','id'],selected||'']);map.setFilter('changed-regions',['in',['get','id'],['literal',changed]]);
 }
 map.on('load',async()=>{await meshPromise;if(disposed)return;ready=true;
  map.addSource('regions',{type:'geojson',data:atlasRegions(current,meshes),maxzoom:8,tolerance:.12,buffer:16});map.addSource('countries',{type:'geojson',data:featureCollection([]),maxzoom:8,tolerance:.12,buffer:16});
  map.addLayer({id:'country-fill',type:'fill',source:'countries',paint:{'fill-color':['get','color'],'fill-opacity':.32,'fill-antialias':true}});
  map.addLayer({id:'region-hit',type:'fill',source:'regions',paint:{'fill-color':'#fff','fill-opacity':0}});
  map.addLayer({id:'lakes',type:'fill',source:'lakes',paint:{'fill-color':'#8aaeb9','fill-opacity':.95}});
  map.addLayer({id:'rivers',type:'line',source:'rivers',minzoom:2.5,paint:{'line-color':'#6a9eae','line-opacity':.72,'line-width':['interpolate',['linear'],['zoom'],2,.35,6,1.1]}});
  map.addLayer({id:'borders-casing',type:'line',source:'countries',paint:{'line-color':'#f4ebd2','line-opacity':.8,'line-width':2}});
  map.addLayer({id:'country-borders',type:'line',source:'countries',paint:{'line-color':'#45544e','line-opacity':.75,'line-width':['interpolate',['linear'],['zoom'],1,.4,5,1.05]}});
  map.addLayer({id:'sector-borders',type:'line',source:'regions',minzoom:5.8,paint:{'line-color':'#514e41','line-opacity':.25,'line-width':.6,'line-dasharray':[2,3]}});
  map.addLayer({id:'changed-regions',type:'line',source:'regions',filter:['in',['get','id'],['literal',changed]],paint:{'line-color':'#b48222','line-width':2.4,'line-dasharray':[4,2]}});
  map.addLayer({id:'selected-region',type:'line',source:'regions',filter:['==',['get','id'],selected||''],paint:{'line-color':'#f9e0a0','line-width':3}});
  const places=geographicLabels.map(([text,x,y,kind],i)=>{addImage('geo-'+i,text,{size:kind==='ocean'?15:kind==='range'?12:13,italic:true,color:kind==='range'?'#615d43':'#365a68'});return feature([x,y],{image:'geo-'+i,kind});});
  map.addSource('geography',{type:'geojson',data:featureCollection(places)});map.addLayer({id:'geographic-names',type:'symbol',source:'geography',layout:{'icon-image':['get','image'],'icon-size':['interpolate',['linear'],['zoom'],1,.65,4,1],'icon-allow-overlap':false}});
  const cityFeatures=cities.map(([name,x,y],i)=>{addImage('city-'+i,name,{size:12,capital:true});return feature([x,y],{image:'city-'+i});});
  map.addSource('cities',{type:'geojson',data:featureCollection(cityFeatures)});map.addLayer({id:'city-dots',type:'circle',source:'cities',minzoom:4,paint:{'circle-color':'#35433c','circle-radius':2,'circle-stroke-color':'#f9f2de','circle-stroke-width':1}});
  map.addLayer({id:'city-names',type:'symbol',source:'cities',minzoom:4,layout:{'icon-image':['get','image'],'icon-anchor':'top-left','icon-offset':[3,1],'icon-allow-overlap':false}});
  map.addSource('nation-labels',{type:'geojson',data:featureCollection([])});map.addLayer({id:'nation-names',type:'symbol',source:'nation-labels',layout:{'icon-image':['get','image'],'icon-size':['interpolate',['linear'],['zoom'],.5,.7,3,1,6,1.1],'symbol-sort-key':['get','priority'],'icon-allow-overlap':false,'icon-padding':7}});
  update(current,{selection:selected,changes:changed});status.remove();container.dataset.ready='true';container.dispatchEvent(new CustomEvent('atlas-ready'));
 });
 map.on('click',e=>{if(!ready)return;const hit=map.queryRenderedFeatures(e.point,{layers:['region-hit']})[0];if(hit)onSelect(hit.properties.id);});
 map.on('mousemove',e=>{if(ready)map.getCanvas().style.cursor=map.queryRenderedFeatures(e.point,{layers:['region-hit']}).length?'pointer':'grab';});
 map.on('error',e=>{if(!ready){status.textContent='Map assets could not load. Refresh to retry.';}console.warn('Atlas resource:',e.error?.message||'Unavailable resource');});
 const resize=new ResizeObserver(()=>map.resize());resize.observe(container);
 function focus(id,{duration=800,maxZoom=5.8}={}){const b=homeBounds(current,id);if(b)map.fitBounds(b,{padding:75,maxZoom,duration});}
 function overview(){if(map.getProjection()?.type==='globe'){map.easeTo({center:[10,15],zoom:2.3,duration:800});return;}map.fitBounds([[-170,-57],[175,77]],{padding:25,duration:850});}
 function setMode(value){mode=value;if(ready){map.setPaintProperty('country-fill','fill-opacity',mode==='terrain'?.08:.32);map.setLayoutProperty('sector-borders','visibility',mode==='terrain'?'none':'visible');}return mode;}
 const api={update,focus,overview,projection:()=>{const next=map.getProjection()?.type==='globe'?'mercator':'globe';map.setProjection({type:next});map.setPaintProperty('ocean','background-color',next==='globe'?'#142331':'#8baeb8');if(next==='globe'&&map.getZoom()<2.3)map.easeTo({zoom:2.3,center:[map.getCenter().lng,15],duration:500});return next;},zoom:delta=>map.zoomTo(Math.max(.5,Math.min(8,map.getZoom()+delta)),{duration:300}),setMode,getMode:()=>mode,getMap:()=>map,destroy(){disposed=true;resize.disconnect();map.remove();attribution.remove();status.remove();}};container.atlas=api;return api;
}
