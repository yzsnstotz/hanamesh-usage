/** Mutate actual compiled implementation in independent temp copies; require assertion failures. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);const evidence=process.env.USAGE_MUTATION_EVIDENCE_DIR??'artifacts/mutations';mkdirSync(evidence,{recursive:true});
// Retired U06 executor->usage derivation: Session D removed chat-turn usage by owner decision.
// Keep X03 on the current local-summary path; no retired mutation is counted as passed.
const cases=[
 {name:'UPGRADE-reopen-legacy-rejection',requiresPeers:true,file:'lib/core/event-store.js',from:' || hasLegacyNonce(event)',to:'',test:'tests/legacy-nonce-upgrade.test.mjs',pattern:'explicit resend leaves legacy'},
 {name:'UPGRADE-reject-old-stored-nonce',file:'lib/core/event-store.js',from:'validateStoredEvent(event);',to:'validateEvent(event);',test:'tests/legacy-nonce-upgrade.test.mjs',pattern:'historical sent'},
 {name:'UPGRADE-admit-old-nonce-to-wire',file:'lib/core/events.js',from:'export function wireEvent(input) {\n    validateEvent(input);',to:'export function wireEvent(input) {\n    validateStoredEvent(input);',test:'tests/legacy-nonce-upgrade.test.mjs',pattern:'legacy read compatibility'},
 {name:'UPGRADE-publish-before-migration-durable',requiresPeers:true,file:'lib/host/index.js',from:'await eventDomain.global.set(compatible);',to:'void eventDomain.global.set(compatible);',test:'tests/legacy-nonce-upgrade.test.mjs',pattern:'production apply waits'},
 {name:'CONSENT-notice-every-session',file:'lib/agent/notice.mjs',from:"if(marker?.schemaVersion===2&&(marker.day===day||marker.session===session))return false;",to:"if(false)return false;",test:'tests/agent-first-consent.test.mjs',pattern:'first notice persists'},
 {name:'CONSENT-ignore-prior-decision',file:'lib/agent/onboarding.mjs',from:"if(core.consent.changedAt!==null)return false;",to:"if(false)return false;",test:'tests/agent-first-consent.test.mjs',pattern:'prior explicit refusal'},
 {name:'G-missing-response-is-success',file:'lib/agent/project.mjs',from:"if(payload.hook_event_name!=='PostToolUse'||!response||typeof response!=='object')return null;",to:"if(payload.hook_event_name!=='PostToolUse'||!response||typeof response!=='object')return true;",test:'tests/agent-lifecycle.test.mjs',pattern:'G real host hook shape'},
 {name:'G-pre-post-duplicate-identity',file:'lib/agent/project.mjs',from:'[channel,payload.session_id,call]',to:'[channel,payload.session_id,call,payload.hook_event_name]',test:'tests/agent-lifecycle.test.mjs',pattern:'G real host hook shape'},
 {name:'G-ignore-unknown-policy',file:'lib/agent/store.mjs',from:'catalog.settings.countUnconfirmedCalls!==true',to:'false',test:'tests/agent-lifecycle.test.mjs',pattern:'G one attempt promotes'},
 {name:'G-late-result-rewrites-frozen-fact',file:'lib/agent/store.mjs',from:'if(existing.wire){',to:'if(false){',test:'tests/agent-lifecycle.test.mjs',pattern:'G frozen unknown event'},
 {name:'G-omit-consent-epoch',file:'lib/core/agent-event.js',from:"action: 'use', occurredAt: row.occurredAt, eventId, nonce: `g${consentId}.${eventNonceForSeat(eventId)}`",to:"action: 'use', occurredAt: row.occurredAt, eventId, nonce: eventNonceForSeat(eventId)",test:'tests/agent-lifecycle.test.mjs',pattern:'G nine-field signature'},
 {name:'Q61-metadata-read-proves-uninstall',file:'lib/host/inventory.js',from:"if(typeof bundle.name==='string'&&accepted.has(bundle.name))throw new UsageError('INVENTORY_FAILED');",to:"/* mutant treats unknown metadata as removal */",test:'tests/q61-policy-diagnostics.test.mjs',pattern:'Q61 an unreadable bundle'},
 {name:'Q61-retention-default-changed',file:'lib/core/policy.js',from:'export const DEFAULT_EVENT_RETENTION_DAYS = 90;',to:'export const DEFAULT_EVENT_RETENTION_DAYS = 91;',test:'tests/q61-policy-diagnostics.test.mjs',pattern:'Q61 defaults'},
 {name:'Q61-command-source-silent-read-failure',file:'lib/host/command-source.js',from:"} catch { return rejected('COMMAND_SOURCE_UNREADABLE'); }",to:"} catch { return null; }",test:'tests/q61-policy-diagnostics.test.mjs',pattern:'Q61 command-source service'},
 {name:'Q18-random-event-nonce',file:'lib/core/identity.js',from:"JSON.stringify(['hanamesh-usage:seat-event-nonce:v1', eventId])",to:"JSON.stringify(['hanamesh-usage:seat-event-nonce:v1', Math.random()])",test:'tests/shared-fact.test.mjs',pattern:'Q18 two independent buffers'},
 {name:'Q18-local-now-for-missing-source-time',file:'lib/host/record.js',from:"if(input.occurredAt===undefined)throw new UsageError('FACT_TIME_UNAVAILABLE');",to:"if(input.occurredAt===undefined)input={...input,occurredAt:new Date(now()).toISOString()};",test:'tests/shared-fact.test.mjs',pattern:'Q18 missing source timestamp'},
 {name:'J2S2-page-replay-credential',file:'lib/host/page-facts.js',from:'credentials.delete(token); // single-use',to:'/* consumed incorrectly */ // single-use',test:'tests/page-facts.test.mjs',pattern:'Usage pages replaces'},
 {name:'J2S2-page-cross-peer',file:'lib/host/page-facts.js',from:'if(!item||item.peer!==peer)return rejected();',to:'if(!item)return rejected();',test:'tests/page-facts.test.mjs',pattern:'pages rejects forged'},
 {name:'J2S2-command-error-counted-as-use',file:'lib/host/command-facts.js',from:"if(data.kind!=='success'||item.source===null",to:"if(false||item.source===null",test:'tests/command-facts.test.mjs',pattern:'command errors, missing invocation'},
 {name:'T05-unavailable-to-zero',file:'lib/core/privacy.js',from:"return { state: 'unavailable', value: null, reason };",to:"return { state: 'reported', value: 0, source: 'synthetic.fixture', rule: 'mutant-wrong-zero' };",test:'tests/core.test.mjs',pattern:'T04 FIXTURE: unknown'},
 {name:'X03-reverse-durable-order',file:'lib/core/boundary.js',from:'await ensureSourceDurable();\n    return await commitSummary();',to:'const wrong = await commitSummary();\n    await ensureSourceDurable();\n    return wrong;',test:'tests/crash/boundary.test.mjs'},
 {name:'X03-summary-before-source',file:'lib/host/mount.js',from:"const record = projectTerminal(input, end);\n      await commitAfterSource",to:"const record = projectTerminal(input, end);\n      await store.put(record);\n      await commitAfterSource",test:'tests/host.test.mjs',pattern:'T12 FIXTURE: live source'},
 {name:'X03-withdraw-remote-first',file:'lib/host/upload.js',from:'if(current===null)await store.withdrawLocal(changedAt,deviceId);',to:'if(current===null){await requestWithdrawal(deviceId);await store.withdrawLocal(changedAt,deviceId);}',test:'tests/withdraw.test.mjs',pattern:'U15 withdrawal clears locally'},
 {name:'U14-unauthorized-marked-sent',file:'lib/host/upload.js',from:"if(response.status===401||response.status===403)return await fail('UPLOAD_UNAUTHORIZED',ids);",to:"if(response.status===401||response.status===403){await store.applyUpload(ids,{accepted:ids.length,duplicates:0,rejected:[],durability:'committed'},iso());return 'uploaded';}",test:'tests/upload.test.mjs',pattern:'U14 401'},
 {name:'U16-ignore-withheld-consent',file:'lib/host/upload.js',from:"if(core.getConsent()!=='granted'){state='stopped';return /** @type {const} */('withheld');}",to:"if(false){state='stopped';return /** @type {const} */('withheld');}",also:[{from:"const granted=readyCore?.getConsent()==='granted',sameDevice=",to:"const granted=true,sameDevice="},{from:"if(link.get()?.getConsent()!=='granted'){stop();return /** @type {const} */('withheld');}",to:"if(false){stop();return /** @type {const} */('withheld');}"}],test:'tests/upload.test.mjs',pattern:'U16 withheld'},
 {name:'T6-receipt-dropped-from-wire',file:'lib/core/events.js',from:"...(receipt === null ? {} : { receipt: { providerId: receipt.providerId, model: receipt.model, count: receipt.count } }),",to:"...{},",test:'tests/upload.test.mjs',pattern:'T6 attributed events upload'},
 {name:'T6-receipt-ignored-by-dedup-identity',file:'lib/core/event-store.js',from:"event.sourceHanaRef, event.targetRef, receipt === null ? null : [receipt.providerId, receipt.model, receipt.count]]);",to:"event.sourceHanaRef, event.targetRef]);",test:'tests/core.test.mjs',pattern:'T6 EventStore dedup identity'},
 {name:'R1-query-in-signed-path',file:'lib/host/upload.js',from:"const signed=await core.signRequest({method:'GET',path,body:null});",to:"const signed=await core.signRequest({method:'GET',path:url.pathname+url.search,body:null});",test:'tests/remote.test.mjs',pattern:'R1 remote readback'},
 {name:'R3-unavailable-reported-as-zero',file:'lib/host/upload.js',from:"if(status<200||status>=300)return unavailable('unknown','REMOTE_UNAVAILABLE',deviceId,status);",to:"if(status<200||status>=300)return {state:'available',deviceId,total:0,events:[],code:null,httpStatus:status,checkedAt};",test:'tests/remote.test.mjs',pattern:'R3 refusal'},
 {name:'U19-uninstall-uses-install-key',file:'lib/host/inventory.js',from:'eventIdForLoader(deviceId,change.action,change.hanaRef,change.version)',to:"eventIdForLoader(deviceId,'install',change.hanaRef,change.version)",test:'tests/inventory.test.mjs',pattern:'uninstall uses the uninstall identity key'},
 {name:'U20-agent-default-local',file:'lib/agent/onboarding.mjs',from:"if(core.consent.changedAt!==null)return false;",to:"if(core.consent.state!=='granted')return false;",test:'tests/agent-onboarding-v2.test.mjs',pattern:'local recording eligibility'},
 {name:'U21-agent-daily-cap',file:'lib/agent/notice.mjs',from:'marker.day===day||marker.session===session',to:'false||marker.session===session',test:'tests/agent-onboarding-v2.test.mjs',pattern:'both channels remind'},
 {name:'U22-agent-retention-cap',file:'lib/agent/store.mjs',from:'Math.min(30,catalog.settings.backfillWindowDays)',to:'catalog.settings.backfillWindowDays',test:'tests/agent-onboarding-v2.test.mjs',pattern:'30-day retention'},
 {name:'RC9-handoff-never-starts-tick',file:'lib/agent/cli.mjs',from:"if(command==='mcp-ready')active=tick();",to:"if(false)active=tick();",test:'tests/agent-onboarding-v2.test.mjs',pattern:'mcp-ready starts'},
 {name:'RC9-retry-within-same-session',file:'agent/bin/runtime-bootstrap.pl',from:"$is_session&&$new_session&&!($first_session&&($s->{initialEntry}//'non-session') eq 'non-session')",to:'$is_session',test:'tests/agent-runtime-background.test.mjs',pattern:'failure stays named'},
 {name:'RC9-fragment-loss-during-takeover',file:'agent/bin/runtime-bootstrap.pl',from:"if($line eq ''&&($s->{code}//'') eq 'RUNTIME_READY'&&-e $node)",to:"if(($s->{code}//'') eq 'RUNTIME_READY'&&-e $node)",also:[{from:"my $s=$line eq ''?readstate():undef;",to:'my $s=readstate();'}],test:'tests/agent-runtime-background.test.mjs',pattern:'fragmented'},
 {name:'R3-abandoned-publication-never-recovers',file:'agent/bin/runtime-bootstrap.pl',from:"if($old&&$old->{code} ne 'RUNTIME_READY'){",to:"if($old&&$old->{code} ne 'RUNTIME_READY'&&$old->{code} ne 'RUNTIME_PREPARING'){",test:'tests/agent-runtime-recovery.test.mjs',pattern:'published valid Node with an abandoned'},
 {name:'R3-active-preparation-lock-overwritten',file:'agent/bin/runtime-bootstrap.pl',from:'if(flock($fd,LOCK_EX|LOCK_NB)){',to:'if(1){',test:'tests/agent-runtime-recovery.test.mjs',pattern:'active preparation lock'},
];
cases.push({name:'B7-preparation-call-dropped',file:'agent/bin/runtime-bootstrap.pl',from:'retain_preparing_hook();',to:'# drop buffered calls',test:'tests/agent-preparation-recording.test.mjs'});
cases.push({name:'REMOTE-version-rule-reintroduced',file:'lib/agent/codex-remote.mjs',from:'for(const row of state.installed){',to:"for(const row of state.installed){if(row.version!=='1.0')continue;",test:'tests/agent-codex-remote.test.mjs',pattern:'remote ID and native name survive'});
const results=[];
for(const item of cases){
 const dir=mkdtempSync(join(tmpdir(),'usage-mutant-'));
 try{
  const command=['--test','--test-reporter=tap',...(item.pattern?[`--test-name-pattern=${item.pattern}`]:[]),item.test];
  const baseline=spawnSync(process.execPath,command,{encoding:'utf8',env:{...process.env,USAGE_TEST_ROOT:root}});
  writeFileSync(`${evidence}/${item.name}-baseline.tap`,(baseline.stdout??'')+(baseline.stderr??''));
  assert.equal(baseline.status,0,'baseline must pass');
  assert.doesNotMatch(baseline.stdout??'',/\b1\.\.0\b/,'mutation baseline must execute a matching test');
  cpSync('lib',join(dir,'lib'),{recursive:true});if(item.file.startsWith('agent/'))cpSync('agent',join(dir,'agent'),{recursive:true});writeFileSync(join(dir,'package.json'),' {"type":"module"}\n');
  if(item.requiresPeers)symlinkSync(resolve(root,'node_modules'),join(dir,'node_modules'),'dir');
  const path=resolve(dir,item.file);let mutated=readFileSync(path,'utf8');
  // A behavior guarded both at admission and after durable intent must lose
  // both checks to represent the same original "ignore consent" mutation.
  for(const change of [item,...(item.also??[])]){assert.equal(mutated.split(change.from).length,2,'mutation must hit exactly one implementation site');mutated=mutated.replace(change.from,change.to);}
  writeFileSync(path,mutated);
  const mutant=spawnSync(process.execPath,command,{encoding:'utf8',env:{...process.env,USAGE_TEST_ROOT:dir}});
  const output=(mutant.stdout??'')+(mutant.stderr??'');writeFileSync(`${evidence}/${item.name}-mutant.tap`,output.replaceAll(dir,'<isolated-mutant>').replace(/[ \t]+$/gm,''));
  assert.notEqual(mutant.status,0,'mutant must fail');assert.match(output,/ERR_ASSERTION/);assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError|INJECTION_TIMEOUT|EXIT_BEFORE_INJECTION/);
  results.push({mutation:item.name,status:'PASS',baselineExit:baseline.status,mutantExit:mutant.status,killedBy:'ERR_ASSERTION',evidence:'FIXTURE',site:item.file});console.log(JSON.stringify(results.at(-1)));
 }catch(error){const failure={mutation:item.name,status:'FAIL',error:String(error)};results.push(failure);console.error(JSON.stringify(failure));}finally{rmSync(dir,{recursive:true,force:true});}
}

writeFileSync(join(evidence,'results.json'),JSON.stringify(results,null,2)+'\n');if(results.some(row=>row.status!=='PASS'))process.exitCode=1;
