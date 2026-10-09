import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire('/Users/yzliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const run=process.argv[2], out=run+'/evidence/successor-01a12186';
const launch=JSON.parse(await readFile(run+'/state/LAUNCH.json','utf8'));
const urls=JSON.parse(await readFile(run+'/state/runtime-urls-private.json','utf8'));
const authURL=urls.find(x=>x.startsWith(launch.origin));
if(!authURL)throw Error('NORMAL_CLI_ENTRY_MISSING');
const context=await chromium.launchPersistentContext(run+'/browser-profile',{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1440,height:1100}});
const safe=t=>t.replace(/https?:\/\/\S+/g,'<URL>');
try{
 const page=await context.newPage();const entry=await page.goto(authURL,{waitUntil:'networkidle'});
 const refresh=await page.evaluate(async()=>{const r=await fetch('/api/hanamesh/core/refresh',{method:'POST'});return {http:r.status,body:await r.json()};});
 const state=await page.evaluate(async()=>{const r=await fetch('/api/hanamesh/core/state');return {http:r.status,body:await r.json()};});
 const alias=new URL(authURL);alias.hostname='localhost';const aliasPage=await context.newPage();const aliasEntry=await aliasPage.goto(alias.href,{waitUntil:'networkidle'});const plain=new URL(aliasPage.url());
 const aliasRead=await aliasPage.evaluate(async()=>{const result={};for(const path of ['/api/hanamesh/core/state','/api/hanamesh/usage/panel']){const r=await fetch(path);result[path]={http:r.status,body:await r.json()};}return result;});
 const result={atUTC:new Date().toISOString(),scope:'Normal published transport token/cookie handshake for both trusted loopback hosts; no auth changes, no credential copied to another profile',entryHTTP:entry.status(),refresh,state,alias:{http:aliasEntry.status(),origin:plain.origin,path:plain.pathname,secretQueryRemoved:plain.search==='',reads:aliasRead},ownerLogin:0,ownerConfirm:0};await writeFile(out+'/canonical-alias-readback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({refreshHTTP:refresh.http,stateHTTP:state.http,bound:state.body.session.bound,account:state.body.account,consent:state.body.consent,aliasHTTP:aliasEntry.status(),aliasSecretRemoved:plain.search===''}));
}finally{await context.close();}
