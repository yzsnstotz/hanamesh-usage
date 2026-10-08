// P04-USAGE-INT-01 first-stage trial entry (development only; never packaged).
// Real: DSH Host/loader/storage/commands, the Usage bundle installed by the public CLI, ServerUsage/Identity public
// HTTP on the card's own hanamesh-server rc.34 + PostgreSQL. Explicit fixtures, labelled on the page: the Core
// adapter (consent switch, device keys, request signing) and the second test subject that writes through the public
// route directly. The ordinary action is the real installed dsh-update-notifier /check-updates command dispatched by the
// Host gateway — not a Renderer/GUI click.
//   DSH_HOME=<run>/dsh-home node tools/int/dev-entry.mjs <desktop> <run>
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign} from 'node:crypto';
import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...args) => write(String(chunk).replace(/([?&]token=)[^\s&]+/g, '$1[REDACTED]'), ...args);
}
const [desktop, run] = process.argv.slice(2).map(p => resolve(p));
assert(run.endsWith('/hanamesh-runs/P04-USAGE-INT-01') && process.env.DSH_HOME === join(run, 'dsh-home'));
const HOST_ORIGIN = 'http://127.0.0.1:48670';
const UI_PORT = 48671;
const UI_ORIGINS = [`http://127.0.0.1:${UI_PORT}`, `http://localhost:${UI_PORT}`];
// Loopback names only: a DNS-rebinding page reaches the loopback socket with its own Host, so every request
// (page, static assets, API) must name this entry exactly. Origin is checked separately for writes.
const UI_HOSTS = [`127.0.0.1:${UI_PORT}`, `localhost:${UI_PORT}`, `[::1]:${UI_PORT}`];
const OTHER_HANA = '@hanamesh-dev/p04-int-other-subject';
const here = fileURLToPath(new URL('./', import.meta.url));
const {signingJSON, wireEvent} = await import(pathToFileURL(join(here, '../../lib/core/index.js')).href);
const log = (event, fields = {}) => console.log(JSON.stringify({at: new Date().toISOString(), event, ...fields}));

