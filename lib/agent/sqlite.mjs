// Filter only Node's exact, known SQLite experimental notice during this import. Other warnings/errors retain Node handling.
let loading;
export function sqlite(){
 if(!loading)loading=(async()=>{
  const original=process.emitWarning;
  process.emitWarning=function(warning,...args){
   const message=typeof warning==='string'?warning:warning?.message,type=typeof args[0]==='string'?args[0]:args[0]?.type??warning?.name;
   if(message==='SQLite is an experimental feature and might change at any time'&&type==='ExperimentalWarning')return;
   return Reflect.apply(original,this,[warning,...args]);
  };
  try{return await import('node:sqlite');}finally{process.emitWarning=original;}
 })();
 return loading;
}
