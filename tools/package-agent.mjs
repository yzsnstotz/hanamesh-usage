import {DEFAULT_AGENT_ORIGINS} from '../lib/agent/profile.mjs';
/** Build a self-contained agent plugin from this repo's build and a packed Core CLI artifact, never sibling sources. */
import {mkdtemp,rm,mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha256=b=>createHash('sha256').update(b).digest('hex');
async function inventory(root,prefix=''){
 const rows=[];for(const e of(await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const path=prefix+e.name;if(e.isDirectory())rows.push(...await inventory(root,path+'/'));else if(e.isFile())rows.push({path,sha256:sha256(await readFile(join(root,path)))});else throw Error('SUITE_NON_REGULAR_FILE');}return rows;
}

const [coreTarball,outputPath]=process.argv.slice(2);
if(!coreTarball||!outputPath)throw new Error('Usage: node tools/package-agent.mjs <core.tgz> <new-output-directory>');
const output=resolve(outputPath),temp=await mkdtemp(join(tmpdir(),'hm-agent-pack-'));
try {
  const result=spawnSync('tar',['-xzf',resolve(coreTarball),'-C',temp],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
  if(result.status!==0)throw new Error('CORE_ARTIFACT_UNREADABLE');
  const core=JSON.parse(await readFile(join(temp,'package/package.json'),'utf8'));
  if(core.name!=='@hanamesh/core'||core.version!=='0.3.25')throw new Error('CORE_ARTIFACT_INVALID');
  const probeHome=join(temp,'core-probe');await mkdir(probeHome);
  const probe=spawnSync(process.execPath,[join(temp,'package/lib/agent-cli.js')],{encoding:'utf8',input:JSON.stringify({config:{sharedHome:probeHome,serverOrigin:null,websiteOrigin:null},input:{operation:'state'}}),env:{PATH:process.env.PATH,HOME:temp}});
  let capability;try{const result=JSON.parse(probe.stdout).result;capability=result?.agentProtocolVersion;}catch{throw Error('CORE_AGENT_CAPABILITY_REQUIRED');}
  if(probe.status!==0||capability!==2||(await readdir(probeHome)).length!==0)throw Error('CORE_AGENT_CAPABILITY_REQUIRED');
  const nodeRecipe=JSON.parse(await readFile('agent/bin/node-runtime.json'));
  const usage=JSON.parse(await readFile('package.json')),plugin=JSON.parse(await readFile('agent/.claude-plugin/plugin.json')),codex=JSON.parse(await readFile('agent/.codex-plugin/plugin.json'));
  if(plugin.name!=='hanamesh'||codex.name!==plugin.name||codex.version!==plugin.version)throw Error('SUITE_MANIFEST_MISMATCH');
  for(const file of await inventory('src/agent')){const source=await readFile(join('src/agent',file.path));const expected=file.path==='cli.mjs'?Buffer.from(source.toString('utf8').replace('__HANAMESH_AGENT_VERSION__',plugin.version)):source;if(sha256(await readFile(join('lib/agent',file.path)))!==sha256(expected))throw Error('SUITE_BUILD_STALE');}
  await mkdir(output); // Fail rather than delete or mix an existing output.
  await cp('agent',output,{recursive:true});
  await mkdir(join(output,'lib'),{recursive:true});
  for(const name of ['core','agent'])await cp(`lib/${name}`,join(output,'lib',name),{recursive:true});
  await mkdir(join(output,'runtime/core'),{recursive:true});
  // The standalone entry's import closure is all Node builtins plus these modules. No DSH peers are installed.
  for(const name of ['agent-cli','agent','shared-device','device','errors','validation','contracts','transport','registration','bind-link']) {
    await mkdir(join(output,'runtime/core/lib'),{recursive:true});
    await cp(join(temp,`package/lib/${name}.js`),join(output,`runtime/core/lib/${name}.js`));
  }
  await mkdir(join(output,'runtime/core/lib/suite'),{recursive:true});
  await cp(join(temp,'package/lib/suite/facts.js'),join(output,'runtime/core/lib/suite/facts.js'));
  await writeFile(join(output,'runtime/core/package.json'),JSON.stringify({name:core.name,version:core.version,type:'module'}));
  await cp(join(temp,'package/LICENSE'),join(output,'runtime/core/LICENSE'));
  await cp('LICENSE',join(output,'LICENSE'));
  const git=args=>{const r=spawnSync('/usr/bin/git',args,{encoding:'utf8',env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}});if(r.status!==0)throw Error('SUITE_SOURCE_REVISION_UNAVAILABLE');return r.stdout.trim();};
  const sourceRevision=git(['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(sourceRevision))throw Error('SUITE_SOURCE_REVISION_INVALID');
  const sourceFiles=[...(await inventory('src/agent')).map(f=>({...f,path:'src/agent/'+f.path})),...(await inventory('agent')).map(f=>({...f,path:'agent/'+f.path}))];
  for(const path of ['package.json','package-lock.json','tools/package-agent.mjs','src/core/agent-event.ts','src/core/identity.ts'])sourceFiles.push({path,sha256:sha256(await readFile(path))});
  const files=await inventory(output),receipt={schemaVersion:1,identityKind:'composite-artifact',plugin:{name:plugin.name,version:plugin.version},capabilities:{readonlyTools:['hanamesh_status']},runtime:{node:usage.engines.node,bundled:false,defaultOrigins:DEFAULT_AGENT_ORIGINS,agentProtocolVersion:2,bootstrap:{path:'bin/hm-agent',automatic:true,preparation:'detached',readinessBridge:'bin/runtime-bootstrap.pl',recipePath:'bin/node-runtime.json',archiveFormat:nodeRecipe.archiveFormat,expectedArchives:nodeRecipe.architectures,nodeVersion:nodeRecipe.version,downloadOrigin:'https://nodejs.org',platforms:['darwin-arm64','darwin-x64']}},components:{usage:{name:usage.name,version:usage.version,sourceRevision,workingTreeDirty:Boolean(git(['status','--porcelain','--untracked-files=normal'])),sourceFiles,sourceSha256:sha256(JSON.stringify(sourceFiles))},core:{name:core.name,version:core.version,agentProtocolVersion:capability,tarballSha256:sha256(await readFile(coreTarball))}},payloadSha256:sha256(JSON.stringify(files)),files};
  await writeFile(join(output,'suite-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({plugin:output,coreVersion:core.version,usageVersion:usage.version,payloadSha256:receipt.payloadSha256,scope:'LOCAL_COMPOSITE_ARTIFACT_NOT_PUBLISHED'}));
} finally {await rm(temp,{recursive:true,force:true});}
