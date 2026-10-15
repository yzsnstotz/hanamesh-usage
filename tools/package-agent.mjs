/** Build a self-contained agent plugin from this repo's build and a packed Core CLI artifact, never sibling sources. */
import {mkdtemp,rm,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const [coreTarball,outputPath]=process.argv.slice(2);
if(!coreTarball||!outputPath)throw new Error('Usage: node tools/package-agent.mjs <core.tgz> <new-output-directory>');
const output=resolve(outputPath),temp=await mkdtemp(join(tmpdir(),'hm-agent-pack-'));
try {
  const result=spawnSync('tar',['-xzf',resolve(coreTarball),'-C',temp],{encoding:'utf8'});
  if(result.status!==0)throw new Error('CORE_ARTIFACT_UNREADABLE');
  const core=JSON.parse(await readFile(join(temp,'package/package.json'),'utf8'));
  if(core.name!=='hanamesh-core')throw new Error('CORE_ARTIFACT_INVALID');
  await mkdir(output); // Fail rather than delete or mix an existing output.
  await cp('agent',output,{recursive:true});
  await mkdir(join(output,'lib'),{recursive:true});
  for(const name of ['core','agent'])await cp(`lib/${name}`,join(output,'lib',name),{recursive:true});
  await mkdir(join(output,'runtime/core'),{recursive:true});
  // The standalone entry's import closure is all Node builtins plus these modules. No DSH peers are installed.
  for(const name of ['agent-cli','agent','shared-device','device','errors','validation','contracts','transport','registration']) {
    await mkdir(join(output,'runtime/core/lib'),{recursive:true});
    await cp(join(temp,`package/lib/${name}.js`),join(output,`runtime/core/lib/${name}.js`));
  }
  await writeFile(join(output,'runtime/core/package.json'),JSON.stringify({name:core.name,version:core.version,type:'module'}));
  await cp(join(temp,'package/LICENSE'),join(output,'runtime/core/LICENSE'));
  await cp('LICENSE',join(output,'LICENSE'));
  console.log(JSON.stringify({plugin:output,coreVersion:core.version,scope:'LOCAL_ARTIFACT_NOT_PUBLISHED'}));
} finally {await rm(temp,{recursive:true,force:true});}
