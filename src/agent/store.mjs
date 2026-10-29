import {mkdir,readFile,readdir,open,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {agentLock} from './sender-lock.mjs';
import {sameRemote,remoteVersion} from './remote-proof.mjs';

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
  constructor(root,{timeoutMs=10000,coreCall=null}={}){this.root=root;this.dir=join(root,'events');this.installDir=join(root,'installs');this.originDir=join(root,'call-origins');this.timeoutMs=timeoutMs;this.coreCall=coreCall;this.migrationReady=false;this.knownOrigins=new Map();}
  async mutate(task){
    const run=(tails.get(this.root) ?? Promise.resolve()).then(async()=>{
      await mkdir(this.root,{recursive:true,mode:0o700});
      const release=await agentLock(this.root,'events',this.timeoutMs);if(!release)throw new Error('AGENT_STORE_BUSY');
      try{return await task();}finally{await release();}
    });
    const tail=run.then(()=>{},()=>{});tails.set(this.root,tail);void tail.then(()=>{if(tails.get(this.root)===tail)tails.delete(this.root);});return run;
  }
  async record(row,consent){return this.observe({factId:row?.factId,channel:row?.channel,occurredAt:row?.occurredAt},row,consent);}
  async coreObserve(factId,admitted){
    if(!/^[a-f0-9]{64}$/.test(factId)||typeof admitted!=='boolean')throw Error('AGENT_FACT_INVALID');
    if(typeof this.coreCall!=='function')throw Error('CORE_AGENT_ORIGIN_CAPABILITY_REQUIRED');
    const result=await this.coreCall({operation:'originObserve',factId,admitted});
    if(!result||Array.isArray(result)||Object.keys(result).sort().join('|')!=='admitted|first'||typeof result.admitted!=='boolean'||typeof result.first!=='boolean')throw Error('CORE_AGENT_ORIGIN_RESPONSE_INVALID');
    this.knownOrigins.set(factId,result.admitted);return result;
  }
  /** One-time legacy import. The marker is advisory; only Core can authorize/sign an identity. Caller holds events lock. */
  async migrateOriginsLocked(){
    if(this.migrationReady)return;
    if(typeof this.coreCall!=='function')throw Error('CORE_AGENT_ORIGIN_CAPABILITY_REQUIRED');
    const state=await this.coreCall({operation:'state'});
    if(state?.agentOriginProtocolVersion!==1)throw Error('CORE_AGENT_ORIGIN_CAPABILITY_REQUIRED');
    if(!state.deviceId)return; // No new identity is created for local cleanup.
    const markerPath=join(this.root,'core-origins-migrated.json'),marker=await readJSON(markerPath,null);
    if(marker!==null&&(marker.schemaVersion!==1||typeof marker.deviceId!=='string'||Object.keys(marker).sort().join('|')!=='deviceId|schemaVersion'))throw Error('AGENT_CALL_ORIGIN_INVALID');
    if(marker?.deviceId===state.deviceId){this.migrationReady=true;return;}
    if(marker&&marker.deviceId!==state.deviceId){
      // Old payload belongs to another identity lifecycle and is never imported into the new device.
      await rm(this.dir,{recursive:true,force:true});await rm(this.installDir,{recursive:true,force:true});await rm(this.originDir,{recursive:true,force:true});
    }else{
      let names;try{names=await readdir(this.originDir);}catch(error){if(error.code!=='ENOENT')throw error;names=[];}
      const seals=[];
      for(const name of names.sort()){
        if(!name.endsWith('.json'))continue;
        if(!/^[a-f0-9]{64}\.json$/.test(name))throw Error('AGENT_CALL_ORIGIN_INVALID');
        const value=await readJSON(join(this.originDir,name),null);
        if(!value||Array.isArray(value)||value.schemaVersion!==1||typeof value.admitted!=='boolean'||Object.keys(value).sort().join('|')!=='admitted|schemaVersion')throw Error('AGENT_CALL_ORIGIN_INVALID');
        seals.push([name.slice(0,-5),value.admitted]);
      }
      const legacy=await this.rows();for(const row of legacy)if(!row||!/^[a-f0-9]{64}$/.test(row.factId))throw Error('AGENT_FACT_INVALID');
      // Import explicit seals first. Missing-seal legacy payload only proposes false; Core's prior verdict always wins.
      for(const [factId,admitted]of seals)await this.coreObserve(factId,admitted);
      for(const row of legacy)await this.coreObserve(row.factId,false);
      await rm(this.originDir,{recursive:true,force:true});
    }
    await mkdir(this.root,{recursive:true,mode:0o700});await atomicJSON(markerPath,{schemaVersion:1,deviceId:state.deviceId});this.migrationReady=true;
  }
  async migrateOrigins(){return this.mutate(()=>this.migrateOriginsLocked());}
  async origin(factId){
    if(!/^[a-f0-9]{64}$/.test(factId))throw Error('AGENT_FACT_INVALID');
    await this.migrateOrigins();
    const admitted=this.knownOrigins.has(factId)?this.knownOrigins.get(factId):(await this.coreObserve(factId,false)).admitted;
    return {schemaVersion:1,admitted};
  }
  async denyMissingOrigin(factId){return this.coreObserve(factId,false);}
  async observe(identity,row,consent,{allowNew=true,outcome=row?.success}={}){
    if(!consent)return 'withheld';
    if(!identity||!/^[a-f0-9]{64}$/.test(identity.factId)||!['codex','claude'].includes(identity.channel)||new Date(identity.occurredAt).toISOString()!==identity.occurredAt)throw Error('AGENT_FACT_INVALID');
    let value=null;
    if(row!==null){
    if(!row||row.factId!==identity.factId||row.channel!==identity.channel)throw Error('AGENT_FACT_INVALID');
    value={factId:row.factId,channel:row.channel,occurredAt:row.occurredAt,disposition:row.disposition,pluginId:row.pluginId,feature:row.feature,success:row.success};
    if(row.remote){
      const v=row.remote;
      if(value.channel!=='codex'||!value.pluginId?.endsWith('@openai-curated-remote')||typeof v.remotePluginId!=='string'||!v.remotePluginId||!remoteVersion(v.version)||!['bundleSha256','contentSha256'].every(k=>/^[a-f0-9]{64}$/.test(v[k]??''))||typeof v.verified!=='boolean'||(!v.verified&&value.success!==null))throw Error('AGENT_FACT_INVALID');
      value.remote={remotePluginId:v.remotePluginId,version:v.version,bundleSha256:v.bundleSha256,contentSha256:v.contentSha256,verified:v.verified};
    }
    if(!['codex','claude'].includes(value.channel)||!['attributed','ambiguous','unverified','outer-only'].includes(value.disposition)||new Date(value.occurredAt).toISOString()!==value.occurredAt||(value.success!==null&&typeof value.success!=='boolean')||(value.disposition==='attributed'&&(typeof value.success!=='boolean'||!owner(value)))||(['unverified','outer-only'].includes(value.disposition)&&(!owner(value)||value.success!==null))||(value.disposition==='ambiguous'&&(value.pluginId!==null||value.feature!==null||value.success!==null)))throw new Error('AGENT_FACT_INVALID');
    }
    return this.mutate(async()=>{
      await this.migrateOriginsLocked();
      await mkdir(this.dir,{recursive:true,mode:0o700});
      const path=join(this.dir,identity.factId+'.json'),existing=await readJSON(path,null);
      const admitted=Boolean(allowNew&&!existing&&value&&owner(value)&&!['ambiguous','outer-only'].includes(value.disposition)&&(!value.remote||value.remote.verified===true));
      const origin=await this.coreObserve(identity.factId,admitted);
      if(origin.first){
        if(existing)return 'origin-unavailable';
        if(value&&allowNew){await atomicJSON(path,value);return 'recorded';}
        return 'unattributed';
      }
      // A missing payload never establishes a new timestamp, even if the original Core admission was true.
      if(!origin.admitted||!existing)return 'duplicate';
      if(existing.channel!==identity.channel||value&&(existing.pluginId!==value.pluginId||existing.feature!==value.feature)||existing.disposition==='outer-only'||existing.success!==null||typeof outcome!=='boolean')return 'duplicate';
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
      await this.migrateOriginsLocked();
      for(const row of await this.rows())if(Date.parse(row.occurredAt)<now-30*86400000){await this.denyMissingOrigin(row.factId);await rm(join(this.dir,`${row.factId}.json`),{force:true});}
      let names;try{names=await readdir(this.installDir);}catch(error){if(error.code!=='ENOENT')throw error;names=[];}
      for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){const path=join(this.installDir,name),entry=await readJSON(path,null);if(entry?.wire&&Date.parse(entry.wire.occurredAt)<now-30*86400000)await atomicJSON(path,{eventId:entry.eventId,delivery:{state:'expired',code:'INSTALL_WINDOW_EXPIRED'}});}
    });
  }
  async eligible(catalog,now=Date.now()){
    await this.migrateOrigins();
    const cutoff=now-Math.min(30,catalog.settings.backfillWindowDays)*86400000,result=[];
    for(const row of await this.rows()){
      if(!(await this.origin(row.factId))?.admitted)continue;
      if(!['attributed','unverified'].includes(row.disposition)||!owner(row)||Date.parse(row.occurredAt)<cutoff||Date.parse(row.occurredAt)>now||(row.success===null&&catalog.settings.countUnconfirmedCalls!==true))continue;
      const owners=catalog.plugins.filter(item=>item.channel===row.channel&&item.pluginId===row.pluginId);
      if(owners.length===1){
        if(owners[0].marketplace==='openai-curated-remote'||owners[0].remote||row.remote){if(!row.remote?.verified||!sameRemote(row.remote,owners[0].remote))continue;}
        result.push({...row,hanaRef:owners[0].hanaRef});
      }
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
  async rejectInstall(eventId,code){return this.mutate(async()=>{await mkdir(this.installDir,{recursive:true,mode:0o700});await atomicJSON(join(this.installDir,eventId+'.json'),{eventId,delivery:{state:'rejected',code}});});}
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
  async withdraw(){return this.mutate(async()=>{await this.migrateOriginsLocked();for(const row of await this.rows())await this.denyMissingOrigin(row.factId);await rm(this.dir,{recursive:true,force:true});await rm(this.installDir,{recursive:true,force:true});await rm(join(this.root,'remote-inventory-diagnostics.json'),{force:true});});}
}
