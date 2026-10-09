import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const require=createRequire('/Users/yzliu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const hostReq=createRequire('/Users/yzliu/.cache/hanamesh-runs/P04-HOST-IDENTITY10-USAGE14-SUPPLY-01/5fefaad7-c0f6-49fc-8960-eeba144e0908/consumer/package.json');
const {Client}=hostReq('pg');
const run=process.argv[2],e=run+'/evidence/public-command-continuation-2';await mkdir(e,{recursive:true});
const launch=JSON.parse(await readFile(run+'/state/LAUNCH.json','utf8'));
const urls=JSON.parse(await readFile(run+'/state/runtime-urls-private.json','utf8'));
const auth=urls.find(u=>u.startsWith(launch.origin+'/?'));
const locator=JSON.parse(await readFile('/Users/yzliu/.cache/hanamesh-runs/P04-HOST-IDENTITY10-USAGE14-SUPPLY-01/5fefaad7-c0f6-49fc-8960-eeba144e0908/supply/LOCATOR.json','utf8'));
const reader=await readFile(locator.postgres.readerEnvFile,'utf8');
const pg=new Client({connectionString:reader.trim().slice('DATABASE_URL='.length)});await pg.connect();
const save=async(n,v)=>{await writeFile(e+'/'+n+'.json',JSON.stringify(v,null,2)+'\n');return v;};
async function db(n){await pg.query('BEGIN READ ONLY');try{const view={};for(const table of ['usage.events','custody.points_events']){const rows=(await pg.query('SELECT row_to_json(t) AS row FROM '+table+' t')).rows.map(x=>x.row).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));view[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),rows};}return await save(n,view);}finally{await pg.query('ROLLBACK');}}
const obs=async(path)=>{const res=await fetch('http://127.0.0.1:'+launch.observerPort+'/'+path);return {http:res.status,body:await res.json()};};
const context=await chromium.launchPersistentContext(run+'/browser-profile',{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1440,height:1100}});
let page,stage='OPEN';
try{
 page=await context.newPage();let agentId;const admitted=[];
 page.on('request',req=>{if(req.method()!=='POST')return;try{const body=req.postDataJSON();const id=body?.payload?.args?.agentId;if(typeof id==='string'){agentId=id;admitted.push({method:body.method,agentId:id});}}catch{}});
 await page.goto(auth,{waitUntil:'networkidle'});
 const skip=page.getByRole('button',{name:'Configure later',exact:true});if(await skip.isVisible()){await skip.click();await skip.waitFor({state:'hidden'});}
 await save('00-ui',{text:await page.locator('body').innerText(),admitted});
 const rpc=async(method,args)=>page.evaluate(async({method,args,rpcId})=>{const response=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId,method,payload:{args}})});return {http:response.status,body:await response.json()};},{method,args,rpcId:randomUUID()});
 if(!agentId){stage='CREATE_PUBLIC_SESSION';await mkdir(run+'/workspace',{recursive:true});const created=await save('00-public-session-create',await rpc('session/create',{request:{cwd:run+'/workspace'}}));if(created.http!==200||!created.body.result.ok)throw Error('NORMAL_SESSION_CREATE_FAILED');agentId=created.body.result.value.sessionId;}
 await save('01-before-state',await obs('state'));const beforeDB=await db('01-before-db');
 const catalog=await save('02-public-command-catalog',await rpc('commands/list',{agentId}));
 if(catalog.http!==200||!catalog.body.result.ok||!catalog.body.result.value.some(x=>x.name==='permission'))throw Error('NORMAL_PERMISSION_NOT_AVAILABLE');
 stage='GRANT';await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'HanaMesh',exact:true}).click();await page.getByRole('checkbox').waitFor();
 if(await page.getByRole('checkbox').isChecked())throw Error('ENGINEERING_CONSENT_NOT_WITHHELD');
 await page.getByRole('checkbox').click();await page.getByText('当前：已开启',{exact:true}).waitFor();
 const baseline=await save('03-granted-state',await obs('state'));
 stage='EXECUTE_PUBLIC_COMMAND';const invocation={method:'commands/execute',args:{agentId,line:'/permission ',submittedAttachments:[]},via:'Existing generated Session.command public Remote contract; browser same-origin authenticated Connection HTTP; no direct Host service/fact injection'};
 await save('04-invocation',invocation);
 const executed=await save('05-command-result',await rpc(invocation.method,invocation.args));
 if(executed.http!==200||!executed.body.result.ok||executed.body.result.value?.result?.kind!=='success')throw Error('NORMAL_COMMAND_NOT_SUCCEEDED');
 const commandId=executed.body.result.value.commandId;
 stage='OBSERVE_USAGE';let state,remote;
 for(let i=0;i<80;i++){state=await obs('state');remote=await obs('remote');const local=state.body.panel.events.find(x=>x.action==='use'&&x.evidenceRef===`command:${commandId}:succeeded`);if(local?.signature?.state==='success'&&local?.upload?.state==='sent'&&remote.body.events.some(x=>x.eventId===local.eventId))break;await new Promise(r=>setTimeout(r,1000));}
 await save('06-local-state',state);await save('07-remote',remote);const afterDB=await db('08-after-db');
 const fact=state.body.facts.find(x=>x.commandId===commandId);const event=state.body.panel.events.find(x=>x.action==='use'&&x.evidenceRef===`command:${commandId}:succeeded`);
 const returned=remote.body.events.find(x=>x.eventId===event?.eventId);
 const persisted=afterDB['usage.events'].rows.find(x=>JSON.stringify(x).includes(event?.eventId??'__missing__'));
 const device=state.body.coreSession.deviceId;
 const foreign=db=>Object.fromEntries(Object.entries(db).map(([t,v])=>[t,v.rows.filter(row=>!JSON.stringify(row).includes(device))]));
 const results={scope:'NEW ORDINARY FUNCTION through mature public Session Remote API; isolated engineering device; normal Core56/Usage19 and TEST Host37/PG; native UI command submit not rerun; owner NOT_RUN',commandId,fact,event,returned,persisted,remoteDevice:remote.body.deviceId,signatureSuccess:event?.signature?.state==='success',sent:event?.upload?.state==='sent',matchedReturned:!!returned&&['hanaRef','action','occurredAt'].every(k=>returned[k]===event[k]),newPGRow:!!persisted&&!beforeDB['usage.events'].rows.some(x=>JSON.stringify(x).includes(event.eventId)),otherRowsUnchanged:JSON.stringify(foreign(beforeDB))===JSON.stringify(foreign(afterDB)),modelsBefore:baseline.body.modelRequests,modelsAfter:state.body.modelRequests};
 await save('09-results',results);
 if(!fact||!results.signatureSuccess||!results.sent||!results.matchedReturned||!results.newPGRow||!results.otherRowsUnchanged||results.modelsBefore!==results.modelsAfter)throw Error('ORDINARY_USAGE_CHAIN_INCOMPLETE');
 await page.getByRole('button',{name:'Usage 开发小面板',exact:true}).click();await page.frameLocator('iframe').getByRole('heading',{name:'当前设备与采集',exact:true}).waitFor();await page.screenshot({path:e+'/10-ordinary-usage.png',fullPage:true});await save('10-renderer',{text:await page.frameLocator('iframe').locator('body').innerText()});
 stage='RESTORE_WITHHELD';await page.getByRole('button',{name:'HanaMesh',exact:true}).click();await page.getByRole('checkbox').click();await page.getByText('当前：已关闭',{exact:true}).waitFor();await save('11-restored-state',await obs('state'));await save('12-restored-remote',await obs('remote'));await db('13-restored-db');
 console.log(JSON.stringify({commandId,ordinaryUse:true,signatureSuccess:results.signatureSuccess,sent:results.sent,matchedReturned:results.matchedReturned,newPGRow:results.newPGRow,otherRowsUnchanged:results.otherRowsUnchanged,modelRequests:state.body.modelRequests,restored:'withheld'}));
}catch(error){await save('FAIL',{stage,name:error.name,message:String(error.message).replace(/http[^\s]+/g,'<URL>')});if(page){await save('FAIL-ui',{text:await page.locator('body').innerText()});await page.screenshot({path:e+'/FAIL.png',fullPage:true});}console.log(JSON.stringify({failed:true,stage,evidence:e}));process.exitCode=1;}
finally{await context.close();await pg.end();}
