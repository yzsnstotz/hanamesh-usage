import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {root} from './helpers.mjs';
const core=await import(pathToFileURL(resolve(root,'lib/core/index.js')).href);
const {createInventory}=await import(pathToFileURL(resolve(root,'lib/host/inventory.js')).href);
class Global{constructor(){this.snapshot={schemaVersion:1,events:[],withdrawal:null,inventory:{last:null}};}get(){return this.snapshot;}async set(next){this.snapshot=structuredClone(next);}}
const entry=(id,name)=>({id,options:{name},disabled:false,fiber:{state:2},parent:{tree:{ctx:{baseUrl:'file:///fixture/'}}}});
const global=new Global(),store=new core.EventStore(global),versions=new Map([['a','1.0.0'],['b','2.0.0']]);let entries=[entry('a','a'),entry('b','b')],unreadable=0;
const ctx={loader:{entries:()=>entries.values()},on:()=>()=>{}},service={getConsent:()=> 'granted',getDeviceId:()=> 'device_FIXTURE',sign:()=>Buffer.alloc(64)};
const inventory=createInventory({ctx,store,link:{get:()=>service},inventoryIntervalMs:300000,inspector:async name=>versions.has(name)?{kind:'present',name,version:versions.get(name)}:{kind:'unreadable'},now:(()=>{let n=0;return()=>Date.parse('2026-09-19T00:00:00.000Z')+n++*1000;})(),note:()=>{unreadable++;}});
const project=result=>result.events.map(({action,hanaRef,version})=>({action,hanaRef,version}));
let result=await inventory.scan();process.stdout.write(`${JSON.stringify({scan:1,events:project(result)})}\n`);
result=await inventory.scan();process.stdout.write(`${JSON.stringify({scan:2,events:project(result)})}\n`);
versions.set('b','2.1.0');entries=[entry('b','b')];result=await inventory.scan();process.stdout.write(`${JSON.stringify({scan:3,events:project(result)})}\n`);
entries=[entry('b','b'),entry('bad','bad')];result=await inventory.scan();process.stdout.write(`${JSON.stringify({scan:4,events:project(result),unreadable})}\n`);await inventory.close();
