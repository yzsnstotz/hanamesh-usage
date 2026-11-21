// Parse packed JavaScript with the existing TypeScript compiler, never execute it.
// https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
import ts from 'typescript';
import {mkdtemp, readdir, readFile, realpath, rm, stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {realpathSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {delimiter, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32/tar.exe') : 'tar';
function npmEntry() {
  const directories = [dirname(process.execPath), ...(process.env.PATH ?? process.env.Path ?? '').split(delimiter)];
  const candidates = [process.env.npm_execpath, ...directories.flatMap(directory => [
    join(directory, 'node_modules/npm/bin/npm-cli.js'),
    join(directory, '../lib/node_modules/npm/bin/npm-cli.js'), join(directory, 'npm'),
  ])].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const file = realpathSync(candidate);
      if (/[/\\]npm-cli\.js$/u.test(file) && statSync(file).isFile()) return file;
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new Error('NPM_CLI_ENTRY_REQUIRED');
}
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options});
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${executable} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
function inside(root, file) {
  const path = relative(root, file);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
}
function literal(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  // Constant concatenation appears in generated bundles as well as hand-written JS.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literal(node.left), right = literal(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
}
export function relativeReferences(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) throw new Error(`PACK_JS_PARSE_FAILED: ${filename}: ${ts.flattenDiagnosticMessageText(tree.parseDiagnostics[0].messageText, ' ')}`);
  const references = [];
  function visit(node) {
    let argument, kind = 'import';
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) argument = node.moduleSpecifier;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) argument = node.arguments[0];
      else if ((ts.isIdentifier(callee) && callee.text === 'require') ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'require' && callee.name.text === 'resolve')) {
        argument = node.arguments[0]; kind = 'require';
      }
    }
    const specifier = argument && literal(argument);
    if (specifier !== undefined && /^(?:\.{1,2})(?:\/|$)/u.test(specifier)) {
      references.push({specifier, kind, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1});
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return references;
}

export async function scanPackage(directory) {
  const root = await realpath(directory), failures = [];
  let files = 0, references = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!/\.(?:js|mjs|cjs)$/u.test(entry.name)) continue;
      const physical = await realpath(file);
      if (!inside(root, physical)) { failures.push({file: relative(root, file), code: 'PACK_RELATIVE_OUTSIDE'}); continue; }
      files++;
      for (const reference of relativeReferences(await readFile(file, 'utf8'), relative(root, file))) {
        references++;
        const row = {file: relative(root, file), ...reference};
        const target = reference.kind === 'require' ? resolve(dirname(file), reference.specifier)
          : fileURLToPath(new URL(reference.specifier, pathToFileURL(file)));
        if (!inside(root, target)) { failures.push({...row, code: 'PACK_RELATIVE_OUTSIDE'}); continue; }
        try {
          const resolved = reference.kind === 'require' ? createRequire(file).resolve(reference.specifier) : target;
          if (!inside(root, await realpath(resolved))) failures.push({...row, code: 'PACK_RELATIVE_OUTSIDE'});
          else if (!(await stat(resolved)).isFile()) failures.push({...row, code: 'PACK_RELATIVE_MISSING'});
        } catch (error) {
          if (['ENOENT', 'ENOTDIR', 'MODULE_NOT_FOUND'].includes(error.code)) failures.push({...row, code: 'PACK_RELATIVE_MISSING'});
          else throw error;
        }
      }
    }
  }
  await walk(root);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  return {name: pkg.name, version: pkg.version, files, references, failures};
}

export async function checkTarball(archive) {
  const temporary = await mkdtemp(join(tmpdir(), 'hanamesh-pack-closure-'));
  try {
    const entries = command(tar, ['-tzf', resolve(archive)]).trim().split('\n');
    if (entries.some(entry => !entry.startsWith('package/') || entry.split('/').includes('..'))) throw new Error('PACK_ARCHIVE_PATH_INVALID');
    command(tar, ['-xzf', resolve(archive), '-C', temporary]);
    return await scanPackage(join(temporary, 'package'));
  } finally { await rm(temporary, {recursive: true, force: true}); }
}

// No argument: normal npm pack (including prepack), then inspect that exact tgz.
// One argument: inspect an existing artifact without rebuilding or repacking it.
export async function main(args = process.argv.slice(2)) {
  if (args.length > 1) throw new Error('Usage: node verify-pack-closure.mjs [package.tgz]');
  let temporary;
  try {
    let archive = args[0];
    if (!archive) {
      temporary = await mkdtemp(join(tmpdir(), 'hanamesh-pack-candidate-'));
      const npm = npmEntry();
      // Install-time ignore-scripts policies must not silently skip the release build.
      const output = command(process.execPath, [npm, 'pack', '--ignore-scripts=false', '--pack-destination', temporary]);
      process.stderr.write(output);
      const archives = (await readdir(temporary)).filter(name => name.endsWith('.tgz'));
      if (archives.length !== 1) throw new Error('PACK_ARTIFACT_REQUIRED');
      archive = join(temporary, archives[0]);
    }
    const receipt = await checkTarball(archive);
    console.log(JSON.stringify({gate: 'PACK_RELATIVE_CLOSURE', archive: resolve(archive), ...receipt}));
    if (receipt.failures.length) process.exitCode = 1;
  } finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
