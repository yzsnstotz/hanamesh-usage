import {sqlite} from './sqlite.mjs';
import {join} from 'node:path';

/** SQLite's OS locks are released on process death. Never unlink a live lock file or guess stale ownership.
 * No event/key data is stored in this database; the reserved transaction is only a cross-process mutex. */
export async function agentLock(root,name,timeoutMs=0) {
  const {DatabaseSync}=await sqlite();
  const db=new DatabaseSync(join(root,`${name}.lock.sqlite`),{timeout:timeoutMs});
  try{db.exec('BEGIN IMMEDIATE');}
  catch(error){db.close();if(error.errcode===5||error.errcode===6)return null;throw new Error('AGENT_LOCK_FAILED');}
  let released=false;
  return async()=>{if(released)return;released=true;try{db.exec('ROLLBACK');}finally{db.close();}};
}
export async function senderLock(root){return agentLock(root,'sender');}
