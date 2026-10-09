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
 const page=await context.newPage(); const res=await page.goto(authURL,{waitUntil:'networkidle'});
 const setup=page.getByRole('button',{name:'Configure later',exact:true}); if(await setup.isVisible())await setup.click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'HanaMesh',exact:true}).click();
 await page.screenshot({path:out+'/01-hanamesh.png',fullPage:true});
 const controls=await page.locator('button,a,[role=button]').evaluateAll(es=>es.filter(e=>e.offsetWidth||e.offsetHeight).map(e=>({tag:e.tagName,text:e.textContent,aria:e.getAttribute('aria-label'),title:e.getAttribute('title')})));
 const coreText=safe(await page.locator('body').innerText());
 await page.getByRole('button',{name:'Usage 开发小面板',exact:true}).click();
 await page.screenshot({path:out+'/02-usage.png',fullPage:true}); const usageText=safe(await page.locator('body').innerText());
 const state=await page.evaluate(async()=>{const r=await fetch('/api/hanamesh/core/state');return {status:r.status,body:await r.json()};});
 const link=await page.evaluate(async()=>{const r=await fetch('/api/hanamesh/core/bind-link',{method:'POST'});return {status:r.status,body:await r.json()};});
 await writeFile(run+'/state/successor-01a12186/bind-link-private.json',JSON.stringify(link,null,2)+'\n',{mode:0o600});
 const url=link.body.url?new URL(link.body.url):null;
 const readback={atUTC:new Date().toISOString(),entryHTTP:res.status(),coreText,usageText,controls,coreState:state,bindLink:{status:link.status,keys:Object.keys(link.body),origin:url?.origin,path:url?.pathname,queryKeys:url?[...url.searchParams.keys()]:[],expiresAt:link.body.expiresAt??null,privateLocator:run+'/state/successor-01a12186/bind-link-private.json'},ownerLogin:0,ownerConfirm:0};
 if(link.status===200&&url){const web=await context.newPage();const wr=await web.goto(link.body.url,{waitUntil:'networkidle'});await web.screenshot({path:out+'/03-web-before-owner.png',fullPage:true});readback.web={http:wr.status(),origin:new URL(web.url()).origin,path:new URL(web.url()).pathname,text:safe(await web.locator('body').innerText()),buttons:await web.getByRole('button').allTextContents()};}
 await writeFile(out+'/entry-readback.json',JSON.stringify(readback,null,2)+'\n');console.log(JSON.stringify(readback));
}finally{await context.close();}
