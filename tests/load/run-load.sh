#!/usr/bin/env bash
# Teste de carga LOCAL (cópia de teste descartável): Postgres + api.py real (+ pgbouncer opcional) + k6.
# Nada toca em produção; tudo vive em /tmp. Uso:
#   MODE=direct|pooled PROFILE=stress|baseline STUDENTS=250 API_WORKERS=4 PG_MAXCONN=100 LABEL=nome tests/load/run-load.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(dirname "$(dirname "$HERE")")"; E2E="$ROOT/tests/e2e"
MODE="${MODE:-direct}"; PROFILE="${PROFILE:-stress}"; STUDENTS="${STUDENTS:-250}"; API_WORKERS="${API_WORKERS:-4}"
PG_MAXCONN="${PG_MAXCONN:-100}"; POOL_SIZE="${POOL_SIZE:-50}"; LABEL="${LABEL:-$PROFILE-$MODE}"; K6="${K6:-$(command -v k6 || echo /root/go/bin/k6)}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"; PY="$E2E/local/.venv/bin"
D="$(mktemp -d /tmp/load-pg.XXXXXX)"; chmod 755 "$D"; chown postgres "$D" 2>/dev/null
PGPORT=54330; APIPORT=8130; BOUNCER=6432; PIDS=(); mkdir -p "$HERE/reports"
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; run_pg "$PGBIN/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1; rm -rf "$D"; }
trap cleanup EXIT

run_pg "$PGBIN/initdb -D $D/data -A trust -U postgres" >/dev/null || exit 2
run_pg "$PGBIN/pg_ctl -D $D/data -o '-p $PGPORT -k $D -c listen_addresses=127.0.0.1 -c max_connections=$PG_MAXCONN -c log_min_messages=fatal' -l $D/pg.log -w start" >/dev/null || { cat "$D/pg.log"; exit 2; }
run_pg "$PGBIN/createdb -h 127.0.0.1 -p $PGPORT -U postgres load"
DIRECT="postgresql://postgres@127.0.0.1:$PGPORT/load"
run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d load -q -f $E2E/local/base-schema.sql" >/dev/null
export JWT_SECRET="load-local-only-secret" ADMIN_KEY="load-local-admin" APP_ENV=test
unset RESEND_API_KEY ANTHROPIC_API_KEY

# 1) migra o schema com UM worker (evita corrida de ALTER TABLE entre workers)
export DATABASE_URL="$DIRECT"
( cd "$ROOT" && exec "$PY/uvicorn" api:app --port $APIPORT --log-level warning ) >"$D/api0.log" 2>&1 & P=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$APIPORT/api/aluno/termos" && break; sleep 0.5; done; kill $P; wait $P 2>/dev/null

# 2) seed de alunos falsos (guard: só host em TEST_DB_HOST_ALLOWLIST)
( cd "$E2E" && TEST_DB_HOST_ALLOWLIST=127.0.0.1 node fixtures/seed-load.mjs seed --students="$STUDENTS" --out="$HERE/reports/load-data.json" ) || exit 2

# 3) pooler (simula a connection string -pooler do Neon) ou conexão direta
if [ "$MODE" = pooled ]; then
  cat >"$D/pgb.ini" <<INI
[databases]
load = host=127.0.0.1 port=$PGPORT dbname=load user=postgres
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = $BOUNCER
auth_type = trust
auth_file = $D/users.txt
pool_mode = transaction
default_pool_size = $POOL_SIZE
max_client_conn = 2000
logfile = $D/pgb.log
pidfile = $D/pgb.pid
INI
  echo '"postgres" ""' >"$D/users.txt"; chown postgres "$D/users.txt" "$D/pgb.ini" 2>/dev/null
  run_pg "pgbouncer -q $D/pgb.ini" & PIDS+=($!); sleep 2   # pgbouncer não roda como root
  export DATABASE_URL="postgresql://postgres@127.0.0.1:$BOUNCER/load"
fi

# 4) api.py real com vários processos (aproxima instâncias serverless concorrentes; 1 conexão por requisição, como no get_db)
( cd "$ROOT" && exec "$PY/uvicorn" api:app --port $APIPORT --workers "$API_WORKERS" --log-level warning ) >"$D/api.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 80); do curl -s -o /dev/null "http://127.0.0.1:$APIPORT/api/aluno/termos" && break; sleep 0.5; done

# 5) auditoria de índices/planos (volume real do seed) — antes da carga
run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d load -X -q -f $HERE/index-audit.sql" >"$HERE/reports/index-audit-$LABEL.txt" 2>&1

# 6) amostra conexões abertas no Postgres a cada 1s durante a carga
( while true; do run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d load -Atc \"select count(*) from pg_stat_activity where datname='load'\""; sleep 1; done ) >"$D/conns.txt" 2>/dev/null & PIDS+=($!)

# 7) k6
echo "▶ k6 [$LABEL] modo=$MODE perfil=$PROFILE alunos=$STUDENTS workers=$API_WORKERS max_connections=$PG_MAXCONN"
( cd "$HERE/k6" && BASE_URL="http://127.0.0.1:$APIPORT" PROFILE="$PROFILE" LABEL="$LABEL" "$K6" run --quiet --no-color meridian.js ) >"$HERE/reports/k6-$LABEL.log" 2>&1
echo "k6 exit=$?"

# 8) coleta pós-carga
sort -n "$D/conns.txt" | tail -1 >"$HERE/reports/peak-conns-$LABEL.txt"
grep -ci "too many clients\|remaining connection slots" "$D/api.log" >"$HERE/reports/conn-errors-$LABEL.txt"
run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d load -Atc \"select 'login_codes_known_email='||count(*) from login_codes where email like 'aluno%@load.meridian.test'; \" " >"$HERE/reports/db-after-$LABEL.txt"
run_pg "$PGBIN/psql -h 127.0.0.1 -p $PGPORT -U postgres -d load -Atc \"select 'auth_rate_limit_rows='||count(*) from auth_rate_limit; select 'executions_total='||count(*) from workout_executions; select 'duplicated_client_keys='||(select count(*) from (select client_key from workout_executions group by 1 having count(*)>1) x); select 'sets_total='||count(*) from workout_execution_sets;\"" >>"$HERE/reports/db-after-$LABEL.txt"
grep -c "Traceback" "$D/api.log" >"$HERE/reports/tracebacks-$LABEL.txt"
tail -5 "$D/api.log" >"$HERE/reports/api-tail-$LABEL.txt"
echo "ok → $HERE/reports (k6-$LABEL.json)"
