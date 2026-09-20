import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { installedPeer, satisfies } from './pins.mjs';
const offline = process.argv.includes('--offline');
const require = createRequire(import.meta.url);
const tsc = spawnSync('tsc',['--version'],{encoding:'utf8'});
console.log(JSON.stringify({node:process.version, compiler:tsc.stdout.trim(), offline, platform:process.platform, arch:process.arch}));
if (!offline) {
  const pnpm = spawnSync('pnpm',['--version'],{encoding:'utf8'});
  if (process.version !== 'v24.13.1' || tsc.stdout.trim() !== 'Version 5.9.3' || pnpm.stdout?.trim() !== '10.33.0') {
    console.error('TARGET_TOOLCHAIN_MISSING: require Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3'); process.exit(2);
  }
  const pkg = require('../package.json');
  for (const [name,version] of Object.entries(pkg.peerDependencies)) {
    try {
      const resolved = installedPeer(name);
      if (!satisfies(resolved.version, version)) throw new Error('version');
    } catch { console.error(`PINNED_PEER_MISSING_OR_MISMATCHED: ${name}@${version}`); process.exit(2); }
  }
}
const compile = spawnSync('tsc',['-p','tsconfig.core.json'],{stdio:'inherit'});
if (compile.status !== 0) process.exit(compile.status ?? 1);
mkdirSync('lib/host',{recursive:true});
for (const file of readdirSync('src/host')) copyFileSync(`src/host/${file}`,`lib/host/${file}`);
copyFileSync('types/host-index.d.ts','lib/host/index.d.ts');
if (!offline) {
  const host = spawnSync('tsc',['-p','tsconfig.host.json'],{stdio:'inherit'});
  if (host.status !== 0) process.exit(host.status ?? 1);
}
console.log(offline ? 'OFFLINE_CORE_SEMANTIC_BUILD_COMPLETE; HOST_JS_COPIED_NOT_TYPECHECKED' : 'TARGET_SEMANTIC_BUILD_COMPLETE');
