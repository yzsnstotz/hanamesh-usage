import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {generateKeyPairSync,createHash,sign as cryptoSign,verify} from 'node:crypto';
import {mkdtemp,writeFile,readFile,mkdir,rm,stat} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createUsageEvent,eventIdForSeat,signingJSON,wireEvent} from '../lib/core/index.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cli=join(root,'lib/host/offline-recovery.js');
const HOST_SHA='9b7e19fd828f924ea32f2b0784ba4807a2d79aab42cc39681b9d6247d2984452';
const FROM='1970-01-01T00:00:00.000Z',TO='1970-01-02T00:00:00.000Z';
async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function device(){
  for(let n=0;n<5000;n++){
    const pair=generateKeyPairSync('ed25519');
    const raw=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
    const id=createHash('sha256').update(raw).digest('base64url');
    if(id.startsWith('_')||id.startsWith('-'))return {pair,raw,id};
  }
  throw Error('could not make leading-symbol device');
}
function signedEvent(d){
  const event=createUsageEvent({deviceId:d.id,hanaRef:'@hanamesh/example',action:'use',occurredAt:new Date(Date.now()-60_000).toISOString(),eventId:eventIdForSeat(d.id,'app-host','historical'),nonce:Buffer.alloc(16,1).toString('base64url'),signature:null,source:'seat',sourcePlugin:'app-host',evidenceRef:'historical'});
  const {signature:_signature,...six}=wireEvent(event);
  return {...event,signature:cryptoSign(null,Buffer.from(signingJSON(six)),d.pair.privateKey).toString('base64url'),upload:{state:'rejected',code:'USAGE_INPUT_INVALID',attempts:1,sentAt:new Date().toISOString()}};
}
async function fixture({consent='granted',withdrawal=null,responseStatus=200,responseBody,race,redirectTo}={}){
  const d=device();const dir=await mkdtemp(join(realpathSync(tmpdir()),'hm-usage-offline-'));
  const profile=join(dir,'profile'),storages=join(profile,'storages');await mkdir(storages,{recursive:true,mode:0o700});
  const coreFile=join(storages,'hanamesh_core.json'),eventFile=join(storages,'hanamesh_usage_events.json'),receiptFile=join(dir,'receipt.json'),backupFile=join(dir,'backup.json');
  const coreGlobal={schemaVersion:1,revision:1,device:{deviceId:d.id,publicKey:d.raw.toString('base64url'),privateKeyPkcs8:d.pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64url'),createdAt:new Date().toISOString()},registration:{status:'registered',principalId:'00000000-0000-4000-8000-000000000001',registeredAt:new Date().toISOString(),lastError:null,attempts:1},consent:{state:consent,changedAt:new Date().toISOString()},serverObservation:{reachable:true,checkedAt:new Date().toISOString()},pointsBindPromptShownAt:null};
  const historical=signedEvent(d);const eventsGlobal={schemaVersion:1,events:[historical],withdrawal,inventory:{last:null}};
  const coreWrapper={unit:{name:'hanamesh_core',version:1},global:coreGlobal,tables:{}};
  const eventWrapper={unit:{name:'hanamesh_usage_events',version:1},global:eventsGlobal,tables:{}};
  await writeFile(coreFile,JSON.stringify(coreWrapper),{mode:0o600});await writeFile(eventFile,JSON.stringify(eventWrapper),{mode:0o600});
  const requests=[];const server=createServer(async(req,res)=>{
    requests.push({method:req.method,url:req.url,headers:req.headers});
    if(race)await race({coreFile,eventFile});
    if(redirectTo){res.writeHead(302,{location:redirectTo});res.end();return;}
    res.writeHead(responseStatus,{'content-type':'application/json'});
    res.end(JSON.stringify(responseBody??{items:[],nextAfter:null,window:{from:FROM,to:TO}}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await mkdir(join(profile,'profiles','tauri'),{recursive:true,mode:0o700});
  await writeFile(join(profile,'profiles','tauri','cordis.patch.yml'),`- id: hanamesh-core\n  config:\n    serverOrigin: ${origin}\n`,{mode:0o600});
  await writeFile(receiptFile,JSON.stringify({hostPackageSha256:HOST_SHA,migrationCount:38,lastMigration:'0037_custody_device_id_base64url',healthy:true,origin,checkedAt:new Date().toISOString(),stoppedPids:[2147483647],stoppedPorts:[await freePort()]}),{mode:0o600});
  const run=async(extra=[],program=cli)=>{
    const args=[program,'--profile-root',profile,'--origin',origin,'--receipt',receiptFile,'--backup',backupFile,...extra];
    const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,HOME:join(dir,'home'),DSH_HOME:profile}});
    let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',s=>stdout+=s);child.stderr.setEncoding('utf8').on('data',s=>stderr+=s);
    const exit=await new Promise(resolve=>child.on('close',resolve));return {exit,stdout,stderr};
  };
  return {d,dir,profile,coreFile,eventFile,receiptFile,backupFile,historical,requests,run,close:async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}};
}

test('P05 CLI RED: explicit stopped-profile recovery keeps original signed event and writes a 0600 backup',async()=>{
  const f=await fixture();try{
    const before=await readFile(f.eventFile);
    const result=await f.run();assert.equal(result.exit,0,result.stderr);
    const after=JSON.parse(await readFile(f.eventFile,'utf8'));
    assert.equal(after.global.events[0].upload.state,'pending');
    assert.deepEqual({...after.global.events[0],upload:f.historical.upload},f.historical);
    assert.deepEqual(await readFile(f.backupFile),before);
    assert.equal((await stat(f.eventFile)).mode&0o777,0o600);
    assert.equal((await stat(f.backupFile)).mode&0o777,0o600);
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].method,'GET');
    assert.match(f.requests[0].url,/^\/v1\/usage\/me\/devices\//);
    const h=f.requests[0].headers;assert.equal(h['x-hm-device-id'],f.d.id);
    const hash=createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    const canonical=`GET|${f.requests[0].url.split('?')[0]}|${h['x-hm-timestamp']}|${h['x-hm-nonce']}|${hash}`;
    assert(verify(null,Buffer.from(canonical),f.d.pair.publicKey,Buffer.from(h['x-hm-signature'],'base64url')));
    assert.doesNotMatch(result.stdout+result.stderr,new RegExp(f.historical.eventId));
    assert.doesNotMatch(result.stdout+result.stderr,new RegExp(f.d.id));
  }finally{await f.close();}
});

test('P05 CLI RED: absent operator receipt, withheld consent, GET 400 and asynchronous Core change are zero-write',async()=>{
  for(const mode of ['receipt','consent','missing-principal','missing-registration-time','get400','race']){
    const f=await fixture({consent:mode==='consent'?'withheld':'granted',responseStatus:mode==='get400'?400:200,race:mode==='race'?async({coreFile})=>{const x=JSON.parse(await readFile(coreFile,'utf8'));x.global.consent.state='withheld';await writeFile(coreFile,JSON.stringify(x),{mode:0o600});}:null});
    try{
      if(mode==='receipt')await rm(f.receiptFile);
      if(mode==='missing-principal'||mode==='missing-registration-time'){
        const core=JSON.parse(await readFile(f.coreFile,'utf8'));
        if(mode==='missing-principal')core.global.registration.principalId=null;
        else core.global.registration.registeredAt=null;
        await writeFile(f.coreFile,JSON.stringify(core),{mode:0o600});
      }
      const before=await readFile(f.eventFile);const result=await f.run();
      assert.notEqual(result.exit,0,mode);
      assert.deepEqual(await readFile(f.eventFile),before,mode);
      assert.doesNotMatch(result.stdout+result.stderr,new RegExp(f.historical.eventId));
    }finally{await f.close();}
  }
});

test('P05 CLI: invalid signature, other rejection, withdrawal, stale receipt and malformed GET never change the history file',async()=>{
  for(const mode of ['signature','code','withdrawal','stale-receipt','get-shape']){
    const f=await fixture({responseBody:mode==='get-shape'?{items:[],nextAfter:null,window:{from:TO,to:FROM}}:undefined});
    try{
      if(['signature','code','withdrawal'].includes(mode)){
        const x=JSON.parse(await readFile(f.eventFile,'utf8'));
        if(mode==='signature')x.global.events[0].signature=Buffer.alloc(64,9).toString('base64url');
        if(mode==='code')x.global.events[0].upload.code='USAGE_SIGNATURE_INVALID';
        if(mode==='withdrawal')x.global.withdrawal={requestedAt:new Date().toISOString(),deviceId:'device_A',state:'sent',attempts:1,deletedEvents:1,lastError:null};
        await writeFile(f.eventFile,JSON.stringify(x),{mode:0o600});
      }
      if(mode==='stale-receipt'){
        const receipt=JSON.parse(await readFile(f.receiptFile,'utf8'));receipt.checkedAt='2020-01-01T00:00:00.000Z';await writeFile(f.receiptFile,JSON.stringify(receipt),{mode:0o600});
      }
      const before=await readFile(f.eventFile),result=await f.run(),after=await readFile(f.eventFile);
      assert.deepEqual(after,before,mode);
      if(mode==='code'||mode==='signature')assert.match(result.stdout,/"recovered":0/);else assert.notEqual(result.exit,0,mode);
    }finally{await f.close();}
  }
});

test('P05 CLI: a redirect never sends device authentication headers to the next origin',async()=>{
  const received=[];const target=createServer((req,res)=>{received.push(req.headers);res.writeHead(200,{'content-type':'application/json'});res.end('{}');});
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
  const f=await fixture({redirectTo:`http://127.0.0.1:${target.address().port}/outside`});
  try{
    const before=await readFile(f.eventFile),result=await f.run();
    assert.notEqual(result.exit,0);assert.deepEqual(await readFile(f.eventFile),before);
    assert.equal(received.length,0);
  }finally{await f.close();await new Promise(resolve=>target.close(resolve));}
});

test('P05 CLI: a live declared DSH process is rejected even when it has no Core or Usage file open',async()=>{
  const f=await fixture();const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  try{
    const receipt=JSON.parse(await readFile(f.receiptFile,'utf8'));receipt.stoppedPids=[child.pid];await writeFile(f.receiptFile,JSON.stringify(receipt),{mode:0o600});
    const before=await readFile(f.eventFile),result=await f.run();assert.notEqual(result.exit,0);
    assert.match(result.stderr,/PROFILE_PROCESS_ACTIVE/);assert.deepEqual(await readFile(f.eventFile),before);
  }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));await f.close();}
});

test('P05 CLI: failure after rename reports durability uncertain and preserves the original backup',async()=>{
  const f=await fixture();
  try{
    const original=await readFile(f.eventFile),source=await readFile(cli,'utf8');
    assert(source.includes('await directory.sync();'));
    const altered=source.replace("from '../core/index.js'",`from '${pathToFileURL(join(root,'lib/core/index.js')).href}'`).replace('await directory.sync();',"throw Error('INJECTED_POST_RENAME');");
    const program=join(f.dir,'offline-recovery-post-rename.mjs');await writeFile(program,altered,{mode:0o600});
    const result=await f.run([],program);
    assert.notEqual(result.exit,0);assert.match(result.stderr,/COMMIT_DURABILITY_UNCERTAIN/);
    assert.deepEqual(await readFile(f.backupFile),original);
    assert.notDeepEqual(await readFile(f.eventFile),original);
    const after=JSON.parse(await readFile(f.eventFile,'utf8'));
    assert.equal(after.global.events[0].upload.state,'pending');
  }finally{await f.close();}
});
