import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, randomBytes, randomUUID, sign} from 'node:crypto';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as usageCore from '../../../lib/core/index.js';
import {createUsageReporter} from '../../../lib/host/upload.js';
import {mountUsage} from '../../../lib/host/mount.js';

// Component gate: real Fastify/identity/usage HTTP and PostgreSQL, protocol-compatible
// test signer in place of the desktop Core. Product Core/UI is P04.compose's gate.
const serverRoot='/Users/yzliu/work/projects/hanamesh/hanamesh-server-usage';
const requireServer=createRequire(join(serverRoot,'package.json'));
const pg=requireServer('pg');
const Fastify=requireServer('fastify');
const imported=relative=>import(pathToFileURL(join(serverRoot,relative)).href);
const {createIdentityModule}=await imported('node_modules/@hanamesh/server-identity/dist/index.js');
const {getIdentityMigrations}=await imported('node_modules/@hanamesh/server-identity/dist/migrations.js');
const {createUsageModule}=await imported('dist/index.js');
const {getUsageMigrations}=await imported('dist/migrations.js');

const runRoot=process.env.USAGE_RUN_ROOT,dbName=process.env.USAGE_DB_NAME,httpPort=Number(process.env.USAGE_HTTP_PORT),pgPort=Number(process.env.USAGE_PG_PORT);
assert.ok(runRoot?.startsWith('/tmp/hm-p04-usage.'));
assert.match(dbName??'',/^hm_usage_accept_p04(?:_v[0-9]+)?$/);
assert.ok(Number.isInteger(httpPort)&&httpPort>1024&&httpPort!==3080);
assert.ok(Number.isInteger(pgPort)&&pgPort>1024);
const readEnv=async file=>Object.fromEntries((await readFile(join(runRoot,file),'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const adminEnv=await readEnv('postgres.env'),runtimeEnv=await readEnv('runtime.env');
const conn=(user,password)=>`postgresql://${user}:${password}@127.0.0.1:${pgPort}/${dbName}`;
const admin=new pg.Pool({connectionString:conn(adminEnv.POSTGRES_USER,adminEnv.POSTGRES_PASSWORD),max:3});
const runtime=new pg.Pool({connectionString:conn('hm_usage_runtime',runtimeEnv.HM_RUNTIME_PASSWORD),max:6});
const origin=`http://127.0.0.1:${httpPort}`,deploymentId=`p04-usage-${dbName}`;
const result={gate:'P04-USAGE-01',evidence:['REAL_HOST','REAL_DB','STANDIN_CORE_SIGNER','STANDIN_DSH_CONTEXT'],dbName,checks:[]};
const record=(id,detail)=>result.checks.push({id,status:'PASS',...detail});
let app,identity,usage;
const empty=()=>({schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}});
class FileGlobal{
  constructor(file,snapshot){this.file=file;this.snapshot=structuredClone(snapshot);}
  get(){return structuredClone(this.snapshot);}
  async set(next){const tmp=`${this.file}.tmp`;await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,this.file);this.snapshot=structuredClone(next);}
  static async open(file){let snapshot;try{snapshot=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;snapshot=empty();}return new FileGlobal(file,snapshot);}
}
const key=generateKeyPairSync('ed25519');
const signText=text=>sign(null,Buffer.from(text),key.privateKey).toString('base64url');
const publicKey=key.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');
const usageNonce=()=>{let value;do{value=randomBytes(16).toString('base64url');}while(!/^[A-Za-z0-9]/.test(value));return value;};
let deviceId,consent='granted',networkUp=true,postCount=0,deleteCount=0,serverPostCount=0,serverDeleteCount=0;
const request=async(method,path,body)=>{const response=await fetch(origin+path,{method,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,json:await response.json()};};
const signer={
  getDeviceId:()=>deviceId,getConsent:()=>consent,getServerOrigin:()=>origin,
  onConsentChange:()=>()=>{},getSession:()=>({}),
  sign:bytes=>new Uint8Array(sign(null,Buffer.from(bytes),key.privateKey)),
  async signRequest({method,path,body}){
    const timestamp=String(Date.now()),nonce=randomBytes(16).toString('base64url');
    const hash=createHash('sha256').update(body??new Uint8Array()).digest('hex');
    return {'x-hm-device-id':deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':signText(`${method}|${path}|${timestamp}|${nonce}|${hash}`)};
  },
};
const linked={get:()=>signer};
const fetchImpl=async(url,options)=>{if(options.method==='POST')postCount++;if(options.method==='DELETE')deleteCount++;if(!networkUp)throw new Error('isolated transport unavailable');return fetch(url,options);};
const reporter=store=>createUsageReporter({store,link:linked,uploadIntervalMs:60000,uploadBatchSize:200,fetchImpl});
const count=async sql=>(await admin.query(sql,[deploymentId,deviceId])).rows[0].n;
try{
  assert.equal((await admin.query('SHOW server_version_num')).rows[0].server_version_num,'170006');
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('identity','identity_auth','usage') AND c.relkind IN ('r','p')")).rows[0].n,0);
  for(const migration of [...await getIdentityMigrations(),...await getUsageMigrations()]){
    const client=await admin.connect();try{await client.query('BEGIN');await client.query(migration.sql);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const role='hm_usage_runtime';
  await admin.query(`GRANT USAGE ON SCHEMA identity_auth,identity,usage TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity_auth TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA identity TO ${role}`);
  await admin.query(`GRANT UPDATE ON identity.principal,identity.device,identity.device_challenge,identity.email_verification,identity.principal_email TO ${role}`);
  await admin.query(`GRANT SELECT ON usage.schema_version TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT ON usage.execution_summaries TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,DELETE ON usage.events TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON usage.daily_rollups TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT ON usage.consent_withdrawals TO ${role}`);
  await assert.rejects(()=>runtime.query('CREATE TABLE public.p04_must_fail(id integer)'),error=>error.code==='42501');
  record('DB_INIT',{postgresVersion:'17.6',runtimeDdlDenied:true});
  const identityEnv={NODE_ENV:'test',DATABASE_URL:conn('hm_usage_runtime',runtimeEnv.HM_RUNTIME_PASSWORD),BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),IDENTITY_BASE_URL:origin,IDENTITY_DEPLOYMENT_ID:deploymentId,IDENTITY_ISSUER:'urn:hanamesh:p04:usage',IDENTITY_ALLOW_REGISTRATION:'true',IDENTITY_MAGIC_LINK_ENABLED:'false'};
  identity=await createIdentityModule({env:identityEnv,pool:runtime,sendMagicLink:async()=>{}});
  usage=await createUsageModule({identity:identity.services,pool:runtime,deploymentId,allowedOrigins:[origin],policy:()=>true,retentionDays:90});
  app=Fastify({logger:false});app.addHook('onRequest',async request=>{if(request.url==='/v1/usage/events'&&request.method==='POST')serverPostCount++;if(request.url.endsWith('/events')&&request.method==='DELETE')serverDeleteCount++;});await app.register(identity.plugin);await app.register(usage.plugin);await app.listen({host:'127.0.0.1',port:httpPort});
  const challenge=await request('POST','/v1/identity/devices/challenge',{purpose:'register'});assert.equal(challenge.status,200);
  const created=await request('POST','/v1/identity/devices',{publicKey,nonce:challenge.json.nonce,signature:signText(challenge.json.nonce+publicKey)});assert.equal(created.status,201);deviceId=created.json.deviceId;
  const localFile=join(runRoot,`${dbName}-local.json`),global=await FileGlobal.open(localFile),store=new usageCore.EventStore(global);
  const unsigned={deviceId,hanaRef:'hanamesh-core',action:'open',occurredAt:new Date().toISOString(),eventId:randomUUID(),nonce:usageNonce()};
  const canonical=JSON.stringify(unsigned);
  const event=usageCore.createUsageEvent({...unsigned,signature:signText(canonical),source:'seat',sourcePlugin:'app-host',evidenceRef:`p04:${dbName}:seed`});
  assert.equal(await store.put(event),'inserted');
  const first=reporter(store);assert.equal(await first.runOnce(),'uploaded');first.stop();
  assert.equal(await count('SELECT count(*)::int n FROM usage.events WHERE deployment_id=$1 AND device_id=$2'),1);
  record('INITIAL_UPLOAD',{eventId:event.eventId,rawRows:1,localState:store.query().events[0].upload.state});
  const replayGlobal={snapshot:{...empty(),events:[event]},get(){return structuredClone(this.snapshot);},async set(next){this.snapshot=structuredClone(next);}};
  const replayStore=new usageCore.EventStore(replayGlobal),replay=reporter(replayStore);assert.equal(await replay.runOnce(),'uploaded');replay.stop();
  assert.equal(replayStore.query().events[0].upload.state,'duplicate');
  assert.equal(await count('SELECT count(*)::int n FROM usage.events WHERE deployment_id=$1 AND device_id=$2'),1);
  record('EVENT_ID_REPLAY',{eventId:event.eventId,rawRows:1,localState:'duplicate'});
  consent='withheld';networkUp=false;
  const withdrawing=reporter(store);assert.equal(await withdrawing.withdraw(new Date().toISOString()),'backoff');withdrawing.stop();
  assert.equal(store.query().total,0);assert.equal(store.getSnapshot().withdrawal.state,'pending');
  assert.equal(await count('SELECT count(*)::int n FROM usage.events WHERE deployment_id=$1 AND device_id=$2'),1);
  record('OFFLINE_WITHDRAW',{localRows:0,remoteRows:1,withdrawalState:'pending',deleteAttempts:deleteCount});
  // Fresh host mount exercises attachCore's automatic pending DELETE on boot.
  networkUp=true;
  const summary={snapshot:{schemaVersion:1,records:[]},get(){return structuredClone(this.snapshot);},async set(next){this.snapshot=structuredClone(next);}};
  const eventGlobal=await FileGlobal.open(localFile);
  const ctx={loader:{entries:()=>[].values()},on:()=>()=>{},provide:()=>{},inject:()=>()=>{},sessions:{get:()=>undefined,list:()=>[],flush:async()=>true},sessionPersistence:{list:async()=>[]}};
  const coreLink={status:()=> 'present',get:()=>signer,onChange:()=>()=>{},close:()=>{}};
  const mounted=mountUsage(ctx,null,{global:summary,close:async()=>{}},{global:eventGlobal,close:async()=>{}},{maxRecords:5000,maxPending:128,allowExport:false,maxEvents:5000,uploadIntervalMs:60000,uploadBatchSize:200,inventoryIntervalMs:300000},coreLink);
  await mounted.ready;await mounted.api.drain();
  assert.equal(mounted.api.health().withdrawal.state,'sent');
  assert.equal(await count('SELECT count(*)::int n FROM usage.events WHERE deployment_id=$1 AND device_id=$2'),0);
  assert.equal(await count('SELECT count(*)::int n FROM usage.consent_withdrawals WHERE deployment_id=$1 AND device_id=$2'),1);
  record('COLD_RETRY',{localRows:mounted.api.events().total,remoteRows:0,withdrawalRows:1,withdrawalState:'sent',offlineDeleteAttempts:deleteCount,serverDeleteCount});
  const before=serverPostCount;await mounted.api.drain();assert.equal(mounted.api.health().consent,'withheld');assert.equal(mounted.api.health().outbox.state,'stopped');
  assert.equal(serverPostCount,before);assert.equal(await count('SELECT count(*)::int n FROM usage.events WHERE deployment_id=$1 AND device_id=$2'),0);
  record('COLD_OFF_REOPEN',{consent:'withheld',serverPostDelta:0,remoteRows:0});
  await mounted.close();
  result.ok=true;
}catch(error){result.ok=false;result.failure={name:error.name,code:error.code??null,message:error.message,at:error.stack?.split('\n')[1]?.trim()};process.exitCode=1;
}finally{
  await app?.close().catch(()=>{});await usage?.close().catch(()=>{});await identity?.close().catch(()=>{});await runtime.end().catch(()=>{});await admin.end().catch(()=>{});
  await mkdir(join(runRoot,'evidence'),{recursive:true});await writeFile(join(runRoot,'evidence',`${dbName}-result.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}
