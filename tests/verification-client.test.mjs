import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// These are client-boundary fixtures, not REAL_HOST/REAL_UI evidence.
const bundle = new URL('../lib/client.js', import.meta.url);
const capabilityPath = 'api/hanamesh/usage/verification';
const callPath = `${capabilityPath}/call`;
const methods = ['record', 'health', 'observeCollection'];
const sample = {
  hanaRef: '@hanamesh/catalog-fixture', action: 'use',
  idempotencyKey: 'source:edited-operation:succeeded', sourcePlugin: '@hanamesh/collector-fixture',
  occurredAt: '2026-10-14T01:02:03.000Z', targetRef: 'actual-app-fixture',
  sourceHanaRef: '@hanamesh/source-fixture', receipt: { providerId: 'fixture', model: null, count: 7 },
};
const health = {
  pending: 0, recoveryComplete: true, failures: {}, consent: 'granted', core: 'present',
  deviceId: 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk',
  outbox: { state: 'offline', pending: 3, sent: 5, duplicate: 1, rejected: 0, lastUploadAt: null, nextAttemptAt: null, lastError: null },
  derive: { skipped: { consentWithheld: 0, executorUnavailable: 0, timeUnavailable: 0, noDevice: 0 } },
  withdrawal: { requestedAt: '2026-10-15T00:00:01.007Z', deviceId: 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk', state: 'pending', lastError: 'WITHDRAW_UNAVAILABLE', attempts: 2, deletedEvents: null },
  inventory: { available: false, source: 'none', lastScanAt: null, detail: null },
};
const plain = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function materialize(fetch, globalFetch) {
  assert(existsSync(bundle), 'normal public client bundle must already exist');
  let registration;
  const instances = new Map();
  let active;
  const effects = [];
  const react = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState(initial) {
      const owner = active, index = owner.index++;
      if (!(index in owner.hooks)) owner.hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.hooks[index], next => {
        owner.hooks[index] = typeof next === 'function' ? next(owner.hooks[index]) : next;
      }];
    },
    useRef(initial) {
      const owner = active, index = owner.index++;
      return owner.hooks[index] ??= { current: initial };
    },
    useEffect(fn, deps) {
      const owner = active, index = owner.index++, old = owner.hooks[index];
      if (old && deps && old.deps && deps.length === old.deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
      effects.push(() => { old?.cleanup?.(); owner.hooks[index] = { deps, cleanup: fn() }; });
    },
  };
  const carrier = fetch ? { fetch } : undefined;
  const globals = { fetch: globalFetch ?? (() => { throw Error('unexpected global fetch'); }) };
  runInNewContext(readFileSync(bundle, 'utf8'), {
    window: { __ModuleLoader__: { load(value) { registration = value; } }, __DSH_TRANSPORT__: carrier },
    globalThis: globals, AbortController, Response, Headers, URL, setTimeout, clearTimeout,
  });
  assert.equal(registration?.id, 'hanamesh-usage');
  const api = registration.factory(name => { assert.equal(name, 'react'); return react; });
  function expand(node, path) {
    if (node === null || node === undefined || typeof node === 'boolean') return null;
    if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}.${i}`));
    if (typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const owner = instances.get(path) ?? { hooks: [], index: 0 };
      instances.set(path, owner); owner.index = 0;
      const previous = active; active = owner;
      try { return expand(node.type({ ...node.props, children: node.children }), `${path}.body`); }
      finally { active = previous; }
    }
    return { ...node, children: node.children.map((child, i) => expand(child, `${path}.${i}`)) };
  }
  let root;
  const harness = {
    api, carrier, globals, tree: null,
    render(component = root) {
      root = component;
      assert.equal(typeof component, 'function', 'UsageVerificationPanel must be exported by normal public client bundle');
      harness.tree = expand(react.createElement(component, null), 'root');
      for (const effect of effects.splice(0)) effect();
      return harness.tree;
    },
    async settle() { for (let i = 0; i < 8; i++) { await tick(); harness.render(); } return harness.tree; },
    dispose() { for (const owner of instances.values()) for (const hook of owner.hooks) hook?.cleanup?.(); },
  };
  return harness;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...tree.children.flatMap(nodes)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return tree.children.map(text).join(' ');
}
function one(h, type) {
  const found = nodes(h.tree).filter(node => node.type === type);
  assert.equal(found.length, 1, `expected one native ${type}`);
  return found[0];
}
function button(h, pattern) {
  const found = nodes(h.tree).filter(node => node.type === 'button' && pattern.test(text(node)));
  assert.equal(found.length, 1, `expected one button matching ${pattern}`);
  return found[0];
}
function edit(h, value) {
  const target = { value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
  one(h, 'textarea').props.onChange({ target, currentTarget: target }); h.render();
}
function choose(h, call) {
  const target = { value: call };
  one(h, 'select').props.onChange({ target, currentTarget: target }); h.render();
}
function click(h, pattern) {
  const node = button(h, pattern); assert.notEqual(node.props.disabled, true);
  node.props.onClick(); h.render();
}
function enabledClient(reply = (call, input) => ({ call, input, result: { disposition: 'recorded', eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, health })) {
  const calls = [];
  function fetch(path, init) {
    assert.equal(this.fetch, fetch, 'authenticated carrier receiver must be retained');
    calls.push({ path, init });
    if (path === capabilityPath) return Promise.resolve(json({ enabled: true, calls: methods, deviceId: health.deviceId }));
    if (path === 'api/hanamesh/usage/panel/view') return Promise.resolve(new Response('<html>readonly fixture</html>', { headers: { 'content-type': 'text/html' } }));
    assert.equal(path, callPath);
    const { call, input } = JSON.parse(init.body);
    return Promise.resolve(json(reply(call, input)));
  }
  return { h: materialize(fetch), calls };
}
function requireBridge(h) {
  assert.equal(typeof h.api.fetchUsageVerification, 'function', 'test-build verification call bridge is absent from normal public client export');
  return h.api.fetchUsageVerification;
}
function bounded(error) {
  assert.match(error?.message ?? '', /^USAGE_VERIFICATION_[A-Z_]+$/);
  assert((error?.message?.length ?? Infinity) <= 96, 'diagnostic must be a bounded code');
  return true;
}

test('VCLIENT01 normal public client exports test-build editor and call bridge', () => {
  const h = materialize();
  assert.equal(typeof h.api.UsagePanel, 'function');
  assert.equal(typeof h.api.UsageVerificationPanel, 'function', 'native test-build Usage verification editor is missing');
  requireBridge(h);
});

test('VCLIENT02 call bridge uses exact JSON envelope, authenticated receiver and caller AbortSignal', async () => {
  const observed = [], reply = { call: 'record', input: sample, result: { disposition: 'recorded', eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, health };
  function fetch(path, init) { assert.equal(this.fetch, fetch); observed.push({ path, init }); return Promise.resolve(json(reply)); }
  const h = materialize(fetch), call = requireBridge(h), signal = new AbortController().signal;
  assert.deepEqual(plain(await call('record', sample, signal)), reply);
  assert.equal(observed.length, 1); assert.equal(observed[0].path, callPath);
  const init = observed[0].init;
  assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store'); assert.equal(init.signal, signal);
  assert.match(new Headers(init.headers).get('content-type'), /^application\/json/);
  assert.deepEqual(JSON.parse(init.body), { call: 'record', input: sample });
});

test('VCLIENT03 health and observeCollection transmit explicit null and preserve entire actual reply', async () => {
  const resultFor = call => call === 'health' ? health : { state: 'failed', code: 'COLLECTION_FAILED', through: 2, events: [], health };
  const { h, calls } = enabledClient((call, input) => ({ call, input, result: resultFor(call), health }));
  const bridge = requireBridge(h);
  for (const call of ['health', 'observeCollection']) {
    const returned = await bridge(call, null, new AbortController().signal);
    assert.deepEqual(plain(returned), { call, input: null, result: resultFor(call), health });
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), { call, input: null });
  }
});

test('VCLIENT04 browser global fetch fallback uses the same local endpoint without carrier', async () => {
  let h, observed;
  function fetch(path, init) { assert.equal(this, h.globals); observed = { path, init }; return Promise.resolve(json({ call: 'health', input: null, result: health, health })); }
  h = materialize(undefined, fetch);
  await requireBridge(h)('health', null, new AbortController().signal);
  assert.equal(observed.path, callPath); assert.deepEqual(JSON.parse(observed.init.body), { call: 'health', input: null });
});

for (const [name, response] of [
  ['HTTP error', () => new Response('raw credential fixture /private/path', { status: 500 })],
  ['wrong media type', () => new Response('<html>raw prompt fixture</html>', { headers: { 'content-type': 'text/html' } })],
  ['malformed JSON', () => new Response('{raw private fixture', { headers: { 'content-type': 'application/json' } })],
  ['missing response envelope', () => json({ arbitrary: 'raw fixture' })],
  ['raw transport rejection', () => { throw new Error('raw credential fixture /private/path'); }],
]) {
  test(`VCLIENT05 call bridge converts ${name} into bounded diagnostics`, async () => {
    const h = materialize(async () => response());
    await assert.rejects(requireBridge(h)('health', null, new AbortController().signal), bounded);
  });
}

for (const [name, response] of [
  ['disabled capability', () => json({ enabled: false })],
  ['missing enabled capability', () => json({ calls: methods })],
  ['production 404', () => new Response('not found', { status: 404 })],
]) {
  test(`VCLIENT06 ${name} never exposes editing or sends a POST`, async () => {
    const calls = [], h = materialize(async (path, init) => { calls.push({ path, init }); return response(); });
    h.render(h.api.UsageVerificationPanel); await h.settle();
    assert(calls.some(row => row.path === capabilityPath && row.init.method === 'GET'));
    assert(!nodes(h.tree).some(node => node.type === 'textarea' || node.type === 'select'));
    assert(!nodes(h.tree).some(node => node.type === 'button' && /执行|调用|execute|四字段|重放|replay/i.test(text(node))));
    assert(calls.every(row => row.init.method !== 'POST'));
    h.dispose();
  });
}

test('VCLIENT07 enabled native editor exposes only three methods and keeps edited record identity and facts', async () => {
  const { h, calls } = enabledClient();
  h.render(h.api.UsageVerificationPanel); await h.settle();
  const options = nodes(one(h, 'select')).filter(node => node.type === 'option').map(node => node.props.value);
  assert.deepEqual(options.sort(), [...methods].sort());
  const capability = calls.find(row => row.path === capabilityPath);
  assert.equal(capability.init.method, 'GET'); assert.equal(capability.init.credentials, 'same-origin'); assert.equal(capability.init.cache, 'no-store');
  assert(capability.init.signal instanceof AbortSignal);
  choose(h, 'record'); edit(h, sample); click(h, /执行|调用|execute/i); await h.settle();
  const posts = calls.filter(row => row.init.method === 'POST');
  assert.equal(posts.length, 1); assert.deepEqual(JSON.parse(posts[0].init.body), { call: 'record', input: sample });
  assert.deepEqual(JSON.parse(one(h, 'textarea').props.value), sample, 'execute must preserve the edited source facts');
  h.dispose();
});

test('VCLIENT08 four-field replay preserves exactly the four edited values without generating a time or new key', async () => {
  const { h, calls } = enabledClient();
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, sample);
  click(h, /四字段|重放|replay/i); await h.settle();
  const four = Object.fromEntries(['hanaRef', 'action', 'idempotencyKey', 'sourcePlugin'].map(key => [key, sample[key]]));
  assert.deepEqual(JSON.parse(one(h, 'textarea').props.value), four);
  // A replay control may prepare or execute; either route must send the same four-field request.
  if (!calls.some(row => row.init.method === 'POST')) { click(h, /执行|调用|execute/i); await h.settle(); }
  const posts = calls.filter(row => row.init.method === 'POST');
  assert.equal(posts.length, 1); assert.deepEqual(JSON.parse(posts[0].init.body), { call: 'record', input: four });
  h.dispose();
});

test('VCLIENT09 switching to either read method shows editable null and executes null rather than stale record data', async () => {
  const { h, calls } = enabledClient();
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, sample);
  for (const call of ['health', 'observeCollection']) {
    choose(h, call); assert.equal(JSON.parse(one(h, 'textarea').props.value), null);
    edit(h, ' \n null \n '); click(h, /执行|调用|execute/i); await h.settle();
    assert.deepEqual(JSON.parse(calls.filter(row => row.init.method === 'POST').at(-1).init.body), { call, input: null });
  }
  h.dispose();
});

test('VCLIENT10 invalid editable JSON cannot issue a call or expose raw editor content as error', async () => {
  const { h, calls } = enabledClient();
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, '{ private-credential-fixture');
  const execute = button(h, /执行|调用|execute/i);
  if (!execute.props.disabled) { execute.props.onClick(); h.render(); await h.settle(); }
  assert.equal(calls.filter(row => row.init.method === 'POST').length, 0);
  const alerts = nodes(h.tree).filter(node => node.props.role === 'alert').map(text).join(' ');
  assert(!alerts.includes('private-credential-fixture'));
  assert(!/\bPASS\b/.test(text(h.tree)));
  h.dispose();
});

test('VCLIENT11 editor displays entire returned call/input/result/health JSON including errors and current instance', async () => {
  const reply = { call: 'record', input: sample, result: { disposition: 'rejected', code: 'FACT_TIME_UNAVAILABLE' }, health };
  const { h } = enabledClient(() => reply);
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, sample); click(h, /执行|调用|execute/i); await h.settle();
  const output = nodes(h.tree).filter(node => ['pre', 'output'].includes(node.type));
  const decoded = output.map(node => { try { return JSON.parse(text(node)); } catch { return null; } });
  assert(decoded.some(value => JSON.stringify(value) === JSON.stringify(reply)), 'actual bridge envelope must be displayed completely, without reducing it to a fabricated verdict');
  assert(!/\bPASS\b/.test(text(h.tree))); h.dispose();
});

test('VCLIENT16 editor shows the actual observation boundary and all event delivery states without inferring completion', async () => {
  const observed = { state: 'processed', code: null, through: 7, events: [{ eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', delivery: 'unconfirmed', code: 'USAGE_STORAGE_UNAVAILABLE' }], health };
  const reply = { call: 'observeCollection', input: null, result: observed, health };
  const { h } = enabledClient(() => reply);
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'observeCollection'); click(h, /执行|调用|execute/i); await h.settle();
  const displayed = nodes(h.tree).filter(node => ['pre', 'output'].includes(node.type)).map(node => { try { return JSON.parse(text(node)); } catch { return null; } });
  assert(displayed.some(value => JSON.stringify(value) === JSON.stringify(reply)));
  assert(!/\bPASS\b/.test(text(h.tree))); h.dispose();
});

test('VCLIENT17 documented service error code survives the bridge while raw text stays hidden', async () => {
  const h = materialize(async () => json({ error: { code: 'USAGE_UNAVAILABLE' } }, 503));
  await assert.rejects(requireBridge(h)('health', null, new AbortController().signal), error => {
    assert.equal(error.code, 'USAGE_UNAVAILABLE'); assert.doesNotMatch(error.message, /raw|private|stack/); return true;
  });
});

test('VCLIENT12 Usage Settings keeps its script-free sandbox iframe and adds native verification controls separately', async () => {
  const { h } = enabledClient(); requireBridge(h);
  h.render(h.api.UsagePanel); await h.settle();
  const iframe = one(h, 'iframe'); assert.equal(iframe.props.sandbox, ''); assert.match(iframe.props.srcDoc, /readonly fixture/);
  one(h, 'textarea'); one(h, 'select');
  assert(!/textarea|verification\/call|<script/i.test(iframe.props.srcDoc), 'editor must belong to native React area, not iframe HTML');
  h.dispose();
});

test('VCLIENT13 editor stays hidden until capability resolves and aborts capability work on disposal', async () => {
  let resolveCapability, observed;
  const h = materialize((path, init) => { observed = { path, init }; return new Promise(resolve => { resolveCapability = resolve; }); });
  h.render(h.api.UsageVerificationPanel);
  assert.equal(observed.path, capabilityPath); assert.equal(observed.init.method, 'GET');
  assert(!nodes(h.tree).some(node => node.type === 'textarea' || node.type === 'select'));
  h.dispose(); assert.equal(observed.init.signal.aborted, true);
  resolveCapability(json({ enabled: true, calls: methods, deviceId: health.deviceId })); await tick();
  assert(!nodes(h.tree).some(node => node.type === 'textarea'));
});

test('VCLIENT14 active call disables execute and aborts its request on disposal', async () => {
  let observed, resolveCall;
  const h = materialize((path, init) => {
    if (path === capabilityPath) return Promise.resolve(json({ enabled: true, calls: methods, deviceId: health.deviceId }));
    observed = { path, init }; return new Promise(resolve => { resolveCall = resolve; });
  });
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, sample);
  click(h, /执行|调用|execute/i); await h.settle();
  const execute = nodes(h.tree).find(node => node.type === 'button' && node.props.disabled === true && /执行|调用|execute|处理中|调用中|执行中/i.test(text(node)));
  assert(execute, 'in-flight request must disable execute');
  assert.equal(observed.path, callPath); h.dispose(); assert.equal(observed.init.signal.aborted, true);
  resolveCall(json({ call: 'record', input: sample, result: { disposition: 'recorded', eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, health })); await tick();
});

test('VCLIENT15 native editor shows bounded transport error without a fabricated successful result', async () => {
  const h = materialize((path) => {
    if (path === capabilityPath) return Promise.resolve(json({ enabled: true, calls: methods, deviceId: health.deviceId }));
    return Promise.reject(new Error('raw secret fixture /private/path'));
  });
  h.render(h.api.UsageVerificationPanel); await h.settle(); choose(h, 'record'); edit(h, sample); click(h, /执行|调用|execute/i); await h.settle();
  const alerts = nodes(h.tree).filter(node => node.props.role === 'alert').map(text).join(' ');
  assert.match(alerts, /USAGE_VERIFICATION_[A-Z_]+/);
  assert(!/raw secret|\/private\/path|\bPASS\b|returned-event-fixture/.test(text(h.tree)));
  h.dispose();
});
