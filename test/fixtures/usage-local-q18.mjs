// SOURCE/FIXTURE handoff for J1S4-APIC-13. Actual Usage implementation in a
// synthetic host; no server, model, shared file or private signing key access.
import {fixtureHost} from '../../tests/fixtures/host.mjs';
export const USAGE_LOCAL_Q18_FIXTURE_LABEL='FIXTURE · Usage Q18 provider · synthetic host/storage, no real clients/server';
export async function createUsageLocalQ18Fixture(options={}){
  const host=await fixtureHost({bound:false,consent:'granted',...options});
  return {label:USAGE_LOCAL_Q18_FIXTURE_LABEL,service:{record:host.api.record,health:host.api.health},setConsent:host.setConsent,close:host.close};
}
export async function createUsageLocalQ18Examples(){
  const fixture=await createUsageLocalQ18Fixture();
  const input={hanaRef:'@hanamesh/example-app',action:'use',occurredAt:new Date().toISOString(),sourcePlugin:'@hanamesh/example-app',idempotencyKey:'command:source-operation-1:succeeded',targetRef:'source-operation-1',receipt:{providerId:'fixture',model:null,count:1}};
  try{
    const recorded=await fixture.service.record(input),duplicate=await fixture.service.record(structuredClone(input));
    const conflict=await fixture.service.record({...input,receipt:{...input.receipt,count:2}});
    const {occurredAt,...missingTime}=input;
    const gap=await fixture.service.record(missingTime);
    fixture.setConsent('withheld');
    const withheld=await fixture.service.record(input);
    return {label:fixture.label,input,results:{recorded,duplicate,conflict,gap,withheld},health:fixture.service.health()};
  }finally{await fixture.close();}
}
