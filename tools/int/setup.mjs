// P04-USAGE-INT-01 assembly only: fresh DSH_HOME, then the public CLI installs the ordinary sample and the Usage
// candidate as ordinary bundles (PUBLIC_CLI_PLUGIN_ADD_BUNDLE). The Desktop checkout is read, never modified.
//   node tools/int/setup.mjs <desktop> <run> <sample.tgz> <usage.tgz>
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const [desktop, run, sample, candidate] = process.argv.slice(2).map(p => resolve(p));
if (!run?.endsWith('/hanamesh-runs/P04-USAGE-INT-01')) throw new Error('RUN_NOT_THIS_CARD');
const home = join(run, 'dsh-home');
if (process.env.DSH_HOME !== home) throw new Error('DSH_HOME_NOT_ISOLATED');
if (existsSync(join(home, 'profiles'))) throw new Error('DSH_HOME_NOT_FRESH');
mkdirSync(home, {recursive: true});
const receipts = [];
for (const [name, tgz] of [['sample', sample], ['usage', candidate]]) {
  const command = [process.execPath, join(desktop, 'apps/cli/lib/bin.js'), 'plugin', '--profile', 'web', 'add', tgz];
  const result = spawnSync(command[0], command.slice(1), {cwd: desktop, encoding: 'utf8', env: process.env});
  // The launcher can print a short-lived web credential; never keep it.
  const output = `${result.stdout}${result.stderr}`.replace(/([?&]token=)[^\s&]+/g, '$1[REDACTED]');
  receipts.push({name, command: command.slice(1), tgz, sha256: createHash('sha256').update(readFileSync(tgz)).digest('hex'), exitCode: result.status, output});
  if (result.status !== 0) break;
}
mkdirSync(join(run, 'state'), {recursive: true});
writeFileSync(join(run, 'state/install-receipts.json'), JSON.stringify({DSH_HOME: home, installation: 'PUBLIC_CLI_PLUGIN_ADD_BUNDLE', receipts}, null, 2) + '\n');
console.log(JSON.stringify(receipts.map(({name, sha256, exitCode}) => ({name, sha256, exitCode}))));
if (receipts.some(r => r.exitCode !== 0)) process.exit(1);
