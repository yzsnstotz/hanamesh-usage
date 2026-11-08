import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {satisfies} from './pins.mjs';

/** pnpm symlinks are installed dependencies, not editable npm link projects.
 * Traverse consumer dependencies/peers (never a dependency's own dev tools).
 * Check every resolved version against the existing frozen npm artifact set too.
 */
export function assertPhysicalClosure(root,pkg,lock){
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
      const packedCore = isRoot && name==='@hanamesh/core' && spec==='file:vendor/hanamesh-core-0.3.33.tgz'
        && manifest.devDependencies?.[name]===spec && !manifest.dependencies?.[name] && !manifest.peerDependencies?.[name];
      if(packedCore){
        const proof=JSON.parse(readFileSync(join(root,'vendor/core-fixture.json'),'utf8'));
        const bytes=readFileSync(join(root,spec.slice(5))), entry=lock.packages['node_modules/@hanamesh/core'];
        assert.equal(proof.repository,'https://github.com/yzsnstotz/hanamesh-core');
        assert.match(proof.commit,/^[a-f0-9]{40}$/);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.sha256,'CORE_FIXTURE_DIGEST');
        assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),entry.integrity,'CORE_FIXTURE_LOCK_INTEGRITY');
        assert.equal(installed.name,proof.name);assert.equal(installed.version,proof.version);assert.equal(entry.version,proof.version);
        assert.deepEqual(installed.peerDependencies,entry.peerDependencies);assert.deepEqual(installed.dependencies,entry.dependencies);
      }else{
        assert(!/^(?:git\+|github:|https?:|file:|link:|workspace:)/.test(spec),`NON_REGISTRY_DEPENDENCY ${manifest.name} -> ${name}@${spec}`);
        assert(satisfies(installed.version,spec),`INCOMPATIBLE_DEPENDENCY ${manifest.name} -> ${name}@${spec}, resolved ${installed.version}`);
      }
      edges.push({from:manifest.name,name,spec,version:installed.version});
      if(!seen.has(dependencyPath)){seen.add(dependencyPath);walk(installed,dependencyPath);}
    }
  }
  walk(pkg,root,true);return {packages:seen.size,edges:edges.length};
}
