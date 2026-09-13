import {readFileSync,readdirSync,existsSync} from 'node:fs';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {validateConsistency} from './consistency-schema.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFileSync(p,'utf8'),digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),deps=JSON.parse(read('docs/contracts/dependencies.json'));
validateConsistency(JSON.parse(read('consistency.json')));
assert.equal(digest(deps.runtimeRegistry.artifact),deps.runtimeRegistry.sha256);
assert.deepEqual(lock.packages[''].peerDependencies,pkg.peerDependencies);
assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
assert.equal(pkg.private,true);assert.equal(pkg.version,'0.1.0-rc.3');assert.equal(pkg.peerDependencies['@hanamesh/dsh-agent-registry'],'0.1.0-rc.3');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const sources=walk('src').filter(p=>/\.(ts|js)$/.test(p));
for(const p of sources){
 if(p.endsWith('.js'))assert.equal(existsSync(p.slice(0,-3)+'.d.ts'),false,`JS entry must not be shadowed by sibling declarations: ${p}`);
 const s=read(p);
 assert.doesNotMatch(s,/(?:^|\s)(?:vuc|canonicalVuc|rewardAmount|settlementAmount|rewards?)\s*[:=]/im,`T10 ${p}`);
 assert.doesNotMatch(s,/(?:from\s+|import\s*\()['"](?:\.\.\/){3}|workspace:|file:\.\./,`T14 ${p}`);
 assert.doesNotMatch(s,/\bnew\s+HanaMeshAgentRegistry\b|\bfetch\s*\(\s*['"]https?:|\bconsole\.(?:log|error|warn)\s*\(/,`boundary ${p}`);
}
assert.match(read('src/host/index.js'),/storageDomain/);assert.match(read('src/host/index.js'),/layout:\s*'single'/);
assert.equal((read('src/core/store.ts').match(/await this\.global\.set\(/g)??[]).length,1);
for(const config of ['tsconfig.core.json','tsconfig.host.json']){const c=JSON.parse(read(config));assert.equal(c.compilerOptions.skipLibCheck,false);assert.equal(c.compilerOptions.strict,true);assert.notEqual(c.compilerOptions.noCheck,true);}
console.log(JSON.stringify({consistencySchemaValid:true,economicFieldMatches:0,lockedRegistrySha256:deps.runtimeRegistry.sha256,productionFilesScanned:sources.length,siblingSourceImports:0,lockScope:'PINNED_DEV_BUILD_CLOSURE_NOT_FULL_HOST',uiKitArtifactAvailable:false},null,2));
