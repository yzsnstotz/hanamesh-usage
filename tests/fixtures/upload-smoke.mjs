import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,sign as edSign} from 'node:crypto';
import * as core from '../../lib/core/index.js';
import {signUsageEvent} from '../../lib/host/core-link.js';
import {createUsageReporter} from '../../lib/host/upload.js';

const origin=process.argv[2],recordPath=process.argv[3];if(!origin||!recordPath)throw Error('usage: upload-smoke ORIGIN REQUESTS_JSONL');
class Global{constructor(snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}}){this.snapshot=structuredClone(snapshot);}get(){return this.snapshot;}async set(next){this.snapshot=structuredClone(next);}}
const {privateKey}=generateKeyPairSync('ed25519');let consent='withheld';
const service={protocolVersion:'1',getDeviceId:()=> 'device_FIXTURE',getPublicKey:()=>'',sign:bytes=>edSign(null,bytes,privateKey),signRequest:async()=>({'x-hm-device-id':'device_FIXTURE','x-hm-timestamp':'1','x-hm-nonce':'request-nonce','x-hm-signature':'request-signature'}),getConsent:()=>consent,onConsentChange:()=>()=>{},getSession:()=>({}),getServerOrigin:()=>origin,getHealth:()=>({})};
const link={get:()=>service};
const countRequests=async()=>{try{return (await readFile(recordPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}};
const makeEvents=()=>[0,1,2].map(index=>signUsageEvent(service,core.createUsageEvent({deviceId:'device_FIXTURE',hanaRef:`pkg-${index}`,action:'use',occurredAt:'2026-09-19T00:00:00.000Z',eventId:core.eventIdForSeat('device_FIXTURE','app-host',`smoke-${index}`),nonce:Buffer.alloc(16,index).toString('base64url'),signature:null,source:'seat',sourcePlugin:'app-host',evidenceRef:`smoke-${index}`})));
let store=new core.EventStore(new Global());let reporter=createUsageReporter({store,link,uploadIntervalMs:60000,uploadBatchSize:200});await reporter.runOnce();let requests=await countRequests();process.stdout.write(`${JSON.stringify({step:'withheld',posts:requests.filter(row=>row.method==='POST').length,consent,outbox:{pending:reporter.health().pending}})}\n`);
consent='granted';for(const event of makeEvents())await store.put(event);await reporter.runOnce();requests=await countRequests();process.stdout.write(`${JSON.stringify({step:'granted-upload',posts:requests.filter(row=>row.method==='POST').length,accepted:reporter.health().sent,keysPerEvent:Object.keys(requests.find(row=>row.method==='POST').body.events[0]).length,outbox:{sent:reporter.health().sent,pending:reporter.health().pending}})}\n`);
store=new core.EventStore(new Global({schemaVersion:1,events:makeEvents(),withdrawal:null,inventory:{last:null}}));reporter=createUsageReporter({store,link,uploadIntervalMs:60000,uploadBatchSize:200});await reporter.runOnce();requests=await countRequests();process.stdout.write(`${JSON.stringify({step:'replay',posts:requests.filter(row=>row.method==='POST').length,duplicates:reporter.health().duplicate,localCount:store.query().total})}\n`);
consent='withheld';await reporter.withdraw('2026-09-19T00:02:00.000Z');requests=await countRequests();process.stdout.write(`${JSON.stringify({step:'withdraw',deletes:requests.filter(row=>row.method==='DELETE').length,outbox:{pending:reporter.health().pending,sent:reporter.health().sent},withdrawal:{state:store.getSnapshot().withdrawal?.state}})}\n`);
await reporter.withdraw('2026-09-19T00:02:00.000Z');requests=await countRequests();process.stdout.write(`${JSON.stringify({step:'withdraw-again-no-resend',deletes:requests.filter(row=>row.method==='DELETE').length})}\n`);
