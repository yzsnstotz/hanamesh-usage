// Contract admission only. No runtime, UI, server, or owner acceptance is claimed.
// Usage imports no sibling business code; published source suites are supplied externally.
// node tools/int/source-conformance.mjs <core55> <core56> <serverUsage13> <usage16> <output>
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes, randomUUID} from 'node:crypto';
const [core55, core56, serverUsage, usage, output] = process.argv.slice(2).map(value=>resolve(value));
if (!output) throw new Error('CONTRACT_PATHS_REQUIRED');
const from = (root, file) => import(pathToFileURL(join(root, file)).href);
const packageOf = async root => JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const [corePin, coreRuntime, serverPin, usagePin] = await Promise.all([core55,core56,serverUsage,usage].map(packageOf));
if (corePin.version !== '0.2.0-rc.55' || coreRuntime.version !== '0.2.0-rc.56'
    || serverPin.version !== '0.2.0-rc.13' || usagePin.version !== '0.2.0-rc.17') throw new Error('PIN_MISMATCH');
const [{runCoreConsumerSuite, runCoreProviderSuite}, {SessionController}, {INITIAL_CORE_SNAPSHOT},
  conformance, events, {duckCore, signUsageEvent}] = await Promise.all([
    from(core55,'lib/contract-suite.js'), from(core56,'lib/controller.js'), from(core56,'lib/contracts.js'),
    from(serverUsage,'dist/conformance/index.js'), from(usage,'lib/core/index.js'), from(usage,'lib/host/core-link.js')]);
const unchangedContractFiles = {};
for (const file of ['lib/contract.js','lib/contract-suite.js','lib/contract-fixtures.js','contract/hanamesh-core.v1.schema.json']) {
  unchangedContractFiles[file] = (await readFile(join(core55,file))).equals(await readFile(join(core56,file)));
}
if (!Object.values(unchangedContractFiles).every(Boolean)) throw new Error('CORE_SOURCE_CONTRACT_DRIFT');
let state = structuredClone(INITIAL_CORE_SNAPSHOT);
const controller = await SessionController.create({serverOrigin:null,websiteOrigin:null}, {
  read:()=>state, publish:async next=>{state=next;}, close:async()=>undefined});
let report;
try {
  const coreConsumer = await runCoreConsumerSuite({label:'Usage rc17 actual duckCore',accept:duckCore});
  const coreProvider = await runCoreProviderSuite({label:'Core rc56 actual SessionController.service; in-memory/offline',
    service:controller.service,setConsent:consent=>controller.setConsent(consent)});
  const localInput = overrides => ({deviceId:controller.service.getDeviceId(),hanaRef:'p04-contract-probe',action:'use',
    occurredAt:new Date().toISOString(),eventId:randomUUID(),nonce:events.eventNonceFromBytes(randomBytes(16)),
    signature:null,source:'seat',sourcePlugin:'p04-contract-probe',evidenceRef:'contract-probe',...overrides});
  const wire = events.wireEvent(signUsageEvent(controller.service,events.createUsageEvent(localInput({}))));
  const sourceVectors = conformance.checkConsumer({
    canonicalize:events.signingJSON,
    signEvent:(unsigned,fixtureKey)=>{
      // Suite vectors and keys come ONLY from the source's published fixtures.
      const device = conformance.createReferenceDevice({seedHex:fixtureKey.seedHex});
      const core = {sign:bytes=>Buffer.from(device.signText(Buffer.from(bytes).toString('utf8')),'base64url')};
      return signUsageEvent(core,events.createUsageEvent(localInput({...unsigned,signature:null}))).signature;
    },
    acceptsDeviceId:id=>{try{events.wireEvent(events.createUsageEvent(localInput({deviceId:id})));return true;}catch{return false;}},
    events:[{event:wire,publicKey:controller.service.getPublicKey()}]
  });
  report = {scope:'SOURCE_CONFORMANCE_ONLY; synthetic event, in-memory Core; REAL_RUNTIME/REAL_UI NOT_RUN',
    versions:{coreContract:corePin.version,core:coreRuntime.version,serverUsage:serverPin.version,usage:usagePin.version},
    unchangedContractFiles,coreConsumer,coreProvider,serverUsage:sourceVectors,
    notRun:['ServerUsage real HTTP/package source suites','Identity10 actual HTTP consumer suite','uniform client UI','real person/device identity','server persistence/readback/replay/withdrawal'],
    ok:coreConsumer.ok && coreProvider.ok && sourceVectors.ok};
} finally { await controller.dispose(); }
await mkdir(output,{recursive:true});
await writeFile(join(output,'source-conformance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,coreConsumer:report.coreConsumer.ok,coreProvider:report.coreProvider.ok,
  serverUsage:report.serverUsage.checks.map(({id,ok,error})=>({id,ok,...(error?{error}:{})}))}));
process.exitCode = report.ok ? 0 : 1;
