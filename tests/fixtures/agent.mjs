import {mkdtemp,rm,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=process.env.USAGE_TEST_ROOT??fileURLToPath(new URL('../../',import.meta.url));
export async function agentHome(t,prefix) {
  const root=await mkdtemp(join(tmpdir(),prefix));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
export async function copyAgentBootstrap(plugin) {
  await mkdir(plugin,{recursive:true});
  for(const path of ['bin','.claude-plugin'])await cp(join(source,'agent',path),join(plugin,path),{recursive:true});
}
