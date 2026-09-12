import {fileURLToPath} from 'node:url';import {dirname,join} from 'node:path';import {readFileSync} from 'node:fs';
/** Read installed ESM peer metadata without assuming package.json is exported. */
export function installedPeer(name){
  let directory=dirname(fileURLToPath(import.meta.resolve(name)));
  for(;;){
    try{const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));if(pkg.name===name)return pkg;}catch(e){if(e.code!=='ENOENT')throw e;}
    const parent=dirname(directory);if(parent===directory)throw Error('PEER_METADATA_NOT_FOUND');directory=parent;
  }
}
