import {realpathSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename,dirname} from 'node:path';
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
  if(basename(root)!=='hanamesh-runs'||basename(dirname(root))!=='.cache'||root.split('/').includes('.dsh'))throw Error('RUNS_ROOT_NOT_ISOLATED');
  const cardRoot=join(root,card),run=resolve(options.run),child=relative(cardRoot,run);
  if(child==='..'||child.startsWith('../')||isAbsolute(child))throw Error('RUN_NOT_THIS_CARD');
  // Resolve existing paths to prevent a card-local symlink from reaching another card/profile.
  if(realpathSync(cardRoot)!==cardRoot||realpathSync(run)!==run||!statSync(run).isDirectory())throw Error('RUN_NOT_THIS_CARD');
  if(statSync(run).uid!==process.getuid?.())throw Error('RUN_NOT_OWNED');
  return {card,run,args};
}
