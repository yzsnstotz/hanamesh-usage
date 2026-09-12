import {fork,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
export const worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
export async function killAt(mode,dir,point){
  const child=fork(worker,[mode,dir,point],{stdio:['ignore','pipe','pipe','ipc'],env:process.env});
  let stderr='';child.stderr.on('data',x=>stderr+=x);
  const exit=once(child,'exit');
  try{
    const pause=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('INJECTION_TIMEOUT:'+stderr)),8000);
      child.once('message',msg=>{clearTimeout(timer);resolve(msg);});
      child.once('exit',(code,signal)=>{clearTimeout(timer);reject(Error(`EXIT_BEFORE_INJECTION:${code}:${signal}:${stderr}`));});
      child.once('error',e=>{clearTimeout(timer);reject(e);});
    });
    if(pause.type!=='pause')throw Error('INVALID_HANDSHAKE');
    if(!child.kill('SIGKILL'))throw Error('SIGNAL_NOT_SENT');
    const [code,signal]=await exit;
    return {label:pause.label,code,signal};
  }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}}
}
export function inspect(dir){return JSON.parse(execFileSync(process.execPath,[worker,'inspect',dir],{encoding:'utf8',env:process.env}));}
export function recover(dir){return JSON.parse(execFileSync(process.execPath,[worker,'recover',dir],{encoding:'utf8',env:process.env}));}
