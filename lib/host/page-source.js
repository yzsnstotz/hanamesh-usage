// @ts-check

const packageName=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
/** Package part of a module specifier: `pkg/client` -> `pkg`, `@s/pkg/x` -> `@s/pkg`. @param {unknown} specifier @returns {string|null} */
export function packageOfModule(specifier){
  if(typeof specifier!=='string')return null;
  const parts=specifier.split('/'),name=specifier.startsWith('@')?parts.slice(0,2).join('/'):parts[0];
  return name&&packageName.test(name)?name:null;
}

/** The package a presented page belongs to, when it is a bundle the person installed into this profile.
 * The client reports the page owner from the client plugin tree: its entry ids are client-side and never equal the
 * Host loader's ids, so ownership is decided by package name against the plugin manager's profile bundles
 * (installed, enabled, removable, profile-provided, readable). Built-in platform pages are not plugin opens.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{entryId:string,moduleName:string}} source
 * @param {(code:string)=>void} [note]
 * @returns {Promise<string|null>}
 */
export async function pagePackage(ctx,source,note=()=>{}){
  const name=packageOfModule(source.moduleName);if(name===null)return null;
  try {
  const manager=/** @type {{listBundles?():Promise<Array<{name?:unknown,installed:boolean,availability?:unknown,enabled:boolean,removable:boolean,error?:unknown,readOnlyReason?:unknown}>>}|undefined} */(ctx.get('pluginManager'));
  if(typeof manager?.listBundles!=='function')return null;
  const owners=(await manager.listBundles()).filter(b=>b.name===name&&b.installed&&b.availability==='profile'&&b.enabled&&b.removable&&!b.error&&!b.readOnlyReason);
  return owners.length===1?name:null;
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
