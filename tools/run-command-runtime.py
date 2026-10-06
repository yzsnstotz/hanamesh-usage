#!/usr/bin/env python3
"""Run the Usage component gate with a fresh DSH_HOME and no inherited credentials.

Arguments: desktop source checkout, run directory, ordinary sample tgz, Node binary,
optionally the private Usage candidate tgz (installed via the ordinary bundle path).
The Desktop source checkout supplies the frozen public runtime; it is never modified.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

desktop, run, sample, node = [Path(p).resolve() for p in sys.argv[1:5]]
candidate = Path(sys.argv[5]).resolve() if len(sys.argv) > 5 else None
usage = Path(__file__).resolve().parent.parent
assert run.is_relative_to(Path.home() / '.cache/hanamesh-runs/NPM-USAGE-01')
assert sample.is_file() and node.is_file()
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
evidence = run.parent / '_evidence/command-consumer' / stamp
evidence.mkdir(parents=True, exist_ok=False)
home = run / 'dsh-home'
if home.exists():
    # Only this runner's disposable runtime; retain prior runtime bytes as evidence.
    active = subprocess.run(['lsof', '+D', str(home)], capture_output=True, text=True)
    assert active.returncode == 1 and not active.stdout.strip(), 'runtime is still in use'
    with tarfile.open(evidence / 'previous-profile.tar.gz', 'w:gz') as archive:
        archive.add(home, arcname='dsh-home')
    shutil.rmtree(home)
for name in ['dsh-home', 'tmp', 'npm-cache', 'pnpm-store']:
    (run / name).mkdir(parents=True, exist_ok=True)
env = {'HOME': os.environ['HOME'], 'PATH': str(node.parent)+':/usr/bin:/bin:/usr/sbin:/sbin',
       'DSH_HOME': str(home), 'TMPDIR': str(run/'tmp'), 'npm_config_cache': str(run/'npm-cache'),
       'npm_config_store_dir': str(run/'pnpm-store'), 'npm_config_userconfig': '/dev/null',
       'CI': '1', 'LANG': 'en_US.UTF-8', 'DSH_TELEMETRY_DISABLED': '1'}
def execute(name, command, cwd):
    result = subprocess.run([str(x) for x in command], cwd=cwd, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=90)
    output = re.sub(r'([?&]token=)[^\s&]+', r'\1[REDACTED]', result.stdout)
    (evidence/f'{name}.log').write_text(output)
    receipt = {'command': [str(x) for x in command], 'cwd': str(cwd),
               'environmentNames': sorted(env), 'DSH_HOME': str(home),
               'exitCode': result.returncode, 'outputSha256': hashlib.sha256(output.encode()).hexdigest()}
    (evidence/f'{name}.receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'step': name, 'exitCode': result.returncode, 'evidence': str(evidence)}), flush=True)
    if result.returncode:
        print(output[-4000:])
        raise SystemExit(result.returncode)
execute('install', [node, desktop/'apps/cli/lib/bin.js', 'plugin', '--profile', 'web', 'add', sample], desktop)
if candidate:
    assert candidate.is_file()
    env['USAGE_GATE_CANDIDATE'] = str(candidate)
    execute('install-usage', [node, desktop/'apps/cli/lib/bin.js', 'plugin', '--profile', 'web', 'add', candidate], desktop)
execute('runtime', [node, usage/'tools/command-runtime.mjs', desktop, run], usage)
receipt = json.loads((run/'evidence/runtime.json').read_text())
assert receipt['result'] == 'PASS'
shutil.copy2(run/'evidence/runtime.json', evidence/'runtime.json')
print(json.dumps(receipt))
