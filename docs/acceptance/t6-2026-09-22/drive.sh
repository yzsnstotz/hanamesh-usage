#!/bin/bash
set -u
S=$1; PORT=$(cat $S/port); H="http://127.0.0.1:$PORT"
post(){ curl -sS -b $S/cookies.txt -H 'content-type: application/json' -X POST -d "$2" "$H$1"; }
USE='{"hanaRef":"@hanamesh/app-vibe-trading","action":"use","idempotencyKey":"use:vibe:2026092118","sourcePlugin":"@hanamesh/dsh-app-host","targetRef":"vibe-trading","receipt":{"providerId":"deepseek","model":"deepseek-chat","count":12}}'
echo "== T6-01 withheld"; post /api/hanamesh/t6/record "$USE" | tee $S/T6-01-withheld.json; echo
echo "== grant"; post /api/hanamesh/core-standin/consent '{"state":"granted"}'; echo; sleep 1
echo "== T6-02 recorded"; post /api/hanamesh/t6/record "$USE" | tee $S/T6-02-recorded.json; echo
echo "== T6-03 duplicate"; post /api/hanamesh/t6/record "$USE" | tee $S/T6-03-duplicate.json; echo
echo "== T6-04 conflict"; post /api/hanamesh/t6/record "${USE/\"count\":12/\"count\":13}" | tee $S/T6-04-conflict.json; echo
echo "== T6-05 receipt on open rejected"; post /api/hanamesh/t6/record '{"hanaRef":"@hanamesh/app-vibe-trading","action":"open","idempotencyKey":"open:vibe:1","sourcePlugin":"@hanamesh/dsh-app-host","receipt":{"providerId":"deepseek","model":null,"count":1}}' | tee $S/T6-05-open-receipt-rejected.json; echo
echo "== T6-06 open with sourceHanaRef"; post /api/hanamesh/t6/record '{"hanaRef":"@hanamesh/app-vibe-trading","action":"open","idempotencyKey":"open:vibe:1","sourcePlugin":"@hanamesh/dsh-app-host","sourceHanaRef":"@hanamesh/recommender"}' | tee $S/T6-06-open-source.json; echo
echo "== T6-07 events"; curl -sS -b $S/cookies.txt "$H/api/hanamesh/usage/events?state=pending&limit=1000" > $S/T6-07-events.json
python3 - "$S/T6-07-events.json" <<'PY'
import json,sys;d=json.load(open(sys.argv[1]));print('total',d['total'])
for e in d['events']:
    if e['source']=='seat': print(e['action'],e['hanaRef'],e['sourceHanaRef'],e['targetRef'],e['receipt'],e['upload']['state'],e['eventId'])
loader=[e for e in d['events'] if e['source']!='seat'];print('non-seat events',len(loader),'all have receipt key None:',all(e.get('receipt') is None for e in loader))
PY
echo "== T6-08 view"; curl -sS -b $S/cookies.txt "$H/api/hanamesh/usage/view" > $S/T6-08-view.html; grep -o "回执（供应商 / 模型 × 次数）" $S/T6-08-view.html | head -1; grep -o "deepseek / deepseek-chat × 12" $S/T6-08-view.html | head -1
echo "== T6-09 health"; curl -sS -b $S/cookies.txt "$H/api/hanamesh/usage/health" | tee $S/T6-09-health.json; echo
