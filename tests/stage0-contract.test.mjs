import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { satisfies } from '../tools/pins.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('U04 package is the standalone hanamesh-usage DSH bundle', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'hanamesh-usage');
  assert.equal(pkg.version, '0.2.0-rc.33');
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) {
      for(const host of ['0.2.0-rc.2','0.2.0','0.2.1-alpha.2','0.2.1','0.2.9'])assert.equal(satisfies(host,version),true,`${name} admits ${host}`);
      for(const host of ['0.1.5-rc.2','0.2.0-rc.1','0.3.0-alpha.1','0.3.0','1.0.0'])assert.equal(satisfies(host,version),false,`${name} rejects ${host}`);
    }
  }
  for(const host of ['4.0.4','4.0.5-alpha.1','4.0.5','4.0.9'])assert.equal(satisfies(host,pkg.peerDependencies['@deepseek-ai/cordis']),true,`Cordis admits ${host}`);
  for(const host of ['4.0.3','4.0.5-alpha.0','4.1.0-alpha.1','4.1.0','5.0.0'])assert.equal(satisfies(host,pkg.peerDependencies['@deepseek-ai/cordis']),false,`Cordis rejects ${host}`);
  for(const host of ['4.5.4','4.6.5'])assert.equal(satisfies(host,pkg.peerDependencies.zod),true,`zod admits ${host}`);
  for(const host of ['4.5.3','5.0.0'])assert.equal(satisfies(host,pkg.peerDependencies.zod),false,`zod rejects ${host}`);
  assert.equal(pkg.overrides,undefined,'host peers must not be overridden back to build versions');
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh-storage-domain'], '0.2.1-alpha.2');
  assert.equal(pkg.devDependencies['@deepseek-ai/cordis'], '4.0.5-alpha.1');
  assert.match(read('src/host/pins.js'), /DSH_VERSION = '0\.2\.1-alpha\.2'/);
  assert.deepEqual(pkg.dsh.bundle, {patch:'./profile/cordis.patch.yml'});
  assert.equal(pkg.files.includes('profile'), true);
  assert.equal(pkg.dsh.client.platform, 'web');assert.equal(pkg.exports['./client'].default,'./lib/client.js');
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(
    Object.keys(pkg.peerDependencies).filter(name => name.startsWith('@hanamesh/') || name.startsWith('hanamesh-')),
    [],
  );
});

test('J1S2 no HanaMesh sibling or contract package is installed in any dependency section', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(
      Object.keys(pkg[section] ?? {}).filter(name => name.startsWith('@hanamesh/') || name.startsWith('hanamesh-')),
      [], section,
    );
  }
  assert.equal(pkg.scripts['test:contract'], 'pnpm run build && node --test --test-reporter=tap tests/stage0-contract.test.mjs tests/stage4-contract.test.mjs tests/contract-wire.test.mjs tests/shared-fact.test.mjs');
});

test('U04 bundle patch inserts exactly one hanamesh-usage loader row', () => {
  const patch = read('profile/cordis.patch.yml');
  assert.equal((patch.match(/^\s*- id:/gm) ?? []).length, 1);
  assert.match(patch, /^\s*- id: hanamesh-usage$/m);
  assert.match(patch, /^\s*name: hanamesh-usage$/m);
});

test('U02 runtime-registry is absent from package, source, vendor and contract inventory', () => {
  const pkg = JSON.parse(read('package.json'));
  const legacyPackage = ['@hanamesh/dsh-agent', 'registry'].join('-');
  const legacyPattern = new RegExp([
    ['dsh-agent', 'registry'].join('-'),
    ['HanaMeshAgent', 'Registry'].join(''),
    ['PINNED_REGISTRY', 'REQUIRED'].join('_'),
  ].join('|'));
  assert.equal(pkg.peerDependencies[legacyPackage], undefined);
  assert.equal(pkg.devDependencies[legacyPackage], undefined);
  assert.doesNotMatch(read('src/host/index.js'), legacyPattern);
  assert.equal(existsSync(new URL('../docs/contracts/runtime-registry', import.meta.url)), false);
  assert.equal(existsSync(new URL(`../vendor/${['hanamesh-dsh-agent','registry-0.1.0-rc.3.tgz'].join('-')}`, import.meta.url)), false);
});
