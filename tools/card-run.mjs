import {realpathSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename,dirname,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
/** Explicit card-scoped tool inputs, checked before any runtime/install/SQL action. */
export function cardRun(argv=process.argv.slice(2),env=process.env){
  const options={},args=[];
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--card'||argv[i]==='--run'){
      const key=argv[i].slice(2);if(options[key]!==undefined||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('CARD_RUN_REQUIRED');options[key]=argv[++i];
    }else args.push(argv[i]);
  }
  const {card}=options;
  if(!card||!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(card)||!options.run)throw Error('CARD_RUN_REQUIRED');
  const root=resolve(env.HANAMESH_RUNS_ROOT??join(homedir(),'.cache/hanamesh-runs'));
  if(basename(root)!=='hanamesh-runs'||basename(dirname(root))!=='.cache'||root.split(sep).includes('.dsh'))throw Error('RUNS_ROOT_NOT_ISOLATED');
  const cardRoot=join(root,card),run=resolve(options.run),child=relative(cardRoot,run);
  if(child==='..'||child.startsWith('..'+sep)||isAbsolute(child))throw Error('RUN_NOT_THIS_CARD');
  // Resolve existing paths to prevent a card-local symlink from reaching another card/profile.
  if(realpathSync(cardRoot)!==cardRoot||realpathSync(run)!==run||!statSync(run).isDirectory())throw Error('RUN_NOT_THIS_CARD');
  if(!ownedByCurrentUser(run))throw Error('RUN_NOT_OWNED');
  return {card,run,args};
}
/** POSIX compares the owner uid. Windows stat has no owner (uid is always 0), so compare the directory's owner SID
 * with this process token's user SID or the default owner SID the token stamps on objects it creates. */
function ownedByCurrentUser(path){
  if(process.platform!=='win32')return statSync(path).uid===process.getuid();
  const system=process.env.SystemRoot??process.env.SYSTEMROOT??process.env.WINDIR;
  const script='$o=[IO.Directory]::GetAccessControl($env:HANAMESH_CARD_RUN_PATH).GetOwner([Security.Principal.SecurityIdentifier]).Value;'+
    '$i=[Security.Principal.WindowsIdentity]::GetCurrent();[Console]::Write([int]($o -eq $i.User.Value -or $o -eq $i.Owner.Value))';
  const result=spawnSync(join(system,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],
    {encoding:'utf8',env:{...process.env,HANAMESH_CARD_RUN_PATH:path}});
  return result.status===0&&result.stdout==='1';
}
