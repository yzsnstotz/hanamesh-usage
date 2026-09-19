/** Mutate actual compiled implementation in independent temp copies; require assertion failures. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);mkdirSync('docs/acceptance/raw',{recursive:true});
const cases=[
 {name:'T05-unavailable-to-zero',file:'lib/core/privacy.js',from:"return { state: 'unavailable', value: null, reason };",to:"return { state: 'reported', value: 0, source: 'synthetic.fixture', rule: 'mutant-wrong-zero' };",test:'tests/core.test.mjs',pattern:'T04 FIXTURE: unknown'},
 {name:'X03-reverse-durable-order',file:'lib/core/boundary.js',from:'await ensureSourceDurable();\n    return await commitSummary();',to:'const wrong = await commitSummary();\n    await ensureSourceDurable();\n    return wrong;',test:'tests/crash/boundary.test.mjs'},
 {name:'U06-guess-unavailable-executor',file:'lib/core/derive.js',from:"if (input.executor.id.state !== 'reported')\n        return { event: null, skipped: 'executorUnavailable' };",to:"if (input.executor.id.state !== 'reported')\n        input.executor.id = { state: 'reported', value: 'guessed-executor', source: 'synthetic.fixture', rule: 'mutant-guessed' };",test:'tests/derive.test.mjs',pattern:'U06 unavailable executor'},
 {name:'X03-derive-before-source',file:'lib/host/mount.js',from:"await commitAfterSource(async () => {\n        flush ??= ctx.sessions.flush(session).then(participated => {\n          if (!participated) throw new UsageError('NO_DURABILITY_LISTENER');\n        });\n        await flush;\n        await verifyTerminal(session.id, end);\n      }, async () => { const disposition=await store.put(record);if(disposition==='inserted')await derive(record);return disposition; });",to:"await derive(record);\n      await commitAfterSource(async () => {\n        flush ??= ctx.sessions.flush(session).then(participated => {\n          if (!participated) throw new UsageError('NO_DURABILITY_LISTENER');\n        });\n        await flush;\n        await verifyTerminal(session.id, end);\n      }, async () => store.put(record));",test:'tests/host.test.mjs',pattern:'U06 source declaration'},
 {name:'X03-withdraw-remote-first',file:'lib/host/upload.js',from:'if(current===null)await store.withdrawLocal(changedAt,deviceId);',to:'if(current===null){await requestWithdrawal(deviceId);await store.withdrawLocal(changedAt,deviceId);}',test:'tests/withdraw.test.mjs',pattern:'U15 withdrawal clears locally'},
 {name:'U14-unauthorized-marked-sent',file:'lib/host/upload.js',from:"if(response.status===401||response.status===403)return await fail('UPLOAD_UNAUTHORIZED',ids);",to:"if(response.status===401||response.status===403){await store.applyUpload(ids,{accepted:ids.length,duplicates:0,rejected:[],durability:'committed'},iso());return 'uploaded';}",test:'tests/upload.test.mjs',pattern:'U14 401'},
 {name:'U16-ignore-withheld-consent',file:'lib/host/upload.js',from:"if(core.getConsent()!=='granted'){state='stopped';return /** @type {const} */('withheld');}",to:"if(false){state='stopped';return /** @type {const} */('withheld');}",test:'tests/upload.test.mjs',pattern:'U16 withheld'},
];
for(const item of cases){
 const dir=mkdtempSync(join(tmpdir(),'usage-mutant-'));
 try{
  const command=['--test','--test-reporter=tap',...(item.pattern?[`--test-name-pattern=${item.pattern}`]:[]),item.test];
  const baseline=spawnSync(process.execPath,command,{encoding:'utf8',env:{...process.env,USAGE_TEST_ROOT:root}});
  writeFileSync(`docs/acceptance/raw/${item.name}-baseline.tap`,(baseline.stdout??'')+(baseline.stderr??''));
  assert.equal(baseline.status,0,'baseline must pass');
  cpSync('lib',join(dir,'lib'),{recursive:true});writeFileSync(join(dir,'package.json'),' {"type":"module"}\n');
  const path=resolve(dir,item.file),original=readFileSync(path,'utf8');assert.equal(original.split(item.from).length,2,'mutation must hit exactly one implementation site');
  writeFileSync(path,original.replace(item.from,item.to));
  const mutant=spawnSync(process.execPath,command,{encoding:'utf8',env:{...process.env,USAGE_TEST_ROOT:dir}});
  const output=(mutant.stdout??'')+(mutant.stderr??'');writeFileSync(`docs/acceptance/raw/${item.name}-mutant.tap`,output.replaceAll(dir,'<isolated-mutant>').replace(/[ \t]+$/gm,''));
  assert.notEqual(mutant.status,0,'mutant must fail');assert.match(output,/ERR_ASSERTION/);assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError|INJECTION_TIMEOUT|EXIT_BEFORE_INJECTION/);
  console.log(JSON.stringify({mutation:item.name,baselineExit:baseline.status,mutantExit:mutant.status,killedBy:'ERR_ASSERTION',evidence:'FIXTURE',site:item.file}));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
