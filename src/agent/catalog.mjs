const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
export function validateCatalog(value) {
  if(value?.schemaVersion!==1||value.eventProtocol!=='hm-agent-v1'||!Array.isArray(value.plugins)||new Date(value.generatedAt).toISOString()!==value.generatedAt)throw new Error('AGENT_CATALOG_INVALID');
  const s=value.settings;
  if(!s||typeof s.countUnconfirmedCalls!=='boolean'||!['uploadIntervalMs','catalogRefreshMs'].every(key=>Number.isSafeInteger(s[key])&&s[key]>0&&s[key]<=2147483647)||!Number.isSafeInteger(s.backfillWindowDays)||s.backfillWindowDays<0)throw new Error('AGENT_SETTINGS_INVALID');
  for(const p of value.plugins) {
    if(!['claude','codex'].includes(p.channel)||!token(p.pluginName)||!token(p.marketplace)||p.pluginId!==`${p.pluginName}@${p.marketplace}`||typeof p.hanaRef!=='string'||!/^\w[\w.-]*\/\w[\w.-]*$/.test(p.githubRepo)||!Array.isArray(p.mcpServers)||!p.mcpServers.every(token)||!Array.isArray(p.skills)||!p.skills.every(token))throw new Error('AGENT_CATALOG_INVALID');
    if((p.remote!==undefined||p.marketplace==='openai-curated-remote')&&!validRemote(p))throw Error('AGENT_CATALOG_INVALID');
  }
  return value;
}
import {validRemote} from './remote-proof.mjs';
