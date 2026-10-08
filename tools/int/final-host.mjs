// Final integration assembly: exact installed candidate Host36; isolated real PostgreSQL.
// FakeChain/semantic Stub remain labelled and do not stand in for Core/device identity.
// P04-USAGE-INT-01 assembly only (not product code): a fresh, card-owned hanamesh-server instance
// (rc.35 since HOST-USAGE12-SUPPLY-01; rc.34 before).
// Consumes the delivered Host package as installed under <run>/host/hanamesh-server (exact tgz + its lock),
// a fresh labelled tmpfs PostgreSQL, the package's own dist/migrate-cli.js and dist/start.js.
// Secrets live only in <run>/host/state/secrets.json and runtime.env.json (0600); never printed.
//   node tools/int/host.mjs <run> up | start | status
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, generateKeyPairSync} from 'node:crypto';
import {mkdir, readFile, writeFile, chmod, open} from 'node:fs/promises';
import path from 'node:path';

const [runArg, command] = process.argv.slice(2);
if (!runArg || !['up', 'start', 'status'].includes(command)) throw new Error('usage: host.mjs <run> up|start|status');
const RUN = path.resolve(runArg);
if (path.dirname(RUN) !== '/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01' || !path.basename(RUN).startsWith('real-')) throw new Error('RUN_NOT_THIS_CARD');
const PKG = path.join(RUN, 'host/hanamesh-server');
const STATE = path.join(RUN, 'host/state');
const CONTAINER = `hanamesh-p04-real-${path.basename(RUN).slice(5,13)}-pg`;
const LABEL = 'hanamesh.card=P04-USAGE-INT-01';
// pgvector/pgvector:pg17 already cached on this machine; never pulled.
const IMAGE = 'sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f';
const {hostPort: PORT} = JSON.parse(await readFile(path.join(RUN, 'state/INPUTS.json'), 'utf8'));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const INSTANCE = `p04-real-${path.basename(RUN).slice(5,13)}`;
const baseEnv = {PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR};

