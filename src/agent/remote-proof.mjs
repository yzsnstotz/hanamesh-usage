import {createHash} from 'node:crypto';
import {requestJSON} from './runtime.mjs';

export const REMOTE_MARKET='openai-curated-remote';
export const remoteVersion=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(v)&&v!=='.'&&v!=='..';
const hex=(v,n)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v);
export const sameRemote=(a,b)=>a&&b&&['remotePluginId','version','bundleSha256','contentSha256'].every(k=>a[k]===b[k]);
export function validRemote(p){return p.channel==='codex'&&p.marketplace===REMOTE_MARKET&&typeof p.remote?.remotePluginId==='string'&&p.remote.remotePluginId.trim()===p.remote.remotePluginId&&p.remote.remotePluginId.length>0&&remoteVersion(p.remote.version)&&hex(p.remote.bundleSha256,64)&&hex(p.remote.contentSha256,64);}
export const sha256=b=>createHash('sha256').update(b).digest('hex');
// The public source whitelist never includes credentials or user-authored runtime files.
export const staticPath=p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/^\.env(?:\.|$)|^auth\.json$|^credentials(?:\.|$)/i.test(s));
const fail=()=>{throw Error('AGENT_CODEX_REMOTE_PROOF_INVALID');};
// Codex 0.165.0's controlled no-app installation preserves fields and formats plugin.json.
// Only formatting of the exact original value is supported. App materialization needs its own proof.
export const formattedManifest=value=>JSON.stringify(value,null,2)+'\n';

/** Fixed public Git objects only; never download a remote backend URL or execute source. */
export async function createRemoteProof(entry,registration,{request=(o,p)=>requestJSON(o,p)}={}){
 if(!validRemote(entry))fail();
 const installation=registration?.installation,s=installation?.source;
 if(registration?.pluginId!==entry.pluginId||registration?.channel!=='codex'||registration?.hanaRef!==entry.hanaRef||registration?.githubRepo!==entry.githubRepo||installation?.version!==entry.remote.version||s?.source!=='codex-remote'||s.repo!==entry.githubRepo||!hex(s.ref,40)||!hex(s.tree,40)||!sameRemote({...s,version:installation.version},entry.remote)||(s.path!==undefined&&!staticPath(s.path)))fail();
 const api=`/repos/${entry.githubRepo}/git`,tree=await request('https://api.github.com',`${api}/trees/${s.ref}?recursive=1`);
 if(tree?.truncated!==false||!Array.isArray(tree.tree)||!hex(tree.sha,40))fail();
 const base=s.path??'',prefix=base?base+'/':'';
 const subtree=base?tree.tree.filter(f=>f.path===base&&f.type==='tree'):null;
 if(base?(subtree.length!==1||subtree[0].sha!==s.tree):tree.sha!==s.tree)fail();
 const selected=tree.tree.filter(f=>f.path.startsWith(prefix)&&f.type!=='tree');
 if(!selected.length||selected.length>4096)fail();
 const files=[],contents=new Map();let total=0;
 for(const f of selected.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){
  const path=f.path.slice(prefix.length);
  if(!staticPath(path)||f.type!=='blob'||!['100644','100755'].includes(f.mode)||!hex(f.sha,40)||!Number.isSafeInteger(f.size)||f.size<0||(total+=f.size)>32*1024*1024)fail();
  const value=await request('https://api.github.com',`${api}/blobs/${f.sha}`);
  if(value?.encoding!=='base64'||value.sha!==f.sha||typeof value.content!=='string')fail();
  const bytes=Buffer.from(value.content.replace(/\s/g,''),'base64');
  if(bytes.length!==f.size||createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==f.sha)fail();
  files.push({path,mode:f.mode,sha256:sha256(bytes)});contents.set(path,bytes);
 }
 if(new Set(files.map(f=>f.path)).size!==files.length||sha256(JSON.stringify(files.map(f=>[f.path,f.mode,f.sha256])))!==entry.remote.contentSha256)fail();
 const raw=contents.get('.codex-plugin/plugin.json');if(!raw)fail();
 let manifest;try{manifest=JSON.parse(raw);}catch{fail();}
 if(manifest?.name!==entry.pluginName||manifest.version!==entry.remote.version||manifest.apps!==undefined||files.some(f=>/(?:^|\/)apps(?:\.json|\/)/.test(f.path)))throw Error('AGENT_CODEX_REMOTE_MATERIALIZATION_UNSUPPORTED');
 const manifestFile=files.find(f=>f.path==='.codex-plugin/plugin.json');manifestFile.formattedSha256=sha256(formattedManifest(manifest));
 return {...entry.remote,pluginId:entry.pluginId,files};
}
