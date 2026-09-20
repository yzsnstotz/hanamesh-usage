import {fileURLToPath} from 'node:url';import {dirname,join} from 'node:path';import {readFileSync} from 'node:fs';
/** Read installed ESM peer metadata without assuming package.json is exported. */
export function installedPeer(name){
  let directory=dirname(fileURLToPath(import.meta.resolve(name)));
  for(;;){
    try{const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));if(pkg.name===name)return pkg;}catch(e){if(e.code!=='ENOENT')throw e;}
    const parent=dirname(directory);if(parent===directory)throw Error('PEER_METADATA_NOT_FOUND');directory=parent;
  }
}
/** Minimal semver check for the peer specs this package declares: an exact version, or `>=A <B` (prerelease-aware, npm rules). */
function parse(v){const m=/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(v);if(!m)throw Error(`BAD_SEMVER ${v}`);return {tuple:[+m[1],+(m[2]??0),+(m[3]??0)],pre:m[4]?m[4].split('.'):null};}
function compare(a,b){for(let i=0;i<3;i++)if(a.tuple[i]!==b.tuple[i])return a.tuple[i]<b.tuple[i]?-1:1;if(!a.pre&&!b.pre)return 0;if(!a.pre)return 1;if(!b.pre)return -1;for(let i=0;;i++){const x=a.pre[i],y=b.pre[i];if(x===undefined&&y===undefined)return 0;if(x===undefined)return -1;if(y===undefined)return 1;const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);if(nx&&ny){if(+x!==+y)return +x<+y?-1:1;}else if(nx)return -1;else if(ny)return 1;else if(x!==y)return x<y?-1:1;}}
export function satisfies(version,spec){
  const v=parse(version);
  if(!/[<>=]/.test(spec))return compare(v,parse(spec))===0;
  const comparators=spec.trim().split(/\s+/).map(c=>{const m=/^(>=|<=|>|<)(.+)$/.exec(c);if(!m)throw Error(`UNSUPPORTED_RANGE ${spec}`);return {op:m[1],v:parse(m[2])};});
  if(v.pre&&!comparators.some(c=>c.v.pre&&c.v.tuple.every((n,i)=>n===v.tuple[i])))return false;
  return comparators.every(({op,v:c})=>{const d=compare(v,c);return op==='>='?d>=0:op==='<='?d<=0:op==='>'?d>0:d<0;});
}
