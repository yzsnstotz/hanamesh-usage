import {mkdir,readFile,readdir,open,link,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function readJSON(path,fallback) {
  try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code === 'ENOENT')return fallback;throw error;}
}
export async function atomicJSON(path,value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try{const fd=await open(temp,'wx',0o600);try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}await rename(temp,path);}finally{await rm(temp,{force:true});}
}
/** One immutable fact per file: parallel short-lived hooks never rewrite the whole queue. */
export class AgentStore {
  constructor(root){this.root=root;this.dir=join(root,'events');}
  async record(row,consent){
    if(!consent)return 'withheld';
    if(!row || !/^[a-f0-9]{64}$/.test(row.factId))throw new Error('AGENT_FACT_INVALID');
    // Construct a new allowlisted object even for callers other than the hook projector.
    const value={factId:row.factId,channel:row.channel,occurredAt:row.occurredAt,disposition:row.disposition,pluginId:row.pluginId,feature:row.feature,success:row.success};
    if(!['codex','claude'].includes(value.channel) || !['attributed','ambiguous','unverified'].includes(value.disposition) || new Date(value.occurredAt).toISOString()!==value.occurredAt || (value.disposition==='attributed' && (typeof value.success!=='boolean' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value.pluginId) || !/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value.feature))))throw new Error('AGENT_FACT_INVALID');
    await mkdir(this.dir,{recursive:true,mode:0o700});
    const path=join(this.dir,`${row.factId}.json`),temp=`${path}.${randomUUID()}.tmp`;
    try{const fd=await open(temp,'wx',0o600);try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}await link(temp,path);return 'recorded';}
    catch(error){if(error.code==='EEXIST')return 'duplicate';throw error;}finally{await rm(temp,{force:true});}
  }
  async rows(){
    let names;try{names=await readdir(this.dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    return Promise.all(names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort().map(name=>readJSON(join(this.dir,name),null)));
  }
  async pending(catalog,now=Date.now()){
    const cutoff=now-catalog.settings.backfillWindowDays*86400000;
    const result=[];
    for(const row of await this.rows()){
      if(row.disposition!=='attributed'||row.delivery||Date.parse(row.occurredAt)<cutoff||Date.parse(row.occurredAt)>now)continue;
      const owners=catalog.plugins.filter(item=>item.channel===row.channel && item.pluginId===row.pluginId);
      if(owners.length===1) result.push({...row,hanaRef:owners[0].hanaRef});
    }return result;
  }
  async mark(factId,delivery){const path=join(this.dir,`${factId}.json`);const row=await readJSON(path,null);if(row)await atomicJSON(path,{...row,delivery});}
  async freezeWire(factId,wire){const path=join(this.dir,`${factId}.json`);const row=await readJSON(path,null);if(row&&!row.wire)await atomicJSON(path,{...row,wire});}
  async withdraw(){await rm(this.dir,{recursive:true,force:true});}
}
