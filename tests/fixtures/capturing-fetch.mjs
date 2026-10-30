import {sharedSettingsResponse} from './shared-settings.mjs';
/** Captures what the client sends; answers with a canned C-USAGE-shaped 200. Implements no server logic. */
export function capturingFetch(calls,{respond=input=>({accepted:input.length,duplicates:0,rejected:[],durability:'committed'}),failFirst=false}={}){
  return async(url,options)=>{const policy=sharedSettingsResponse(url,options);if(policy)return policy;
    calls.push({url:String(url),method:options.method,headers:options.headers,body:options.body});
    if(failFirst&&calls.length===1)throw new Error('FIXTURE_ACK_LOST');
    return new Response(JSON.stringify(respond(JSON.parse(options.body))),{status:200});
  };
}
