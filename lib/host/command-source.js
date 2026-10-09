// @ts-check
import { validLoaderReference } from '../core/index.js';

/** Resolve a Host command's Loader owner through the profile's canonical package resolver.
 * The event's module specifier is not a package identity on its own.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} source
 * @returns {string|null}
 */
export function commandPackage(ctx, source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
  const observed = /** @type {{entryId?:unknown,moduleName?:unknown}} */(source);
  if (typeof observed.entryId !== 'string' || typeof observed.moduleName !== 'string') return null;
  const host = /** @type {{loader?:{entries():Iterable<unknown>},get?(name:string):unknown}} */(/** @type {unknown} */(ctx));
  const service = /** @type {{packageOf?(specifier:string,parentURL:string):unknown}|undefined} */(host.get?.('pluginPackages'));
  if (typeof host.loader?.entries !== 'function' || typeof service?.packageOf !== 'function') return null;
  try {
    for (const candidate of host.loader.entries()) {
      if (candidate === null || typeof candidate !== 'object') continue;
      const entry = /** @type {{id?:unknown,options?:{name?:unknown,group?:unknown},parent?:{tree?:{ctx?:{baseUrl?:unknown}}}}} */(candidate);
      if (entry.id !== observed.entryId || entry.options?.name !== observed.moduleName || entry.options.group) continue;
      const baseUrl = entry.parent?.tree?.ctx?.baseUrl;
      if (typeof baseUrl !== 'string' || !baseUrl.startsWith('file:')) return null;
      const found = service.packageOf(observed.moduleName, baseUrl);
      if (found === null || typeof found !== 'object') return null;
      const pkg = /** @type {{name?:unknown,version?:unknown,manifest?:{name?:unknown,version?:unknown}}} */(found);
      const manifest=pkg.manifest;
      if (!manifest || pkg.name !== manifest.name || pkg.version !== manifest.version || !validLoaderReference(pkg.name,pkg.version)) return null;
      return /** @type {string} */(pkg.name);
    }
  } catch { return null; }
  return null;
}
