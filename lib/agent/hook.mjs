import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {runtime} from './runtime.mjs';
import {projectHook} from './project.mjs';
import {installedPlugins} from './inventory.mjs';
import {agentLock} from './sender-lock.mjs';
import {mkdir} from 'node:fs/promises';

try {
  const r=await runtime();const state=await r.call({operation:'state'});
  // No raw stdin parsing, installed-plugin scan, queue, or network before the explicit local opt-in.
  if(state.consent.state!=='granted') {
    process.stdout.write('HanaMesh：尚未同意，默认不记录。请查看插件 setup 指引，亲自同意后用 bind-link 打开网站登录并绑定；上传仅含时间、插件、功能、成败及渠道。第4段验收终端已自动配置地址，可输入 agree，再输入 bind。\n');
  } else {
    const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const {channel,home:hostHome}=r.host;
    if(!hostHome)throw new Error('AGENT_HOST_HOME_REQUIRED');
    if(payload.hook_event_name==='SessionStart')process.stdout.write(`HanaMesh：已同意。请用 hanamesh_status 检查收录名单、绑定与待发记录；尚未绑定请打开网站绑定页。\n`);
    const installed=await installedPlugins(channel,hostHome);
    const row=projectHook(payload,channel,installed);
    if(row){
      await mkdir(r.agentHome,{recursive:true,mode:0o700});
      const release=await agentLock(r.agentHome,'collection',r.config.requestTimeoutMs);
      if(!release)throw new Error('AGENT_COLLECTION_BUSY');
      try{const current=await r.call({operation:'state'});if(current.consent.state==='granted'&&current.consent.changedAt===state.consent.changedAt&&current.consent.consentId===state.consent.consentId)await r.store.record(row,true);}
      finally{await release();}
    }
  }
} catch(error) {process.stderr.write(`HanaMesh: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_HOOK_FAILED'}；请运行 hanamesh_status 查看前置条件。\n`);process.exitCode=1;}
