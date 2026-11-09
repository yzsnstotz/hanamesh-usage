// Test-only unpublished Theme transport. Production Core archive membership is unchanged.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
export async function themeFixtureRegistry(upstream,file){
 const bytes=await readFile(file),tar=process.platform==='win32'?join(process.env.SystemRoot??process.env.SYSTEMROOT??process.env.WINDIR,'System32','tar.exe'):'tar';
 const result=spawnSync(tar,['-xOzf',file,'package/package.json'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const metadata=JSON.parse(result.stdout);assert.equal(metadata.name,'@hanamesh/theme');assert.equal(metadata.version,'0.1.0');
 assert.equal(metadata.repository.url,'https://github.com/yzsnstotz/hanamesh-core.git');
 const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64'),sockets=new Set(),pending=new Set();let registry;
 const server=createServer((request,response)=>{void(async()=>{
  if(request.headers.host!==new URL(registry).host||request.headers.authorization||request.headers.cookie||!['GET','HEAD'].includes(request.method)){response.writeHead(403);response.end();return;}
  const url=new URL(request.url,registry);if(url.search||url.hash||url.origin!==new URL(registry).origin){response.writeHead(400);response.end();return;}
  let name;try{name=decodeURIComponent(url.pathname.slice(1));}catch{response.writeHead(400);response.end();return;}
  let body,status=200,type='application/json';
  if(name==='@hanamesh/theme')body=Buffer.from(JSON.stringify({name,versions:{[metadata.version]:{...metadata,dist:{integrity,tarball:registry+'theme.tgz'}}},'dist-tags':{}}));
  else if(name==='theme.tgz'){body=bytes;type='application/octet-stream';}
  else{
   const abort=new AbortController();pending.add(abort);
   try{const res=await fetch(new URL(url.pathname.slice(1),upstream),{redirect:'error',credentials:'omit',signal:abort.signal});status=res.status;type=res.headers.get('content-type')??type;body=Buffer.from(await res.arrayBuffer());}finally{pending.delete(abort);}
  }
  response.writeHead(status,{'content-type':type,'content-length':body.length,'cache-control':'no-store'});response.end(request.method==='HEAD'?undefined:body);
 })().catch(()=>{if(!response.headersSent)response.writeHead(502);response.end();});});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});registry='http://127.0.0.1:'+server.address().port+'/';
 return {registry,close:()=>new Promise((resolve,reject)=>{for(const abort of pending)abort.abort();server.close(error=>error?reject(error):resolve());for(const socket of sockets)socket.destroy();})};
}
