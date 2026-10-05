/** DSH and Usage peer/platform policy, without starting a runtime. */
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {installedPeer,satisfies} from './pins.mjs';
export function validateHostPreflight(actual){
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 const checks={node:{target:'v24.13.1',actual:`v${actual.node}`},pnpm:{target:'10.33.0',actual:actual.pnpm},typescript:{target:'Version 5.9.3',actual:`Version ${actual.typescript}`},platform:{target:'darwin-arm64',actual:`${process.platform}-${process.arch}`}};
 for(const [name,version] of Object.entries(pkg.peerDependencies)){let actual=null;try{actual=installedPeer(name).version;}catch{}checks[name]={target:version,actual,satisfied:actual!==null&&satisfies(actual,version)};}
 const dshHome=process.env.DSH_HOME?resolve(process.env.DSH_HOME):null;
 const isolatedHome=!!dshHome&&dshHome!==resolve(homedir(),'.dsh')&&existsSync(dshHome);
 const cli=spawnSync('dsh',['--version'],{encoding:'utf8'});
 console.log(JSON.stringify({observedAt:new Date().toISOString(),checks,dshCLI:cli.error?null:cli.stdout.trim(),isolatedDSHHomeProvided:isolatedHome,scope:'READ_ONLY_PREFLIGHT_NO_RUNTIME_START_NO_NETWORK_NO_PERSONAL_STATE'},null,2));
 if(Object.values(checks).some(c=>'satisfied' in c?!c.satisfied:c.actual!==c.target)||!isolatedHome){console.error('PRECONDITIONS_NOT_MET: pinned host/toolchain or isolated DSH_HOME unavailable; no host tests attempted.');process.exitCode=2;}
}
