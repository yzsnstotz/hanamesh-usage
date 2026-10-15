import {join} from 'node:path';
import {readJSON} from './store.mjs';
import {hookTrust} from './trust.mjs';

export async function status(r) {
  const core=await r.call({operation:'state'});
  const rows=await r.store.rows();
  const catalog=await readJSON(join(r.agentHome,'catalog.json'),null);
  const sender=await readJSON(join(r.agentHome,'sender.json'),null);
  const withdrawal=await readJSON(join(r.agentHome,'withdrawal.json'),null);
  const classified=rows.map(row=>({...row,listed:catalog?.plugins.some(p=>p.pluginId===row.pluginId&&p.channel===row.channel) ?? false}));
  const code=core.consent.state!=='granted'?'CONSENT_WITHHELD':!r.config.serverOrigin?'SERVER_ORIGIN_UNAVAILABLE':!catalog?'CATALOG_UNAVAILABLE':r.senderError ?? (rows.some(row=>row.delivery?.state==='unconfirmed')?'UPLOAD_UNCONFIRMED':sender?.code ?? null);
  return {consent:core.consent,deviceId:core.deviceId,configuration:r.config,settings:catalog?.settings ?? null,
    hookTrust:await hookTrust(r.host?.channel==='codex'?(r.env ?? {}):{}),
    hooksObserved:rows.length>0,counts:{local:rows.length,unlisted:classified.filter(r=>!r.listed).length,ambiguous:rows.filter(r=>r.disposition==='ambiguous').length,unverified:rows.filter(r=>r.disposition==='unverified').length,sent:rows.filter(r=>['sent','duplicate'].includes(r.delivery?.state)).length,unconfirmed:rows.filter(r=>r.delivery?.state==='unconfirmed').length},
    records:classified.map(({factId,channel,pluginId,feature,success,disposition,listed,delivery})=>({factId,channel,pluginId,feature,success,disposition,listed,delivery})),sender,withdrawal,code,nextStep:withdrawal?.state==='unconfirmed'?'本机已清除，远端仍有未知提交；DELETE只是当时快照，需后台提供提交/撤回屏障才能确认，当前保持关闭。':withdrawal?.state==='pending'?'已停止采集，远端删除等待完成；下次会话继续，完成前不能重新开启。':code==='CONSENT_WITHHELD'?'计量关闭。请由用户在终端执行插件 setup 和 consent --agree。':code==='SERVER_ORIGIN_UNAVAILABLE'?'请由用户执行 setup，设置本机后端和网站地址。':code==='CATALOG_UNAVAILABLE'?'等待后端提供收录名单与 hm-agent-v1；不会上传未知插件。':sender?.bound===false?'请打开网站绑定页；在终端运行 bind-link 取得有签名的链接。':'收录且明确归属的记录按后台间隔上传；已上传不等于已计积分。'};
}
