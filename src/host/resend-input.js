// @ts-check
/** Closed selection DTO. A named call conveys one current user action, never
 * a force flag, replacement event, identity, or reusable authorization.
 * @param {unknown} input @param {number} [maxEvents]
 * @returns {string[]|null}
 */
export function resendEventIds(input,maxEvents=Number.MAX_SAFE_INTEGER){
  if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).join('|')!=='eventIds')return null;
  const ids=/** @type {{eventIds?:unknown}} */(input).eventIds;
  if(!Array.isArray(ids)||ids.length===0||ids.length>maxEvents
    ||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
    ||new Set(ids).size!==ids.length)return null;
  return [...ids];
}
