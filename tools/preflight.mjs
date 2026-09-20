import {spawnSync} from 'node:child_process';import {readFileSync,existsSync} from 'node:fs';import {homedir} from 'node:os';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {installedPeer,satisfies} from './pins.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const tool=name=>{const r=spawnSync(name,['--version'],{encoding:'utf8'});return r.error?null:(r.stdout??'').trim();};
const checks={node:{target:'v24.13.1',actual:process.version},pnpm:{target:'10.33.0',actual:tool('pnpm')},typescript:{target:'Version 5.9.3',actual:tool('tsc')},platform:{target:'darwin-arm64',actual:`${process.platform}-${process.arch}`}};
for(const [name,version] of Object.entries(pkg.peerDependencies)){let actual=null;try{actual=installedPeer(name).version;}catch{}checks[name]={target:version,actual,satisfied:actual!==null&&satisfies(actual,version)};}
const dshHome=process.env.DSH_HOME?resolve(process.env.DSH_HOME):null;
const isolatedHome=!!dshHome&&dshHome!==resolve(homedir(),'.dsh')&&existsSync(dshHome);
console.log(JSON.stringify({observedAt:new Date().toISOString(),checks,dshCLI:tool('dsh'),isolatedDSHHomeProvided:isolatedHome,scope:'READ_ONLY_PREFLIGHT_NO_RUNTIME_START_NO_NETWORK_NO_PERSONAL_STATE'},null,2));
if(Object.values(checks).some(c=>'satisfied' in c?!c.satisfied:c.actual!==c.target)||!isolatedHome){console.error('PRECONDITIONS_NOT_MET: pinned host/toolchain or isolated DSH_HOME unavailable; no host tests attempted.');process.exitCode=2;}
