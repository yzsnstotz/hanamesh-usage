import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateConsistency} from '../tools/consistency-schema.mjs';
const c=JSON.parse(readFileSync(new URL('../consistency.json',import.meta.url),'utf8'));
test('X01 SOURCE: declaration schema valid and all stateful groups/boundaries enumerated',()=>{
  validateConsistency(c);assert.equal(c.exempt,false);assert.equal(c.groups.length,2);assert.equal(c.boundaries.length,2);assert.equal(c.boundaries[0].safeDirection,'dsh:session-log');assert.equal(c.boundaries[1].safeDirection,'storage-domain:hanamesh_usage');
});
test('X01 schema rejects absent reasons, one-sided boundary and invalid safe side',()=>{
  for(const mutation of [x=>delete x.exempt,x=>x.groups=[],x=>x.boundaries[0].safeDirection='neither',x=>x.boundaries[0].sides.pop(),x=>x.exempt=true,x=>x.groups[0].facts=['only'],x=>x.unrecognized=true]){const v=structuredClone(c);mutation(v);assert.throws(()=>validateConsistency(v),/INVALID_CONSISTENCY/);}
});
