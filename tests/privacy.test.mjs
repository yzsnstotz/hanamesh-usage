import test from 'node:test';
import assert from 'node:assert/strict';
import { core, session, record, MemoryGlobal } from './fixtures/helpers.mjs';

test('T09 FIXTURE ONLY: prompt, paths, files, full result and credentials never enter summary',async()=>{
  const s=session({kind:'error'});
  s.binding.workspace='/home/SYNTHETIC_PRIVATE_PERSON/work';s.binding.authRef='SYNTHETIC_PRIVATE_AUTH';s.binding.externalSessionId='SYNTHETIC_PRIVATE_THREAD';
  s.events.splice(2,0,{type:'user/message',seq:2,time:1020,data:{turn:0,content:'SYNTHETIC_PRIVATE_PROMPT',attachments:['/home/SYNTHETIC_PRIVATE_FILE']}});
  s.events.at(-1).seq=3;s.events.at(-1).data.reason.error={message:'SYNTHETIC_PRIVATE_RESULT',apiKey:'sk-SYNTHETIC_PRIVATE_KEY'};
  const r=core.projectTerminal(s,s.events.at(-1)),store=new core.ActivityStore(new MemoryGlobal());await store.put(r);
  const exported=JSON.stringify(store.export());assert.doesNotMatch(exported,/SYNTHETIC_PRIVATE|SYNTHETIC_ERROR|sk-/);
  assert.doesNotMatch(exported,/"(?:prompt|content|attachments|workspace|authRef|externalSessionId)"/);
  assert.match(exported,/runtime_error_details_withheld/);assert.match(exported,/synthetic/);
});
test('metadata guards reject likely secrets, URLs, personal paths and HTML',()=>{
  for(const s of ['sk-EXAMPLE','ghp_EXAMPLE','github_pat_EXAMPLE','bearerEXAMPLE','private_keyEXAMPLE','user@example.com','/Users/example/docs','/home/example','C:\\Users\\example','https://example.com','<script>','a'.repeat(161),'0x'+'a'.repeat(64)])assert.equal(core.safeMetadata(s),false,s);
  for(const s of ['native','0.1.5-alpha.1','v1','fixture-model','org/model-v2'])assert.equal(core.safeMetadata(s),true,s);
});
test('provider/model unsafe text is redacted, not truncated into an apparently safe value',()=>{
  const r=record({provider:'sk-SYNTHETIC',model:'/home/SYNTHETIC_PATH'});assert.equal(r.provider.reason,'redacted');assert.equal(r.model.reason,'redacted');
});
test('export allowlist drops future local-only properties and untrusted eventRef',()=>{
  const r=record();r.prompt='SYNTHETIC_PRIVATE';r.executor.privateContent='SYNTHETIC_PRIVATE';r.eventRef='SYNTHETIC_PRIVATE';
  r.provider.rule='/home/SYNTHETIC_PRIVATE';const out=core.exportProjection(r);
  assert.doesNotMatch(JSON.stringify(out),/SYNTHETIC_PRIVATE/);assert.equal(out.provider.state,'unavailable');
});
test('HTML escapes unsafe content instead of executable markup',()=>{
  assert.equal(core.escapeHtml(`<script>&"'`),'&lt;script&gt;&amp;&quot;&#39;');
  const q=core.queryRecords([record()]);q.records[0].executor.id.value='<img src=x onerror=alert(1)>';
  const html=core.renderActivity(q);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
test('T10 SOURCE/SCHEMA: no local economic assertions and reserved attestation fields stay null',()=>{
  const r=record();for(const key of ['VUC','vuc','canonicalVuc','reward','rewards','settlement','settlementAmount','rewardAmount'])assert.equal(Object.hasOwn(r,key),false);
  for(const key of ['signature','evidenceCommitment','policyVersion'])assert.equal(r[key],null);
});
