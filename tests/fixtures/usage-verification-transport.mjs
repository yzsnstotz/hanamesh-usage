import {UsageError} from '../../lib/core/index.js';

/** Test-only editable bridge; never imported by the production host. */
export function mountVerificationTransport(ctx,api) {
  const base='/api/hanamesh/usage';
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
    for(const [path,method] of [[`${base}/verification`,'GET'],[`${base}/verification/call`,'POST']]){
      const dispose=ctx.connection.fetch.register({path,methods:[/** @type {'GET'|'POST'} */(method)],requestBody:'buffered',fetch:async request=>{
        if(request.method!==method)return new Response(JSON.stringify({error:{code:'METHOD_NOT_ALLOWED'}}),{status:405,headers});
        try{
          if([...new URL(request.url).searchParams].length!==0)throw new UsageError('USAGE_VERIFICATION_INVALID');
          if(method==='GET')return new Response(JSON.stringify({enabled:true,calls:['record','health','observeCollection'],deviceId:api.health().deviceId}),{headers});
          let body;try{body=await request.json();}catch{throw new UsageError('USAGE_VERIFICATION_INVALID');}
          if(body===null||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join('|')!=='call|input'
            ||!['record','health','observeCollection'].includes(body.call)
            ||(body.call==='record'?(body.input===null||typeof body.input!=='object'||Array.isArray(body.input)):body.input!==null))throw new UsageError('USAGE_VERIFICATION_INVALID');
          const {call,input}=body;
          const result=call==='record'?await api.record(input):call==='health'?api.health():await api.observeCollection();
          return new Response(JSON.stringify({call,input,result,health:api.health()}),{headers});
        }catch(error){
          const code=error instanceof UsageError&&error.code==='USAGE_VERIFICATION_INVALID'?'USAGE_VERIFICATION_INVALID':'USAGE_UNAVAILABLE';
          return new Response(JSON.stringify({error:{code}}),{status:code==='USAGE_VERIFICATION_INVALID'?400:503,headers});
        }
      }});ctx.effect(()=>dispose);
    }
}
