// @ts-check
/** Interpret only the two public BundleInfo shapes consumed by Usage.
 * rc.2's installed && removable identifies a profile-owned dependency; the
 * installation-owned copy is protected even when also declared by the profile.
 * alpha's explicit availability is authoritative, including missing/unknown.
 * @param {{installed?:unknown,removable?:unknown,availability?:unknown}} bundle
 * @returns {unknown}
 */
export function bundleAvailability(bundle){
  if(Object.hasOwn(bundle,'availability'))return bundle.availability;
  if(bundle.installed!==true)return undefined;
  if(bundle.removable===true)return 'profile';
  if(bundle.removable===false)return 'installation';
  return undefined;
}
