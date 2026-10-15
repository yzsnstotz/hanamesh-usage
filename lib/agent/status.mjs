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
    hooksObserved:rows.length>0,counts:{local:rows.length,unlisted:classified.filter(r=>!r.listed).length,ambiguous:rows.filter(r=>r.disposition==='ambiguous').length,unverified:rows.filter(r=>r.disposition==='unverified').length,outerOnly:rows.filter(r=>r.disposition==='outer-only').length,sent:rows.filter(r=>['sent','duplicate'].includes(r.delivery?.state)).length,unconfirmed:rows.filter(r=>r.delivery?.state==='unconfirmed').length},
    records:classified.map(({factId,channel,pluginId,feature,success,observedSuccess,disposition,listed,delivery})=>({factId,channel,pluginId,feature,success,observedSuccess,disposition,listed,delivery})),sender,withdrawal,code,nextStep:withdrawal?.state==='unconfirmed'?'本机已清除，尚未取得匹配同意代次的提交撤回屏障，当前保持关闭。':withdrawal?.state==='pending'?'已停止采集，远端删除等待完成；下次会话继续，完成前不能重新开启。':code==='CONSENT_WITHHELD'?'计量关闭。请由用户在终端执行插件 setup 和 consent --agree。':code==='SERVER_ORIGIN_UNAVAILABLE'?'请由用户执行 setup，设置本机后端和网站地址。':code==='CATALOG_UNAVAILABLE'?'等待后端提供收录名单与 hm-agent-v1；不会上传未知插件。':sender?.bound===false?'请打开网站绑定页；在终端运行 bind-link 取得有签名的链接。':catalog?.settings.countUnconfirmedCalls?'未知调用计分已开启：开始后没有可见终结结果的调用也可能上传，成败保持未知；已上传不等于已计积分。':'收录且有可验证结果的记录按后台间隔上传；未知调用默认不计分，已上传不等于已计积分。'};
}
