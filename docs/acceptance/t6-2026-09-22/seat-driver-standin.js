// T6 real-gate driver (STANDIN): forwards a JSON body to ctx.hanameshUsage.record() so the seat can be exercised on a real DSH host.
export const name='hanamesh-t6-seat-driver';
export const inject=['connection','hanameshUsage'];
export function apply(ctx){
  const dispose=ctx.connection.fetch.register({path:'/api/hanamesh/t6/record',methods:['POST'],requestBody:'buffered',fetch:async request=>{
    try{const input=await request.json();const result=await ctx.hanameshUsage.record(input);return new Response(JSON.stringify(result),{headers:{'content-type':'application/json','cache-control':'no-store'}});}
    catch(error){return new Response(JSON.stringify({error:String(error?.code??'DRIVER_FAILED')}),{status:500,headers:{'content-type':'application/json'}});}
  }});
  ctx.effect(()=>async()=>{await dispose();});
}
