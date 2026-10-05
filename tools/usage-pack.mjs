/** Usage archive and public-consumer policy; packing engine belongs to devkit. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const tarball=resolve(root,process.env.USAGE_PACK_TARBALL??`artifacts/hanamesh-usage-${pkg.version}.tgz`);
export const packConfig={root,tarball,required:['lib/host/index.js','lib/host/index.d.ts','lib/core/index.js','lib/core/index.d.ts','profile/cordis.patch.yml','consistency.json'],forbidden:/node_modules\/|vendor\/|tests?\/|tools\/|artifacts\/|devkit.config/u,
 validate:({entries,read})=>{
  const manifest=JSON.parse(read('package.json'));
  assert.equal(manifest.name,pkg.name);assert.equal(manifest.version,pkg.version);
  assert.deepEqual(manifest.dependencies??{},{});
  assert.equal(manifest.peerDependencies['@hanamesh/devkit'],'0.1.0-rc.1');
  assert.deepEqual(manifest.peerDependenciesMeta['@hanamesh/devkit'],{optional:true});
  for(const entry of entries.filter(entry=>entry.endsWith('.js')||entry.endsWith('.d.ts')))assert.doesNotMatch(read(entry.slice('package/'.length)).toString(),/@hanamesh\/devkit/);
 },consumer:{packageJson:{name:'usage-public-consumer',private:true,type:'module',dependencies:{'@types/node':pkg.devDependencies['@types/node'],'hanamesh-usage':`file:${tarball}`,...Object.fromEntries(Object.entries(pkg.peerDependencies).filter(([name])=>name!=='@hanamesh/devkit'))}},
 javascript:`import assert from 'node:assert/strict';
import {name,apply,usageDomainSpec} from 'hanamesh-usage';
import {commitAfterSource} from 'hanamesh-usage/core';
assert.equal(name,'hanamesh-usage');assert.equal(typeof apply,'function');assert.ok(usageDomainSpec);
const calls=[];assert.equal(await commitAfterSource(async()=>calls.push('source'),async()=>{calls.push('summary');return 7;}),7);assert.deepEqual(calls,['source','summary']);
assert.throws(()=>import.meta.resolve('@hanamesh/devkit'),{code:'ERR_MODULE_NOT_FOUND'});
console.log('PUBLIC_JS_CONSUMER: installed tarball, no devkit runtime');`,
 typescript:`import {name,apply} from 'hanamesh-usage';
import type {UsageService,Config} from 'hanamesh-usage';
import {commitAfterSource} from 'hanamesh-usage/core';
const pluginName:'hanamesh-usage'=name;
const publicApply:typeof apply=apply;
const config:Config={};
const result:Promise<number>=commitAfterSource(async()=>{},async()=>7);
declare const service:UsageService;
void [pluginName,publicApply,config,result,service];`
 }};
