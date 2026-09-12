import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export const root = resolve(process.env.ACTIVITY_TEST_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)));
export const core = await import(pathToFileURL(resolve(root, 'lib/core/index.js')).href);
export function session({id='fixture-session-1',turn=0,kind='completed',provider='fixture-provider',model='fixture-model',usage=false,parentSession, inheritedEventCount=0} = {}) {
  const events = [
    {type:'turn/start',seq:0,time:1000,data:{turn}},
    ...(provider === null ? [] : [{type:'request/context',seq:1,time:1010,data:{provider,model}}]),
  ];
  if (usage) events.push({type:'assistant/message',seq:events.length,time:1050,data:{turn,step:0,usage:{unspecifiedContract:31},message:{content:'SYNTHETIC_CONTENT_NOT_TO_EXPORT'}}});
  events.push({type:'turn/end',seq:events.length,time:1100,data:{turn,reason:{kind,error:{message:'SYNTHETIC_ERROR_NOT_TO_EXPORT'}}}});
  return {sessionId:id,inheritedEventCount,events, binding:{sessionId:id,runtime:'fixture-native',driverVersion:'0.1.5-alpha.1',protocolVersion:'fixture-v1'},sampleKind:'synthetic',...(parentSession ? {parentSession} : {})};
}
export function record(options={}) { const s = session(options); return core.projectTerminal(s,s.events.at(-1)); }
export function withUsage(r, state, value) {
  const out = structuredClone(r);
  for (const key of Object.keys(out.usage)) out.usage[key]=core.numberValue(value,state,'synthetic.fixture','fixture-normalized-tokens-v1');
  return out;
}
export class MemoryGlobal {
  constructor(snapshot={schemaVersion:1,records:[]}) {this.snapshot=structuredClone(snapshot);this.writes=0;this.fail=false;}
  get(){return this.snapshot;}
  async set(next){if(this.fail)throw Error('SYNTHETIC_STORAGE_FAILURE');this.writes++;this.snapshot=structuredClone(next);}
}
