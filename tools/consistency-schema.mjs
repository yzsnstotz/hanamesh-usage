/** Local X01 checker. Not a claimed public consistency-kit implementation. */
export function validateConsistency(v){
  const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const text=x=>typeof x==='string'&&x.trim().length>0;
  const demand=(ok,msg)=>{if(!ok)throw Error(`INVALID_CONSISTENCY:${msg}`);};
  demand(obj(v),'object');demand(Object.keys(v).every(k=>['module','groups','boundaries','exempt','why'].includes(k)),'unknown-field');
  demand(v.module==='activity','module');demand(typeof v.exempt==='boolean','exempt');demand(Array.isArray(v.groups)&&Array.isArray(v.boundaries),'arrays');
  if(v.exempt||v.groups.length===0)demand(text(v.why),'empty-reason');
  if(v.exempt)demand(v.groups.length===0&&v.boundaries.length===0,'exempt-state');
  const names=new Set();
  for(const g of v.groups){demand(obj(g),'group');demand(Object.keys(g).sort().join(',')==='facts,medium,name,why','group-fields');demand(text(g.name)&&text(g.medium)&&text(g.why),'group-text');demand(Array.isArray(g.facts)&&g.facts.length>=2&&g.facts.every(text)&&new Set(g.facts).size===g.facts.length,'facts');demand(!names.has(g.name),'duplicate');names.add(g.name);}
  for(const b of v.boundaries){demand(obj(b),'boundary');demand(Object.keys(b).sort().join(',')==='name,safeDirection,sides,why','boundary-fields');demand(text(b.name)&&text(b.why),'boundary-text');demand(Array.isArray(b.sides)&&b.sides.length===2&&b.sides.every(text)&&b.sides[0]!==b.sides[1],'sides');demand(b.sides.includes(b.safeDirection),'safe-side');demand(!names.has(b.name),'duplicate');names.add(b.name);}
}
