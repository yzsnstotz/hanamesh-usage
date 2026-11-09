/** File fixture only. Not a replacement dsh-storage-domain or session backend.
 * POSIX makes the rename durable with a directory fsync; Windows has no directory handle fsync (EPERM)
 * and its rename (MoveFileEx) is the metadata commit itself. */
import {open,rename,readFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
export async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function atomicJson(path,value,stage=async()=>{}){
  await mkdir(dirname(path),{recursive:true});const temp=`${path}.${process.pid}.tmp`;
  const handle=await open(temp,'w',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  await stage('before-rename');await rename(temp,path);
  if(process.platform!=='win32'){const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}
  await stage('after-rename');
}
export class FileGlobal{
  static async open(path,stage){return new FileGlobal(path,await readJson(path,{schemaVersion:1,records:[]}),stage);}
  constructor(path,snapshot,stage){this.path=path;this.snapshot=snapshot;this.stage=stage;}
  get(){return this.snapshot;}
  async set(next){await atomicJson(this.path,next,this.stage);this.snapshot=structuredClone(next);}
}
