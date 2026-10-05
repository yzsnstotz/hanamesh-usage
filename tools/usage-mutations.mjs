/** Usage-owned cases and failure policy; execution belongs to devkit. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const mutationCases=[
 {name:'T05-unavailable-to-zero',file:'lib/core/privacy.js',from:"return { state: 'unavailable', value: null, reason };",to:"return { state: 'reported', value: 0, source: 'synthetic.fixture', rule: 'mutant-wrong-zero' };",test:'tests/core.test.mjs',pattern:'T04 FIXTURE: unknown'},
 {name:'X03-reverse-durable-order',file:'lib/core/boundary.js',from:'await ensureSourceDurable();\n    return await commitSummary();',to:'const wrong = await commitSummary();\n    await ensureSourceDurable();\n    return wrong;',test:'tests/crash/boundary.test.mjs'},
 {name:'U06-guess-unavailable-executor',file:'lib/core/derive.js',from:"if (input.executor.id.state !== 'reported')\n        return { event: null, skipped: 'executorUnavailable' };",to:"if (input.executor.id.state !== 'reported')\n        input.executor.id = { state: 'reported', value: 'guessed-executor', source: 'synthetic.fixture', rule: 'mutant-guessed' };",test:'tests/derive.test.mjs',pattern:'U06 unavailable executor'},
 {name:'X03-derive-before-source',file:'lib/host/mount.js',from:"await commitAfterSource(async () => {\n        flush ??= ctx.sessions.flush(session).then(participated => {\n          if (!participated) throw new UsageError('NO_DURABILITY_LISTENER');\n        });\n        await flush;\n        await verifyTerminal(session.id, end);\n      }, async () => { const disposition=await store.put(record);if(disposition==='inserted')await derive(record);return disposition; });",to:"await derive(record);\n      await commitAfterSource(async () => {\n        flush ??= ctx.sessions.flush(session).then(participated => {\n          if (!participated) throw new UsageError('NO_DURABILITY_LISTENER');\n        });\n        await flush;\n        await verifyTerminal(session.id, end);\n      }, async () => store.put(record));",test:'tests/host.test.mjs',pattern:'U06 source declaration'},
 {name:'X03-withdraw-remote-first',file:'lib/host/upload.js',from:'if(current===null)await store.withdrawLocal(changedAt,deviceId);',to:'if(current===null){await requestWithdrawal(deviceId);await store.withdrawLocal(changedAt,deviceId);}',test:'tests/withdraw.test.mjs',pattern:'U15 withdrawal clears locally'},
 {name:'U14-unauthorized-marked-sent',file:'lib/host/upload.js',from:"if(response.status===401||response.status===403)return await fail('UPLOAD_UNAUTHORIZED',ids);",to:"if(response.status===401||response.status===403){await store.applyUpload(ids,{accepted:ids.length,duplicates:0,rejected:[],durability:'committed'},iso());return 'uploaded';}",test:'tests/upload.test.mjs',pattern:'U14 401'},
 {name:'U16-ignore-withheld-consent',file:'lib/host/upload.js',from:"if(core.getConsent()!=='granted'){state='stopped';return /** @type {const} */('withheld');}",to:"if(false){state='stopped';return /** @type {const} */('withheld');}",test:'tests/upload.test.mjs',pattern:'U16 withheld'},
 {name:'T6-receipt-dropped-from-wire',file:'lib/core/events.js',from:"...(receipt === null ? {} : { receipt: { providerId: receipt.providerId, model: receipt.model, count: receipt.count } }),",to:"...{},",test:'tests/upload.test.mjs',pattern:'T6 attributed events upload'},
 {name:'T6-receipt-ignored-by-dedup-identity',file:'lib/core/event-store.js',from:"event.sourceHanaRef, event.targetRef, receipt === null ? null : [receipt.providerId, receipt.model, receipt.count]]);",to:"event.sourceHanaRef, event.targetRef]);",test:'tests/core.test.mjs',pattern:'T6 EventStore dedup identity'},
 {name:'U19-uninstall-uses-install-key',file:'lib/host/inventory.js',from:'eventIdForLoader(deviceId,change.action,change.hanaRef,change.version)',to:"eventIdForLoader(deviceId,'install',change.hanaRef,change.version)",test:'tests/inventory.test.mjs',pattern:'U19 uninstall uses'},
];
export function validateMutationEvidence(evidenceDir){
 for(const item of mutationCases){
  const output=readFileSync(join(evidenceDir,`${item.name}.tap`),'utf8');
  assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError|INJECTION_TIMEOUT|EXIT_BEFORE_INJECTION/);
 }
}
