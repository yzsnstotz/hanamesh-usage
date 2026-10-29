import {createHash} from 'node:crypto';

const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/.test(value) && !/secret|password|api.?key|ghp_|sk-/i.test(value);
const normalized = value => value.replace(/[^A-Za-z0-9_]/g,'_');
/** Opaque native invocation identity; never persist the original session/call ids. */
export function hookCallIdentity(payload,channel,now=Date.now()) {
  const call=payload.tool_use_id ?? payload.tool_call_id;
  if(!['claude','codex'].includes(channel)||!['PreToolUse','PostToolUse','PostToolUseFailure'].includes(payload.hook_event_name)||typeof payload.session_id!=='string'||!payload.session_id||typeof call!=='string'||!call)return null;
  return {factId:createHash('sha256').update(JSON.stringify([channel,payload.session_id,call])).digest('hex'),channel,occurredAt:new Date(now).toISOString()};
}
/** A result completes the original invocation, independently of later inventory. */
export function hookOutcome(payload,channel) {
  const name=payload.tool_name,response=payload.tool_response;
  if(payload.hook_event_name==='PreToolUse')return null;
  if(payload.hook_event_name==='PostToolUseFailure')return false;
  if(payload.hook_event_name!=='PostToolUse'||!response||typeof response!=='object')return null;
  if(response.error!=null)return false;
  if(Object.hasOwn(response,'isError'))return typeof response.isError==='boolean'?!response.isError:null;
  if(Object.hasOwn(response,'is_error'))return typeof response.is_error==='boolean'?!response.is_error:null;
  if(Object.hasOwn(response,'exit_code'))return Number.isSafeInteger(response.exit_code)?response.exit_code===0:null;
  if(channel==='claude'&&name==='Skill'&&typeof response.success==='boolean')return response.success;
  if(typeof name==='string'&&name.startsWith('mcp__')&&Array.isArray(response.content))return true;
  if(channel==='claude'&&typeof name==='string'&&name.startsWith('mcp__')&&Array.isArray(response)&&response.length>0&&response.every(block=>block&&typeof block==='object'&&typeof block.type==='string'))return true;
  return null;
}
/** Only the tool identifier and a narrowly recognized call/read expression are inspected in memory.
 * Never open transcript_path, persist tool_input/tool_response, evaluate code, or record prompts. */
export function projectHook(payload,channel,installed,now=Date.now()) {
  if (!['claude','codex'].includes(channel) || !['PreToolUse','PostToolUse','PostToolUseFailure'].includes(payload.hook_event_name)) return null;
  const name = payload.tool_name;
  if (typeof name !== 'string') return null;
  const input = payload.tool_input ?? {};
  const candidates = [];
  const add = (plugin,feature) => {if(token(feature)) candidates.push({pluginId:plugin.pluginId,feature,...(plugin.remote?{remote:plugin.remote}:{})});};
  const matchMcp = tool => {
    for(const plugin of installed) for(const server of plugin.mcpServers) {
      const prefix = channel === 'claude' ? `mcp__plugin_${plugin.pluginName}_${server}__` : `mcp__${normalized(server)}__`;
      if(tool.startsWith(prefix)) add(plugin,`mcp:${tool.slice(prefix.length)}`);
    }
  };
  matchMcp(name);
  if (name === 'Skill' && typeof input.skill === 'string') {
    for(const plugin of installed) for(const skill of plugin.skills) if(input.skill === `${plugin.pluginName}:${skill}`) add(plugin,`skill:${skill}`);
  }
  const command = ['Bash','exec_command','functions.exec_command'].includes(name) ? (input.command ?? input.cmd) : null;
  if(channel === 'codex' && typeof command === 'string') {
    for(const plugin of installed) for(const skill of plugin.skills) {
      const path = `${plugin.root}/skills/${skill}/SKILL.md`;
      if(command.trim() === `cat ${path}` || command.trim() === `cat "${path}"` || command.trim() === `cat '${path}'`) add(plugin,`skill:${skill}`);
    }
  }
  const unique = [...new Map(candidates.map(row=>[JSON.stringify([row.remote?.remotePluginId??row.pluginId,row.feature]),row])).values()];
  if(unique.length === 0) return null;
  // More than one installed owner or more than one feature is deliberately not scored.
  const identity=hookCallIdentity(payload,channel,now);if(!identity)return null;
  const {factId,occurredAt}=identity;
  if(unique.length !== 1) return {factId,channel,occurredAt,disposition:'ambiguous',pluginId:null,feature:null,success:null};
  const success=hookOutcome(payload,channel);
  return {factId,channel,occurredAt,disposition:success===null?'unverified':'attributed',...unique[0],success};
}
