/** Explicit origin-protocol doubles for Agent unit tests; actual normal Core interaction has its own tests. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const maps=new Map(),files=new Map();
const defaultState={agentProtocolVersion:2,agentOriginProtocolVersion:1,deviceId:'A'.repeat(43),consent:{state:'granted',changedAt:null,consentId:'11111111-1111-4111-8111-111111111111',authorization:'website'}};
export function fixtureOriginCall(root){return async input=>{
 if(input.operation==='state')return structuredClone(defaultState);
 if(input.operation!=='originObserve')throw Error('UNEXPECTED_CORE_FIXTURE_OPERATION');
 if(!/^[a-f0-9]{64}$/.test(input.factId)||typeof input.admitted!=='boolean')throw Error('CORE_INPUT_INVALID');
 const file=files.get(root);let data;if(file){try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={};}}else{data=maps.get(root)??{};maps.set(root,data);}
 const first=!Object.hasOwn(data,input.factId);if(first){data[input.factId]=input.admitted;if(file){await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data));}}
 return {admitted:data[input.factId],first};
};}
export function fixtureAgentStore(Base){return class FixtureAgentStore extends Base{constructor(root,options={}){super(root,{...options,coreCall:options.coreCall??fixtureOriginCall(root)});}};}
export function fixtureCoreCLI(root,state,file){
 files.set(root,file);
 return `import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{dirname}from'node:path';let text='';for await(const b of process.stdin)text+=b;const {input}=JSON.parse(text);const state=${JSON.stringify({...state,agentOriginProtocolVersion:1})};let result;if(input.operation==='state')result=state;else if(input.operation==='originObserve'){if(!state.deviceId)throw Error('CORE_DEVICE_REQUIRED');const path=${JSON.stringify(file)};let data;try{data=JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={};}const first=!Object.hasOwn(data,input.factId);if(first){data[input.factId]=input.admitted;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(data));}result={admitted:data[input.factId],first};}else throw Error('UNEXPECTED_CORE_FIXTURE_OPERATION');console.log(JSON.stringify({result}));`;
}
