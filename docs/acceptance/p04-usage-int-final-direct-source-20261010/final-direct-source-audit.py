from pathlib import Path
import hashlib, json, subprocess, tarfile, datetime

run = Path(__file__).resolve().parents[1]
out = run / 'evidence' / 'final-direct-source-audit'
out.mkdir(parents=True, exist_ok=False)
docs = Path('/Users/yzliu/.cache/hanamesh-pm-1921-docs-merge')
source = Path('/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01/real-c0f2439f-2b2a-4036-932b-ef0b85728101/source/hanamesh-usage')
core = Path('/Users/yzliu/work/projects/hanamesh/hanamesh-core')
srv = Path('/Users/yzliu/work/projects/hanamesh/hanamesh-server-usage')
installed = run / 'dsh-home/profiles/web/node_modules'
def sha(data): return hashlib.sha256(data).hexdigest()
def git(repo, *args): return subprocess.check_output(['git', *args], cwd=repo)
def save(name, value):
    (out / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return value
def blob(repo, tag, name): return git(repo, 'show', tag + ':' + name)
def refs(repo, tag, expected_object, expected_target):
    remote = git(repo, 'ls-remote', 'origin', 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}').decode()
    local_object = git(repo, 'rev-parse', tag).decode().strip()
    local_target = git(repo, 'rev-parse', tag + '^{}').decode().strip()
    assert expected_object in remote and expected_target in remote
    assert local_object == expected_object and local_target == expected_target
    return {'tag': tag, 'tagObject': local_object, 'target': local_target, 'freshRemote': remote}

core_pin = refs(core, 'v0.3.2', 'f8bd539f5390cdd1614eb6bf95d3866ead86ab9d', '00b936fcff8c3bff462fcfa14ce4f1729704f215')
srv_pin = refs(srv, 'v0.3.1-rc.1', '1a5eca5fbfa4b0113ebf19162d3bebc6f70d06bc', '24299fb8f8ed22edb3200b4871cc2f11041c0b61')
save('01-current-direct-source-pins', {'core': core_pin, 'serverUsage': srv_pin})

core_files = ['lib/contract.js', 'lib/contract-suite.js', 'lib/contract-fixtures.js', 'contract/hanamesh-core.v1.schema.json', 'lib/contract.d.ts']
core_rows = []
for name in core_files:
    current = blob(core, core_pin['tag'], name)
    actual = (installed / 'hanamesh-core' / name).read_bytes()
    core_rows.append({'file': name, 'publishedSHA256': sha(current), 'actualCore56SHA256': sha(actual), 'equal': current == actual})
assert all(x['equal'] for x in core_rows)
save('02-core-public-contract-byte-reuse', {'scope': 'Five actual directly consumed public contract inputs; not whole Core package equality', 'files': core_rows})

pack = Path('/Users/yzliu/.cache/hanamesh-runs/CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01/identity-rc2-actual-20261009/candidate/hanamesh-server-usage-0.3.1-rc.1.tgz')
assert sha(pack.read_bytes()) == '1f7bbadac38cc560f5a3fe98e2c2cc438b15fe67aaf2d847f3a96de048fd116a'
rows = []
with tarfile.open(pack) as tar:
    for member in tar.getmembers():
        if not member.isfile(): continue
        name = member.name.removeprefix('package/')
        actual = tar.extractfile(member).read()
        current = blob(srv, srv_pin['tag'], name)
        previous = blob(srv, 'v0.3.0-rc.1', name)
        rows.append({'file': name, 'normalPackSHA256': sha(actual), 'publishedTagSHA256': sha(current), 'previousPublishedSHA256': sha(previous), 'equalCurrentTag': actual == current, 'equalPreviousTag': actual == previous})
assert len(rows) == 56 and all(x['equalCurrentTag'] for x in rows)
changed = [x['file'] for x in rows if not x['equalPreviousTag']]
assert set(changed) == {'package.json', 'README.md', 'docs/DEVKIT_LICENSE_RECORD.md'}
save('03-server-usage-normal-tag-and-reuse', {'normalPack': str(pack), 'sha256': sha(pack.read_bytes()), 'bytes': pack.stat().st_size, 'members': len(rows), 'all56EqualCurrentTag': True, 'samePrevious': 53, 'changedMetadataOnly': changed, 'files': rows})

usage_pack = Path('/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01/real-c0f2439f-2b2a-4036-932b-ef0b85728101/supply/hanamesh-usage-0.2.0-rc.19.tgz')
usage_rows = []
with tarfile.open(usage_pack) as tar:
    for member in tar.getmembers():
        if not member.isfile(): continue
        name = member.name.removeprefix('package/')
        actual = tar.extractfile(member).read()
        normal_install = (installed / 'hanamesh-usage' / name).read_bytes()
        receipt_source = blob(source, 'cb0aeb7de11bb211dce3ae0fe432808f0d6fee9e', name)
        now_source = blob(source, 'HEAD', name)
        usage_rows.append({'file': name, 'normalPackSHA256': sha(actual), 'equalActualInstall': actual == normal_install, 'equalPassedSource': actual == receipt_source, 'equalCurrentSource': actual == now_source})
assert len(usage_rows) == 50 and all(x['equalActualInstall'] and x['equalPassedSource'] and x['equalCurrentSource'] for x in usage_rows)
save('04-usage-normal-source-inputs', {'version': '0.2.0-rc.19', 'formalTag': None, 'sourceAuthority': 'MERGE-USAGE-MAIN-01 normal main/package closure; no invented formal rc19 tag', 'sourceReceiptCommit': 'cb0aeb7de11bb211dce3ae0fe432808f0d6fee9e', 'normalPack': str(usage_pack), 'sha256': sha(usage_pack.read_bytes()), 'all50Unchanged': True, 'files': usage_rows})

receipts = {}
paths = {
    'usageCore19': docs / 'bluemap/cards/MERGE-USAGE-MAIN-01/evidence/normal-consumer/contract-consumer.json',
    'usageSrv03': Path('/Users/yzliu/.cache/hanamesh-runs/MERGE-USAGE-MAIN-01/srv03-0f07fcbb-afe9-4b50-b429-8ee5314ff8b1/evidence/consumer-suite.json'),
    'coreCurrentGate': docs / 'bluemap/cards/MERGE-CORE-MAIN-01/REPORT.md',
    'coreCRScope': docs / 'bluemap/cards/MERGE-CORE-MAIN-01/CR-CORE-HTTP-URL-SUPPLY-01.md',
    'srvCurrentGate': docs / 'bluemap/cards/CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01/REPORT.md',
}
for key, path in paths.items():
    raw = path.read_bytes(); receipts[key] = {'path': str(path), 'sha256': sha(raw)}
    (out / ('REFERENCED-' + key + path.suffix)).write_bytes(raw)
a = json.loads(paths['usageCore19'].read_text()); b = json.loads(paths['usageSrv03'].read_text())
assert a['packages']['usage']['version'] == '0.2.0-rc.19' and a['coreConsumer']['ok'] and len(a['coreConsumer']['results']) == 13
assert b['result']['ok'] and len(b['result']['checks']) == 4
save('05-direct-consumer-gate-reuse', {'rerun': False, 'why': 'Actual Usage19 all50 files unchanged; Core public source5 exact; latest normal ServerUsage56 exact tag and previous business/contract53 exact; reuse passed source gates only', 'core': {'publishedSource': core_pin, 'originalReceipt': receipts['usageCore19'], 'consumer': '13/13 inherited SOURCE/FIXTURE'}, 'serverUsage': {'publishedSource': srv_pin, 'originalReceipt': receipts['usageSrv03'], 'consumer': 'C-canonical3/C-sign3/C-device-id accept5 reject8/C-events1 inherited SOURCE/FIXTURE', 'contractVersion': '0.3.0-rc.1', 'packageVersion': '0.3.1-rc.1'}, 'supplierActual': 'Current ServerUsage supplier normal actual HTTP10/package7 and Core current source gate already collected by PM; reference only, not rerun here'})

names = git(core, 'ls-tree', '-r', '--name-only', core_pin['tag']).decode().splitlines()
old_names = [x for x in names if x.startswith('vendor/srv-identity/')]
manifest = json.loads(blob(core, core_pin['tag'], 'package.json'))
assert not old_names and 'vendor/srv-identity' not in manifest['files']
save('06-r6-current-owning-and-legacy', {'owningOrigin': 'hanamesh-core', 'currentOwningCard': 'MERGE-CORE-MAIN-01', 'currentPublishedSource': core_pin, 'currentR6OldIdentityCopyPaths': old_names, 'currentPackFilesExcludesCopy': True, 'currentOwningGateReceipt': receipts['coreCurrentGate'], 'currentCR': receipts['coreCRScope'], 'currentMissingSupply': None, 'reason': 'Current Core source closure removed active copy; existing DeviceBindInput source and actual query gate already delivered; wider HTTP-only DTO/suite was explicitly not a current hard prerequisite. Usage consumes Core Services ABI and ServerUsage signed HTTP, not Identity Services/types directly.', 'legacyRuntime': {'version': '0.2.0-rc.56', 'oldCopyPaths': [x for x in ['vendor/srv-identity/API.md','vendor/srv-identity/contracts.d.ts'] if (installed / 'hanamesh-core' / x).exists()], 'action': 'Preserve original runtime/accepted boundaries; current source R6 does not certify or rewrite historical package'}, 'futureOnlyIfScoped': {'origin': 'hanamesh-core', 'card': 'MERGE-CORE-MAIN-01 / CR-CORE-HTTP-URL-SUPPLY-01', 'items': ['HTTP-only POST /api/hanamesh/core/bind-link response wrapper {url,expiresAt}', 'GET /api/hanamesh/core/state full wrapper'], 'currentP04DirectConsumerNeed': 'N/A; no new missing named method/field/version'}})
save('00-SUMMARY', {'atUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'CURRENT DIRECT SOURCE CONSISTENCY RECEIPT; engineering self-check; no 17-repo re-audit, no new source suite run', 'directOrigins': ['hanamesh-core','hanamesh-server-usage'], 'coreSource': 'v0.3.2 exact5 public contract reused Usage19 13/13', 'serverUsageSource': 'v0.3.1-rc.1 normal56 exact tag, prior business+suite53 exact reused Usage19 four checks', 'usage': 'normal rc19/source main closure all50 unchanged', 'R6': 'Current owning Core source gate already collected; no current missing supply; legacy rc56 profile remains a historical runtime', 'remaining': ['owner binding/canonical account and person consent/use/withdraw', 'final native client submit path', 'one final independent VERIFY'], 'newProductCode': 0, 'newDependencies': 0, 'runtimeMutation': 0, 'suiteReruns': 0, 'deleted': []})
print(json.dumps({'coreExact': len(core_rows), 'serverNormalExact': len(rows), 'serverInheritedExact': 53, 'usageExact': len(usage_rows), 'R6CurrentMissingSupply': None, 'suiteReruns': 0, 'evidence': str(out)}))
