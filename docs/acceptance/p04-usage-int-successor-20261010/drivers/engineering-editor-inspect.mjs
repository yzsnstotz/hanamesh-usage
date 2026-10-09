import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire('/Users/yzliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const run=process.argv[2];
const launch=JSON.parse(await readFile(run+'/state/LAUNCH.json','utf8'));
const urls=JSON.parse(await readFile(run+'/state/runtime-urls-private.json','utf8'));
const authURL=urls.find(x=>x.startsWith(launch.origin));
if(!authURL)throw Error('NORMAL_CLI_ENTRY_MISSING');
const context=await chromium.launchPersistentContext(run+'/browser-profile',{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1440,height:1000}});
try{
 const page=await context.newPage();
 const response=await page.goto(authURL,{waitUntil:'networkidle'});
 const editors=await page.locator('textarea,input,[contenteditable]').evaluateAll(es=>es.map(e=>({tag:e.tagName,role:e.getAttribute('role'),aria:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),contenteditable:e.getAttribute('contenteditable'),type:e.getAttribute('type')})));console.log(JSON.stringify({editors}));
 const controls=await page.locator('button,a,[role=button]').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.textContent,aria:e.getAttribute('aria-label'),title:e.getAttribute('title'),role:e.getAttribute('role'),visible:!!(e.offsetWidth||e.offsetHeight)})));
 const text=await page.locator('body').innerText();await page.screenshot({path:run+'/evidence/engineering-ordinary-before.png',fullPage:true});await writeFile(run+'/evidence/engineering-ordinary-before.json',JSON.stringify({response:response.status(),text,controls},null,2)+'\n');console.log(JSON.stringify({response:response.status(),text,controls}));
} finally {await context.close();}
