// @ts-check

/** @typedef {{entryId:string,moduleName:string}} CommandSource */
/** @typedef {{commandName:string,seq:number,source:CommandSource|null}} PendingCommand */

/** Capture only a Loader identity, including an injected child's owning ancestor.
 * @param {any} caller
 * @returns {CommandSource|null}
 */
function ownerOf(caller) {
  const seen=new Set();
  for(let fiber=caller?.fiber;fiber&&!seen.has(fiber);fiber=fiber.parent?.fiber) {
    seen.add(fiber);
    const entry=fiber.entry;
    if(!entry)continue;
    if(typeof entry.id!=='string'||typeof entry.options?.name!=='string'||entry.options.group)return null;
    return Object.freeze({entryId:entry.id,moduleName:entry.options.name});
  }
  return null;
}

/** Produce Usage-owned facts from native command registrations and original session edges.
 * No service implementation, session identity, arguments or result text is persisted here.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {(fact:unknown)=>void} accept
 * @param {number} maxPending
 */
export function mountCommandFacts(ctx,accept,maxPending) {
  /** @type {Map<object,Map<string,PendingCommand>>} */
  const pending=new Map();
  let count=0,closed=false;
  const stop=ctx.on('internal/get',(caller,name,_error,next)=>{
    const service=next();
    if(closed||name!=='commands'||!service||typeof service.register!=='function')return service;
    // `next()` is already Cordis-traced to the caller. Preserve that receiver,
    // scoped registration effect, validation, return value and native disposer.
    return new Proxy(service,{
      get(target,key) {
        const member=Reflect.get(target,key,target);
        if(key!=='register'||typeof member!=='function')return typeof member==='function'?member.bind(target):member;
        return (/** @type {any} */ definition)=>{
          if(closed||!definition||typeof definition.handler!=='function')return Reflect.apply(member,target,[definition]);
          const source=ownerOf(caller),handler=definition.handler,commandName=definition.name;
          const wrapped={...definition,handler:function(/** @type {any} */ invocation) {
            if(!closed&&source!==null) {
              const item=pending.get(invocation?.agent?.session)?.get(invocation?.commandId);
              if(item&&item.commandName===commandName)item.source=source;
            }
            return Reflect.apply(handler,this,[invocation]);
          }};
          return Reflect.apply(member,target,[wrapped]);
        };
      },
    });
  });
  const stopDisposed=ctx.on('session/disposed',session=>{
    const commands=pending.get(session);
    if(commands){count-=commands.size;pending.delete(session);}
  });
  return {
    /** @param {import('@deepseek-ai/dsh-session').Session} session @param {unknown} event */
    observe(session,event) {
      if(closed||!event||typeof event!=='object')return;
      const edge=/** @type {{type?:unknown,seq?:unknown,time?:unknown,data?:{commandId?:unknown,name?:unknown,kind?:unknown}}} */(event);
      if(edge.type!=='command/run'&&edge.type!=='command/done')return;
      const data=edge.data;
      if(!data||typeof data.commandId!=='string'||data.commandId.length===0||typeof edge.seq!=='number'||!Number.isSafeInteger(edge.seq)||edge.seq<0||!session.isOwnSeq(/** @type {import('@deepseek-ai/dsh-session').SessionSeq} */(edge.seq)))return;
      let commands=pending.get(session);
      if(edge.type==='command/run') {
        if(typeof data.name!=='string'||commands?.has(data.commandId)||count>=maxPending)return;
        if(!commands){commands=new Map();pending.set(session,commands);}
        commands.set(data.commandId,{commandName:data.name,seq:edge.seq,source:null});count++;
        return;
      }
      const item=commands?.get(data.commandId);
      if(!commands||!item||edge.seq<=item.seq)return;
      commands.delete(data.commandId);count--;
      if(commands.size===0)pending.delete(session);
      if(data.kind!=='success'||item.source===null||typeof edge.time!=='number'||!Number.isSafeInteger(edge.time))return;
      accept(Object.freeze({commandId:data.commandId,phase:'succeeded',commandName:item.commandName,source:item.source,occurredAt:edge.time}));
    },
    close(){if(closed)return;closed=true;stop();stopDisposed();pending.clear();count=0;},
  };
}
