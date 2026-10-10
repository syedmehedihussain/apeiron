#!/bin/sh
# Calls the running Cherry daemon's API from a terminal or from Claude Code.
#
#   api.sh GET  /api/projects
#   api.sh POST /api/projects/core/scans/security/run
#   api.sh POST /api/projects/core/chat '{"text":"What is next?"}'
#
# It signs in the way the browser does: it asks the daemon for a login code with the CLI secret
# in ~/.cherry/run/daemon.json (readable only by you), trades it for a session cookie, and keeps
# the cookie in ~/.cherry/run/skill-cookies.txt (0600). `cherry logout` ends that session too.
set -eu

METHOD="${1:?usage: api.sh METHOD PATH [JSON]}"
ROUTE="${2:?usage: api.sh METHOD PATH [JSON]}"
BODY="${3:-}"

HOME_DIR="${CHERRY_HOME:-$HOME/.cherry}"
RUN="$HOME_DIR/run/daemon.json"
JAR="$HOME_DIR/run/skill-cookies.txt"

if [ ! -f "$RUN" ]; then
  echo "Cherry is not running. Start it with \`cherry\` (or \`pnpm dev\` in the repo)." >&2
  exit 2
fi

# Port and CLI secret, read without printing the secret.
field() { node -e "const r=require(process.argv[1]);process.stdout.write(String(r[process.argv[2]]))" "$RUN" "$1"; }
PORT="$(field port)"
PID="$(field pid)"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "Cherry is not running (stale $RUN). Start it with \`cherry\`." >&2
  exit 2
fi
BASE="http://127.0.0.1:$PORT"

login() {
  umask 077
  code="$(curl -sf -X POST -H "x-cherry-cli: $(field cliSecret)" "$BASE/api/cli/login-code" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).code))")"
  curl -sf -c "$JAR" -H 'content-type: application/json' \
    -d "{\"code\":\"$code\"}" "$BASE/api/session" >/dev/null
}

call() {
  if [ -n "$BODY" ]; then
    curl -s -b "$JAR" -o "$OUT" -w '%{http_code}' -X "$METHOD" \
      -H 'content-type: application/json' -d "$BODY" "$BASE$ROUTE"
  else
    curl -s -b "$JAR" -o "$OUT" -w '%{http_code}' -X "$METHOD" "$BASE$ROUTE"
  fi
}

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
[ -f "$JAR" ] || login
STATUS="$(call)"
if [ "$STATUS" = 401 ]; then
  login
  STATUS="$(call)"
fi
cat "$OUT"
echo
case "$STATUS" in
  2*) exit 0 ;;
  *) echo "HTTP $STATUS" >&2; exit 1 ;;
esac
