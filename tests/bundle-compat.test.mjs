import test from 'node:test';
import assert from 'node:assert/strict';
import {pagePackage} from '../lib/host/page-source.js';

// The official rc.2 public BundleInfo shape, not an alpha fixture with an omitted value.
const bundle={name:'ordinary-plugin',version:'1.0.0',installed:true,enabled:true,optional:false,removable:true,rows:[],overrides:[]};
const source={entryId:'client-owned-entry',moduleName:'ordinary-plugin/client'};
const owner=rows=>pagePackage({get:()=>({listBundles:async()=>rows})},source);
test('rc.2 page ownership accepts a readable enabled profile bundle without availability',async()=>{
  assert.equal(await owner([bundle]),'ordinary-plugin');
});
test('rc.2 page ownership rejects disabled, unreadable, protected and installation-owned bundles',async()=>{
  for(const patch of [{enabled:false},{error:{code:'not-bundle'}},{readOnlyReason:'management-required'},{removable:false},{installed:false}])
    assert.equal(await owner([{...bundle,...patch}]),null,JSON.stringify(patch));
});
test('an explicit alpha availability never falls back to the rc.2 ownership rule',async()=>{
  assert.equal(await owner([{...bundle,availability:'profile'}]),'ordinary-plugin');
  for(const availability of ['missing','installation',undefined,null,'unknown'])
    assert.equal(await owner([{...bundle,availability}]),null,String(availability));
});
