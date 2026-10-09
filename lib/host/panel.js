// @ts-check
import { createPublicKey, verify } from 'node:crypto';
import { escapeHtml, signingJSON, validTargetRef } from '../core/index.js';

/** Read-only projection: one device, no signatures/nonces or raw source contents.
 * @param {import('./contracts.js').HealthSnapshot} health
 * @param {import('../core/index.js').UsageEvent[]} events
 * @param {import('hanamesh-core/contract').HanaMeshCoreContract|null} core
 * @param {import('./contracts.js').PanelTestSupply} testSupply
 * @returns {import('./contracts.js').PanelSnapshot}
 */
export function projectUsagePanel(health, events, core, testSupply) {
  let principalId=null, key=null;
  if(core!==null){
    try {const session=core.getSession();if(session.deviceId===health.deviceId&&validTargetRef(session.principalId))principalId=session.principalId;} catch {}
    try {
      const value=core.getPublicKey();
      if(/^[A-Za-z0-9_-]{43}$/.test(value)){
        const bytes=Buffer.from(value,'base64url');
        if(bytes.length===32&&bytes.toString('base64url')===value)key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),bytes]),format:'der',type:'spki'});
      }
    } catch {}
  }
  const scoped=health.deviceId===null?[]:events.filter(e=>e.deviceId===health.deviceId);
  return {
    subject:{deviceId:health.deviceId,principalId,reason:health.deviceId===null?'DEVICE_UNAVAILABLE':principalId===null?'PRINCIPAL_UNAVAILABLE':null},
    testSupply:{...testSupply},consent:health.consent,core:health.core,total:scoped.length,
    outbox:{...health.outbox,pending:scoped.filter(e=>e.upload.state==='pending').length,sent:scoped.filter(e=>e.upload.state==='sent').length,duplicate:scoped.filter(e=>e.upload.state==='duplicate').length,rejected:scoped.filter(e=>e.upload.state==='rejected').length},failures:{...health.failures},
    events:scoped.map(event=>{
      /** @type {import('./contracts.js').PanelEvent['signature']} */
      let signature={state:'unknown',code:event.signature===null?'SIGNATURE_MISSING':'SIGNER_KEY_UNAVAILABLE'};
      if(event.signature!==null&&key!==null){
        try {
          const bytes=Buffer.from(event.signature,'base64url');
          const valid=bytes.length===64&&bytes.toString('base64url')===event.signature&&verify(null,Buffer.from(signingJSON(event)),key,bytes);
          signature={state:valid?'success':'failure',code:valid?null:'SIGNATURE_INVALID'};
        } catch {signature={state:'failure',code:'SIGNATURE_INVALID'};}
      }
      return {eventId:event.eventId,deviceId:event.deviceId,hanaRef:event.hanaRef,action:event.action,occurredAt:event.occurredAt,source:event.source,sourcePlugin:event.sourcePlugin,evidenceRef:event.evidenceRef,signature,upload:{...event.upload}};
    }),
  };
}

/** @param {import('./contracts.js').PanelSnapshot} panel */
export function renderUsagePanel(panel) {
  const e=escapeHtml;
  const signatureLabels={success:'成功 · Ed25519 校验通过',failure:'失败 · 签名无效',unknown:'未知 · 未验证'};
  const deliveryLabels={sent:'成功 · 接收端已确认',duplicate:'成功 · 接收端确认重复',rejected:'失败 · 接收端拒绝',pending:'未知 · 等待接收端确认'};
  const badges=[panel.testSupply.identity?'测试身份 / 合成签名供给':'身份真实性：未知（未提供本次产品门证据）',panel.testSupply.receiver?'测试接收端 / 非生产上报':'接收端真实性：未知（未提供本次产品门证据）'];
  const rows=panel.events.map(event=>`<tr><td>${e(event.eventId)}</td><td>${e(event.hanaRef)}</td><td>${e(event.action)}</td><td>${e(event.occurredAt)}</td><td>${e(event.source)}<br>${e(event.sourcePlugin??'未知')}<br>${e(event.evidenceRef??'未知')}</td><td>${e(signatureLabels[event.signature.state])}<br>${e(event.signature.code??'')}</td><td>${e(deliveryLabels[event.upload.state])}<br>${e(event.upload.code??'')}<br>尝试 ${e(event.upload.attempts)} · ${e(event.upload.sentAt??'尚无确认时间')}</td></tr>`).join('');
  const faults=Object.entries(panel.failures).map(([code,count])=>`${e(code)} × ${e(count)}`).join('；');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Usage 开发小面板</title><style>body{font:14px system-ui;margin:16px;color:#17231c;background:#f7faf8}h1{font-size:22px}.supply{padding:12px;border:2px solid #bc790c;background:#fff5dc}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;vertical-align:top;border:1px solid #d2ddd5;padding:8px;overflow-wrap:anywhere}th{background:#e8f0eb}section{margin:16px 0}</style></head><body><main><h1>Usage 开发小面板</h1><p class="supply"><strong>${badges.map(e).join('<br>')}</strong></p><section><h2>当前设备与采集</h2><p>设备 ${e(panel.subject.deviceId??'未知')}；主体 ${e(panel.subject.principalId??'未知')}；${e(panel.subject.reason??'')}。</p><p>同意 ${e(panel.consent)}；Core ${e(panel.core)}；本设备事件 ${panel.total} 条。</p><p>只读刷新不会采集事件。open 来自公开页面呈现事实；use 来自成功命令；目录和任意按钮不会冒充 use。</p></section><section><h2>签名与上报分别判断</h2><p>签名成功只说明当前设备公钥下的密码学校验；接收端成功只说明已收到确认，不证明生产身份或数据库。pending/未知不是成功。</p><p>上报 ${e(panel.outbox.state)}；pending ${e(panel.outbox.pending)}；sent ${e(panel.outbox.sent)}；duplicate ${e(panel.outbox.duplicate)}；rejected ${e(panel.outbox.rejected)}。</p><p role="status">最近错误 ${e(panel.outbox.lastError??'无')}；最近上报 ${e(panel.outbox.lastUploadAt??'未知')}；采集/签名诊断 ${faults||'无已记录失败'}。</p></section><table><caption>本机当前设备的最小事件与 owning 来源</caption><thead><tr><th>事件 ID</th><th>插件</th><th>动作</th><th>ISO 时间</th><th>来源 / 插件 / 事实引用</th><th>签名</th><th>上报</th></tr></thead><tbody>${rows||'<tr><td colspan="7">当前设备没有事件；未同意或设备未知时不会新采集。</td></tr>'}</tbody></table></main></body></html>`;
}
