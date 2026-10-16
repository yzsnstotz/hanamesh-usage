// Contract-only public settings response. Event request verifiers still inspect all signed event bytes.
export const sharedSettings={version:1,uploadIntervalMs:60000,catalogRefreshMs:300000,backfillWindowDays:30,countUnconfirmedCalls:false};
export function sharedSettingsResponse(url,options){
 return options?.method==='GET'&&new URL(url).pathname==='/v1/usage/settings'?Response.json(sharedSettings):null;
}
