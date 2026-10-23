import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
function scenario(t,fields={},script='release:check',args=[]) {
 const dir=mkdtempSync(join(tmpdir(),'hm-release-中文 space-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'.run-state.json'),JSON.stringify({owner:'release-wiring-test',state:'active',keep:false})+'\n');
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'hm-release-wiring-fixture',version:'1.0.0',files:['index.js'],scripts:source.scripts,...fields}));
 // Only release scripts run in this small package, never the product build.
 const fixture=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
 fixture.scripts=Object.fromEntries(['release:check','release:publish','prepublishOnly'].filter(k=>source.scripts[k]).map(k=>[k,source.scripts[k]]));
 writeFileSync(join(dir,'package.json'),JSON.stringify(fixture));writeFileSync(join(dir,'index.js'),'export const fixture=true;\n');
 writeFileSync(join(dir,'pnpm-lock.yaml'),JSON.stringify({lockfileVersion:'9.0',settings:{autoInstallPeers:true,excludeLinksFromLockfile:false},importers:{'.':Object.fromEntries(['dependencies','optionalDependencies'].filter(k=>fields[k]).map(k=>[k,Object.fromEntries(Object.entries(fields[k]).map(([name,spec])=>[name,{specifier:spec,version:spec}]))]))},packages:{},snapshots:{}}));
 const env={...process.env,PATH:join(root,'node_modules','.bin')+delimiter+process.env.PATH};
 const result=spawnSync('npm',['run',script,'--',...args],{cwd:dir,env,encoding:'utf8'});
 const lines=(result.stdout??'').trim().split('\n'),line=lines.findLast(s=>s.startsWith('{'));
 assert.ok(line,`normal npm entry must emit a JSON gate result: ${result.stdout} ${result.stderr}`);
 const receipt=JSON.parse(line);
 assert.equal(receipt.invariant,'DSH_PNPM_PLATFORM_CLOSURE');assert.equal(receipt.disableable,false);assert.match(receipt.reason,/cannot be disabled/);
 if(script==='release:check'&&args.length===0)assert.deepEqual(JSON.parse(readFileSync(join(dir,'artifacts/release-platform/receipt.json'),'utf8')),receipt);
 return {result,receipt,dir};
}
test('normal npm release entry checks the normal tar in a spaced non-ASCII path',t=>{
 const {result,receipt}=scenario(t);assert.equal(result.status,0,result.stderr);assert.equal(receipt.status,'PASS');assert.match(receipt.tarballSHA256,/^[a-f0-9]{64}$/);assert.match(receipt.lockfileSHA256,/^[a-f0-9]{64}$/);
});
for(const [axis,value] of [['os',['darwin']],['cpu',['arm64']],['libc',['glibc']],['os',[]]]) test(`normal release entry rejects actual ${axis}=${JSON.stringify(value)} even on a matching platform`,t=>{
 const {result,receipt}=scenario(t,{[axis]:value});assert.equal(result.status,1);assert.equal(receipt.status,'FAIL');assert.ok(receipt.findings.some(f=>f.code==='PLATFORM_FIELD'));
});
test('platform optional target is rejected through the release entry',t=>{
 const {result,receipt}=scenario(t,{optionalDependencies:{'helper-linux-x64':'1.0.0'}});assert.equal(result.status,1);assert.ok(receipt.findings.some(f=>f.code==='PLATFORM_OPTIONAL'),JSON.stringify(receipt));
});
test('contract-external resolver shape fails with actionable named fields and persisted receipt',t=>{
 const {result,receipt}=scenario(t,{pnpm:{overrides:{helper:'1.0.0'}}});assert.equal(result.status,1);
 const f=receipt.findings.find(f=>f.code==='UNSUPPORTED_DEPENDENCY_SHAPE');assert.ok(f);
 for(const k of ['package','path','shape','why','action','contract'])assert.ok(f[k],k);
});
test('directory guard refuses before any publish operation; no npm publish is invoked',t=>{
 const {result,receipt}=scenario(t,{},'prepublishOnly');assert.equal(result.status,1);assert.equal(receipt.findings[0].code,'SOURCE_PUBLISH_FORBIDDEN');
});
test('an attempted disable flag is named rejection, never a pass or warning',t=>{
 const {result,receipt}=scenario(t,{},'release:check',['--skip','true']);assert.equal(result.status,1);assert.equal(receipt.findings[0].code,'ARGUMENT_INVALID');
});
