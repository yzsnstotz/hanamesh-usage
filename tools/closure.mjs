import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {satisfies} from './pins.mjs';
import {createHash} from 'node:crypto';

/** pnpm symlinks are installed dependencies, not editable npm link projects.
 * Traverse consumer dependencies/peers (never a dependency's own dev tools).
 * Check every resolved version against the existing frozen npm artifact set too.
 */
export function assertPhysicalClosure(root,pkg,lock){
  const tool='@hanamesh/release-platform-gate',toolSpec='file:vendor/hanamesh-release-platform-gate-0.1.9.tgz';
  const hasTool=['dependencies','devDependencies','optionalDependencies','peerDependencies'].some(section=>Object.hasOwn(pkg[section]??{},tool));
  if(hasTool){
    for(const section of ['dependencies','optionalDependencies','peerDependencies'])assert.equal(pkg[section]?.[tool],undefined,'DEV_ONLY_RELEASE_TOOL');
    assert.equal(pkg.devDependencies?.[tool],toolSpec,'RELEASE_TOOL_SOURCE');
    const bytes=readFileSync(join(root,toolSpec.slice(5)));
    assert.equal(bytes.length,33790,'RELEASE_TOOL_INTEGRITY');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),'c72010c96a5f22e36d65f6c1fd850e583dead7e843644eba1657b4416d9cbd0d','RELEASE_TOOL_INTEGRITY');
    const frozen=lock.packages['node_modules/'+tool];
    assert.equal(frozen?.version,'0.1.9','RELEASE_TOOL_SOURCE');
    assert.equal(frozen?.resolved,toolSpec,'RELEASE_TOOL_SOURCE');
    assert.equal(frozen?.integrity,'sha512-'+createHash('sha512').update(bytes).digest('base64'),'RELEASE_TOOL_INTEGRITY');
    assert.equal(lock.packages[''].devDependencies?.[tool],toolSpec,'RELEASE_TOOL_SOURCE');
  }
  const seen=new Set(),edges=[];
  function locate(name,from){
    for(let cursor=from;;cursor=dirname(cursor)){
      const candidate=join(cursor,'node_modules',name,'package.json');
      if(existsSync(candidate))return dirname(realpathSync(candidate));
      if(dirname(cursor)===cursor)return null;
    }
  }
  function walk(manifest,path,isRoot=false){
    const required={...manifest.dependencies,...manifest.peerDependencies,...(isRoot?manifest.devDependencies:{})};
    for(const [name,spec] of Object.entries({...required,...manifest.optionalDependencies})){
      const optional=Object.hasOwn(manifest.optionalDependencies??{},name)||manifest.peerDependenciesMeta?.[name]?.optional===true;
      const dependencyPath=locate(name,path);
      if(dependencyPath===null){assert(optional,`MISSING_REQUIRED ${manifest.name} -> ${name}`);continue;}
      const installed=JSON.parse(readFileSync(join(dependencyPath,'package.json'),'utf8'));
      assert.equal(installed.name,name);
      const locked=Object.entries(lock.packages).some(([key,value])=>key.endsWith(`node_modules/${name}`)&&value.version===installed.version);
      assert(locked,`UNLOCKED_DEPENDENCY ${name}@${installed.version}`);
      if(name===tool){
        assert(isRoot&&hasTool,'DEV_ONLY_RELEASE_TOOL');
        assert.equal(installed.version,'0.1.9','RELEASE_TOOL_SOURCE');
      } else {
        assert(!/^(?:git\+|github:|https?:|file:|link:|workspace:)/.test(spec),`NON_REGISTRY_DEPENDENCY ${manifest.name} -> ${name}@${spec}`);
        assert(satisfies(installed.version,spec),`INCOMPATIBLE_DEPENDENCY ${manifest.name} -> ${name}@${spec}, resolved ${installed.version}`);
      }
      edges.push({from:manifest.name,name,spec,version:installed.version});
      if(!seen.has(dependencyPath)){seen.add(dependencyPath);walk(installed,dependencyPath);}
    }
  }
  walk(pkg,root,true);return {packages:seen.size,edges:edges.length};
}
