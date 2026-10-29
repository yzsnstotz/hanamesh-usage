import {createHash} from 'node:crypto';

const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/.test(value) && !/secret|password|api.?key|ghp_|sk-/i.test(value);
const normalized = value => value.replace(/[^A-Za-z0-9_]/g,'_');
// Mask comments and string/template literals before identifying code-mode calls. This is intentionally
// conservative: template interpolation and computed/dynamic calls are not attributed.
function codeOnly(code) {
  let out='',quote=null,comment=null;
  for(let i=0;i<code.length;i++){
    const c=code[i],next=code[i+1];
    if(comment==='line'){if(c==='\n'){comment=null;out+='\n';}else out+=' ';continue;}
    if(comment==='block'){if(c==='*'&&next==='/'){comment=null;out+='  ';i++;}else out+=c==='\n'?'\n':' ';continue;}
    if(quote){if(c==='\\'){out+='  ';i++;}else{out+=c==='\n'?'\n':' ';if(c===quote)quote=null;}continue;}
    if(c==='/'&&next==='/'){comment='line';out+='  ';i++;continue;}
    if(c==='/'&&next==='*'){comment='block';out+='  ';i++;continue;}
    if(['"',"'",'`'].includes(c)){quote=c;out+=' ';continue;}
    out+=c;
  }return out;
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
  // Code-mode statements may invoke several plugins; an outer result cannot establish their separate outcomes.
  // Reject comments/quoted-only matches: only direct await tools.mcp__...(...) statements are recognized.
  if(channel === 'codex' && ['exec','functions.exec'].includes(name) && typeof input.code === 'string') {
    const code = codeOnly(input.code);
    for(const call of code.matchAll(/(?:^|[;\n}]|(?:const|let|var)\s+\w+\s*=)\s*await\s+tools\.(mcp__[A-Za-z0-9_]+)\s*\(/g)) matchMcp(call[1]);
  }
  let command = ['Bash','exec_command','functions.exec_command'].includes(name) ? (input.command ?? input.cmd) : null;
  if(channel === 'codex' && ['exec','functions.exec'].includes(name) && typeof input.code === 'string') {
    // Recognize a literal shell read only. No variable interpolation or execution is performed here.
    const literal=/(?:cmd|command)\s*:\s*(['"])(cat [^'"\n]+\/SKILL\.md)\1/.exec(input.code);
    command=literal && /^(?:cmd|command)\s*:/.test(codeOnly(input.code).slice(literal.index)) ? literal[2] : null;
  }
  if(channel === 'codex' && typeof command === 'string') {
    for(const plugin of installed) for(const skill of plugin.skills) {
      const path = `${plugin.root}/skills/${skill}/SKILL.md`;
      if(command.trim() === `cat ${path}` || command.trim() === `cat "${path}"` || command.trim() === `cat '${path}'`) add(plugin,`skill:${skill}`);
    }
  }
  const unique = [...new Map(candidates.map(row=>[JSON.stringify(row),row])).values()];
  if(unique.length === 0) return null;
  // More than one installed owner or more than one feature is deliberately not scored.
  const factId = createHash('sha256').update(JSON.stringify([channel,payload.session_id,payload.tool_use_id ?? payload.tool_call_id])).digest('hex');
  if(typeof payload.session_id !== 'string' || typeof (payload.tool_use_id ?? payload.tool_call_id) !== 'string') return null;
  const occurredAt = new Date(now).toISOString();
  if(unique.length !== 1) return {factId,channel,occurredAt,disposition:'ambiguous',pluginId:null,feature:null,success:null};
  if(unique[0].remote?.verified===false)return {factId,channel,occurredAt,disposition:'unverified',...unique[0],success:null};
  const response = payload.tool_response;
  // Outer script recognition is local-only: its nested calls have their own call ids/hooks.
  if(channel==='codex'&&['exec','functions.exec'].includes(name))return {factId,channel,occurredAt,disposition:'outer-only',...unique[0],success:null};
  let success=null;
  if(payload.hook_event_name==='PostToolUseFailure')success=false;
  else if(payload.hook_event_name==='PostToolUse'&&response&&typeof response==='object'){
    if(response.error!=null)success=false;
    else if(Object.hasOwn(response,'isError'))success=typeof response.isError==='boolean'?!response.isError:null;
    else if(Object.hasOwn(response,'is_error'))success=typeof response.is_error==='boolean'?!response.is_error:null;
    else if(Object.hasOwn(response,'exit_code'))success=Number.isSafeInteger(response.exit_code)?response.exit_code===0:null;
    // Claude Skill reports an explicit boolean; no tool result text or command metadata is retained.
    else if(channel==='claude'&&name==='Skill'&&typeof response.success==='boolean')success=response.success;
    else if(name.startsWith('mcp__')&&Array.isArray(response.content))success=true; // MCP isError is optional and defaults to false.
    // Claude emits successful MCP results as bare content blocks; failures use PostToolUseFailure.
    // Inspect block structure only, never text, attachments or other result data.
    else if(channel==='claude'&&name.startsWith('mcp__')&&Array.isArray(response)&&response.length>0&&response.every(block=>block&&typeof block==='object'&&typeof block.type==='string'))success=true;
  }
  return {factId,channel,occurredAt,disposition:success===null?'unverified':'attributed',...unique[0],success};
}
