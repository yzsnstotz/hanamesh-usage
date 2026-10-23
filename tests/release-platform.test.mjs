import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const gate='@hanamesh/release-platform-gate';
test('release gate is the reviewed 0.1.9 normal tar, dev-only with an immutable digest',()=>{
 assert.equal(pkg.devDependencies[gate],'file:vendor/hanamesh-release-platform-gate-0.1.9.tgz');
 assert.equal(pkg.dependencies?.[gate],undefined);assert.equal(pkg.peerDependencies?.[gate],undefined);
 const b=readFileSync(root+'vendor/hanamesh-release-platform-gate-0.1.9.tgz');
 assert.equal(b.length,33790);assert.equal(createHash('sha256').update(b).digest('hex'),'c72010c96a5f22e36d65f6c1fd850e583dead7e843644eba1657b4416d9cbd0d');
 assert.match(read('vendor/SHA256SUMS'),/c72010c96a5f22e36d65f6c1fd850e583dead7e843644eba1657b4416d9cbd0d  hanamesh-release-platform-gate-0.1.9.tgz/);
});
test('normal npm release entry checks and publishes one checked tar; directory publication is guarded',()=>{
 assert.equal(pkg.scripts['release:check'],'hanamesh-release check --lockfile pnpm-lock.yaml');
 assert.equal(pkg.scripts['release:publish'],'hanamesh-release publish --lockfile pnpm-lock.yaml');
 assert.equal(pkg.scripts.prepublishOnly,'hanamesh-release source-guard');
});
test('the existing required package/check entry has no bypass around release:check',()=>{
 if(pkg.name==='hanamesh-core') {
  assert.equal(pkg.scripts['verify:pack'],'node scripts/check-package.mjs && npm run release:check');
  assert.equal(pkg.scripts.pack,'npm run release:check');
 } else assert.equal(pkg.scripts.check,'node tools/check.mjs && npm run release:check');
});
test('CI includes frozen installation, original gates and immutable release gate without optional jobs',()=>{
 assert.equal(existsSync(root+'.github/workflows/release-check.yml'),true);
 const ci=read('.github/workflows/release-check.yml');
 for(const s of ['--frozen-lockfile','--strict-peer-dependencies','npm run build','npm test','npm run test:mutations','npm run check','npm run release:check']) assert.ok(ci.includes(s),s);
 assert.match(ci,/uses: actions\/upload-artifact@v4/);
 assert.match(ci,/if: always\(\)/);
 assert.doesNotMatch(ci,/continue-on-error|if:(?! always\(\))|npm publish|release:publish|contents: write|id-token: write/);
});
test('release documentation exposes the reason, no-disable contract, and named unsupported shapes',()=>{
 const doc=read('README.md');
 for(const s of ['DSH_PNPM_PLATFORM_CLOSURE','disableable=false','UNSUPPORTED_DEPENDENCY_SHAPE','dependency-shapes-v1','不能关闭','pnpm 11.7.0','npm run release:check','npm run release:publish']) assert.ok(doc.includes(s),s);
});
test('historical local-registry publisher cannot publish unchecked archives',()=>{
 if(pkg.name==='hanamesh-core') {
  const script=read('scripts/p1/publish.sh');
  assert.doesNotMatch(script,/npm publish|curl|_authToken|publish_if_missing/);
  assert.match(script,/npm run prepublishOnly/);
 } else assert.equal(pkg.scripts.prepublishOnly,'hanamesh-release source-guard');
});
