import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scenario,upgradeDefaultGeography} from '../scenario.mjs';
import {validateScenario} from '../scenario-editor.mjs';
const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-default-map.json',import.meta.url),'utf8'));
test('geographic scenarios retain selectable islands and geometry through export/import',()=>{
 const w=scenario(),roundtrip=validateScenario(w,[{country:'FR'}]);
 assert.equal(roundtrip.regions.length,84);assert.deepEqual(roundtrip.regions.map(r=>r.polygons),w.regions.map(r=>r.polygons));
 assert(w.regions.filter(r=>r.owner==='IT').some(r=>r.polygons.length>1),'Italy retains its islands');
 assert(w.regions.filter(r=>r.owner==='GB').flatMap(r=>r.polygons).length>10,'British islands remain separate components');
 const invalid=structuredClone(w);invalid.regions[0].polygons[0][0][0][0]=Infinity;assert.throws(()=>validateScenario(invalid,[]));
 const mismatch=structuredClone(w);mismatch.regions[0].polygons[0][0][0][0]+=.1;assert.throws(()=>validateScenario(mismatch,[]),/first polygon ring/);
});
test('legacy map upgrade preserves geopolitical state and skips custom geometry',()=>{
 const w=scenario();for(const r of w.regions){r.points=structuredClone(legacy.find(p=>p.id===r.id).points);delete r.polygons;}
 w.regions.find(r=>r.id==='GB1').owner='IE';w.countries.find(c=>c.id==='IE').name='Irish Union';
 const state=structuredClone(w),routes=w.regions.map(r=>r.neighbors);
 assert(upgradeDefaultGeography(w));assert.equal(w.regions.find(r=>r.id==='GB1').owner,'IE');assert.deepEqual(w.countries,state.countries);assert.deepEqual(w.units,state.units);assert.deepEqual(w.regions.map(r=>r.neighbors),routes);assert.equal(upgradeDefaultGeography(w),false);
 const custom=structuredClone(state);custom.regions[0].points[0][0]+=.1;const before=structuredClone(custom);assert.equal(upgradeDefaultGeography(custom),false);assert.deepEqual(custom,before);
});
