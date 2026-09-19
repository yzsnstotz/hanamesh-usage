import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('U23 stage4 standins and isolated-host scripts are present',()=>{
  for(const path of ['test/fixtures/core-standin/package.json','test/fixtures/core-standin/lib/index.js','test/fixtures/core-standin/profile/cordis.patch.yml','test/fixtures/core-standin-suite/package.template.json','test/fixtures/core-standin-suite/profile/cordis.patch.yml','scripts/p2/fresh-home.sh','scripts/p2/boot.sh','scripts/p2/pack-standins.mjs'])assert.equal(existsSync(new URL(`../${path}`,import.meta.url)),true,path);
  const standin=JSON.parse(read('test/fixtures/core-standin/package.json'));assert.equal(standin.dsh.bundle.patch,'./profile/cordis.patch.yml');assert.equal(standin.name,'hanamesh-core-standin');
  assert.equal((read('test/fixtures/core-standin/profile/cordis.patch.yml').match(/^\s*- id:/gm)??[]).length,1);
  assert.match(read('test/fixtures/core-standin/README.md'),/^STANDIN — 只为 P2 真实门，不是产物/);
  const suite=read('test/fixtures/core-standin-suite/profile/cordis.patch.yml');assert.equal((suite.match(/^\s*- id:/gm)??[]).length,2);assert.match(suite,/id: hanamesh-usage/);
});
test('U31 suite tgz bundles usage without a checkout-specific path',()=>{
  const archive=new URL('../test/fixtures/core-standin-suite/hanamesh-core-standin-suite-0.0.1-standin.tgz',import.meta.url);
  const extract=path=>{const result=spawnSync('tar',['-xOf',archive.pathname,path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  const list=spawnSync('tar',['-tzf',archive.pathname],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.match(list.stdout,/package\/node_modules\/hanamesh-usage\/package.json/);
  const manifest=JSON.parse(extract('package/package.json'));assert.equal(manifest.version,'0.0.1-standin');assert.equal(manifest.dependencies['hanamesh-usage'],'0.2.0-rc.4');assert.deepEqual(manifest.bundledDependencies,['hanamesh-usage']);assert.doesNotMatch(JSON.stringify(manifest),/file:\/\/|\/Users\//);
  assert.doesNotMatch(extract('package/lib/index.js'),/\.\.\/\.\.\/core-standin/);
});
