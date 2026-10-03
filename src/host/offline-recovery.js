// @ts-check
// Local operator tool. This file is packaged in lib/host but is never mounted
// by the DSH plugin and exposes no authenticated-browser or plugin write route.
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventStore, signingJSON, wireEvent } from '../core/index.js';

const EXPECTED_HOST_SHA='9b7e19fd828f924ea32f2b0784ba4807a2d79aab42cc39681b9d6247d2984452';
const FROM='1970-01-01T00:00:00.000Z',TO='1970-01-02T00:00:00.000Z';
const RAW_KEY_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const ALLOWED=new Set(['--profile-root','--origin','--receipt','--backup']);
class RecoveryError extends Error {
  /** @param {string} code */
  constructor(code){super(code);this.code=code;}
}
/** @param {string} code @returns {never} */
const fail=code=>{throw new RecoveryError(code);};
/** @param {Buffer} bytes */
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} value @returns {value is Record<string, any>} */
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** @param {string[]} argv */
function flags(argv){
  if(argv.length!==8)fail('ARGUMENTS_INVALID');
  /** @type {Record<string,string>} */ const out={};
  for(let n=0;n<argv.length;n+=2){if(!ALLOWED.has(argv[n])||Object.hasOwn(out,argv[n])||!argv[n+1])fail('ARGUMENTS_INVALID');out[argv[n]]=argv[n+1];}
  if(Object.keys(out).length!==4)fail('ARGUMENTS_INVALID');
  return /** @type {{'--profile-root':string,'--origin':string,'--receipt':string,'--backup':string}} */(out);
}
/** @param {string} path @param {boolean} file @param {boolean} [secret] */
async function securePath(path,file,secret=true){
  if(!isAbsolute(path)||resolve(path)!==path)fail('PATH_UNSAFE');
  let current=path;
  while(true){const info=await lstat(current).catch(()=>fail('PATH_UNAVAILABLE'));if(info.isSymbolicLink())fail('PATH_UNSAFE');if(current===sep)break;current=dirname(current);}
  const info=await lstat(path);
  if(file&&!info.isFile()||!file&&!info.isDirectory()||info.uid!==process.getuid?.())fail('PATH_UNSAFE');
  if(file&&(secret?(info.mode&0o777)!==0o600:(info.mode&0o022)!==0)||!file&&(info.mode&0o022)!==0)fail('PATH_UNSAFE');
  if(await realpath(path)!==path)fail('PATH_UNSAFE');
}
/** Inspect the one fixed P05 Tauri overlay; reject ambiguous YAML instead of
 * treating an operator-supplied origin as proof of the Core runtime config.
 * @param {Buffer} bytes @param {string} origin */
