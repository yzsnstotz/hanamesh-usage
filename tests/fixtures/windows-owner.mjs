// Windows-native ownership fixtures for card-run: real owner SIDs and ACLs set with the system icacls/PowerShell.
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const system=process.env.SystemRoot??process.env.SYSTEMROOT??process.env.WINDIR;
const tool=(...parts)=>join(system,'System32',...parts);
function powershell(script,env={}){
  const r=spawnSync(tool('WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';"+script],{encoding:'utf8',env:{...process.env,...env}});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
export const currentUserSid=()=>powershell('[Console]::Write([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)');
export const ownerSid=path=>sid(powershell('[Console]::Write([IO.Directory]::GetAccessControl($env:HM_OWNER_PATH,"Owner").GetOwner([Security.Principal.SecurityIdentifier]).Value)',{HM_OWNER_PATH:path}));
function sid(value){assert.match(value,/^S-1-[0-9-]+$/);return value;}
export const SYSTEM_SID='S-1-5-18',ADMINISTRATORS_SID='S-1-5-32-544',OWNER_RIGHTS_SID='S-1-3-4';
export function icacls(path,...args){const r=spawnSync(tool('icacls.exe'),[path,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);}
/** An elevated token may stamp BUILTIN\Administrators as owner; card runs must be owned by the user SID itself. */
export function ownByCurrentUser(path){icacls(path,'/setowner','*'+currentUserSid());assert.equal(ownerSid(path),currentUserSid());}