// ---- fixture Core adapter: device keys registered through Identity's public device routes ----
const stateFile = join(run, 'state/fixture-core.json');
await mkdir(join(run, 'state'), {recursive: true});
const rawKey = publicKey => publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('base64url');
async function postJSON(path, body, headers = {}) {
  const response = await fetch(new URL(path, HOST_ORIGIN), {method: 'POST', headers: {'content-type': 'application/json', origin: HOST_ORIGIN, ...headers}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json().catch(() => null)};
}
async function registerDevice() {
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const key = rawKey(publicKey);
  const challenge = await postJSON('/v1/identity/devices/challenge', {purpose: 'register'});
  if (challenge.status !== 200 && challenge.status !== 201) throw new Error(`IDENTITY_CHALLENGE_HTTP_${challenge.status}`);
  const signature = sign(null, Buffer.from(challenge.body.nonce + key), privateKey).toString('base64url');
  const registered = await postJSON('/v1/identity/devices', {publicKey: key, nonce: challenge.body.nonce, signature});
  if (registered.status !== 201 && registered.status !== 200) throw new Error(`IDENTITY_DEVICE_HTTP_${registered.status}`);
  return {privateKey: privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64url'), publicKey: key, deviceId: registered.body.deviceId, principalId: registered.body.principalId, registeredAt: new Date().toISOString()};
}
let state;
try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!state) {
  state = {consent: 'withheld', devices: {self: await registerDevice(), other: await registerDevice()}};
  log('fixture_devices_registered', {self: state.devices.self.deviceId, other: state.devices.other.deviceId});
}
const saveState = async () => { await writeFile(stateFile, JSON.stringify(state), {mode: 0o600}); await chmod(stateFile, 0o600); };
await saveState();
function signer(device) {
  const key = createPrivateKey({key: Buffer.from(device.privateKey, 'base64url'), format: 'der', type: 'pkcs8'});
  return {
    sign: bytes => new Uint8Array(sign(null, bytes, key)),
    // Identity device auth: METHOD|PATH|TIMESTAMP(ms)|NONCE|sha256(body), path without query.
    async signRequest({method, path, body}) {
      const timestamp = String(Date.now()), nonce = randomBytes(16).toString('base64url');
      const message = `${method.toUpperCase()}|${path}|${timestamp}|${nonce}|${createHash('sha256').update(body ?? Buffer.alloc(0)).digest('hex')}`;
      return {'x-hm-device-id': device.deviceId, 'x-hm-timestamp': timestamp, 'x-hm-nonce': nonce, 'x-hm-signature': sign(null, Buffer.from(message), key).toString('base64url')};
    },
  };
}
const self = signer(state.devices.self), other = signer(state.devices.other);
const listeners = new Set();
const core = {
  protocolVersion: '1',
  getDeviceId: () => state.devices.self.deviceId,
  getPublicKey: () => state.devices.self.publicKey,
  sign: self.sign,
  signRequest: self.signRequest,
  getConsent: () => state.consent,
  onConsentChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  getSession: () => ({protocolVersion: '1', deviceId: state.devices.self.deviceId, registration: 'registered', principalId: state.devices.self.principalId, bound: false, serverReachable: null, checkedAt: state.devices.self.registeredAt, reason: 'P04_INT_FIXTURE_CORE'}),
  getServerOrigin: () => HOST_ORIGIN,
  getHealth: () => ({revision: 1, mode: 'normal', components: []}),
};

// ---- real DSH host with the CLI-installed bundles ----
const {runProfile} = await import(pathToFileURL(join(desktop, 'apps/cli/lib/profile-boot.js')));
const {createLaunchEnvironmentSnapshot} = await import(pathToFileURL(join(desktop, 'packages/util/launch-environment/lib/index.js')));
const patch = join(run, 'state/dev-entry.patch.json');
await writeFile(patch, JSON.stringify([
  {id: 'update-notifier', config: {initialDelay: 3600000, interval: 3600000}},
  // identity: fixture Core keys; receiver: the card's own real ServerUsage, so not a fixture receiver.
  {id: 'hanamesh-usage', config: {uploadIntervalMs: 5000, panelTestSupply: {identity: true, receiver: false}}},
]));
const app = await runProfile({profile: 'web', patchFiles: [patch], args: ['--no-open', '--port', '0'], environment: createLaunchEnvironmentSnapshot([{source: 'process', values: process.env}])});
const ctx = app.ctx;
assert.notEqual(ctx.webServer.port, 3080);
let modelRequests = 0;
ctx.on('agent/request', () => { modelRequests++; throw Error('MODEL_REQUEST_FORBIDDEN'); });
ctx.provide('hanameshCore', core);
const usageEntry = [...ctx.loader.entries()].find(e => e.options.name === 'hanamesh-usage');
assert(usageEntry?.fiber, 'USAGE_NOT_INSTALLED');
const usagePackage = ctx.get('pluginPackages').packageOf('hanamesh-usage', usageEntry.parent.tree.ctx.baseUrl);
const api = ctx.get('hanameshUsage');
assert(api && typeof api.remote === 'function', 'USAGE_REMOTE_READBACK_MISSING');
await api.drain();
const ordinaryEntry = [...ctx.loader.entries()].find(e => e.options.name === 'dsh-update-notifier');
assert(ordinaryEntry?.fiber, 'ORDINARY_SAMPLE_NOT_INSTALLED');
const ordinaryPackage = ctx.get('pluginPackages').packageOf(ordinaryEntry.options.name, ordinaryEntry.parent.tree.ctx.baseUrl);
const session = await ctx.typertGateway.invoke({namespace: 'session', method: 'create', args: {request: {cwd: run, sessionId: `p04-usage-int-${Date.now()}`}}});
const facts = [];
ctx.on('commands/operation', fact => { if (fact?.phase === 'succeeded') facts.push(fact); });
log('dev_entry_host_ready', {usage: usagePackage.version, ordinary: `${ordinaryPackage.name}@${ordinaryPackage.version}`, dshPort: ctx.webServer.port, consent: state.consent});

// ---- operations behind the page ----
const settle = async () => {
  await api.drain();
  // Observability only: the reporter's own timer uploads every 5 s; report whatever state is reached.
  for (let waited = 0; waited < 12000 && api.health().consent === 'granted' && api.health().outbox.pending > 0; waited += 250) await new Promise(r => setTimeout(r, 250));
  await api.drain();
};
async function readOther() {
  const path = `/v1/usage/me/devices/${state.devices.other.deviceId}/events`;
  const to = new Date(Date.now() + 300000), from = new Date(to.getTime() - 90 * 86400000);
  const url = new URL(path, HOST_ORIGIN); url.searchParams.set('from', from.toISOString()); url.searchParams.set('to', to.toISOString()); url.searchParams.set('limit', '200');
  try {
    const response = await fetch(url, {headers: {...await other.signRequest({method: 'GET', path, body: null}), origin: HOST_ORIGIN}});
    if (!response.ok) return {state: 'unknown', total: null, httpStatus: response.status};
    const body = await response.json();
    if (body.nextAfter !== null) return {state: 'unknown', total: null, httpStatus: response.status, code: 'MORE_THAN_ONE_PAGE'};
    return {state: 'available', total: body.items.length, httpStatus: response.status};
  } catch { return {state: 'unknown', total: null, httpStatus: null, code: 'REMOTE_UNAVAILABLE'}; }
}
async function postSigned(signerFor, events) {
  const json = JSON.stringify(events);
  try {
    const response = await fetch(new URL('/v1/usage/events', HOST_ORIGIN), {method: 'POST', headers: {...await signerFor.signRequest({method: 'POST', path: '/v1/usage/events', body: new TextEncoder().encode(json)}), 'content-type': 'application/json', origin: HOST_ORIGIN}, body: json});
    return {httpStatus: response.status, body: await response.json().catch(() => null)};
  } catch { return {httpStatus: null, body: null, code: 'REMOTE_UNAVAILABLE'}; }
}
const operations = {
  async state() {
    return {
      supply: {core: 'FIXTURE_CORE_ADAPTER', otherSubject: 'FIXTURE_DIRECT_PUBLIC_ROUTE', ordinaryAction: 'REAL_HOST_COMMAND_DISPATCH_NOT_RENDERER', receiver: 'REAL_SERVER_USAGE_LOCAL_TEST_HOST'},
      versions: {usage: usagePackage.version, ordinary: `${ordinaryPackage.name}@${ordinaryPackage.version}`, hostOrigin: HOST_ORIGIN},
      consent: state.consent, self: {deviceId: state.devices.self.deviceId, principalId: state.devices.self.principalId},
      other: {deviceId: state.devices.other.deviceId, principalId: state.devices.other.principalId},
      panel: api.panel(), withdrawal: api.health().withdrawal, modelRequests,
    };
  },
  async consent({state: next}) {
    if (!['granted', 'withheld'].includes(next)) return {error: 'INVALID_CONSENT'};
    if (state.consent !== next) {
      state.consent = next; await saveState();
      const changedAt = new Date().toISOString();
      for (const fn of listeners) fn(next, changedAt);
    }
    await settle();
    return {consent: state.consent, withdrawal: api.health().withdrawal, local: api.panel().total};
  },
  async action() {
    const before = api.panel().total;
    const value = await ctx.typertGateway.invoke({namespace: 'commands', method: 'execute', args: {agentId: session.sessionId, line: '/check-updates', submittedAttachments: []}});
    await settle();
    return {commandId: value.commandId, result: value.result?.kind ?? null, localBefore: before, localAfter: api.panel().total, consent: state.consent};
  },
  async replay() {
    const fact = facts.at(-1);
    if (!fact) return {error: 'NO_SUCCEEDED_COMMAND_YET'};
    const before = api.panel().total;
    ctx.emit('commands/operation', fact);
    await api.drain();
    const local = api.events({limit: 1000}).events.find(e => e.evidenceRef === `command:${fact.commandId}:succeeded`);
    // Server idempotency: resend the identical already-signed event with a fresh request signature.
    const server = local && local.upload.state !== 'pending' ? await postSigned(self, [wireEvent(local)]) : {skipped: local ? 'LOCAL_EVENT_NOT_YET_SENT' : 'LOCAL_EVENT_ABSENT'};
    return {commandId: fact.commandId, localBefore: before, localAfter: api.panel().total, server};
  },
  remote: () => api.remote(),
  other: () => readOther(),
  async otherSeed() {
    const event = {deviceId: state.devices.other.deviceId, hanaRef: OTHER_HANA, action: 'use', occurredAt: new Date().toISOString(), eventId: randomUUID(), nonce: `n${randomBytes(16).toString('base64url')}`};
    const signed = {...event, signature: Buffer.from(other.sign(new TextEncoder().encode(signingJSON(event)))).toString('base64url')};
    return {post: await postSigned(other, [signed]), readback: await readOther()};
  },
};

// ---- page server (loopback, same-origin JSON only) ----
const page = {
  '/': ['text/html; charset=utf-8', await readFile(join(here, 'page/index.html'))],
  '/page.js': ['text/javascript; charset=utf-8', await readFile(join(here, 'page/page.js'))],
  '/page.css': ['text/css; charset=utf-8', await readFile(join(here, 'page/page.css'))],
};
const routes = {'GET /api/state': 'state', 'POST /api/consent': 'consent', 'POST /api/action': 'action', 'POST /api/replay': 'replay', 'GET /api/remote': 'remote', 'GET /api/other': 'other', 'POST /api/other/seed': 'otherSeed'};
let serial = Promise.resolve();
async function handle(req, res) {
  const headers = {'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer'};
  if (!UI_HOSTS.includes(String(req.headers.host).toLowerCase())) {
    res.writeHead(421, {...headers, 'content-type': 'application/json'}); res.end('{"error":"HOST_NOT_ALLOWED"}'); return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && page[url.pathname]) {
    res.writeHead(200, {...headers, 'content-type': page[url.pathname][0], 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
    res.end(page[url.pathname][1]); return;
  }
  const name = routes[`${req.method} ${url.pathname}`];
  if (!name) { res.writeHead(404, {...headers, 'content-type': 'application/json'}); res.end('{"error":"NOT_FOUND"}'); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  if (req.method === 'POST' && (!UI_ORIGINS.includes(req.headers.origin) || !String(req.headers['content-type']).startsWith('application/json') || Buffer.concat(chunks).length > 1024)) {
    res.writeHead(403, {...headers, 'content-type': 'application/json'}); res.end('{"error":"ORIGIN_OR_CONTENT_TYPE_REJECTED"}'); return;
  }
  let input = {};
  if (req.method === 'POST') { try { input = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { res.writeHead(400, {...headers, 'content-type': 'application/json'}); res.end('{"error":"INVALID_JSON"}'); return; } }
  // One operation at a time so every readback reflects a single completed step.
  const run = serial.then(() => operations[name](input));
  serial = run.catch(() => {});
  try {
    const body = await run;
    log('operation', {name, ok: !body?.error});
    res.writeHead(200, {...headers, 'content-type': 'application/json'}); res.end(JSON.stringify(body));
  } catch (error) {
    log('operation_failed', {name, code: error?.code ?? error?.name ?? 'ERROR'});
    res.writeHead(500, {...headers, 'content-type': 'application/json'}); res.end(JSON.stringify({error: 'OPERATION_FAILED', operation: name}));
  }
}
const servers = [];
for (const host of ['127.0.0.1', '::1']) {
  const server = createServer((req, res) => { void handle(req, res); });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(UI_PORT, host, ok); });
  servers.push(server);
}
log('dev_entry_listening', {urls: UI_ORIGINS});
const shutdown = async () => { for (const server of servers) server.close(); await app.shutdown.shutdown(0); };
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
