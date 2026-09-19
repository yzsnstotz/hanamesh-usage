#!/usr/bin/env node
// STUB — P2 protocol fixture only. It does not authenticate or verify signatures.
import {createServer} from 'node:http';
import {appendFile} from 'node:fs/promises';

const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const port=Number(value('--port')??0),record=value('--record');if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
const seen=new Set();
const seven=['deviceId','hanaRef','action','occurredAt','eventId','nonce','signature'].sort().join('|');
async function readBody(request){const chunks=[];for await(const chunk of request)chunks.push(chunk);return Buffer.concat(chunks);}
const server=createServer(async(request,response)=>{
  const url=new URL(request.url??'/','http://127.0.0.1'),body=await readBody(request);let parsed=null;try{parsed=body.length?JSON.parse(body.toString('utf8')):null;}catch{}
  const row={method:request.method,path:url.pathname,body:parsed};if(record)await appendFile(record,JSON.stringify(row)+'\n',{mode:0o600});
  response.setHeader('content-type','application/json');
  if(request.method==='POST'&&url.pathname==='/v1/usage/events'){
    const events=Array.isArray(parsed)?parsed:[];const rejected=[];let accepted=0,duplicates=0;
    for(const event of events){if(event===null||typeof event!=='object'||Object.keys(event).sort().join('|')!==seven){rejected.push({eventId:typeof event?.eventId==='string'?event.eventId:'invalid',code:'USAGE_INPUT_INVALID'});continue;}if(seen.has(event.eventId))duplicates++;else{seen.add(event.eventId);accepted++;}}
    response.end(JSON.stringify({accepted,duplicates,rejected,durability:'committed'}));return;
  }
  if(request.method==='DELETE'&&/^\/v1\/usage\/me\/devices\/[^/]+\/events$/.test(url.pathname)){const deletedEvents=seen.size;seen.clear();response.end(JSON.stringify({deletedEvents}));return;}
  response.statusCode=404;response.end('{"error":"NOT_FOUND"}');
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`${JSON.stringify({event:'STUB_READY',port:server.address().port})}\n`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
