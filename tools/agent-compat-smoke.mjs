/** Drive the installed manifest commands, with isolated state and a network tripwire. No model calls. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const plugin=resolve(process.argv[2]);
const root=await mkdtemp(join(tmpdir(),'hm-px2-smoke-'));
try {
  // Intentionally do not inherit API keys, login state, credential helpers or user configs.
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,COMSPEC:process.env.COMSPEC,
    TEMP:root,TMP:root,TMPDIR:root,HOME:root,USERPROFILE:root,APPDATA:join(root,'appdata'),LOCALAPPDATA:join(root,'local'),
    HANAMESH_SHARED_HOME:join(root,'shared'),HANAMESH_AGENT_HOME:join(root,'agent'),
    CLAUDE_CONFIG_DIR:join(root,'claude'),CODEX_HOME:join(root,'codex'),CLAUDE_PLUGIN_ROOT:plugin,PLUGIN_ROOT:plugin,LANG:'C',LC_ALL:'C'};
  await mkdir(env.CLAUDE_CONFIG_DIR,{recursive:true});await mkdir(env.CODEX_HOME,{recursive:true});
  const run=(command,args,input,extra={},shell=false)=>{
    const r=spawnSync(command,args,{env:{...env,...extra},cwd:root,input,encoding:'utf8',timeout:120000,shell});
    assert.equal(r.status,0,`${command}: ${r.stderr} ${r.error?.message??''}`);return r.stdout;
  };
  const launch=(action,...args)=>process.platform==='win32'
    ?run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(plugin,'bin/hm-agent.ps1'),action,...args])
    :run('/bin/sh',[join(plugin,'bin/hm-agent'),action,...args]);
  launch('install-runtime');
  // Installed Node children (including Core) inherit this tripwire; no credential/network probe is needed.
  const tripwire=join(root,'no-network.mjs');
  await writeFile(tripwire,`import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dgram from 'node:dgram';import fs from 'node:fs';const deny=()=>{fs.writeFileSync(${JSON.stringify(join(root,'network-attempt'))},'attempt');throw Error('PX2_NETWORK_FORBIDDEN')};globalThis.fetch=deny;http.request=http.get=https.request=https.get=net.connect=net.createConnection=tls.connect=dgram.createSocket=deny;`);
  env.NODE_OPTIONS=`--import=${JSON.stringify(tripwire)}`;
  let count=0;
  for(const channel of ['claude','codex']) {
    const hooks=JSON.parse(await readFile(join(plugin,'hooks',channel==='claude'?'hooks.json':'codex.json'))).hooks;
    for(const [event,groups] of Object.entries(hooks))for(const group of groups)for(const hook of group.hooks) {
      // Shape and fields from each host's official hooks reference, synthetic values only.
      const payload={session_id:'px2-synthetic',transcript_path:join(root,'must-not-read'),cwd:root,hook_event_name:event,permission_mode:'default',
        ...(event==='SessionStart'?{source:'startup',model:'synthetic'}:{tool_name:'mcp__synthetic__echo',tool_use_id:'px2-call',tool_input:{secret:'PX2_PRIVATE_SENTINEL'},
        ...(event==='PostToolUse'?{tool_response:{content:[{type:'text',text:'PX2_PRIVATE_SENTINEL'}],isError:false}}:{}),
        ...(event==='PostToolUseFailure'?{error:'PX2_PRIVATE_SENTINEL',is_interrupt:false}:{}),...(channel==='codex'?{turn_id:'px2-turn',model:'synthetic'}:{})})};
      let output;
      const extra={HANAMESH_AGENT_CHANNEL:channel};
      if(process.platform==='win32'&&channel==='codex') {
        // Codex commandWindows is a shell command; execute its exact bytes via cmd.exe.
        output=run(hook.commandWindows,[],JSON.stringify(payload),extra,true);
      } else {
        // Claude shell:bash is documented on Windows (Git for Windows), sh on Unix.
        output=run(process.platform==='win32'?'bash':'/bin/sh',['-c',hook.command],JSON.stringify(payload),extra);
      }
      if(event==='SessionStart'){assert.match(JSON.parse(output).systemMessage,/默认关闭/);}else assert.equal(output,'');
      assert.ok(!output.includes('PX2_PRIVATE_SENTINEL'));count++;
    }
  }
  const status=JSON.parse(launch('status'));
  assert.equal(status.consent.state,'withheld');assert.equal(status.counts.local,0);
  const files=async dir=>{let all=[];try{for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);all.push(...e.isDirectory()?await files(p):[p]);}}catch(e){if(e.code!=='ENOENT')throw e}return all;};
  for(const file of await files(root))if(!file.endsWith('no-network.mjs'))assert.ok(!(await readFile(file)).includes(Buffer.from('PX2_PRIVATE_SENTINEL')),`raw field persisted: ${file}`);
  assert.ok(!(await files(root)).includes(join(root,'network-attempt')),'hook attempted a network call');
  console.log(JSON.stringify({platform:process.platform,arch:process.arch,hooks:count,consent:'withheld',local:0,networkAttempts:0}));
} finally { await rm(root,{recursive:true,force:true}); }
