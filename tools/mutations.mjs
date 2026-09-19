/** Mutate actual compiled implementation in independent temp copies; require assertion failures. */
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);mkdirSync('docs/acceptance/raw',{recursive:true});
const cases=[
 {name:'T05-unavailable-to-zero',file:'lib/core/privacy.js',from:"return { state: 'unavailable', value: null, reason };",to:"return { state: 'reported', value: 0, source: 'synthetic.fixture', rule: 'mutant-wrong-zero' };",test:'tests/core.test.mjs',pattern:'T04 FIXTURE: unknown'},
 {name:'X03-reverse-durable-order',file:'lib/core/boundary.js',from:'await ensureSourceDurable();\n    return await commitSummary();',to:'const wrong = await commitSummary();\n    await ensureSourceDurable();\n    return wrong;',test:'tests/crash/boundary.test.mjs'},
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
  const output=(mutant.stdout??'')+(mutant.stderr??'');writeFileSync(`docs/acceptance/raw/${item.name}-mutant.tap`,output.replaceAll(dir,'<isolated-mutant>'));
  assert.notEqual(mutant.status,0,'mutant must fail');assert.match(output,/ERR_ASSERTION/);assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError|INJECTION_TIMEOUT|EXIT_BEFORE_INJECTION/);
  console.log(JSON.stringify({mutation:item.name,baselineExit:baseline.status,mutantExit:mutant.status,killedBy:'ERR_ASSERTION',evidence:'FIXTURE',site:item.file}));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
