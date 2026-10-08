#!/usr/bin/env bash
# Harness LOCAL: Postgres descartável + api.py REAL + gateway estilo Vercel → roda a suíte e2e.
# Nada aqui toca em produção; tudo vive em /tmp e é destruído ao final.
# Uso: tests/e2e/local/run-local.sh [args do playwright]   (ex.: --grep @smoke)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; E2E="$(dirname "$HERE")"; ROOT="$(dirname "$(dirname "$E2E")")"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
[ -x "$PGBIN/initdb" ] || { echo "Postgres local não encontrado (precisa dos binários do servidor). Use um branch de teste do Neon (README)." >&2; exit 2; }
[ -x "$HERE/.venv/bin/uvicorn" ] || { python3 -m venv "$HERE/.venv" && "$HERE/.venv/bin/pip" install -q -r "$ROOT/requirements.txt"; }
D="$(mktemp -d /tmp/e2e-pg.XXXXXX)"; chmod 755 "$D"; chown postgres "$D" 2>/dev/null
PGPORT=54329; APIPORT=8123; GWPORT=8124; PIDS=()
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; run_pg "$PGBIN/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1; rm -rf "$D"; }
trap cleanup EXIT
run_pg "$PGBIN/initdb -D $D/data -A trust -U postgres" >/dev/null || exit 2
run_pg "$PGBIN/pg_ctl -D $D/data -o '-p $PGPORT -k $D -c listen_addresses=127.0.0.1' -l $D/pg.log -w start" >/dev/null || { cat "$D/pg.log"; exit 2; }
run_pg "$PGBIN/createdb -h 127.0.0.1 -p $PGPORT -U postgres e2e"
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/e2e"
run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d e2e -q -f $HERE/base-schema.sql" >/dev/null
export JWT_SECRET="e2e-local-only-secret" ADMIN_KEY="e2e-local-admin" APP_ENV=test
unset RESEND_API_KEY ANTHROPIC_API_KEY
( cd "$ROOT" && exec "$HERE/.venv/bin/uvicorn" api:app --port $APIPORT --log-level warning ) >"$D/api.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$APIPORT/api/aluno/termos" && break; sleep 0.5; done
"$HERE/.venv/bin/python" "$HERE/gateway.py" $GWPORT "http://127.0.0.1:$APIPORT" & PIDS+=($!)
sleep 1
export BASE_URL="http://127.0.0.1:$GWPORT" TEST_DB_HOST_ALLOWLIST="127.0.0.1"
cd "$E2E" || exit 2
node fixtures/seed.mjs seed || { echo "seed falhou"; tail -20 "$D/api.log"; exit 2; }
eval "$(node fixtures/issue-tokens.mjs --export)"
node lib/run.mjs "$@"; RC=$?
[ $RC -ne 0 ] && { echo "--- api.log (últimas linhas) ---"; tail -40 "$D/api.log"; }
exit $RC
