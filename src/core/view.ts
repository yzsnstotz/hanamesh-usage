import type { QueryResult } from './types.js';
import type { UsageEvent } from './events.js';
import { formatObservation } from './query.js';

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] ?? c));
}

/** Server-rendered, script-free local review view. */
export function renderUsage(query: QueryResult, eventQuery: {total:number;events:UsageEvent[]} = {total:0,events:[]}, health: Record<string,unknown> = {}): string {
  const e = escapeHtml;
  const metrics = Object.entries(query.aggregate).map(([name,value]) => `<tr><th scope="row">${e(name)}</th><td>${e(value.reported.sum === null ? '— 无 reported 值' : value.reported.sum)} (${value.reported.count})</td><td>${e(value.estimated.sum === null ? '— 无 estimated 值' : value.estimated.sum)} (${value.estimated.count})</td><td>${value.unavailable}</td></tr>`).join('');
  const rows = query.records.map(r => `<tr><td>${e(r.execution.sessionId)} / turn ${r.execution.turn}</td><td>${e(formatObservation(r.executor.id))}<br>${e(formatObservation(r.executor.version))}</td><td>${e(formatObservation(r.result))}<br>${e(r.terminalReason)}</td><td>${e(formatObservation(r.provider))}<br>${e(formatObservation(r.model))}</td><td>${e(formatObservation(r.usage.totalTokens))}</td><td>${e(r.provenance.sampleKind)}</td></tr>`).join('');
  const eventRows = eventQuery.events.map(event => `<tr><td>${e(event.eventId.slice(0,8))}</td><td>${e(event.hanaRef)}</td><td>${e(event.action)}</td><td>${e(event.occurredAt)}</td><td>${e(event.upload.state)}</td><td>${e(event.upload.code ?? '—')}</td></tr>`).join('');
  const outbox = health.outbox && typeof health.outbox === 'object' ? health.outbox as Record<string,unknown> : {};
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HanaMesh 使用记录</title><body><main><h1>本地使用记录</h1><p>匹配 ${query.total} 条，当前页 ${query.records.length} 条。以下摘要不取代原始 session。</p><form method="get"><label>执行者 <input name="executor"></label> <label>结果 <select name="result"><option value="">全部</option><option>completed</option><option>failed</option><option>interrupted</option><option>unavailable</option></select></label> <label>最早结束时间（Unix 毫秒）<input name="from" type="number" min="0"></label> <label>最晚结束时间（Unix 毫秒）<input name="to" type="number" min="0"></label> <label>来源 <select name="source"><option value="">全部</option><option>registry-session-log</option></select></label> <button>筛选</button></form><h2>用量 · 不混合来源</h2><table><caption>筛选后所有记录；不是当前页合计</caption><thead><tr><th>指标</th><th>reported（条数）</th><th>estimated（条数）</th><th>unavailable 条数</th></tr></thead><tbody>${metrics}</tbody></table><h2>Declaration 记录</h2><table><thead><tr><th>原始执行引用</th><th>执行者 / 版本</th><th>结果</th><th>Provider / Model</th><th>总量</th><th>样本类型</th></tr></thead><tbody>${rows}</tbody></table><h2>上报状态</h2><p>事件 ${eventQuery.total} 条；consent ${e(health.consent ?? 'unknown')}；pending ${e(outbox.pending ?? 0)}；sent ${e(outbox.sent ?? 0)}；duplicate ${e(outbox.duplicate ?? 0)}；rejected ${e(outbox.rejected ?? 0)}；最近上报 ${e(outbox.lastUploadAt ?? '—')}。</p><table><thead><tr><th>eventId</th><th>Hana</th><th>动作</th><th>时间</th><th>状态</th><th>代码</th></tr></thead><tbody>${eventRows}</tbody></table></main></body></html>`;
}
