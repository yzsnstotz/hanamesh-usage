/** The small managed Windows helper is a locked product asset, built only in Actions. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function verifyNativeHelper(){
 const root=new URL('../agent/bin/',import.meta.url),read=name=>readFileSync(new URL(name,root)),sha=b=>createHash('sha256').update(b).digest('hex');
 const record=JSON.parse(read('windows-detached.json')),binary=read('windows-detached.dll');
 if(record.schemaVersion!==1||record.architecture!=='AnyCPU'||!/^[a-f0-9]{40}$/.test(record.builtFromRevision)||record.sourceSha256!==sha(read('windows-detached.cs'))||record.sha256!==sha(binary)||binary.toString('ascii',0,2)!=='MZ')throw Error('WINDOWS_DETACH_HELPER_LOCK_MISMATCH');
 return record;
}
