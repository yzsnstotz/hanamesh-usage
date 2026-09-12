// @ts-check
import { ActivityError, renderActivity, validateFilter } from '../core/index.js';
/** @param {URL} url @returns {import('../core/index.js').Filter} */
function parseFilter(url) {
  /** @type {Record<string, string | number>} */
  const filter = {};
  const seen = new Set();
  for (const [key,value] of url.searchParams) {
    if (seen.has(key)) throw new ActivityError('INVALID_FILTER');
    seen.add(key);
    if (!['executor','from','to','result','source','quality','offset','limit'].includes(key)) throw new ActivityError('INVALID_FILTER');
    if (value === '') continue;
    if (['from','to','offset','limit'].includes(key)) {
      if (!/^\d+$/.test(value)) throw new ActivityError('INVALID_FILTER');
      filter[key] = Number(value);
    } else filter[key] = value;
  }
  const output = /** @type {import('../core/index.js').Filter} */ (filter);
  validateFilter(output);
  return output;
}
/** Registered ONLY on Connection's authenticated exact-fetch registry, never raw WebServer.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./contracts.js').ActivityService} api
 */
export function mountTransport(ctx, api) {
  const base = '/api/hanamesh/activity';
  for (const [path,method] of [[base,'GET'],[`${base}/view`,'GET'],[`${base}/export`,'POST']]) {
    const dispose = ctx.connection.fetch.register({
      path: /** @type {string} */ (path), methods: [/** @type {'GET'|'POST'} */ (method)], requestBody: 'buffered',
      fetch: async request => {
        const headers = { 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'", 'content-type':'application/json; charset=utf-8' };
        if (request.method !== method) return new Response('{"error":"METHOD_NOT_ALLOWED"}', { status:405, headers });
        try {
          const filter = parseFilter(new URL(request.url));
          const result = path === `${base}/export` ? api.export(filter) : api.query(filter);
          if (path === `${base}/view`) return new Response(renderActivity(result), { headers:{...headers,'content-type':'text/html; charset=utf-8'} });
          if (path === `${base}/export`) return new Response(JSON.stringify(result), { headers:{...headers,'content-disposition':'attachment; filename="hanamesh-activity.json"'} });
          return new Response(JSON.stringify({ ...result, health:api.health() }), { headers });
        } catch (error) {
          const code = error instanceof ActivityError && ['EXPORT_DISABLED','INVALID_FILTER'].includes(error.code) ? error.code : 'ACTIVITY_UNAVAILABLE';
          return new Response(JSON.stringify({ error:code }), { status:code === 'EXPORT_DISABLED' ? 403 : code === 'INVALID_FILTER' ? 400 : 503, headers });
        }
      },
    });
    ctx.effect(() => dispose);
  }
}
