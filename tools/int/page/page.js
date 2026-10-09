// Same-origin calls only; every value is written with textContent.
const $ = id => document.getElementById(id);
const signatureLabels = {success: '成功 · Ed25519 校验通过', failure: '失败 · 签名无效', unknown: '未知 · 未验证'};
const uploadLabels = {sent: '成功 · 服务端已确认', duplicate: '成功 · 服务端确认重复', rejected: '失败 · 服务端拒绝', pending: '未知 · 等待服务端确认'};
const withdrawalLabels = {sent: '服务端删除已确认', pending: '服务端删除未确认（会自动重试；当前结果未知）', offline: '没有服务端地址，只清了本机；服务端结果未知'};

function cell(row, text, cls) { const td = row.insertCell(); td.textContent = text; if (cls) td.className = cls; }
function show(target, text, cls) { const el = $(target); el.textContent = text; el.className = cls ?? ''; }

async function call(method, path, body) {
  const init = {method, headers: {}, cache: 'no-store'};
  if (method === 'POST') { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body ?? {}); }
  let response;
  try { response = await fetch(path, init); } catch { throw new Error('本页后台不可达'); }
  const value = await response.json().catch(() => null);
  $('last').textContent = `${method} ${path} → HTTP ${response.status}\n${JSON.stringify(value, null, 2)}`;
  if (!response.ok || value === null || value.error) throw new Error(value?.error ?? `HTTP ${response.status}`);
  return value;
}

function renderState(s) {
  $('versions').textContent = `hanamesh-usage ${s.versions.usage} · 普通插件 ${s.versions.ordinary} · 服务端 ${s.versions.hostOrigin}（${s.versions.host} · ${s.versions.serverUsage}，正常安装）`;
  $('consent').textContent = s.consent === 'granted' ? '已开启（测试 Core）' : '未开启 / 已撤回（测试 Core）';
  const w = s.withdrawal;
  if (w === null) show('withdrawal', '');
  else show('withdrawal', `撤回：${withdrawalLabels[w.state]}；服务端删除条数 ${w.deletedEvents ?? '未知'}；尝试 ${w.attempts} 次${w.lastError ? `；错误 ${w.lastError}` : ''}`, w.state === 'sent' ? 'ok' : 'unknown');
  const p = s.panel;
  $('local-summary').textContent = `本设备 ${p.subject.deviceId ?? '未知'}（测试主体 ${p.subject.principalId ?? '未知'}）：本机 ${p.total} 条；已确认 ${p.outbox.sent}，重复 ${p.outbox.duplicate}，等待 ${p.outbox.pending}，拒绝 ${p.outbox.rejected}；上报状态 ${p.outbox.state}${p.outbox.lastError ? `，最近错误 ${p.outbox.lastError}` : ''}。`;
  const body = $('local-rows'); body.replaceChildren();
  if (p.events.length === 0) { const row = body.insertRow(); cell(row, '本机没有记录。未同意时不会采集。'); row.cells[0].colSpan = 6; }
  for (const e of p.events) {
    const row = body.insertRow();
    cell(row, e.eventId); cell(row, e.hanaRef); cell(row, e.action); cell(row, e.occurredAt);
    cell(row, signatureLabels[e.signature.state], e.signature.state === 'success' ? 'ok' : e.signature.state === 'failure' ? 'bad' : 'unknown');
    cell(row, `${uploadLabels[e.upload.state]} · 尝试 ${e.upload.attempts}`, e.upload.state === 'pending' ? 'unknown' : e.upload.state === 'rejected' ? 'bad' : 'ok');
  }
  $('other-subject').textContent = `另一测试主体设备 ${s.other.deviceId}（主体 ${s.other.principalId}）`;
}

function renderRemote(r) {
  const body = $('remote-rows'); body.replaceChildren();
  if (r.state !== 'available') {
    show('remote-summary', `服务端记录：未知（${r.code}${r.httpStatus ? ` · HTTP ${r.httpStatus}` : ''}）。读不到不等于 0。`, 'unknown');
    return;
  }
  show('remote-summary', `服务端记录：本设备 ${r.total} 条（${r.checkedAt} 读取）。`, 'ok');
  for (const e of r.events) { const row = body.insertRow(); cell(row, e.eventId); cell(row, e.hanaRef); cell(row, e.action); cell(row, e.occurredAt); cell(row, e.receivedAt); }
}

function renderOther(o) {
  if (o.state !== 'available') show('other-summary', `另一测试主体：未知（${o.code ?? ''}${o.httpStatus ? ` HTTP ${o.httpStatus}` : ''}）`, 'unknown');
  else show('other-summary', `另一测试主体：服务端 ${o.total} 条。`, 'ok');
}

async function refresh() { renderState(await call('GET', '/api/state')); }

function bind(id, run) {
  $(id).addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll('button')];
    for (const b of buttons) b.disabled = true;
    try { await run(); } catch (error) { $('last').textContent = `失败：${error.message}`; }
    finally { try { await refresh(); } catch (error) { $('last').textContent += `\n刷新失败：${error.message}`; } for (const b of buttons) b.disabled = false; }
  });
}

bind('grant', () => call('POST', '/api/consent', {state: 'granted'}));
bind('withhold', async () => { await call('POST', '/api/consent', {state: 'withheld'}); renderRemote(await call('GET', '/api/remote')); renderOther(await call('GET', '/api/other')); });
bind('action', async () => {
  const r = await call('POST', '/api/action');
  show('action-result', r.consent === 'granted'
    ? `命令 ${r.result === 'success' ? '执行成功' : `结果 ${r.result}`}；本机记录 ${r.localBefore} → ${r.localAfter} 条。`
    : `命令 ${r.result === 'success' ? '执行成功' : `结果 ${r.result}`}；未同意，本机记录 ${r.localBefore} → ${r.localAfter} 条（不采集）。`);
});
bind('replay', async () => {
  const r = await call('POST', '/api/replay');
  const server = r.server.body ? `服务端回执：新增 ${r.server.body.accepted}，重复 ${r.server.body.duplicates}，拒绝 ${r.server.body.rejected?.length ?? '未知'}` : `服务端未重放（${r.server.skipped ?? r.server.code ?? `HTTP ${r.server.httpStatus}`}）`;
  show('action-result', `重放同一成功事实：本机记录 ${r.localBefore} → ${r.localAfter} 条；${server}。`);
});
bind('remote', async () => renderRemote(await call('GET', '/api/remote')));
bind('other-seed', async () => { const r = await call('POST', '/api/other/seed'); renderOther(r.readback); });
bind('other-read', async () => renderOther(await call('GET', '/api/other')));

refresh().catch(error => { $('last').textContent = `读取失败：${error.message}`; });
