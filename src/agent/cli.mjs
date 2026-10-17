#!/usr/bin/env node
import {mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {runtime} from './runtime.mjs';
import {atomicJSON,readJSON} from './store.mjs';
import {status} from './status.mjs';
import {uploadOnce} from './upload.mjs';
import {senderLock} from './sender-lock.mjs';
import {beginWithdrawal,finishWithdrawal,grantConsent} from './withdraw.mjs';

const safeCode=error=>/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_FAILED';
let r;try{r=await runtime();}catch(error){process.stderr.write(`${safeCode(error)}\n`);process.exit(1);}
const command=process.argv[2] ?? 'status';
if(command==='mcp') {
  let stopped=false,timer=null,active=null;
  const tick=async()=>{
    if(stopped)return;
    let release=null,allowed=false;
    try {
      // Before opt-in this MCP is a pure reader; it neither creates directories nor contacts a server.
      const core=await r.call({operation:'state'});
      const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);
      if(withdrawal?.state==='pending') {
        await finishWithdrawal(r);
      }
      if(core.consent.state==='granted') {
        allowed=true;
        await mkdir(r.agentHome,{recursive:true,mode:0o700});
        release=await senderLock(r.agentHome);
        if(release){const result=await uploadOnce(r);r.senderError=null;await atomicJSON(join(r.agentHome,'sender.json'),{...result,checkedAt:new Date().toISOString()});}
      }
    }catch(error){r.senderError=safeCode(error);if(allowed)await atomicJSON(join(r.agentHome,'sender.json'),{state:'stopped',code:safeCode(error),checkedAt:new Date().toISOString()});}
    finally{if(release)await release();}
    if(!stopped){const catalog=await readJSON(join(r.agentHome,'catalog.json'),null);timer=setTimeout(()=>{active=tick();},catalog?.settings?.uploadIntervalMs ?? r.config.bootstrapIntervalMs);timer.unref();}
  };
  const send=value=>process.stdout.write(`${JSON.stringify(value)}\n`);
  const lines=createInterface({input:process.stdin});
  for await(const line of lines) {
    let request;try{request=JSON.parse(line);}catch{continue;}
    if(request.id===undefined)continue;
    try {
      let result;
      if(request.method==='initialize') {result={protocolVersion:request.params?.protocolVersion ?? '2024-11-05',capabilities:{tools:{}},serverInfo:{name:'hanamesh-usage',version:'0.3.0-rc.2'}};if(!active)active=tick();}
      else if(request.method==='ping')result={};
      else if(request.method==='tools/list')result={tools:[{name:'hanamesh_status',description:'只读检查 HanaMesh 同意、配置、计量前置条件、记录和发送原因；不修改宿主信任。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]};
      else if(request.method==='tools/call' && request.params?.name==='hanamesh_status' && Object.keys(request.params?.arguments ?? {}).length===0)result={content:[{type:'text',text:JSON.stringify(await status(r))}]};
      else{send({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}});continue;}
      send({jsonrpc:'2.0',id:request.id,result});
    }catch(error){send({jsonrpc:'2.0',id:request.id,result:{isError:true,content:[{type:'text',text:safeCode(error)}]}});}
  }
  stopped=true;if(timer)clearTimeout(timer);await active;
} else {
  try {
    let result;
    if(command==='setup') {
      const serverOrigin=process.argv[3],websiteOrigin=process.argv[4];
      if(!serverOrigin||!websiteOrigin)throw new Error('SETUP_NEEDS_SERVER_AND_WEBSITE_ORIGINS');
      for(const value of [serverOrigin,websiteOrigin]){const u=new URL(value);if(u.origin!==value || (u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw new Error('AGENT_ORIGIN_INVALID');}
      const bootstrapIntervalMs=Number(process.argv[5] ?? 60000);if(!Number.isSafeInteger(bootstrapIntervalMs)||bootstrapIntervalMs<=0||bootstrapIntervalMs>2147483647)throw new Error('AGENT_SETTINGS_INVALID');
      const requestTimeoutMs=Number(process.argv[6] ?? 10000);if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<10||requestTimeoutMs>60000)throw new Error('AGENT_SETTINGS_INVALID');
      await r.configure({serverOrigin,websiteOrigin,bootstrapIntervalMs,requestTimeoutMs});result={configured:true,consent:'unchanged',notice:'上传仅含时间、已收录插件、功能、成败与渠道；不会读取聊天历史。请由用户自己执行 consent --agree 开启。'};
    } else if(command==='consent' && process.argv[3]==='--agree') {
      result=await grantConsent(r);
    } else if(command==='withdraw') {
      const deleted=await beginWithdrawal(r);result={consent:'withheld',localDeleted:true,remoteDeletion:deleted.state,...deleted};
    } else if(command==='bind-link') {
      await r.call({operation:'register'});result=await r.call({operation:'bindLink'});
    } else if(command==='resend') {
      const id=process.argv[3];if(!/^[a-f0-9]{64}$/.test(id ?? ''))throw new Error('AGENT_FACT_INVALID');
      const row=(await r.store.rows()).find(row=>row.factId===id);
      if(!row||row.delivery?.state!=='unconfirmed')throw new Error('AGENT_RESEND_UNAVAILABLE');
      await r.store.mark(id,null);result={pending:id,notice:'原签名字节保持不变；下次发送重新签请求头。'};
    } else if(command==='status')result=await status(r);
    else throw new Error('AGENT_COMMAND_INVALID');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch(error){process.stderr.write(`${safeCode(error)}\n`);process.exitCode=1;}
}
