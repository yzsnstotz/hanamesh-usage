import {join} from 'node:path';
import {readJSON} from './store.mjs';
import {localRecordingEnabled} from './onboarding.mjs';
import {localPending} from './notice.mjs';
import {hookTrust} from './trust.mjs';

export async function status(r) {
  const core=await r.call({operation:'state'});
  const rows=(await r.store.rows()).filter(row=>Date.parse(row.occurredAt)>=Date.now()-30*86400000);
  const catalog=await readJSON(join(r.agentHome,'catalog.json'),null);
  const sender=await readJSON(join(r.agentHome,'sender.json'),null);
  const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);
  const onboarding=await readJSON(join(r.agentHome,'onboarding.json'),null),localEnabled=await localRecordingEnabled(r,core),pending=localPending(rows);
  const classified=rows.map(row=>({...row,listed:catalog?.plugins.some(p=>p.pluginId===row.pluginId&&p.channel===row.channel) ?? null}));
  const issue=r.senderError??sender?.code??null;
  const code=!localEnabled?'CONSENT_WITHHELD':core.consent.state!=='granted'?(issue??'WEBSITE_CONSENT_REQUIRED'):!r.config.serverOrigin?'SERVER_ORIGIN_UNAVAILABLE':issue??(!catalog?'CATALOG_UNAVAILABLE':rows.some(row=>row.delivery?.state==='unconfirmed')?'UPLOAD_UNCONFIRMED':null);
  const nextStep=withdrawal?.state==='unconfirmed'?'本机已清除，尚未取得匹配代次的提交撤回屏障，当前保持关闭。':withdrawal?.state==='pending'?'已停止采集，远端删除等待完成；下次启动继续，完成前不能重新开启。':!localEnabled?'本机记录已关闭；原生禁用只停止执行，不代表已清理或远端撤回完成。':core.consent.state!=='granted'?`仅本机记录，尚未网站同意上传。${issue?'准备/核实未就绪：'+issue+'。':''}${onboarding?.state==='bound-pending-audit'?'设备已绑定，正在等待网站同意审计提交；不会上传或继续催绑定。':onboarding?.url?'请用bindingLink去网站注册/登录并一次同意绑定。':'绑定链接未就绪，请等待后台准备并查看具名原因。'}`:code?`上传未就绪：${code}；本机记录与已计分分别确认。`:sender?.bound===false?'请通过bindingLink去网站完成绑定。':catalog?.settings.countUnconfirmedCalls?'后台允许未知调用上报，成败仍为null；已上传不等于已计积分。':'收录且有可验证结果的记录按后台间隔上传；已上传不等于已计积分。';
  const preparation=await r.runtimePreparation?.()??null;
  return {runtime:{code:'RUNTIME_READY',recordingDuringPreparation:false,preparingCallsBackfilled:false,preparationStartedAt:preparation?.startedAt??null,preparationFinishedAt:preparation?.finishedAt??null,message:'运行环境已就绪；准备期间的调用未记录，也不会补录。'},agentProtocolVersion:core.agentProtocolVersion??1,localCollection:{enabled:localEnabled,retentionDays:30},pendingLocal:pending,onboarding:localEnabled?onboarding:{state:'closed'},bindingLink:localEnabled&&core.consent.authorization!=='website'&&sender?.bound!==true?(onboarding?.url??null):null,consent:core.consent,deviceId:core.deviceId,configuration:r.config,settings:catalog?.settings ?? null,
    hookTrust:await hookTrust(r.host?.channel==='codex'?(r.env ?? {}):{}),
    hooksObserved:rows.length>0,counts:{local:rows.length,unlisted:classified.filter(r=>r.listed===false).length,listingUnknown:classified.filter(r=>r.listed===null).length,ambiguous:rows.filter(r=>r.disposition==='ambiguous').length,unverified:rows.filter(r=>r.disposition==='unverified').length,outerOnly:rows.filter(r=>r.disposition==='outer-only').length,sent:rows.filter(r=>['sent','duplicate'].includes(r.delivery?.state)).length,unconfirmed:rows.filter(r=>r.delivery?.state==='unconfirmed').length},
    records:classified.map(({factId,channel,pluginId,feature,success,observedSuccess,disposition,listed,delivery})=>({factId,channel,pluginId,feature,success,observedSuccess,disposition,listed,delivery})),sender,withdrawal,code,nextStep};
}
