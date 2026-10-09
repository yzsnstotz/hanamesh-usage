import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require=createRequire(import.meta.url);
const bundle=new URL('../lib/client.js',import.meta.url);
function materialize(fetch){
  assert(existsSync(bundle),'public Usage client entry is missing');
  let registration;
  const window={__ModuleLoader__:{load:value=>{registration=value;}},__DSH_TRANSPORT__:fetch?{fetch}:undefined};
  runInNewContext(readFileSync(bundle,'utf8'),{window,globalThis:{fetch:()=>{throw Error('unexpected global fetch');}},AbortController});
  assert.equal(registration.id,'hanamesh-usage');
  return registration.factory(name=>{assert.equal(name,'react');return require('react');});
}
test('normal client export contributes exactly its own Settings section',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert(pkg.exports['./client'],'normal installed bundle has no public client export');
  const client=materialize();let slot,entry,component,disposed=false;
  client.apply({slots:{inject(name,fn){slot=name;const dispose=fn();dispose();},register(options,body){entry=options;component=body;return()=>{disposed=true;};}}});
  assert.equal(slot,'settings.section');assert.equal(entry.id,'hanamesh-usage');assert.equal(entry.label,'Usage 开发小面板');assert.equal(component,client.UsagePanel);assert(disposed);
});
test('panel read uses the selected carrier with receiver and refuses non-HTML/error replies',async()=>{
  const calls=[];
  function fetch(path,init){assert.equal(this.fetch,fetch);calls.push([path,init]);return Promise.resolve(new Response('<html>fixture only</html>',{headers:{'content-type':'text/html'}}));}
  const client=materialize(fetch);
  assert.equal(await client.fetchUsagePanel(new AbortController().signal),'<html>fixture only</html>');
  assert.equal(calls[0][0],'api/hanamesh/usage/panel/view');assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].cache,'no-store');
  const refused=materialize(()=>Promise.resolve(new Response('{}',{status:503,headers:{'content-type':'application/json'}})));
  await assert.rejects(refused.fetchUsagePanel(new AbortController().signal),/USAGE_PANEL_UNAVAILABLE/);
});
