import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {scenario} from '../scenario.mjs';import {atlasRegions,atlasCountries,homeBounds,geometryFingerprint} from '../public/atlas-data.js';
const sandbox={};vm.runInNewContext(fs.readFileSync(new URL('../public/vendor/polygon-clipping.js',import.meta.url),'utf8'),sandbox);const union=sandbox.polygonClipping.union;
test('the atlas dissolves artificial sector seams while keeping exact gameplay hit regions',()=>{
 const w=scenario(),before=structuredClone(w),countries=atlasCountries(w,union),regions=atlasRegions(w);assert.equal(countries.features.length,47);assert.equal(regions.features.length,122);assert.deepEqual(w,before);
 const france=countries.features.find(f=>f.properties.id==='FR');assert.equal(france.geometry.type,'MultiPolygon');assert(france.geometry.coordinates.length>0);
 for(const f of regions.features){assert.equal(f.properties.owner,w.regions.find(r=>r.id===f.id).owner);for(const polygon of f.geometry.coordinates)for(const ring of polygon)assert.deepEqual(ring[0],ring.at(-1));}
 // Adjacent gameplay squares must become one external country ring.
 const squares={countries:[{id:'A',name:'A',color:'#aaaaaa'}],regions:[{id:'A0',owner:'A',points:[[0,0],[1,0],[1,1],[0,1]]},{id:'A1',owner:'A',points:[[1,0],[2,0],[2,1],[1,1]]}]};assert.equal(atlasCountries(squares,union).features[0].geometry.coordinates.length,1);
});
test('ownership and nation identity changes reach the atlas without stale original borders',()=>{
 const w=scenario(),province=w.regions.find(r=>r.owner==='FR');province.owner='DE';w.countries.find(c=>c.id==='DE').name='New Name';const data=atlasRegions(w);assert.equal(data.features.find(f=>f.id===province.id).properties.owner,'DE');assert.equal(atlasCountries(w,union).features.find(f=>f.id==='DE').properties.name,'New Name');
});
test('homeland focus excludes distant colonies and local assets contain valid real geography',()=>{
 const w=scenario();for(const id of ['FR','GB','US','JP','AU','NZ']){const b=homeBounds(w,id);assert(b);assert(b[1][0]-b[0][0]<100);assert(b[0][1]>=-80);assert(b[1][1]<=80);}
 for(const file of ['rivers','lakes']){const data=JSON.parse(fs.readFileSync(new URL('../public/atlas/'+file+'.geojson',import.meta.url)));assert(data.features.length>20);assert(data.features.every(f=>f.geometry.coordinates.length>0));}
});

test('refined coast meshes follow ownership but never replace custom scenario geometry',()=>{const w=scenario(),r=w.regions[0],mesh={properties:{id:r.id,sourceHash:geometryFingerprint(r.polygons)},geometry:{coordinates:[[[[0,0],[1,0],[0,1],[0,0]]]]}};const meshes=new Map([[r.id,mesh]]);assert.deepEqual(atlasRegions(w,meshes).features[0].geometry.coordinates,mesh.geometry.coordinates);r.owner='FR';assert.equal(atlasRegions(w,meshes).features[0].properties.owner,'FR');r.polygons[0][0][0][0]+=.1;assert.notDeepEqual(atlasRegions(w,meshes).features[0].geometry.coordinates,mesh.geometry.coordinates);});
