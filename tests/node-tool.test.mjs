import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeToolCommand,nodeToolSync} from '../tools/node-tool.mjs';
for(const name of ['tsc','npm','pnpm'])test(`build tool ${name} uses verified Node and its JavaScript entrypoint`,()=>{
 const result=nodeToolCommand(name,['--version']);
 assert.equal(result.file,process.execPath);
 assert.match(result.args[0],/\.(?:c?js)$/);
 assert.equal(result.args.at(-1),'--version');
 const version=nodeToolSync(name,['--version'],{encoding:'utf8'});
 assert.ifError(version.error);assert.equal(version.status,0,version.stderr);
 assert.match(version.stdout,/\d+\.\d+\.\d+/);
});
