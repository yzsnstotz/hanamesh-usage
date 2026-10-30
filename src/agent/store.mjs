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
const owner=row=>(row.remote?typeof row.remote.remotePluginId==='string'&&row.remote.remotePluginId.length>0:typeof row.pluginId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(row.pluginId))&&typeof row.feature==='string'&&/^(mcp|skill):[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(row.feature);
/** A call owns one row and one signed event. All modifications serialize across hook/sender processes. */
export class AgentStore {
  constructor(root,{timeoutMs=10000}={}){this.root=root;this.dir=join(root,'events');this.installDir=join(root,'installs');this.timeoutMs=timeoutMs;}
  async mutate(task){
    const run=(tails.get(this.root) ?? Promise.resolve()).then(async()=>{
      await mkdir(this.root,{recursive:true,mode:0o700});
      const release=await agentLock(this.root,'events',this.timeoutMs);if(!release)throw new Error('AGENT_STORE_BUSY');
      try{return await task();}finally{await release();}
    });
    const tail=run.then(()=>{},()=>{});tails.set(this.root,tail);void tail.then(()=>{if(tails.get(this.root)===tail)tails.delete(this.root);});return run;
  }
  async record(row,consent){return this.observe({factId:row?.factId,channel:row?.channel,occurredAt:row?.occurredAt},row,consent);}
  async observe(identity,row,consent,{outcome=row?.success}={}){
    if(!consent)return 'withheld';
    if(!row)return 'unattributed';
    if(!identity||!/^[a-f0-9]{64}$/.test(identity.factId)||!['codex','claude'].includes(identity.channel)||new Date(identity.occurredAt).toISOString()!==identity.occurredAt)throw Error('AGENT_FACT_INVALID');
    let value=null;
    if(row!==null){
    if(!row||row.factId!==identity.factId||row.channel!==identity.channel)throw Error('AGENT_FACT_INVALID');
    value={factId:row.factId,channel:row.channel,occurredAt:row.occurredAt,disposition:row.disposition,pluginId:row.pluginId,feature:row.feature,success:row.success};
    if(row.remote){
      const v=row.remote;if(typeof v.remotePluginId!=='string'||!v.remotePluginId||typeof v.name!=='string'||!v.name)throw Error('AGENT_FACT_INVALID');
      value.remote={remotePluginId:v.remotePluginId,name:v.name};
    }
    if(!['codex','claude'].includes(value.channel)||!['attributed','ambiguous','unverified'].includes(value.disposition)||new Date(value.occurredAt).toISOString()!==value.occurredAt||(value.success!==null&&typeof value.success!=='boolean')||(value.disposition==='attributed'&&(typeof value.success!=='boolean'||!owner(value)))||(['unverified'].includes(value.disposition)&&(!owner(value)||value.success!==null))||(value.disposition==='ambiguous'&&(value.pluginId!==null||value.feature!==null||value.success!==null)))throw new Error('AGENT_FACT_INVALID');
    }
    return this.mutate(async()=>{
      await mkdir(this.dir,{recursive:true,mode:0o700});
      const path=join(this.dir,identity.factId+'.json'),existing=await readJSON(path,null);
      if(!existing){if(value){await atomicJSON(path,value);return 'recorded';}return 'unattributed';}
      if(existing.channel!==identity.channel||value&&((existing.remote?existing.remote.remotePluginId!==value.remote?.remotePluginId:existing.pluginId!==value.pluginId)||existing.feature!==value.feature)||existing.success!==null||typeof outcome!=='boolean')return 'duplicate';
      if(existing.wire){
        // Signed bytes/delivery never change. A late result is a local observation, not another credit.
        if(typeof existing.observedSuccess==='boolean')return 'duplicate';
        await atomicJSON(path,{...existing,observedSuccess:outcome});return 'observed';
      }
      await atomicJSON(path,{...existing,success:outcome,disposition:'attributed'});return 'promoted';
    });
  }
  async rows(){
    let names;try{names=await readdir(this.dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}
    return Promise.all(names.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort().map(name=>readJSON(join(this.dir,name),null)));
  }
  async prune(now=Date.now()){
    return this.mutate(async()=>{
      for(const row of await this.rows())if(Date.parse(row.occurredAt)<now-30*86400000){await rm(join(this.dir,`${row.factId}.json`),{force:true});}
      let names;try{names=await readdir(this.installDir);}catch(error){if(error.code!=='ENOENT')throw error;names=[];}
      for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){const path=join(this.installDir,name),entry=await readJSON(path,null);if(entry?.wire&&Date.parse(entry.wire.occurredAt)<now-30*86400000)await atomicJSON(path,{eventId:entry.eventId,delivery:{state:'expired',code:'INSTALL_WINDOW_EXPIRED'}});}
    });
  }
  async eligible(catalog,now=Date.now()){
    const cutoff=now-Math.min(30,catalog.settings.backfillWindowDays)*86400000,result=[];
    for(const row of await this.rows()){
      if(!['attributed','unverified'].includes(row.disposition)||!owner(row)||Date.parse(row.occurredAt)<cutoff||Date.parse(row.occurredAt)>now||(row.success===null&&catalog.settings.countUnconfirmedCalls!==true))continue;
      const matches=catalog.plugins.filter(item=>item.channel===row.channel&&(row.remote?item.remotePluginId===row.remote.remotePluginId:item.pluginId===row.pluginId));
      const owners=[...new Map(matches.map(item=>[item.hanaRef,item])).values()];
      if(owners.length===1)result.push({...row,hanaRef:owners[0].hanaRef});
    }return result;
  }
  async pending(catalog,now=Date.now()){return (await this.eligible(catalog,now)).filter(row=>!row.delivery);}
  async installState(eventId){if(!/^[a-f0-9-]{36}$/.test(eventId))throw Error('AGENT_EVENT_INVALID');return readJSON(join(this.installDir,`${eventId}.json`),null);}
  async freezeInstall(factId,wire){return this.mutate(async()=>{
    const existing=await this.installState(wire.eventId);if(existing)return existing.wire??null;
    const row=await readJSON(join(this.dir,`${factId}.json`),null);
    if(!row||wire.action!=='install'||['success','channel','feature','occurredAt'].some(key=>row[key]!==wire[key]))throw Error('AGENT_FACT_CHANGED');
    await mkdir(this.installDir,{recursive:true,mode:0o700});await atomicJSON(join(this.installDir,`${wire.eventId}.json`),{eventId:wire.eventId,wire});return wire;
  });}
  async markInstall(eventId,delivery){return this.mutate(async()=>{
    const path=join(this.installDir,`${eventId}.json`),entry=await readJSON(path,null);if(!entry)throw Error('AGENT_FACT_CHANGED');
    // Terminal dedup metadata is not a retained usage record. Unknown signed bytes stay frozen until local expiry.
    await atomicJSON(path,delivery.state==='unconfirmed'?{...entry,delivery}:{eventId,delivery});
  });}
  async mark(factId,delivery){return this.mutate(async()=>{const path=join(this.dir,`${factId}.json`),row=await readJSON(path,null);if(row)await atomicJSON(path,{...row,delivery});});}
  async freezeWire(factId,wire){return this.mutate(async()=>{
    const path=join(this.dir,`${factId}.json`),row=await readJSON(path,null);if(!row)throw new Error('AGENT_FACT_CHANGED');
    if(row.wire)return row.wire;
    if(['success','channel','feature','occurredAt'].some(key=>row[key]!==wire[key]))throw new Error('AGENT_FACT_CHANGED');
    await atomicJSON(path,{...row,wire});return wire;
  });}
  async withdraw(){return this.mutate(async()=>{await rm(this.dir,{recursive:true,force:true});await rm(this.installDir,{recursive:true,force:true});await rm(join(this.root,'remote-inventory-diagnostics.json'),{force:true});});}
}