function docker(args, extra = {}) {
  const result = spawnSync('docker', args, {encoding: 'utf8', env: {...baseEnv, DOCKER_HOST: process.env.DOCKER_HOST, ...extra}});
  if (result.status !== 0) throw new Error(`docker ${args[0]} exit ${result.status}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
const psql = (sql, db = 'postgres') => docker(['exec', '-i', CONTAINER, 'psql', '-h', '127.0.0.1', '-v', 'ON_ERROR_STOP=1', '-qAt', '-U', 'postgres', '-d', db, '-c', sql]);
const literal = value => `'${value.replaceAll("'", "''")}'`;

async function up() {
  await mkdir(path.join(STATE, 'logs'), {recursive: true, mode: 0o700});
  const secrets = {super: randomBytes(24).toString('hex'), migrator: randomBytes(24).toString('hex'), runtime: randomBytes(24).toString('hex'),
    auth: randomBytes(32).toString('hex'), github: randomBytes(16).toString('hex'),
    custodyKey: generateKeyPairSync('ed25519').privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64url')};
  const secretsFile = path.join(STATE, 'secrets.json');
  await writeFile(secretsFile, JSON.stringify(secrets), {mode: 0o600}); await chmod(secretsFile, 0o600);
  docker(['run', '--detach', '--pull', 'never', '--name', CONTAINER, '--label', LABEL, '--env', 'POSTGRES_PASSWORD',
    '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432', IMAGE], {POSTGRES_PASSWORD: secrets.super});
  const pgPort = Number(/^127\.0\.0\.1:(\d+)$/mu.exec(docker(['port', CONTAINER, '5432/tcp']))?.[1]);
  // Readiness probe of a container this script just created; failure is reported, not retried around.
  let ready = false;
  for (let n = 0; n < 120 && !ready; n++) { try { psql('SELECT 1'); ready = true; } catch { await new Promise(r => setTimeout(r, 250)); } }
  if (!ready) throw new Error('PG_NOT_READY');
  for (const statement of [
    `CREATE ROLE hm_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(secrets.migrator)}`,
    `CREATE ROLE hm_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(secrets.runtime)}`,
    'CREATE ROLE hm_catalog_nonowner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
    'CREATE DATABASE hm_local OWNER hm_migrator', 'REVOKE ALL ON DATABASE hm_local FROM PUBLIC', 'GRANT CONNECT ON DATABASE hm_local TO hm_runtime'
  ]) psql(statement);
  psql('CREATE EXTENSION vector', 'hm_local');
  const url = (role, password) => `postgresql://${role}:${password}@127.0.0.1:${pgPort}/hm_local`;
  const migration = spawnSync(process.execPath, [path.join(PKG, 'dist/migrate-cli.js')], {cwd: PKG, encoding: 'utf8',
    env: {...baseEnv, MIGRATION_DATABASE_URL: url('hm_migrator', secrets.migrator), MIGRATION_DATABASE_NAME: 'hm_local'}});
  await writeFile(path.join(STATE, 'logs/migrate-cli.log'), `${migration.stdout}${migration.stderr}\nexit=${migration.status}\n`.split(secrets.migrator).join('[REDACTED]'));
  if (migration.status !== 0) throw new Error(`MIGRATE_EXIT_${migration.status}`);
  // Same public Host keys as the delivered Host34 supply; dev pages and every test-supply switch stay off here.
  const runtimeEnv = {DATABASE_URL: url('hm_runtime', secrets.runtime), INSTANCE_ID: INSTANCE, HOST: '127.0.0.1', PORT: String(PORT), NODE_ENV: 'development',
    BETTER_AUTH_SECRET: secrets.auth, IDENTITY_BASE_URL: ORIGIN, IDENTITY_DEPLOYMENT_ID: INSTANCE, IDENTITY_ISSUER: `urn:hanamesh:${INSTANCE}`,
    IDENTITY_TRUSTED_ORIGINS: JSON.stringify([ORIGIN, `http://localhost:${PORT}`]), IDENTITY_ALLOW_REGISTRATION: 'false', IDENTITY_GITHUB_CLIENT_ID: 'local-unused', IDENTITY_GITHUB_CLIENT_SECRET: secrets.github,
    IDENTITY_GITHUB_OAUTH_BASE: 'http://127.0.0.1:9', IDENTITY_GITHUB_API_BASE: 'http://127.0.0.1:9', IDENTITY_MAGIC_LINK_ENABLED: 'false',
    CUSTODY_SIGNER_PRIVATE_KEY: secrets.custodyKey, CUSTODY_SIGNER_KEY_ID: INSTANCE, CUSTODY_CHAIN_EXECUTOR: 'fake', SEMANTIC_EMBEDDING_PROVIDER: 'stub',
    CUSTODY_WITHDRAW_ENABLED: 'false', CUSTODY_OUTBOX_INTERVAL_MS: '3600000', CUSTODY_OUTBOX_MAX_ATTEMPTS: '5', CUSTODY_VOUCHER_TTL_MS: '60000', CLAIM_PENDING_TTL_MS: '3600000',
    SPLIT_CREATOR_BPS: '0', SPLIT_REFERRER_BPS: '0', POINTS_INSTALL: '5', POINTS_OPEN: '0', POINTS_USE: '2', POINTS_USE_DAILY_MAX: '10', CREATOR_MIRROR_BPS: '500', CLAIM_BONUS: '100', UNBOUND_CAP: '500',
    USAGE_RETENTION_INTERVAL_MS: '3600000', REGISTRY_INDEXER_PRINCIPAL_IDS: '00000000-0000-4000-8000-000000000001', INDEXER_INTERVAL_MS: '86400000', SEMANTIC_SYNC_INTERVAL_MS: '86400000',
    HOST_DEV_PAGES: 'false'};
  const envFile = path.join(STATE, 'runtime.env.json');
  await writeFile(envFile, JSON.stringify(runtimeEnv), {mode: 0o600}); await chmod(envFile, 0o600);
  console.log(JSON.stringify({event: 'p04_int_host_up', container: CONTAINER, pgPort, migrateExit: migration.status, origin: ORIGIN}));
}

async function start() {
  const env = {...baseEnv, ...JSON.parse(await readFile(path.join(STATE, 'runtime.env.json'), 'utf8'))};
  const log = await open(path.join(STATE, 'logs/host.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(PKG, 'dist/start.js')], {cwd: PKG, env, detached: true, stdio: ['ignore', log.fd, log.fd]});
  await writeFile(path.join(STATE, 'host.pid'), `${child.pid}\n`);
  child.unref();
  console.log(JSON.stringify({event: 'p04_int_host_started', pid: child.pid, origin: ORIGIN}));
}

async function status() {
  const pid = (await readFile(path.join(STATE, 'host.pid'), 'utf8').catch(() => '')).trim();
  const health = await fetch(`${ORIGIN}/health`).then(r => r.status, () => 'UNREACHABLE');
  console.log(JSON.stringify({pid: pid || null, container: docker(['ps', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Status}}']) || 'absent', health}));
}

if (command === 'up') await up();
else if (command === 'start') await start();
else await status();
