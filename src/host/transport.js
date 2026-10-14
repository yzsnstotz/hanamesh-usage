// @ts-check
import { UsageError, exportEventProjection, renderUsage, validateFilter } from '../core/index.js';
import { renderUsagePanel } from './panel.js';
import { resendEventIds } from './resend-input.js';
/** Build-only optional transport augmentation; public CLI declarations do not require Connection.
 * @typedef {import('@deepseek-ai/dsh-client-connection').HostConnectionService} OptionalConnection
 */
/** @param {URL} url @returns {import('../core/index.js').Filter} */
function parseFilter(url) {
  /** @type {Record<string, string | number>} */
  const filter = {};
  const seen = new Set();
  for (const [key,value] of url.searchParams) {
    if (seen.has(key)) throw new UsageError('INVALID_FILTER');
    seen.add(key);
    if (!['executor','from','to','result','source','quality','offset','limit'].includes(key)) throw new UsageError('INVALID_FILTER');
    if (value === '') continue;
    if (['from','to','offset','limit'].includes(key)) {
      if (!/^\d+$/.test(value)) throw new UsageError('INVALID_FILTER');
      filter[key] = Number(value);
    } else filter[key] = value;
  }
  const output = /** @type {import('../core/index.js').Filter} */ (filter);
  validateFilter(output);
  return output;
}
/** @param {URL} url @returns {{state?: import('../core/index.js').UploadState, limit?: number, after?: string}} */
function parseEventFilter(url) {
  /** @type {Record<string, string | number>} */
  const filter = {};
  const seen = new Set();
  for (const [key,value] of url.searchParams) {
    if (seen.has(key) || !['state','limit','after'].includes(key) || value === '') throw new UsageError('INVALID_FILTER');
    seen.add(key);
    if (key === 'limit') {
      if (!/^\d+$/.test(value)) throw new UsageError('INVALID_FILTER');
      filter.limit = Number(value);
    } else filter[key] = value;
  }
  return /** @type {{state?: import('../core/index.js').UploadState, limit?: number, after?: string}} */ (filter);
}
/** Registered ONLY on Connection's authenticated exact-fetch registry, never raw WebServer.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./contracts.js').UsageService} api
 * @param {{verification?:boolean}} [options]
 */
export function mountTransport(ctx, api, options={}) {
  const base = '/api/hanamesh/usage';
  for (const [path,method] of [[base,'GET'],[`${base}/view`,'GET'],[`${base}/export`,'POST'],[`${base}/health`,'GET'],[`${base}/events`,'GET'],[`${base}/panel`,'GET'],[`${base}/panel/view`,'GET'],[`${base}/panel/remote`,'GET'],[`${base}/events/resend`,'POST']]) {
    const dispose = ctx.connection.fetch.register({
      path: /** @type {string} */ (path), methods: [/** @type {'GET'|'POST'} */ (method)], requestBody: 'buffered',
      fetch: async request => {
        const headers = { 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'", 'content-type':'application/json; charset=utf-8' };
        if (request.method !== method) return new Response('{"error":"METHOD_NOT_ALLOWED"}', { status:405, headers });
        try {
          const url = new URL(request.url);
          if(path===`${base}/events/resend`){
            if([...url.searchParams].length!==0||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new UsageError('RESEND_INPUT_INVALID');
            let input;try{input=await request.json();}catch{throw new UsageError('RESEND_INPUT_INVALID');}
            const eventIds=resendEventIds(input);if(eventIds===null)throw new UsageError('RESEND_INPUT_INVALID');
            return new Response(JSON.stringify(await api.resendEvents({eventIds})),{headers});
          }
          if(path===`${base}/panel/remote`){
            if([...url.searchParams].length!==0)throw new UsageError('INVALID_FILTER');
            // Read-only; an unreachable or refusing server is reported in the body as unknown, never as zero.
            return new Response(JSON.stringify(await api.remote()),{headers});
          }
          if(path===`${base}/panel`||path===`${base}/panel/view`){
            if([...url.searchParams].length!==0)throw new UsageError('INVALID_FILTER');
            const panel=api.panel();
            if(path.endsWith('/view'))return new Response(renderUsagePanel(panel),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'"}});
            return new Response(JSON.stringify(panel),{headers});
          }
          if (path === `${base}/health`) {
            if ([...url.searchParams].length !== 0) throw new UsageError('INVALID_FILTER');
            return new Response(JSON.stringify(api.health()), { headers });
          }
          if (path === `${base}/events`) {
            const result=api.events(parseEventFilter(url));
            return new Response(JSON.stringify({total:result.total,events:result.events.map(exportEventProjection)}), { headers });
          }
          const filter = parseFilter(url);
          const result = path === `${base}/export` ? api.export(filter) : api.query(filter);
          if (path === `${base}/view`) {
            const eventResult=api.events({limit:1000});
            return new Response(renderUsage(result, {total:eventResult.total,events:eventResult.events.map(exportEventProjection)}, api.health()), { headers:{...headers,'content-type':'text/html; charset=utf-8'} });
          }
          if (path === `${base}/export`) return new Response(JSON.stringify(result), { headers:{...headers,'content-disposition':'attachment; filename="hanamesh-usage.json"'} });
          return new Response(JSON.stringify({ ...result, health:api.health() }), { headers });
        } catch (error) {
          const code = error instanceof UsageError && ['EXPORT_DISABLED','INVALID_FILTER','RESEND_INPUT_INVALID'].includes(error.code) ? error.code : 'USAGE_UNAVAILABLE';
          return new Response(JSON.stringify(path===`${base}/events/resend`?{error:{code}}:{error:code}), { status:code === 'EXPORT_DISABLED' ? 403 : ['INVALID_FILTER','RESEND_INPUT_INVALID'].includes(code) ? 400 : 503, headers });
        }
      },
    });
    ctx.effect(() => dispose);
  }
  if(options.verification===true&&process.env.NODE_ENV!=='production'){
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
}
