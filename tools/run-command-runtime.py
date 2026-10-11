#!/usr/bin/env python3
"""Run the Usage component gate with a fresh DSH_HOME and no inherited credentials.

Arguments: desktop source checkout, run directory, ordinary sample tgz, Node binary,
required Usage candidate tgz, and optional ordinary page sample tgz.
The Desktop source checkout supplies the frozen public runtime; it is never modified.
"""
import argparse
from card_run import card_run
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--card',required=True)
parser.add_argument('--run',required=True)
parser.add_argument('desktop')
parser.add_argument('sample')
parser.add_argument('node')
parser.add_argument('--candidate',required=True)
parser.add_argument('--page-sample')
options=parser.parse_args()
run=card_run(options.card,options.run)
desktop,sample,node=[Path(p).resolve() for p in [options.desktop,options.sample,options.node]]
candidate=Path(options.candidate).resolve() if options.candidate else None
page_sample=Path(options.page_sample).resolve() if options.page_sample else None
usage=Path(__file__).resolve().parent.parent
assert sample.is_file() and node.is_file()
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
evidence = run / '_evidence' / ('page-consumer' if page_sample else 'command-consumer') / stamp
evidence.mkdir(parents=True, exist_ok=False)
home = run / 'dsh-home'
if home.exists():
    # Only this runner's disposable runtime; retain prior runtime bytes as evidence.
    active = subprocess.run(['lsof', '+D', str(home)], capture_output=True, text=True)
    assert active.returncode == 1 and not active.stdout.strip(), 'runtime is still in use'
    with tarfile.open(evidence / 'previous-profile.tar.gz', 'w:gz') as archive:
        archive.add(home, arcname='dsh-home')
    shutil.rmtree(home)
for name in ['dsh-home', 'tmp']:
    (run / name).mkdir(parents=True, exist_ok=True)
isolated_home=Path(tempfile.mkdtemp(prefix='command-home-',dir=run))
env = {'HOME': str(isolated_home), 'PATH': str(node.parent)+':/usr/bin:/bin:/usr/sbin:/sbin',
       'DSH_HOME': str(home), 'TMPDIR': str(run/'tmp'), 'npm_config_cache': os.environ.get('npm_config_cache',str(Path.home()/'.npm')),
       'npm_config_store_dir': os.environ.get('npm_config_store_dir',str(Path.home()/'Library/pnpm/store')), 'npm_config_userconfig': '/dev/null',
       'HANAMESH_RUNS_ROOT': str(Path(os.environ.get('HANAMESH_RUNS_ROOT',Path.home()/'.cache/hanamesh-runs')).resolve()), 'CI': '1', 'LANG': 'en_US.UTF-8', 'DSH_TELEMETRY_DISABLED': '1'}
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
# Usage must precede ordinary contributors; native registration facts are not retroactive.
assert candidate.is_file()
env['USAGE_GATE_CANDIDATE']=str(candidate)
execute('install-usage',[node,desktop/'apps/cli/lib/bin.js','plugin','--profile','web','add',candidate],desktop)
execute('install',[node,desktop/'apps/cli/lib/bin.js','plugin','--profile','web','add',sample],desktop)
if page_sample:
    assert page_sample.is_file()
    env['USAGE_GATE_PAGE_SAMPLE']=str(page_sample)
    execute('install-page-sample',[node,desktop/'apps/cli/lib/bin.js','plugin','--profile','web','add',page_sample],desktop)
execute('runtime', [node, usage/'tools/command-runtime.mjs', desktop, '--card', options.card, '--run', run], usage)
receipt = json.loads((run/'evidence/runtime.json').read_text())
assert receipt['result'] == 'PASS'
shutil.copy2(run/'evidence/runtime.json', evidence/'runtime.json')
print(json.dumps(receipt))
