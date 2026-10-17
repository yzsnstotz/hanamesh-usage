import {mkdir,realpath} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readJSON,atomicJSON} from './store.mjs';
import {agentLock} from './sender-lock.mjs';

export const consentScope='开启后，符合规则的插件使用可计贡献积分并支持作者收入；仅记录时间、插件、功能、成败和渠道，不保存/上传对话、工具内容、文件或凭据；设置可随时关闭。';
const quote=value=>"'"+String(value).replaceAll("'","'\"'\"'")+"'";
export function personalCommand(r,command) {
  // Carry the exact local consent/config roots into the user's terminal, never an inferred server address.
  const env={HANAMESH_SHARED_HOME:r.sharedHome,HANAMESH_AGENT_HOME:r.agentHome,HANAMESH_AGENT_CHANNEL:r.host.channel};
  return Object.entries(env).map(([k,v])=>`${k}=${quote(v)}`).join(' ')+` ${quote(process.execPath)} ${quote(fileURLToPath(new URL('./cli.mjs',import.meta.url)))} ${command}`;
}
export function writeNotice(message,stream=process.stdout) {
  return new Promise((resolveWrite,reject)=>{
    const failed=()=>{reject(new Error('AGENT_NOTICE_OUTPUT_FAILED'));};
    stream.once('error',failed);
    stream.write(JSON.stringify({systemMessage:message})+'\n',error=>{if(error)reject(new Error('AGENT_NOTICE_OUTPUT_FAILED'));else{stream.off('error',failed);resolveWrite();}});
  });
}
export async function firstConsentNotice(r,emit=writeNotice) {
  if(!['claude','codex'].includes(r.host.channel))throw new Error('AGENT_CHANNEL_REQUIRED');
  if(!r.host.home)throw new Error('AGENT_HOST_HOME_REQUIRED');
  const decided=state=>state.consent.state==='granted'||state.consent.consentId!==null||state.consent.changedAt!==null;
  if(decided(await r.call({operation:'state'})))return false;
  if(await readJSON(join(r.agentHome,'withdrawal.json'),null))return false;
  const canonical=async path=>{try{return await realpath(path);}catch(error){if(error.code!=='ENOENT')throw error;return join(await canonical(dirname(path)),basename(path));}};
  const home=await canonical(resolve(r.host.home));
  const key=createHash('sha256').update(JSON.stringify([r.host.channel,home])).digest('hex');
  const dir=join(r.agentHome,'notices');await mkdir(dir,{recursive:true,mode:0o700});
  const release=await agentLock(dir,key,r.config.requestTimeoutMs);if(!release)throw new Error('AGENT_NOTICE_BUSY');
  try {
    const path=join(dir,`${key}.json`),marker=await readJSON(path,null);
    if(marker){if(marker.state!=='emitted'||marker.schemaVersion!==1||marker.channel!==r.host.channel)throw new Error('AGENT_NOTICE_INVALID');return false;}
    if(decided(await r.call({operation:'state'}))||await readJSON(join(r.agentHome,'withdrawal.json'),null))return false;
    const missing=['serverOrigin','websiteOrigin'].filter(k=>!r.config[k]);
    const setup=missing.length?`\n上传前置条件未配置：${missing.join('、')}（必填）；请用 hm-setup 查看设置，不会自动填地址、绑定账号或批准钩子。`:'\n上传、计分与账号绑定按服务端规则分别确认。';
    await emit(`HanaMesh：是否开启使用记录？默认关闭，不操作就不记录。${consentScope}\n开启（本人在终端执行）：\n${personalCommand(r,'agree')}\n设置关闭（本人在终端执行）：\n${personalCommand(r,'withdraw')}${setup}`);
    // This means only that the supported systemMessage was written successfully. The host has no display ACK.
    try{await atomicJSON(path,{schemaVersion:1,state:'emitted',channel:r.host.channel,emittedAt:new Date().toISOString()});}
    catch{throw new Error('AGENT_NOTICE_PERSIST_FAILED');}
    return true;
  }finally{await release();}
}
