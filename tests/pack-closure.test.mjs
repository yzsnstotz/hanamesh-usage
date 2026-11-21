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

test('packed closure parses JS imports, re-exports, dynamic import, require and require.resolve, ignoring text and comments', () => {
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

function manifest(fields) {
  return JSON.stringify({name:'@fixture/closure',version:'1.0.0',type:'module',...fields});
}

test('R482 F1: package.json exports missing subpath makes the release CLI fail', async t => {
  const root = await fixture(t, {
    'package/package.json': manifest({exports:{'.':'./index.mjs','./broken':'./missing.mjs'}}),
    'package/index.mjs': 'export const x=1;',
  });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-pack-closure.mjs',import.meta.url)),pack(root)], {encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+'\n'+result.stderr);
  const receipt = JSON.parse(result.stdout.trim());
  assert.deepEqual(receipt.failures.map(row=>[row.entry,row.specifier,row.code]),[
    ['exports["./broken"]','./missing.mjs','PACK_ENTRY_MISSING'],
  ]);
});

test('package.json exports checks every nested condition and array fallback, preserving null', async t => {
  const root = await fixture(t, {
    'package/package.json': manifest({exports:{
      '.':{node:{import:'./index.mjs',require:'./missing.cjs'},browser:'./browser.mjs',types:'./index.d.ts',default:['./index.mjs',null,'./fallback.mjs']},
      './disabled':null,'./private/*':null,
    }}),
    'package/index.mjs': 'export const x=1;',
  });
  const result = await checkTarball(pack(root));
  assert.deepEqual(result.failures.map(row=>row.specifier).sort(),['./browser.mjs','./fallback.mjs','./index.d.ts','./missing.cjs']);
  assert.ok(result.failures.every(row=>row.code==='PACK_ENTRY_MISSING'));
});

for (const [field,value,entry] of [
  ['main','missing.js','main'],['module','./missing.mjs','module'],['types','./missing.d.ts','types'],
  ['bin','bin/missing','bin'],['bin',{valid:'bin/valid',broken:'bin/missing'},'bin["broken"]'],
]) {
  test(`package.json ${entry} is checked even with valid exports`,async t=>{
    const root = await fixture(t,{
      'package/package.json':manifest({exports:'./index.mjs',[field]:value}),
      'package/index.mjs':'export const x=1;','package/bin/valid':'#!/bin/sh\nexit 0\n',
    });
    const result = await checkTarball(pack(root));
    assert.deepEqual(result.failures.map(row=>[row.entry,row.code]),[[entry,'PACK_ENTRY_MISSING']]);
  });
}

test('package.json valid entry files, nested exports conditions, arrays, and null pass',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({main:'legacy',module:'./index.mjs',types:'types/index.d.ts',bin:{tool:'bin/tool'},exports:{
      '.':{types:'./types/index.d.ts',node:[{import:'./index.mjs',require:'./legacy.js'},null],default:'./index.mjs'},
      './disabled':null,'./private/*':null,
    }}),
    'package/index.mjs':'export const x=1;','package/legacy.js':'export const x=1;',
    'package/types/index.d.ts':'export declare const x:number;','package/bin/tool':'#!/bin/sh\nexit 0\n',
  });
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-pack-closure.mjs',import.meta.url)),pack(root)],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stdout+'\n'+cli.stderr);
  const result=JSON.parse(cli.stdout.trim());
  assert.deepEqual(result.failures,[]);
  assert.equal(result.entryTargets,8);
});

test('package.json exports patterns replace every star with the same nested subpath',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({exports:{
      './features/*.js':{types:'./types/*.d.ts',default:'./src/*/copy/*.mjs'},'./features/private/*':null,
    }}),
    'package/types/a.d.ts':'export {};','package/types/deep/b.d.ts':'export {};',
    'package/src/a/copy/a.mjs':'export {};','package/src/deep/b/copy/deep/b.mjs':'export {};',
  });
  const result=await checkTarball(pack(root));
  assert.deepEqual(result.failures,[]);
  assert.equal(result.entryTargets,4);
});

