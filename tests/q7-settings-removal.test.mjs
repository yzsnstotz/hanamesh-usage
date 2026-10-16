import test from 'node:test';import assert from 'node:assert/strict';
import {EventStore} from '../lib/core/index.js';import {createUsageReporter} from '../lib/host/upload.js';
const settings={version:7,uploadIntervalMs:1234,catalogRefreshMs:300000,backfillWindowDays:0,countUnconfirmedCalls:false};
test('Q7 reporter admits four-field server policy and rejects legacy weights without fallback',async t=>{
 for(const legacy of [false,true]){
 let snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};const store=new EventStore({get:()=>snapshot,set:async value=>{snapshot=structuredClone(value);}});
 const reporter=createUsageReporter({store,link:{get:()=>({getConsent:()=> 'granted',getServerOrigin:()=> 'https://fixture.invalid'})},uploadIntervalMs:999999,uploadBatchSize:200,fetchImpl:async()=>Response.json(legacy?{...settings,channelWeights:{dsh:1,claude:1,codex:1}}:settings)});t.after(()=>reporter.stop());
 assert.equal(await reporter.runOnce(),legacy?'backoff':'idle');
 assert.deepEqual(reporter.health().settings,legacy?null:settings);assert.equal(reporter.health().uploadIntervalMs,legacy?null:1234);assert.equal(reporter.health().lastError,legacy?'USAGE_SETTINGS_INVALID':null);
 }
});
