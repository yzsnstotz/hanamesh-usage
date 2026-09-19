import {readFileSync,readdirSync,existsSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {validateConsistency} from './consistency-schema.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
validateConsistency(JSON.parse(read('consistency.json')));
assert.deepEqual(lock.packages[''].peerDependencies,pkg.peerDependencies);
assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
assert.equal(pkg.name,'hanamesh-usage');assert.equal(pkg.version,'0.2.0-rc.1');assert.equal(pkg.private,undefined);assert.equal(pkg.license,'MIT');
assert.deepEqual(pkg.dependencies??{},{});assert.equal(Object.keys(pkg.peerDependencies).filter(name=>name.startsWith('@hanamesh/')||name.startsWith('hanamesh-')).length,0);
assert.equal(pkg.dsh?.bundle?.patch,'./profile/cordis.patch.yml');assert.equal(pkg.dsh?.client,undefined);assert(pkg.files.includes('profile'));assert(existsSync(pkg.dsh.bundle.patch));
const patch=read(pkg.dsh.bundle.patch);assert.equal((patch.match(/^\s*- id:/gm)??[]).length,1);assert.match(patch,/^\s*- id: hanamesh-usage$/m);assert.match(patch,/^\s*name: hanamesh-usage$/m);
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const sources=walk('src').filter(p=>/\.(ts|js)$/.test(p));
const forbiddenSibling=new RegExp(`(?:from\\s+|import\\s*\\()['"](?:hanamesh-core|@hanamesh/dsh-app-host|${['@hanamesh/dsh-agent','registry'].join('-')})['"]`);
for(const p of sources){
 if(p.endsWith('.js'))assert.equal(existsSync(p.slice(0,-3)+'.d.ts'),false,`JS entry must not be shadowed by sibling declarations: ${p}`);
 const s=read(p);
 assert.doesNotMatch(s,/(?:^|\s)(?:vuc|canonicalVuc|rewardAmount|settlementAmount|rewards?)\s*[:=]/im,`T10 ${p}`);
 assert.doesNotMatch(s,/(?:from\s+|import\s*\()['"](?:\.\.\/){3}|workspace:|file:\.\./,`T14 ${p}`);
 assert.doesNotMatch(s,forbiddenSibling,`sibling import ${p}`);
 if(p.endsWith('src/host/upload.js')){
   assert.match(s,/getServerOrigin/);assert.match(s,/new URL\(/);
 }else assert.doesNotMatch(s,/\bfetch\s*\(/,`outbound fetch ${p}`);
 assert.doesNotMatch(s,/\bconsole\.(?:log|error|warn)\s*\(/,`boundary ${p}`);
}
assert.match(read('src/host/index.js'),/storageDomain/);assert.match(read('src/host/index.js'),/layout:\s*'single'/);
assert.equal((read('src/core/store.ts').match(/await this\.global\.set\(/g)??[]).length,1);
for(const config of ['tsconfig.core.json','tsconfig.host.json']){const c=JSON.parse(read(config));assert.equal(c.compilerOptions.skipLibCheck,false);assert.equal(c.compilerOptions.strict,true);assert.notEqual(c.compilerOptions.noCheck,true);}
console.log(JSON.stringify({consistencySchemaValid:true,economicFieldMatches:0,bundleRows:1,productionFilesScanned:sources.length,siblingSourceImports:0,lockScope:'PINNED_DEV_BUILD_CLOSURE_NOT_FULL_HOST'},null,2));
