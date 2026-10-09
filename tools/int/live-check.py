"""Card-owned live observer checks; never creates usage records or changes timers."""
import json, sys, time, subprocess, urllib.request
from pathlib import Path
CONTROL = Path(sys.argv[1]).resolve()
if CONTROL.parent != Path('/Users/yzliu/.cache/hanamesh-runs/P04-USAGE-INT-01') or not CONTROL.name.startswith('control-'):
    raise ValueError('CONTROL_NOT_THIS_CARD')
OUT = CONTROL / 'evidence'
OUT.mkdir(exist_ok=True)
MAIN = 'qQZ6SDAcckArVBoOHzEtbx17vrLU-by3UhxA_vB815w'
OTHER = 'GlddWEuTPx1eM81_a8pYNt9byskcX8KoM4GEG0sf2Cg'
def save(name, value):
    (OUT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def observer(op, method='GET', port=62153):
    with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/{op}', method=method), timeout=10) as r:
        return json.load(r)
def pg():
    sql = f"BEGIN READ ONLY; SELECT COALESCE(json_agg(t ORDER BY event_id),'[]'::json) FROM (SELECT event_id, device_id, principal_id, hana_ref, action, occurred_at, received_at FROM usage.events WHERE device_id IN ('{MAIN}','{OTHER}')) t; COMMIT;"
    r = subprocess.run(['/opt/homebrew/bin/docker','--host','unix:///Users/yzliu/.colima/default/docker.sock','exec','-i','hanamesh-p04-real-99f45855-pg','psql','-h','127.0.0.1','-v','ON_ERROR_STOP=1','-qAt','-U','postgres','-d','hm_local','-c',sql], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)
mode=sys.argv[2]
if mode == 'snapshot':
    prefix=sys.argv[3]
    for name,port in [('main',62153),('other',55132)]:
        for op in ['state','remote']: save(f'{prefix}-{name}-{op}',observer(op,port=port))
    rows=pg();save(prefix+'-pg',rows)
    print(json.dumps({'prefix':prefix,'PG':len(rows)}))
elif mode == 'atomic-watch':
    OUT=OUT/'atomic-signature'
    OUT.mkdir(exist_ok=True)
    initial=observer('state'); known={f['commandId'] for f in initial['facts']}
    save('atomic-watch-baseline',initial)
    print('WATCH_READY', flush=True)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        state=observer('state')
        facts=[f for f in state['facts'] if f['commandId'] not in known]
        if not facts:
            time.sleep(.05); continue
        fact=facts[-1]
        event=next((e for e in state['panel']['events'] if e['evidenceRef']==f"command:{fact['commandId']}:succeeded"),None)
        if event is None:
            save('atomic-not-eligible',{'fact':fact,'reason':'NO_REAL_EVENT'});break
        rows=pg();save('atomic-before-pg',rows);save('atomic-before-state',state)
        absent=not any(r['event_id']==event['eventId'] for r in rows)
        eligible=absent and event['action']=='use' and event['signature']['state']=='success' and event['upload']['state']=='pending' and event['upload']['attempts']==0
        if not eligible:
            save('atomic-not-eligible',{'event':event,'absentFromPG':absent});print('NOT_ELIGIBLE');break
        # Existing observer uses wireEvent(actual event) and real Core.signRequest.
        # Second item has invalid signature with legal shape; no fabricated local record is stored.
        response=observer('rejectBatch',method='POST');save('atomic-reject-response',response)
        after=pg();save('atomic-after-pg',after)
        result={'commandId':fact['commandId'],'eventId':event['eventId'],'firstRealSignedPendingUse':True,'firstAbsentBefore':absent,'firstAbsentAfter':not any(r['event_id']==event['eventId'] for r in after),'allRowsUnchanged':rows==after,'response':response,'noTimerOrProviderChanges':True}
        save('atomic-result',result);print(json.dumps(result));break
    else:
        save('atomic-not-eligible',{'reason':'NO_NEW_NATIVE_EVENT_WITHIN_OBSERVATION_WINDOW'});print('NO_NEW_FACT')
else: raise ValueError('UNKNOWN_MODE')
