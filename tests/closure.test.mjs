import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {satisfies} from '../tools/pins.mjs';
test('Q67 no arbitrary file or workspace source becomes a development artifact exception',async t=>{
 const {assertPhysicalClosure}=await import('../tools/closure.mjs');
 const root=mkdtempSync(join(tmpdir(),'usage-artifact-rejection-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'node_modules/a'),{recursive:true});writeFileSync(join(root,'node_modules/a/package.json'),JSON.stringify({name:'a',version:'1.0.0'}));
 for(const spec of ['file:vendor/a.tgz','file:../a','workspace:*'])assert.throws(()=>assertPhysicalClosure(root,{name:'root',devDependencies:{a:spec}},{packages:{'node_modules/a':{version:'1.0.0'}}}),/NON_REGISTRY_DEPENDENCY/);
});
test('Q67 the exact Core development archive still rejects changed bytes',async t=>{
 const {assertPhysicalClosure}=await import('../tools/closure.mjs');
 const root=mkdtempSync(join(tmpdir(),'usage-artifact-integrity-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'vendor'));mkdirSync(join(root,'node_modules/@hanamesh/core'),{recursive:true});
 writeFileSync(join(root,'vendor/hanamesh-core-0.3.33.tgz'),'changed archive');
 writeFileSync(join(root,'vendor/core-fixture.json'),JSON.stringify({repository:'https://github.com/yzsnstotz/hanamesh-core',commit:'b'.repeat(40),sha256:'a'.repeat(64)}));
 writeFileSync(join(root,'node_modules/@hanamesh/core/package.json'),JSON.stringify({name:'@hanamesh/core',version:'0.3.33'}));
 assert.throws(()=>assertPhysicalClosure(root,{name:'root',devDependencies:{'@hanamesh/core':'file:vendor/hanamesh-core-0.3.33.tgz'}},{packages:{'node_modules/@hanamesh/core':{version:'0.3.33'}}}),/CORE_FIXTURE_DIGEST/);
});
test('Q67 locked dependency ranges retain npm prerelease rules',()=>{
  for(const [version,spec,expected] of [['4.0.4','~4.0.4',true],['4.1.0','~4.0.4',false],['4.0.4','^3.0.0 || ^4.0.0',true],['0.2.0-rc.2','*',false],['0.2.0-rc.2','0.2.0-rc.2',true]])assert.equal(satisfies(version,spec),expected);
});
test('Q67 full physical closure rejects missing required dependencies and incompatible peers',async t=>{
  const {assertPhysicalClosure}=await import('../tools/closure.mjs');
  const root=mkdtempSync(join(tmpdir(),'usage-closure-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const pkg={name:'root',version:'1.0.0',devDependencies:{a:'1.0.0'}};
  const lock={packages:{'node_modules/a':{version:'1.0.0'},'node_modules/b':{version:'1.0.0'}}};
  const put=(name,manifest)=>{const dir=join(root,'node_modules',name);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'package.json'),JSON.stringify(manifest));};
  put('a',{name:'a',version:'1.0.0',dependencies:{b:'^1.0.0'},peerDependencies:{optional:'^1.0.0'},peerDependenciesMeta:{optional:{optional:true}},devDependencies:{notConsumerDependency:'1.0.0'}});
  assert.throws(()=>assertPhysicalClosure(root,pkg,lock),/MISSING_REQUIRED/);
  put('b',{name:'b',version:'1.0.0'});assert.equal(assertPhysicalClosure(root,pkg,lock).packages,2);
  put('a',{name:'a',version:'1.0.0',peerDependencies:{b:'^2.0.0'}});
  assert.throws(()=>assertPhysicalClosure(root,pkg,lock),/INCOMPATIBLE_DEPENDENCY/);
});
