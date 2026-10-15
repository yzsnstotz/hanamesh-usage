import {spawn} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {readJSON,atomicJSON,AgentStore} from './store.mjs';

export function hostContext(env=process.env,pluginRoot=fileURLToPath(new URL('../../',import.meta.url))) {
  const canonical=path=>{try{return realpathSync(path);}catch{return resolve(path);}};
  const root=canonical(pluginRoot);
  const inside=home=>home&&root.startsWith(canonical(home)+'/');
  let channel=env.HANAMESH_AGENT_CHANNEL;
  if(!channel)channel=inside(env.CLAUDE_CONFIG_DIR)||root.includes('/.claude/plugins/cache/')?'claude':inside(env.CODEX_HOME)||env.CODEX_HOME?'codex':'claude';
  return {channel,home:channel==='codex'?env.CODEX_HOME:(env.CLAUDE_CONFIG_DIR ?? join(homedir(),'.claude'))};
}

export function locations(env=process.env) {
  const sharedHome=resolve(env.HANAMESH_SHARED_HOME ?? join(homedir(),'.hanamesh-shared'));
  return {sharedHome,agentHome:resolve(env.HANAMESH_AGENT_HOME ?? join(sharedHome,'agent/usage')),
    coreCLI:env.HANAMESH_CORE_AGENT_CLI ?? fileURLToPath(new URL('../../runtime/core/lib/agent-cli.js',import.meta.url))};
}
export async function runtime(env=process.env) {
  if(Number(process.versions.node.split('.')[0])!==24||!process.versions.sqlite)throw new Error('AGENT_NODE24_SQLITE_REQUIRED');
  const paths=locations(env);
  const config={bootstrapIntervalMs:60000,requestTimeoutMs:10000,...await readJSON(join(paths.agentHome,'config.json'),{serverOrigin:null,websiteOrigin:null})};
  if(!Number.isSafeInteger(config.bootstrapIntervalMs)||config.bootstrapIntervalMs<1||config.bootstrapIntervalMs>2147483647||!Number.isSafeInteger(config.requestTimeoutMs)||config.requestTimeoutMs<10||config.requestTimeoutMs>60000)throw new Error('AGENT_SETTINGS_INVALID');
  for(const key of ['serverOrigin','websiteOrigin'])if(config[key]!==null){const url=new URL(config[key]);if((url.protocol!=='https:' && !(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))||url.origin!==config[key])throw new Error('AGENT_ORIGIN_INVALID');}
  const call= input=>new Promise((resolveResult,reject)=>{
    const child=spawn(process.execPath,[paths.coreCLI],{stdio:['pipe','pipe','pipe'],env:{PATH:env.PATH,HOME:env.HOME ?? homedir(),TMPDIR:env.TMPDIR}});
    let stdout='';child.stdout.setEncoding('utf8').on('data',chunk=>{stdout+=chunk;});
    child.stderr.resume();child.on('error',()=>reject(new Error('CORE_AGENT_UNAVAILABLE')));
    child.on('close',()=>{try{const value=JSON.parse(stdout);if(value.error)reject(new Error(value.error.code));else resolveResult(value.result);}catch{reject(new Error('CORE_AGENT_RESPONSE_INVALID'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({config:{...config,timeoutMs:config.requestTimeoutMs,sharedHome:paths.sharedHome},input}));
  });
  return {...paths,config,call,env,host:hostContext(env),store:new AgentStore(paths.agentHome,{timeoutMs:config.requestTimeoutMs}),
    async configure(value){await mkdir(paths.agentHome,{recursive:true,mode:0o700});await atomicJSON(join(paths.agentHome,'config.json'),value);},
  };
}
export async function requestJSON(origin,path,init={},timeoutMs=10000) {
  const response=await fetch(new URL(path,origin),{...init,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(timeoutMs)});
  let body;try{body=await response.json();}catch{throw new Error(response.ok?'AGENT_RESPONSE_INVALID':`AGENT_HTTP_${response.status}_UNREADABLE`);}
  if(!response.ok)throw new Error(/^[A-Z][A-Z0-9_]{0,79}$/.test(body?.error?.code)?body.error.code:`AGENT_HTTP_${response.status}`);
  return body;
}
