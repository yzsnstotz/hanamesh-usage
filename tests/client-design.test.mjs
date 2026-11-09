import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function client(){let registration;runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:value=>registration=value}},AbortController});return registration.factory(name=>{assert.equal(name,'react');return require('react');});}
const rows=[
 {eventId:'a',hanaRef:'notes',action:'open',occurredAt:'2026-11-10T01:00:00Z',upload:'sent',code:null},
 {eventId:'b',hanaRef:'Docs',action:'use',occurredAt:'2026-11-10T02:00:00Z',upload:'pending',code:null},
 {eventId:'c',hanaRef:'notes',action:'install',occurredAt:'2026-11-10T03:00:00Z',upload:'rejected',code:'UPLOAD_UNAUTHORIZED'},
];
test('Usage filters the authoritative local page without synthesizing or mutating records',()=>{
 const api=client(),input=structuredClone(rows);
 assert.deepEqual(Array.from(api.visibleUsageRows(input,' NOTES ','all'),r=>r.eventId),['a','c']);
 assert.deepEqual(Array.from(api.visibleUsageRows(input,'','pending'),r=>r.eventId),['b']);
 assert.deepEqual(Array.from(api.visibleUsageRows(input,'docs','sent')),[]);
 assert.deepEqual(input,rows);
});
test('Usage main and sidebar share an id and consent navigation uses the public layout service',async()=>{
 const api=client(),entries=[],effects=[],selected=[];
 const ctx={layout:{selectPanel:id=>selected.push(id)},remote:{$mount:async()=>()=>{}},on:()=>()=>{},effect:fn=>{const result=fn();effects.push(result);return result;},inject(deps,run){run(this);return Promise.resolve();},slots:{inject(name,run){return run();},register(options,component){entries.push({options,component});return()=>{};}}};
 await api.apply(ctx);
 assert(entries.some(e=>e.options.name==='settings.section'&&e.options.id==='hanamesh-usage'));
 const main=entries.find(e=>e.options.name==='main'&&e.options.key==='hanamesh-usage');
 assert(main);assert.equal(main.options.key,'hanamesh-usage');assert(entries.some(e=>e.options.name==='sidebar.panellist'&&e.options.id===main.options.key));
 const page=main.component();assert.equal(page.type,api.UsagePanel);page.props.onManageConsent();
 assert.deepEqual(selected,['hanamesh-account']);
});
