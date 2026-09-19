#!/bin/sh
set -eu
ROOT=$1
PORT=$2
case "$ROOT" in /tmp/hm-p2.*|/private/tmp/hm-p2.*) ;; *) echo "root must be an hm-p2 temp directory" >&2; exit 64;; esac
test "$PORT" -ne 3080
. "$ROOT/environment"
export DSH_HOME
if test -f "$ROOT/boot.pid" && kill -0 "$(cat "$ROOT/boot.pid")" 2>/dev/null; then kill "$(cat "$ROOT/boot.pid")"; fi
: > "$ROOT/boot.log"
"$DSH" --profile usage --port "$PORT" --host 127.0.0.1 > "$ROOT/boot.log" 2>&1 &
PID=$!
printf '%s\n' "$PID" > "$ROOT/boot.pid"
I=0
while test "$I" -lt 600; do
  if ! kill -0 "$PID" 2>/dev/null; then sed -E 's/(token=)[^[:space:]]+/\1<REDACTED>/' "$ROOT/boot.log" >&2; exit 1; fi
  URL=$(sed -nE 's#.*dsh web: (http://127\.0\.0\.1:[0-9]+/\?token=[^[:space:]]+).*#\1#p' "$ROOT/boot.log" | tail -1)
  if test -n "$URL"; then
    curl -fsS -D "$ROOT/auth.headers" -c "$ROOT/cookies.txt" -o /dev/null "$URL"
    STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$ROOT/cookies.txt" "http://127.0.0.1:$PORT/")
    test "$STATUS" = 200
    printf '%s\n' "http://127.0.0.1:$PORT/?token=<REDACTED>"
    exit 0
  fi
  I=$((I+1)); sleep 0.1
done
kill "$PID" 2>/dev/null || true
echo "DSH announcement timeout" >&2
exit 1
