import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readJSON} from './store.mjs';

const safeName = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
async function describe(pluginId,root) {
  const [pluginName,marketplace]=pluginId.split('@');
  if(!safeName(pluginName)||!safeName(marketplace))throw new Error('AGENT_INVENTORY_INVALID');
  const mcp=await readJSON(join(root,'.mcp.json'),{});
  let skills=[];try{skills=(await readdir(join(root,'skills'),{withFileTypes:true})).filter(item=>item.isDirectory()&&safeName(item.name)).map(item=>item.name);}catch(error){if(error.code!=='ENOENT')throw error;}
  return {pluginId,pluginName,marketplace,root:resolve(root),mcpServers:Object.keys(mcp.mcpServers ?? mcp).filter(safeName),skills};
}
/** Read only the selected host's installed metadata, never session histories or credentials. */
export async function installedPlugins(channel,hostHome) {
  const result=[];
  if(channel==='claude') {
    const installed=await readJSON(join(hostHome,'plugins/installed_plugins.json'),{plugins:{}});
    const settings=await readJSON(join(hostHome,'settings.json'),{});
    for(const [id,rows] of Object.entries(installed.plugins)) {
      if(settings.enabledPlugins?.[id]===false)continue;
      for(const row of rows) if(typeof row.installPath==='string')result.push(await describe(id,row.installPath));
    }
  } else if(channel==='codex') {
    let config;try{config=await readFile(join(hostHome,'config.toml'),'utf8');}catch(error){if(error.code==='ENOENT')return [];throw error;}
    let table=null;
    for(const raw of config.split('\n')) {
      const header=/^\[plugins\."([^"\\]+)"\]\s*(?:#.*)?$/.exec(raw.trim());
      if(header){table=header[1];continue;}if(raw.trim().startsWith('[')){table=null;continue;}
      if(!table || !/^enabled\s*=\s*true\s*(?:#.*)?$/.test(raw.trim()))continue;
      const [name,market]=table.split('@');if(!safeName(name)||!safeName(market))throw new Error('AGENT_INVENTORY_INVALID');
      const root=join(hostHome,'plugins/cache',market,name);
      let versions;try{versions=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')throw new Error('AGENT_INSTALLATION_UNREADABLE');throw error;}
      // Config does not identify an active cache revision; several revisions remain ambiguous rather than choosing latest.
      for(const version of versions.filter(item=>item.isDirectory()))result.push(await describe(table,join(root,version.name)));
    }
  } else throw new Error('AGENT_CHANNEL_REQUIRED');
  // Deduplicate identical install rows, retain different roots as ambiguity.
  return [...new Map(result.map(row=>[`${row.pluginId}:${row.root}`,row])).values()];
}
