import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {satisfies} from '../tools/pins.mjs';
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