test('package.json exports patterns check missing sibling-condition targets for every expanded subpath',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({exports:{'./feature/*':{import:'./esm/*.mjs',require:'./cjs/*.cjs'}}}),
    'package/esm/a.mjs':'export {};','package/esm/b.mjs':'export {};','package/cjs/a.cjs':'module.exports={};',
  });
  const result=await checkTarball(pack(root));
  assert.deepEqual(result.failures.map(row=>[row.entry,row.specifier,row.code]),[
    ['exports["./feature/*"]["require"]','./cjs/b.cjs','PACK_ENTRY_MISSING'],
  ]);
});

test('package.json exports pattern with no packed targets fails',async t=>{
  const root=await fixture(t,{'package/package.json':manifest({exports:{'./feature/*':'./missing/*.js'}})});
  const result=await checkTarball(pack(root));
  assert.deepEqual(result.failures.map(row=>[row.specifier,row.code]),[['./missing/*.js','PACK_ENTRY_MISSING']]);
});

test('package.json null exclusions remove private wildcard subpaths before checking sibling conditions',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({exports:{
      './feature/*':{import:'./esm/*.mjs',require:'./cjs/*.cjs'},
      './feature/private/*':null,'./feature/hidden':null,
      './feature/private/public/*':'./special/*.mjs',
    }}),
    'package/esm/public.mjs':'export {};','package/cjs/public.cjs':'module.exports={};',
    'package/esm/private/internal.mjs':'export {};','package/esm/hidden.mjs':'export {};',
    'package/esm/private/public/allowed.mjs':'export {};','package/special/allowed.mjs':'export {};',
  });
  const result=await checkTarball(pack(root));
  assert.deepEqual(result.failures,[]);
  assert.equal(result.entryTargets,3);
});

test('package.json entries reject outside paths and exports targets inside node_modules',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({main:'../outside.js',module:'../outside.mjs',types:'../outside.d.ts',bin:'../outside-bin',exports:{
      './outside':'./../outside.mjs','./encoded':'./%2e%2e/outside.mjs','./dependency':'./node_modules/dependency/index.js',
    }}),
    'package/node_modules/dependency/index.js':'export {};',
  });
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-pack-closure.mjs',import.meta.url)),pack(root)],{encoding:'utf8'});
  assert.equal(cli.status,1,cli.stdout+'\n'+cli.stderr);
  const result=JSON.parse(cli.stdout.trim());
  assert.equal(result.failures.length,7);
  assert.ok(result.failures.every(row=>['PACK_ENTRY_OUTSIDE','PACK_ENTRY_INVALID'].includes(row.code)));
});

test('package.json entry realpaths cannot escape the package, and directory exports cannot replace files',async t=>{
  const root=await fixture(t,{
    'package/package.json':manifest({types:'./linked.d.ts',exports:{'.':'./directory'}}),
    'package/directory/index.mjs':'export {};','outside.d.ts':'export {};',
  });
  await symlink(join(root,'outside.d.ts'),join(root,'package/linked.d.ts'));
  const result=await scanPackage(join(root,'package'));
  assert.deepEqual(result.failures.map(row=>[row.entry,row.code]),[
    ['exports["."]','PACK_ENTRY_MISSING'],['types','PACK_ENTRY_OUTSIDE'],
  ]);
});

test('package.json entries of packed nested packages are checked too',async t=>{
  const root=await fixture(t,{
    'package/node_modules/dependency/package.json':manifest({exports:{'.':'./missing.mjs'}}),
  });
  const result=await checkTarball(pack(root));
  assert.deepEqual(result.failures.map(row=>[row.file,row.entry,row.code]),[
    ['node_modules/dependency/package.json','exports["."]','PACK_ENTRY_MISSING'],
  ]);
});
