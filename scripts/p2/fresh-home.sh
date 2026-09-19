#!/bin/sh
set -eu
ROOT=$1
case "$ROOT" in /tmp/hm-p2.*|/private/tmp/hm-p2.*) ;; *) echo "root must be a fresh hm-p2 temp directory" >&2; exit 64;; esac
REPO=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
DSH=${DSH:-"$REPO/../../hanamesh-dsh-runtime/runtime/node_modules/.bin/dsh"}
test -x "$DSH"
mkdir -p "$ROOT/home"
export DSH_HOME="$ROOT/home"
"$DSH" --profile usage --from-default-profile web --dump-config >/dev/null
find "$DSH_HOME" -maxdepth 4 -type f \( -name '.credentials*' -o -name '*credentials*.json' \) -delete
printf '%s\n' "DSH_HOME=$DSH_HOME" "DSH=$DSH" > "$ROOT/environment"
