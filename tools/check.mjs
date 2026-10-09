import {readFileSync,readdirSync,existsSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {validateConsistency} from './consistency-schema.mjs';
import {spawnSync} from 'node:child_process';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
validateConsistency(JSON.parse(read('consistency.json')));
assert.deepEqual(lock.packages[''].peerDependencies,pkg.peerDependencies);
assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
const closure=spawnSync('npm',['ls','--all','--json'],{encoding:'utf8'});
assert.equal(closure.status,0,closure.stderr);
assert.deepEqual(JSON.parse(closure.stdout).problems??[],[]);
assert.equal(pkg.name,'hanamesh-usage');assert.equal(pkg.version,'0.2.0-rc.19');assert.equal(pkg.private,undefined);assert.equal(pkg.license,'MIT');
assert.deepEqual(pkg.dependencies??{},{});assert.equal(Object.keys(pkg.peerDependencies).filter(name=>name.startsWith('@hanamesh/')||name.startsWith('hanamesh-')).length,0);
assert.equal(pkg.dsh?.bundle?.patch,'./profile/cordis.patch.yml');assert.equal(pkg.dsh?.client?.platform,'web');assert.equal(pkg.exports['./client'].default,'./lib/client.js');assert(pkg.files.includes('profile'));assert(existsSync(pkg.dsh.bundle.patch));
const dependencies=JSON.parse(read('docs/contracts/dependencies.json'));
assert.equal(pkg.devDependencies['hanamesh-core'],dependencies.hanameshCore.source);
assert.equal(pkg.devDependencies['@hanamesh/server-usage'],dependencies.serverUsage.source);
assert.equal(existsSync('docs/contracts/hanamesh-core'),false);
for(const name of ['hanamesh-core','@hanamesh/server-usage']) {
 assert.match(pkg.devDependencies[name],/^git\+https:\/\/github\.com\/yzsnstotz\/[^#]+#semver:\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
 assert.match(lock.packages[`node_modules/${name}`].resolved,/#[0-9a-f]{40}$/);
}
await import('hanamesh-core/contract/suite');
await import('@hanamesh/server-usage/conformance');
const patch=read(pkg.dsh.bundle.patch);assert.equal((patch.match(/^\s*- id:/gm)??[]).length,1);assert.match(patch,/^\s*- id: hanamesh-usage$/m);assert.match(patch,/^\s*name: hanamesh-usage$/m);
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const sources=walk('src').filter(p=>/\.(ts|js)$/.test(p));
const forbiddenSibling=new RegExp(`(?:from\\s+|import\\s*\\()['"](?:hanamesh-core|@hanamesh/dsh-app-host|${['@hanamesh/dsh-agent','registry'].join('-')})['"]`);
for(const p of sources){
 if(p.endsWith('.js'))assert.equal(existsSync(p.slice(0,-3)+'.d.ts'),false,`JS entry must not be shadowed by sibling declarations: ${p}`);
 const s=read(p);
 assert.doesNotMatch(s,/(?:^|\s)(?:vuc|canonicalVuc|rewardAmount|settlementAmount|rewards?)\s*[:=]/im,`T10 ${p}`);
 assert.doesNotMatch(s,/\bproducer\b/,`legacy summaries producer must not enter event path ${p}`);
 assert.doesNotMatch(s,/(?:from\s+|import\s*\()['"](?:\.\.\/){3}|workspace:|file:\.\./,`T14 ${p}`);
 assert.doesNotMatch(s,forbiddenSibling,`sibling import ${p}`);
 if(p.endsWith('src/host/upload.js')){
   assert.match(s,/getServerOrigin/);assert.match(s,/new URL\(/);
 }else if(p==='src/client/index.ts'){
   const calls=[...s.matchAll(/\bfetch\s*\(([^,]+),/g)].map(match=>match[1]);
   assert.deepEqual(calls,["'api/hanamesh/usage/panel/view'","'api/hanamesh/usage/panel/view'"],`client only reads its own authenticated panel ${p}`);
   assert.match(s,/method:'GET'/);assert.doesNotMatch(s,/https?:|ctx\.get\(/);
 }else assert.doesNotMatch(s,/\bfetch\s*\(/,`outbound fetch ${p}`);
 assert.doesNotMatch(s,/\bconsole\.(?:log|error|warn)\s*\(/,`boundary ${p}`);
}
assert.match(read('src/host/index.js'),/storageDomain/);assert.match(read('src/host/index.js'),/layout:\s*'single'/);
for(const store of ['src/core/store.ts','src/core/event-store.ts'])assert.equal((read(store).match(/await this\.global\.set\(/g)??[]).length,1,`${store} must publish each mutation with one global.set site`);
for(const config of ['tsconfig.core.json','tsconfig.host.json']){const c=JSON.parse(read(config));assert.equal(c.compilerOptions.skipLibCheck,false);assert.equal(c.compilerOptions.strict,true);assert.notEqual(c.compilerOptions.noCheck,true);}
console.log(JSON.stringify({consistencySchemaValid:true,consistencyGroups:2,consistencyBoundaries:3,economicFieldMatches:0,bundleRows:1,productionFilesScanned:sources.length,siblingSourceImports:0,lockScope:'PINNED_DEV_BUILD_CLOSURE_NOT_FULL_HOST'},null,2));
