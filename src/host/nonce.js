// @ts-check
import {randomBytes} from 'node:crypto';

/** The O1 server accepts base64url nonces only when the first character is alphanumeric.
 * Keep the 16-byte canonical encoding used by existing local snapshots.
 * @param {(size:number)=>Buffer} [random]
 */
export function createUsageNonce(random=randomBytes){
  for(let attempt=0;attempt<32;attempt++){
    const nonce=random(16).toString('base64url');
    if(/^[A-Za-z0-9]/.test(nonce))return nonce;
  }
  throw new Error('NONCE_GENERATION_FAILED');
}
