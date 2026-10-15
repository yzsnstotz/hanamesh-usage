import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Read configured trust honestly: a recorded hash alone cannot prove that the host accepts current hook content. */
export async function hookTrust(env=process.env) {
  if(!env.CODEX_HOME)return {state:'host-managed',effective:'unknown',nextStep:'Claude Code 在新会话加载插件；本工具不修改宿主设置。'};
  let text;try{text=await readFile(join(env.CODEX_HOME,'config.toml'),'utf8');}catch(error){if(error.code==='ENOENT')return {state:'not-installed',effective:false};throw error;}
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const parts=root.split('/'),i=parts.lastIndexOf('cache');
  const ownKey=i>=0?`${parts[i+2]}@${parts[i+1]}`:null;
  const match=ownKey ?? /\[plugins\."(hanamesh-usage@[^"\\]+)"\]/.exec(text)?.[1];
  if(!match)return {state:'not-installed',effective:false};
  const tables=new Map();let table=null;
  for(const line of text.split('\n')){const h=/^\[(.+)\]$/.exec(line.trim());if(h){table=h[1];continue;}const kv=/^([a-z_]+)\s*=\s*(.+)$/.exec(line.trim());if(table&&kv){const v=tables.get(table)??{};v[kv[1]]=kv[2];tables.set(table,v);}}
  if(tables.get(`plugins."${match}"`)?.enabled!=='true')return {state:'disabled',effective:false};
  const events=['session_start','post_tool_use','post_tool_use_failure'];
  const rows=events.map(event=>tables.get(`hooks.state."${match}:hooks/hooks.json:${event}:0:0"`));
  const recorded=rows.filter(row=>row?.trusted_hash && row.enabled!=='false').length;
  return {state:recorded===events.length?'trust-recorded':recorded?'partially-trusted':'untrusted',recorded,total:events.length,effective:recorded===events.length?'unknown':false,
    nextStep:'在 Codex 插件 → HanaMesh 使用记录 → Hooks 查看并点 Trust all。只读配置中的旧哈希不证明当前内容仍受信任；本工具不会替你信任。'};
}
