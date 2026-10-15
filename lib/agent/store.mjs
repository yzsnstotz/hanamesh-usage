import {mkdir,readFile,readdir,open,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {agentLock} from './sender-lock.mjs';

export async function readJSON(path,fallback) {
  try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code === 'ENOENT')return fallback;throw error;}
}
export async function atomicJSON(path,value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try{const fd=await open(temp,'wx',0o600);try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}await rename(temp,path);}finally{await rm(temp,{force:true});}
}
const tails=new Map();
const owner=row=>typeof row.pluginId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(row.pluginId)&&typeof row.feature==='string'&&/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(row.feature);
/** A call owns one row and one signed event. All modifications serialize across hook/sender processes. */
export class AgentStore {
  constructor(root,{timeoutMs=10000}={}){this.root=root;this.dir=join(root,'events');this.timeoutMs=timeoutMs;}
  async mutate(task){
    const run=(tails.get(this.root) ?? Promise.resolve()).then(async()=>{
      await mkdir(this.root,{recursive:true,mode:0o700});
      const release=await agentLock(this.root,'events',this.timeoutMs);if(!release)throw new Error('AGENT_STORE_BUSY');
      try{return await task();}finally{await release();}
    });
    const tail=run.then(()=>{},()=>{});tails.set(this.root,tail);void tail.then(()=>{if(tails.get(this.root)===tail)tails.delete(this.root);});return run;
  }
  async record(row,consent){
    if(!consent)return 'withheld';
    if(!row || !/^[a-f0-9]{64}$/.test(row.factId))throw new Error('AGENT_FACT_INVALID');
    const value={factId:row.factId,channel:row.channel,occurredAt:row.occurredAt,disposition:row.disposition,pluginId:row.pluginId,feature:row.feature,success:row.success};
    if(!['codex','claude'].includes(value.channel)||!['attributed','ambiguous','unverified','outer-only'].includes(value.disposition)||new Date(value.occurredAt).toISOString()!==value.occurredAt||(value.success!==null&&typeof value.success!=='boolean')||(value.disposition==='attributed'&&(typeof value.success!=='boolean'||!owner(value)))||(['unverified','outer-only'].includes(value.disposition)&&(!owner(value)||value.success!==null))||(value.disposition==='ambiguous'&&(value.pluginId!==null||value.feature!==null||value.success!==null)))throw new Error('AGENT_FACT_INVALID');
    return this.mutate(async()=>{
      await mkdir(this.dir,{recursive:true,mode:0o700});const path=join(this.dir,`${row.factId}.json`),existing=await readJSON(path,null);
      if(!existing){await atomicJSON(path,value);return 'recorded';}
      if(existing.channel!==value.channel||existing.pluginId!==value.pluginId||existing.feature!==value.feature||existing.disposition==='outer-only'||existing.success!==null||typeof value.success!=='boolean')return 'duplicate';
      if(existing.wire){
        // Signed bytes/delivery never change. A late result is a local observation, not another credit.
        if(typeof existing.observedSuccess==='boolean')return 'duplicate';
        await atomicJSON(path,{...existing,observedSuccess:value.success});return 'observed';
      }
      await atomicJSON(path,{...existing,success:value.success,disposition:'attributed'});return 'promoted';
    });
  }
  async rows(){
    let names;try{names=await readdir(this.dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    return Promise.all(names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort().map(name=>readJSON(join(this.dir,name),null)));
  }
  async pending(catalog,now=Date.now()){
    const cutoff=now-catalog.settings.backfillWindowDays*86400000,result=[];
    for(const row of await this.rows()){
      if(!['attributed','unverified'].includes(row.disposition)||!owner(row)||row.delivery||Date.parse(row.occurredAt)<cutoff||Date.parse(row.occurredAt)>now||(row.success===null&&catalog.settings.countUnconfirmedCalls!==true))continue;
      const owners=catalog.plugins.filter(item=>item.channel===row.channel&&item.pluginId===row.pluginId);
      if(owners.length===1)result.push({...row,hanaRef:owners[0].hanaRef});
    }return result;
  }
  async mark(factId,delivery){return this.mutate(async()=>{const path=join(this.dir,`${factId}.json`),row=await readJSON(path,null);if(row)await atomicJSON(path,{...row,delivery});});}
  async freezeWire(factId,wire){return this.mutate(async()=>{
    const path=join(this.dir,`${factId}.json`),row=await readJSON(path,null);if(!row)throw new Error('AGENT_FACT_CHANGED');
    if(row.wire)return row.wire;
    if(['success','channel','feature','occurredAt'].some(key=>row[key]!==wire[key]))throw new Error('AGENT_FACT_CHANGED');
    await atomicJSON(path,{...row,wire});return wire;
  });}
  async withdraw(){return this.mutate(()=>rm(this.dir,{recursive:true,force:true}));}
}
