// @ts-check
import { randomBytes, createHash } from 'node:crypto';
import { commandPackage } from './command-source.js';
import { pagePackage } from './page-source.js';
const surfaces=['main','settings.section','plugins.bundle.config','plugins.row.config'];
/** Usage-owned presentation seat. Credentials are ephemeral, peer-bound and consumed before any async write.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {()=>boolean} consent
 * @param {(input:any,allowed:()=>boolean)=>Promise<any>} record
 * @param {number} limit
 * @param {(code:string)=>void} [note]
 */
export function createPageFacts(ctx,consent,record,limit,note=()=>{}){
 /** @type {Map<string,{peer:object,source:{entryId:string,moduleName:string,packageName:string},surface:string,epoch:number,issuedAt:number}>} */
 const credentials=new Map();let epoch=0,closed=false;
 const rejected=()=>({disposition:'rejected'});
 return {
  /** @param {object} peer @param {unknown} request */
  async issue(peer,request){
   if(closed)return rejected();if(!consent())return {disposition:'withheld'};
   if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).sort().join('|')!=='entryId|moduleName|surface')return rejected();
   const item=/** @type {any} */(request);
   if(typeof item.entryId!=='string'||typeof item.moduleName!=='string'||!surfaces.includes(item.surface))return rejected();
   const name=commandPackage(ctx,item,note);if(name===null)return rejected();
   const source={entryId:item.entryId,moduleName:item.moduleName,packageName:name},observedEpoch=epoch;
   if(await pagePackage(ctx,source,note)!==name||closed||epoch!==observedEpoch||!consent())return rejected();
   const now=Date.now();for(const [token,value] of credentials)if(now-value.issuedAt>60000)credentials.delete(token);
   if(credentials.size>=limit)return rejected();
   const credential=randomBytes(32).toString('base64url');
   credentials.set(credential,{peer,source,surface:item.surface,epoch,issuedAt:now});
   return {disposition:'issued',credential};
  },
  /** @param {object} peer @param {unknown} request */
  async presented(peer,request){
   if(closed||!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).join('|')!=='credential')return rejected();
   const token=/** @type {{credential?:unknown}} */(request).credential;if(typeof token!=='string')return rejected();
   const item=credentials.get(token);if(!item||item.peer!==peer)return rejected();
   credentials.delete(token); // single-use even when storage or async ownership checks fail
   if(item.epoch!==epoch||Date.now()-item.issuedAt>60000||!consent())return rejected();
   const name=await pagePackage(ctx,item.source,note);
   if(name===null||closed||item.epoch!==epoch||!consent())return rejected();
   return record({hanaRef:name,action:'open',occurredAt:new Date().toISOString(),idempotencyKey:`page:${createHash('sha256').update(token).digest('hex')}`,sourcePlugin:name},()=>!closed&&item.epoch===epoch&&consent());
  },
  /** @param {object} peer */
  release(peer){for(const [token,item] of credentials)if(item.peer===peer)credentials.delete(token);},
  revoke(){epoch++;credentials.clear();},
  close(){closed=true;credentials.clear();},
 };
}