function coreConfigOf(bytes,origin){
  const lines=bytes.toString('utf8').split(/\r?\n/u);
  const matches=lines.map((line,index)=>/^\s*-\s+id:\s*hanamesh-core\s*$/u.test(line)?index:-1).filter(index=>index>=0);
  if(matches.length!==1)fail('CORE_CONFIG_INVALID');
  const begin=matches[0],indent=lines[begin].search(/\S/u);
  let end=lines.length;
  for(let n=begin+1;n<lines.length;n++)if(/^\s*-\s+id:/u.test(lines[n])&&lines[n].search(/\S/u)<=indent){end=n;break;}
  const block=lines.slice(begin+1,end).filter(line=>!/^\s*#/u.test(line));
  /** @param {string} name */
  const read=name=>block.flatMap(line=>{const found=new RegExp(`^\\s*${name}:\\s*(.*?)\\s*$`,'u').exec(line);return found?[found[1].replace(/^['"]|['"]$/gu,'')]:[];});
  const origins=read('serverOrigin'),modes=read('authNonceSource');
  if(origins.length!==1||origins[0]!==origin||modes.length>1||modes.length===1&&modes[0]!=='client')fail('CORE_CONFIG_INVALID');
}
/** @param {string} path */
function noOpenFile(path){
  const result=spawnSync('/usr/sbin/lsof',['-Fn',path],{encoding:'utf8',timeout:5000});
  if(result.error||result.status!==1)fail('PROFILE_ACTIVE_OR_UNVERIFIABLE');
}
/** @param {string} value */
function originOf(value){
  /** @type {URL} */ let url;try{url=new URL(value);}catch{fail('ORIGIN_INVALID');}
  const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin!==value)fail('ORIGIN_INVALID');
  return url.origin;
}
/** @param {string} path @param {string} origin */
async function receiptOf(path,origin){
  await securePath(path,true);
  let item;try{item=JSON.parse(await readFile(path,'utf8'));}catch{fail('RECEIPT_INVALID');}
  if(!object(item)||Object.keys(item).sort().join('|')!==['hostPackageSha256','migrationCount','lastMigration','healthy','origin','checkedAt','stoppedPids','stoppedPorts'].sort().join('|')||item.hostPackageSha256!==EXPECTED_HOST_SHA||item.migrationCount!==38||item.lastMigration!=='0037_custody_device_id_base64url'||item.healthy!==true||item.origin!==origin)fail('RECEIPT_INVALID');
  const checked=Date.parse(item.checkedAt),age=Date.now()-checked;
  if(!Number.isFinite(checked)||new Date(checked).toISOString()!==item.checkedAt||age<0||age>15*60_000)fail('RECEIPT_STALE');
  if(!Array.isArray(item.stoppedPids)||item.stoppedPids.length<1||item.stoppedPids.length>8||item.stoppedPids.some((pid)=>!Number.isSafeInteger(pid)||pid<1)||!Array.isArray(item.stoppedPorts)||item.stoppedPorts.length<1||item.stoppedPorts.length>8||item.stoppedPorts.some((port)=>!Number.isSafeInteger(port)||port<1||port>65535))fail('RECEIPT_INVALID');
  return /** @type {{stoppedPids:number[],stoppedPorts:number[]}} */(item);
}
/** @param {{stoppedPids:number[],stoppedPorts:number[]}} receipt */
function verifyStopped(receipt){
  for(const pid of receipt.stoppedPids){try{process.kill(pid,0);fail('PROFILE_PROCESS_ACTIVE');}catch(error){if(error instanceof RecoveryError)throw error;if(!object(error)||error.code!=='ESRCH')fail('PROFILE_PROCESS_UNVERIFIABLE');}}
  for(const port of receipt.stoppedPorts){const result=spawnSync('/usr/sbin/lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8',timeout:5000});if(result.error||result.status!==1)fail('PROFILE_PORT_ACTIVE_OR_UNVERIFIABLE');}
}
/** @param {Buffer} bytes */
function coreOf(bytes){
  let wrapper;try{wrapper=JSON.parse(bytes.toString('utf8'));}catch{fail('CORE_INVALID');}
  if(!object(wrapper)||Object.keys(wrapper).sort().join('|')!=='global|tables|unit'||!object(wrapper.unit)||wrapper.unit.name!=='hanamesh_core'||wrapper.unit.version!==1||!object(wrapper.tables)||Object.keys(wrapper.tables).length!==0||!object(wrapper.global))fail('CORE_INVALID');
  const state=wrapper.global,device=state.device;
  if(state.schemaVersion!==1||!Number.isSafeInteger(state.revision)||state.revision<0)fail('CORE_INVALID');
  const registration=state.registration;
  if(!object(state.consent)||state.consent.state!=='granted'||!object(registration)||registration.status!=='registered'||typeof registration.principalId!=='string'||registration.principalId.length===0||typeof registration.registeredAt!=='string'||!Number.isFinite(Date.parse(registration.registeredAt))||new Date(registration.registeredAt).toISOString()!==registration.registeredAt)fail('CONSENT_OR_REGISTRATION_REQUIRED');
  if(!object(device)||typeof device.deviceId!=='string'||!/^[_-][A-Za-z0-9_-]{42}$/.test(device.deviceId)||typeof device.publicKey!=='string'||typeof device.privateKeyPkcs8!=='string')fail('DEVICE_INVALID');
  try{
    const raw=Buffer.from(device.publicKey,'base64url'),privateKey=createPrivateKey({key:Buffer.from(device.privateKeyPkcs8,'base64url'),format:'der',type:'pkcs8'});
    const derived=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32);
    if(raw.length!==32||raw.toString('base64url')!==device.publicKey||!derived.equals(raw)||createHash('sha256').update(raw).digest('base64url')!==device.deviceId)fail('DEVICE_INVALID');
    const publicKey=createPublicKey({key:Buffer.concat([RAW_KEY_PREFIX,raw]),format:'der',type:'spki'});
    return {deviceId:device.deviceId,privateKey,publicKey};
  }catch{fail('DEVICE_INVALID');}
}
/** @param {Buffer} bytes */
function eventsOf(bytes){
  let wrapper;try{wrapper=JSON.parse(bytes.toString('utf8'));}catch{fail('EVENTS_INVALID');}
  if(!object(wrapper)||Object.keys(wrapper).sort().join('|')!=='global|tables|unit'||!object(wrapper.unit)||wrapper.unit.name!=='hanamesh_usage_events'||wrapper.unit.version!==1||!object(wrapper.tables)||Object.keys(wrapper.tables).length!==0||!object(wrapper.global))fail('EVENTS_INVALID');
  if(wrapper.global.withdrawal!==null)fail('WITHDRAWAL_PRESENT');
  return wrapper;
}
/** @param {{deviceId:string,privateKey:import('node:crypto').KeyObject}} device @param {string} origin */
async function probe(device,origin){
  const path=`/v1/usage/me/devices/${encodeURIComponent(device.deviceId)}/events`;
  const url=new URL(path,origin);url.searchParams.set('from',FROM);url.searchParams.set('to',TO);url.searchParams.set('limit','1');
  const timestamp=Date.now().toString(),nonce=randomBytes(16).toString('base64url'),bodyHash=hash(Buffer.alloc(0));
  const canonical=`GET|${path}|${timestamp}|${nonce}|${bodyHash}`;
  const signature=sign(null,Buffer.from(canonical),device.privateKey).toString('base64url');
  /** @type {Response} */ let response;
  try{response=await fetch(url,{method:'GET',redirect:'error',headers:{'x-hm-device-id':device.deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':signature,origin},signal:AbortSignal.timeout(10_000)});}catch{fail('PROBE_UNAVAILABLE');}
  if(response.status!==200)fail('PROBE_REJECTED');
  if(new URL(response.url).origin!==origin||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail('PROBE_INVALID');
  let body;try{const reader=response.body?.getReader();if(!reader)fail('PROBE_INVALID');const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)fail('PROBE_INVALID');chunks.push(value);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('PROBE_INVALID');}
  if(!object(body)||!Array.isArray(body.items)||body.items.length!==0||body.nextAfter!==null||!object(body.window)||body.window.from!==FROM||body.window.to!==TO)fail('PROBE_INVALID');
}
/** @param {string} path @param {string} original */
async function unchanged(path,original){return hash(await readFile(path))===original;}
/** @param {import('../core/index.js').UsageEvent} event @param {import('node:crypto').KeyObject} publicKey */
function verifyOriginal(event,publicKey){
  const wire=wireEvent(event),{signature,...six}=wire;
  if(typeof signature!=='string')return false;
  return verify(null,Buffer.from(signingJSON(six)),publicKey,Buffer.from(signature,'base64url'));
}
/** @param {string[]} argv */
export async function recoverOffline(argv){
  const input=flags(argv),profile=input['--profile-root'],origin=originOf(input['--origin']),receipt=input['--receipt'],backup=input['--backup'];
  const storage=join(profile,'storages'),corePath=join(storage,'hanamesh_core.json'),eventPath=join(storage,'hanamesh_usage_events.json'),configPath=join(profile,'profiles','tauri','cordis.patch.yml');
  if([profile,storage,corePath,eventPath,receipt].includes(backup)||dirname(backup)===storage)fail('PATH_UNSAFE');
  await securePath(profile,false);await securePath(storage,false);await securePath(corePath,true);await securePath(eventPath,true);await securePath(configPath,true,false);await securePath(dirname(backup),false);
  try{await access(backup);fail('BACKUP_EXISTS');}catch(error){if(error instanceof RecoveryError)throw error;}
  const operator=await receiptOf(receipt,origin);verifyStopped(operator);
  noOpenFile(corePath);noOpenFile(eventPath);noOpenFile(configPath);
  const originalCore=await readFile(corePath),originalEvents=await readFile(eventPath),originalConfig=await readFile(configPath),coreHash=hash(originalCore),eventsHash=hash(originalEvents),configHash=hash(originalConfig);
  coreConfigOf(originalConfig,origin);
  const firstCore=coreOf(originalCore),firstEvents=eventsOf(originalEvents);
  const firstStore=new EventStore({get:()=>firstEvents.global,set:async()=>fail('READ_ONLY')},5000,Date.now);
  const candidates=firstStore.getSnapshot().events.filter(event=>event.deviceId===firstCore.deviceId&&event.upload.state==='rejected'&&event.upload.code==='USAGE_INPUT_INVALID').length;
  if(candidates===0)return {status:'NOOP',candidates:0,recovered:0,skipped:0,fileSha256Before:eventsHash,fileSha256After:eventsHash};
  await probe(firstCore,origin);
  verifyStopped(operator);
  noOpenFile(corePath);noOpenFile(eventPath);noOpenFile(configPath);
  if(!await unchanged(corePath,coreHash)||!await unchanged(eventPath,eventsHash)||!await unchanged(configPath,configHash))fail('PROFILE_CHANGED');
  coreConfigOf(await readFile(configPath),origin);
  const secondCore=coreOf(await readFile(corePath)),secondEvents=eventsOf(await readFile(eventPath));
  if(secondCore.deviceId!==firstCore.deviceId)fail('PROFILE_CHANGED');
  const backupHandle=await open(backup,'wx',0o600).catch(()=>fail('BACKUP_FAILED'));
  try{await backupHandle.writeFile(originalEvents);await backupHandle.sync();}finally{await backupHandle.close();}
  if(!await unchanged(backup,eventsHash))fail('BACKUP_FAILED');
  const adapter={get:()=>secondEvents.global,
    /** @param {import('../core/index.js').EventSnapshot} value */
    async set(value){
    const tmp=join(storage,`.hanamesh_usage_events.recover-${randomBytes(12).toString('hex')}.tmp`);
    let created=false;
    try{
      const next={unit:secondEvents.unit,global:value,tables:secondEvents.tables};
      const handle=await open(tmp,'wx',0o600);created=true;
      try{await handle.writeFile(JSON.stringify(next));await handle.sync();}finally{await handle.close();}
      verifyStopped(operator);noOpenFile(corePath);noOpenFile(eventPath);noOpenFile(configPath);
      if(!await unchanged(corePath,coreHash)||!await unchanged(eventPath,eventsHash)||!await unchanged(configPath,configHash))fail('PROFILE_CHANGED');
      coreConfigOf(await readFile(configPath),origin);
      coreOf(await readFile(corePath));eventsOf(await readFile(eventPath));
      await rename(tmp,eventPath);created=false;
      try{const directory=await open(storage,'r');try{await directory.sync();}finally{await directory.close();}}catch{fail('COMMIT_DURABILITY_UNCERTAIN');}
    }finally{if(created)await unlink(tmp).catch(()=>{});}
  }};
  const store=new EventStore(adapter,5000,Date.now);
  const recovered=await store.recoverRejectedDeviceId(secondCore.deviceId,event=>verifyOriginal(event,secondCore.publicKey));
  const skipped=candidates-recovered;
  const afterHash=hash(await readFile(eventPath));
  if(recovered>0&&afterHash===eventsHash)fail('COMMIT_STATE_UNCERTAIN');
  return {status:skipped>0?'PARTIAL':recovered>0?'RECOVERED':'NOOP',candidates,recovered,skipped,fileSha256Before:eventsHash,fileSha256After:afterHash};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  recoverOffline(process.argv.slice(2)).then(result=>{process.stdout.write(JSON.stringify(result)+'\n');}).catch(error=>{
    const code=error instanceof RecoveryError?error.code:'RECOVERY_FAILED';
    process.stderr.write(JSON.stringify({status:'ERROR',code})+'\n');process.exitCode=1;
  });
}
