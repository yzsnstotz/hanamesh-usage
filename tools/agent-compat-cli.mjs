/** Credential-free native CLI installation gates. Only temporary HOME/config paths. */
import {mkdir,writeFile,readFile,cp,realpath,access} from 'node:fs/promises';
import {join,dirname,resolve,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const stage=process.argv[2],root=join(process.env.RUNNER_TEMP??process.env.PX2_RUN_ROOT??tmpdir(),'px2');
await mkdir(root,{recursive:true});
const result={platform:process.platform,arch:process.arch,tier:stage,checks:[]};
const env={PATH:dirname(process.execPath)+delimiter+process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,COMSPEC:process.env.COMSPEC,PATHEXT:process.env.PATHEXT,OS:process.env.OS,PROCESSOR_ARCHITECTURE:process.env.PROCESSOR_ARCHITECTURE,PROCESSOR_ARCHITEW6432:process.env.PROCESSOR_ARCHITEW6432,
  HOME:join(root,'home'),USERPROFILE:join(root,'home'),TEMP:root,TMP:root,TMPDIR:root,APPDATA:join(root,'appdata'),LOCALAPPDATA:join(root,'local'),
  CLAUDE_CONFIG_DIR:join(root,'claude'),CODEX_HOME:join(root,'codex'),DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',
  GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',
  NPM_CONFIG_USERCONFIG:join(root,'npmrc'),NPM_CONFIG_GLOBALCONFIG:join(root,'global-npmrc'),NPM_CONFIG_CACHE:join(root,'npm-cache'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org',LANG:'C',LC_ALL:'C'};
for(const p of ['HOME','CLAUDE_CONFIG_DIR','CODEX_HOME','APPDATA','LOCALAPPDATA'])await mkdir(env[p],{recursive:true});
await writeFile(env.NPM_CONFIG_USERCONFIG,'');await writeFile(env.NPM_CONFIG_GLOBALCONFIG,'');
const run=(label,cmd,args,cwd=root)=>{
 const r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
 result.checks.push({label,status:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.code});
 assert.equal(r.status,0,`${label}: ${r.stderr} ${r.stdout} ${r.error?.message??''}`);
 return r.stdout;
};
try {
 if(stage==='prepare') { console.log(JSON.stringify({root,scope:'ISOLATED_PATHS_ONLY'})); }
 else {
  assert.ok(['minimum','latest'].includes(stage));
  let npmCLI;
  for(const dir of process.env.PATH.split(delimiter)) {
   const candidates=[join(dir,'node_modules/npm/bin/npm-cli.js'),join(dir,'../lib/node_modules/npm/bin/npm-cli.js')];
   try{candidates.push(await realpath(join(dir,'npm')))}catch{}
   for(const candidate of candidates)try{await access(candidate);if(candidate.endsWith('.js')){npmCLI=candidate;break}}catch{}
   if(npmCLI)break;
  }
  assert.ok(npmCLI,'npm CLI JavaScript entry required');
  const prefix=join(root,'clis');
  run('install official CLIs',process.execPath,[npmCLI,'install','--prefix',prefix,'--no-audit','--no-fund',`@anthropic-ai/claude-code@${stage==='minimum'?'2.1.301':'latest'}`,`@openai/codex@${stage==='minimum'?'0.162.1':'latest'}`]);
  const cli=async(name,args)=>{
   const packageRoot=join(prefix,'node_modules',name),pkg=JSON.parse(await readFile(join(packageRoot,'package.json'))),entry=join(packageRoot,typeof pkg.bin==='string'?pkg.bin:Object.values(pkg.bin)[0]);
   return /\.[cm]?js$/.test(entry)?run(name+' '+args.join(' '),process.execPath,[entry,...args]):run(name+' '+args.join(' '),entry,args);
  };
  result.claude=(await cli('@anthropic-ai/claude-code',['--version'])).trim();result.codex=(await cli('@openai/codex',['--version'])).trim();
  // Obtain one pinned public Core artifact; verify before unpacking it, never read a sibling repo.
  const core=join(root,'core-0.3.28.tgz');
  const response=await fetch('https://registry.npmjs.org/@hanamesh/core/-/core-0.3.28.tgz',{redirect:'error'});assert.ok(response.ok);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha512').update(bytes).digest('base64'),'J0s6ffDqfUlMQvfrjfGpPEmwQIvMPicIv7NLyhNix3wDZDvlATjoK0KOwrCjvKib3MIeq9v+TegJlZ4gTXzPlQ==');await writeFile(core,bytes);
  const plugin=join(root,'plugin with spaces');
  run('package composite plugin',process.execPath,[resolve('tools/package-agent.mjs'),core,plugin],process.cwd());
  await cli('@anthropic-ai/claude-code',['plugin','validate',plugin]);
  // Distinct marketplace formats are accepted by each official CLI.
  const market=join(root,'market');await mkdir(join(market,'.claude-plugin'),{recursive:true});await mkdir(join(market,'.agents/plugins'),{recursive:true});
  await cp(plugin,join(market,'plugin'),{recursive:true});
  const common={name:'px2-local',owner:{name:'HanaMesh'},plugins:[{name:'hanamesh',source:'./plugin',category:'productivity'}]};
  await writeFile(join(market,'.claude-plugin/marketplace.json'),JSON.stringify(common));
  await writeFile(join(market,'.agents/plugins/marketplace.json'),JSON.stringify({...common,plugins:[{name:'hanamesh',source:{source:'local',path:'./plugin'},category:'Productivity',policy:{installation:'AVAILABLE',authentication:'ON_USE'}}]}));
  await cli('@anthropic-ai/claude-code',['plugin','marketplace','add',market]);
  await cli('@anthropic-ai/claude-code',['plugin','install','hanamesh@px2-local']);
  await cli('@anthropic-ai/claude-code',['plugin','list','--json']);
  await cli('@openai/codex',['plugin','marketplace','add',market,'--json']);
  await cli('@openai/codex',['plugin','add','hanamesh@px2-local','--json']);
  await cli('@openai/codex',['plugin','list','--json']);
  const mcp=JSON.parse(await cli('@openai/codex',['mcp','list','--json'])).find(row=>row.name==='hanamesh');
  assert.ok(mcp,'installed plugin MCP must be visible');assert.equal(mcp.transport.command,'bash');
  assert.deepEqual(mcp.transport.args,['./bin/hm-agent','mcp']);assert.ok(mcp.transport.cwd.includes('hanamesh'));
  const loaded=JSON.parse(await readFile(join(mcp.transport.cwd,'.codex-plugin/plugin.json')));
  assert.equal(loaded.hooks,'./hooks/codex.json');
  await access(join(mcp.transport.cwd,loaded.hooks));
  console.log(JSON.stringify({platform:result.platform,arch:result.arch,tier:stage,claude:result.claude,codex:result.codex,checks:result.checks.length}));
 }
} finally {await writeFile(join(root,'results.json'),JSON.stringify(result,null,2)+'\n');}
