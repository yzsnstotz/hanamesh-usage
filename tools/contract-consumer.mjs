// Normal installed source contracts; engineering only, no product UI or server.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {randomUUID, randomBytes} from 'node:crypto';
import {runCoreConsumerSuite, runCoreProviderSuite} from 'hanamesh-core/contract/suite';
import * as conformance from '@hanamesh/server-usage/conformance';

const [usagePath, outputPath] = process.argv.slice(2);
if (!usagePath || !outputPath) throw new Error('USAGE_PACKAGE_AND_OUTPUT_REQUIRED');
const usage = resolve(usagePath), output = resolve(outputPath);
const coreRoot = dirname(fileURLToPath(import.meta.resolve('hanamesh-core/package.json')));
const serverRoot = resolve(dirname(fileURLToPath(import.meta.resolve('@hanamesh/server-usage/conformance'))),'../..');
const load = async root => JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const {SessionController} = await import(join(coreRoot,'lib/controller.js'));
const {INITIAL_CORE_SNAPSHOT} = await import(join(coreRoot,'lib/contracts.js'));
const events = await import(join(usage,'lib/core/index.js'));
const {duckCore, signUsageEvent} = await import(join(usage,'lib/host/core-link.js'));
let state = structuredClone(INITIAL_CORE_SNAPSHOT);
const controller = await SessionController.create({serverOrigin:null,websiteOrigin:null}, {
  read:()=>state, publish:async next=>{state=next;}, close:async()=>undefined});
let report;
try {
  const coreConsumer = await runCoreConsumerSuite({label:'normally installed Usage duckCore',accept:duckCore});
  const coreProvider = await runCoreProviderSuite({label:'normally installed Core SessionController; memory/offline',
    service:controller.service,setConsent:value=>controller.setConsent(value)});
  const local = overrides => ({deviceId:controller.service.getDeviceId(),hanaRef:'usage-contract-probe',action:'use',
    occurredAt:new Date().toISOString(),eventId:randomUUID(),nonce:events.eventNonceFromBytes(randomBytes(16)),
    signature:null,source:'seat',sourcePlugin:'usage-contract-probe',evidenceRef:'contract-probe',...overrides});
  const event = events.wireEvent(signUsageEvent(controller.service,events.createUsageEvent(local({}))));
  const serverConsumer = conformance.checkConsumer({canonicalize:events.signingJSON,
    signEvent:(unsigned,key)=>{
      const device = conformance.createReferenceDevice({seedHex:key.seedHex});
      const core = {sign:bytes=>Buffer.from(device.signText(Buffer.from(bytes).toString('utf8')),'base64url')};
      return signUsageEvent(core,events.createUsageEvent(local({...unsigned,signature:null}))).signature;
    },
    acceptsDeviceId:id=>{try{events.wireEvent(events.createUsageEvent(local({deviceId:id})));return true;}catch{return false;}},
    events:[{event,publicKey:controller.service.getPublicKey()}]});
  report = {scope:'SOURCE_CONFORMANCE_ONLY; normal packages, in-memory Core and synthetic event',
    packages:{core:await load(coreRoot),serverUsage:await load(serverRoot),usage:await load(usage)},
    sourcePaths:{coreRoot,serverRoot,usage},coreConsumer,coreProvider,serverConsumer,
    notRun:['C-request-message consumer','ServerUsage provider HTTP and package suites','Identity HTTP consumer',
      'renderer, real person, server persistence, 401/503 transaction, withdrawal, owner product acceptance'],
    ok:coreConsumer.ok && coreProvider.ok && serverConsumer.ok};
} finally {await controller.dispose();}
await mkdir(output,{recursive:true});
await writeFile(join(output,'contract-consumer.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,coreConsumer:report.coreConsumer.ok,coreProvider:report.coreProvider.ok,
  serverConsumer:report.serverConsumer.checks}));
process.exitCode = report.ok ? 0 : 1;
