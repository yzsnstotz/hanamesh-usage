import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readJSON,atomicJSON} from './store.mjs';
import {agentLock} from './sender-lock.mjs';
import {localRecordingEnabled,refreshOnboarding} from './onboarding.mjs';
export const consentScope='已开启本机使用记录：只记插件、功能、时间、成败与渠道，不保存对话、工具输入输出正文、文件或凭据。网站同意绑定前仅留本机，不上传使用记录；网站同意后补传窗口内历史，按规则计贡献积分并支持作者收入。可在宿主插件管理中随时禁用停止；禁用不等于已清除本机记录或完成远端撤回。';
export function writeNotice(message,stream=process.stdout){return new Promise((ok,bad)=>{const failed=()=>bad(Error('AGENT_NOTICE_OUTPUT_FAILED'));stream.once('error',failed);stream.write(JSON.stringify({systemMessage:message})+'\n',error=>{if(error)bad(Error('AGENT_NOTICE_OUTPUT_FAILED'));else{stream.off('error',failed);ok();}});});}
export function localPending(rows,now=Date.now()){
 const candidates=rows.filter(v=>!v.delivery&&['attributed','unverified'].includes(v.disposition)&&Date.parse(v.occurredAt)>=now-30*86400000&&Date.parse(v.occurredAt)<=now);
 const earliest=candidates.length?Math.min(...candidates.map(v=>Date.parse(v.occurredAt))):null;
 return {count:candidates.length,days:earliest===null?null:Math.max(0,Math.ceil((earliest+30*86400000-now)/86400000)),expiresAt:earliest===null?null:new Date(earliest+30*86400000).toISOString()};
}
const dayOf=now=>{const d=new Date(now);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
export async function firstConsentNotice(r,emit=writeNotice,{payload,now=Date.now()}={}){
 if(!['claude','codex'].includes(r.host.channel))throw Error('AGENT_CHANNEL_REQUIRED');
 if(!payload||typeof payload.session_id!=='string'||!payload.session_id||!['startup','clear','fork'].includes(payload.source)||payload.agent_type||payload.subagent_type||payload.parent_session_id)return false;
 const state=await r.call({operation:'state'});if(!await localRecordingEnabled(r,state))return false;
 if(state.consent.state==='granted'&&state.consent.authorization==='website')return false;
 const sender=await readJSON(join(r.agentHome,'sender.json'),null),onboarding=await readJSON(join(r.agentHome,'onboarding.json'),null);
 if(sender?.bound===true||onboarding?.state==='bound-pending-audit')return false;
 const dir=join(r.agentHome,'notices');await mkdir(dir,{recursive:true,mode:0o700});
 const release=await agentLock(dir,r.host.channel,r.config.requestTimeoutMs);if(!release)throw Error('AGENT_NOTICE_BUSY');
 try{
  const path=join(dir,`${r.host.channel}-daily.json`),marker=await readJSON(path,null),day=dayOf(now),session=createHash('sha256').update(payload.session_id).digest('hex');
  if(marker?.schemaVersion===2&&(marker.day===day||marker.session===session))return false;
  if(!await localRecordingEnabled(r))return false;
  let link,problem=null;try{link=await refreshOnboarding(r,{link:true});}catch(error){problem=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)?error.message:'AGENT_ONBOARDING_UNAVAILABLE';}
  if(['active','bound-pending-audit','closed'].includes(link?.state))return false;
  await r.store.prune(now);const pending=localPending(await r.store.rows(),now);
  const deadline=pending.days===null?'暂无可确定的最早补报期限。':`最早一条距30天补报期限还剩${pending.days}天（到期提示：${pending.expiresAt}）；${pending.days<=1?'紧急：请尽快绑定并上传。':pending.days<=7?'临近期限，请尽快绑定并上传。':''}`;
  const target=link?.url?`去HanaMesh注册/登录并点击「同意并绑定」：${link.url}`:`绑定链接尚未就绪（${problem??'AGENT_ONBOARDING_UNAVAILABLE'}），请在插件hm-setup查看状态；不会自动绑定或上传。`;
  await emit(`HanaMesh：${consentScope}\n本机待上传候选${pending.count}条（收录名单及可上传资格未确认时，不代表全部可计分）。${deadline}过期即不再计分，超30天记录将在下次插件执行时清除。\n${target}\n自动准备会下载固定运行时、发送设备公钥等绑定准备信息；使用记录不会随之发送。当天最多提醒一次。`);
  await atomicJSON(path,{schemaVersion:2,state:'emitted',channel:r.host.channel,day,session,emittedAt:new Date(now).toISOString()});return true;
 }finally{await release();}
}
