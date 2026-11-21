import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {relativeReferences, checkTarball, scanPackage} from '../scripts/verify-pack-closure.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'pack-closure-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [name, content] of Object.entries({'package/package.json': '{"name":"@fixture/closure","version":"1.0.0","type":"module"}', ...files})) {
    await mkdir(join(root, name, '..'), {recursive: true});
    await writeFile(join(root, name), content);
  }
  return root;
}
function pack(root) {
  const archive = join(root, 'fixture.tgz');
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32/tar.exe') : 'tar';
  const result = spawnSync(tar, ['-czf', archive, '-C', root, 'package'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return archive;
}

test('packed closure parses imports, exports, dynamic import, require and require.resolve, ignoring text and comments', () => {
  const source = `// import './comment-missing.js'
    const text = "require('./string-missing.js')";
    import './one.js'; export * from './two.mjs'; export {x} from './three.js';
    const load = () => import('./four.js'); require('./five'); require.resolve('./six.json');
    import('./' + 'seven.js'); import(\`./eight.js\`); import('node:fs'); import('external');`;
  assert.deepEqual(relativeReferences(source, 'fixture.js').map(row => [row.kind, row.specifier]), [
    ['import', './one.js'], ['import', './two.mjs'], ['import', './three.js'], ['import', './four.js'],
    ['require', './five'], ['require', './six.json'], ['import', './seven.js'], ['import', './eight.js'],
  ]);
});

test('actual tgz: all files are inspected, including unexported tools and bundled modules', async t => {
  const root = await fixture(t, {
    'package/index.js': `import './entry.mjs?cache=1#fragment';`,
    'package/entry.mjs': 'export const x = 1;',
    'package/tools/unused.mjs': `import('./native-helper.mjs');`,
    'package/node_modules/@fixture/bundled/index.cjs': `require('./missing');`,
  });
  const result = await checkTarball(pack(root));
  assert.equal(result.files, 4);
  assert.equal(result.references, 3);
  assert.deepEqual(result.failures.map(row => [row.file, row.specifier, row.code]).sort(), [
    ['node_modules/@fixture/bundled/index.cjs', './missing', 'PACK_RELATIVE_MISSING'],
    ['tools/unused.mjs', './native-helper.mjs', 'PACK_RELATIVE_MISSING'],
  ]);
});

for (const source of [`import './absent.js'`, `export * from './absent.js'`, `import('./absent.js')`, `require('./absent.js')`, `require.resolve('./absent.js')`]) {
  test(`actual tgz rejects missing relative reference: ${source}`, async t => {
    const root = await fixture(t, {'package/index.js': source});
    const result = await checkTarball(pack(root));
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'PACK_RELATIVE_MISSING');
  });
}

test('ESM requires an exact file; CommonJS resolves extensions and directory package mains', async t => {
  const root = await fixture(t, {
    'package/index.mjs': `import './value'; import './dir';`,
    'package/loader.cjs': `require('./value'); require('./dir');`,
    'package/value.js': 'exports.value = 1;',
    'package/dir/package.json': '{"main":"main.cjs"}',
    'package/dir/main.cjs': 'exports.value = 1;',
  });
  const result = await checkTarball(pack(root));
  assert.deepEqual(result.failures.map(row => [row.file, row.specifier]), [['index.mjs', './value'], ['index.mjs', './dir']]);
});

test('lexical and physical references outside the package fail even when the target exists', async t => {
  const root = await fixture(t, {'package/index.js': `import '../outside.js'; import './link.js';`, 'outside.js': 'export const x=1;'});
  await symlink(join(root, 'outside.js'), join(root, 'package/link.js'));
  const result = await scanPackage(join(root, 'package'));
  assert.equal(result.failures.length, 3); // two imports plus the packed symlink file itself
  assert.ok(result.failures.every(row => row.code === 'PACK_RELATIVE_OUTSIDE'));
});

test('complete tgz passes without executing the packed code', async t => {
  const root = await fixture(t, {
    'package/index.js': `import {x} from './value.mjs'; throw new Error('must never execute');`,
    'package/value.mjs': 'export const x=1;',
    'package/loader.cjs': `require('./data.json');`,
    'package/data.json': '{}',
  });
  const result = await checkTarball(pack(root));
  assert.equal(result.references, 2);
  assert.deepEqual(result.failures, []);
});

test('normal pack runs prepack even when install policy ignores scripts', async t => {
  const root = await fixture(t, {
    'package/.npmrc': 'ignore-scripts=true\n',
    'package/package.json': JSON.stringify({name:'closure-lifecycle-fixture',version:'1.0.0',type:'module',files:['index.js','value.js'],scripts:{
      prepack:`node -e "require('fs').writeFileSync('index.js',\\\"import './value.js'\\\");require('fs').writeFileSync('value.js','export const x=1')"`,
    }}),
  });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-pack-closure.mjs', import.meta.url))], {
    cwd: join(root,'package'), encoding:'utf8', env:process.env,
  });
  assert.equal(result.status,0,result.stderr);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(receipt.files,2);
  assert.equal(receipt.references,1);
  assert.deepEqual(receipt.failures,[]);
});

test('the release CLI exits nonzero for a broken tarball', async t => {
  const root = await fixture(t, {'package/index.mjs': `import './missing.mjs';`});
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-pack-closure.mjs', import.meta.url)), pack(root)], {encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.failures.length,1);
  assert.equal(receipt.failures[0].code,'PACK_RELATIVE_MISSING');
});
