// @ts-check
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** @type {Array<(this:any)=>void>} */
const initializers=[];
/** Public Remote decorators expressed as standard initializers for the JS host build. */
export class UsagePagesRemote extends TypertRemoteService {
 /** @param {import('@deepseek-ai/cordis').Context} ctx @param {ReturnType<import('./page-facts.js').createPageFacts>} pages */
 constructor(ctx,pages){super(ctx,'hanameshUsagePages',{namespace:'hanameshUsagePages'});this.pages=pages;this.peers=new WeakSet();for(const initialize of initializers)initialize.call(this);}
 peer(){const peer=this.ctx.invocation?.peer;if(!peer)throw new Error('USAGE_PAGE_PEER_REQUIRED');if(!this.peers.has(peer)){this.peers.add(peer);peer.ctx.effect(()=>()=>this.pages.release(peer));}return peer;}
 /** @param {unknown} request */
 issue(request){return this.pages.issue(this.peer(),request);}
 /** @param {unknown} request */
 presented(request){return this.pages.presented(this.peer(),request);}
}
for(const name of ['issue','presented']){
 const method=/** @type {'issue'|'presented'} */(name);
 Remote(UsagePagesRemote.prototype[method],{kind:'method',name:method,static:false,private:false,access:{has:object=>method in object,get:object=>Reflect.get(object,method)},addInitializer:initialize=>{initializers.push(initialize);},metadata:undefined});
}
/** @param {import('@deepseek-ai/cordis').Context} ctx @param {ReturnType<import('./page-facts.js').createPageFacts>} pages */
export function mountPagesRemote(ctx,pages){new UsagePagesRemote(ctx,pages);}
