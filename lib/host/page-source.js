// @ts-check
import {commandPackage} from './command-source.js';

/** Recheck a Host page's owner against live Inventory and profile-installed bundle rows.
 * Built-in platform pages and platform-owned generated configuration pages are not ordinary plugin opens.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{entryId:string,moduleName:string,packageName:string}} source
 * @param {(code:string)=>void} [note]
 * @returns {Promise<string|null>}
 */
export async function pagePackage(ctx,source,note=()=>{}){
  const name=commandPackage(ctx,source,note);
  if(name===null||name!==source.packageName)return null;
  try {
  const inventory=/** @type {{list?():Promise<{entries:Array<{entryId:string,moduleName:string,enabled:boolean,fiberPhase:string|null}>}>}|undefined} */(ctx.get('pluginInventory'));
  const manager=/** @type {{listBundles?():Promise<Array<{installed:boolean,enabled:boolean,removable:boolean,error?:unknown,readOnlyReason?:unknown,rows:Array<{entryId?:string,moduleName:string}>}>>}|undefined} */(ctx.get('pluginManager'));
  if(typeof inventory?.list!=='function'||typeof manager?.listBundles!=='function')return null;
  const snapshot=await inventory.list();
  const matches=snapshot.entries.filter(e=>e.entryId===source.entryId&&e.moduleName===source.moduleName);
  if(matches.length!==1||!matches[0]?.enabled||matches[0].fiberPhase!=='active')return null;
  if(!await ownedByProfileBundle(manager,source))return null;
  // Resolution is checked again after async Inventory/management reads.
  return commandPackage(ctx,source,note)===name?name:null;
  } catch { note('PAGE_SOURCE_UNREADABLE');return null; }
}

/** True when exactly one bundle the person installed into this profile (installed, enabled, removable, readable)
 * declares the entry. Platform pages/commands and installation-supplied bundles are not ordinary plugin use.
 * @param {{listBundles?():Promise<Array<{installed:boolean,enabled:boolean,removable:boolean,error?:unknown,readOnlyReason?:unknown,rows:Array<{entryId?:string,moduleName:string}>}>>}|undefined} manager
 * @param {{entryId:string,moduleName:string}} source
 */
export async function ownedByProfileBundle(manager,source){
  if(typeof manager?.listBundles!=='function')return false;
  const bundles=await manager.listBundles();
  return bundles.filter(b=>b.installed&&b.enabled&&b.removable&&!b.error&&!b.readOnlyReason
    &&b.rows.some(r=>r.entryId===source.entryId&&r.moduleName===source.moduleName)).length===1;
}
