#!/usr/bin/env bash
# Suíte de checagens SOMENTE LEITURA. Uso:  checks/run_all.sh   (ou: make check)
# Não altera código do app, não corrige nada, não toca em produção.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
cd "$ROOT"
[ -f "$HERE/.env" ] && { set -a; . "$HERE/.env"; set +a; }

# Segurança: recusa alvos que parecem produção.
BASE_URL="${BASE_URL:-}"
USER_BASE_URL="$BASE_URL"   # a URL informada pelo usuário (H usa só esta, nunca o servidor sintético)
if [ "${ALLOW_PRODUCTION_URL:-}" != "1" ] && [[ "$BASE_URL" == *"meridian-fitness.vercel.app"* && "$BASE_URL" != *"-git-"* ]]; then
  echo "✖ BASE_URL aponta para PRODUÇÃO ($BASE_URL). Use um preview da Vercel ligado ao branch de teste do Neon." >&2
  exit 2
fi

# ── bootstrap das ferramentas de dev (só dentro de /checks; nada vai ao deploy) ──
PY="$HERE/.venv/bin/python"
if [ ! -x "$PY" ]; then
  echo "• criando venv de checagens e instalando requirements-dev.txt…"
  python3 -m venv "$HERE/.venv" && "$HERE/.venv/bin/pip" install -q -r "$HERE/requirements-dev.txt" || { echo "falha ao instalar deps Python" >&2; exit 2; }
fi
if [ ! -d "$HERE/node_modules" ]; then
  echo "• instalando dependências Node de /checks…"
  (cd "$HERE" && { [ -f package-lock.json ] && npm ci --no-audit --no-fund || npm install --no-audit --no-fund; }) >/dev/null || { echo "falha ao instalar deps Node" >&2; exit 2; }
fi
rm -rf "$HERE/reports"; mkdir -p "$HERE/reports"

# ── alvo: servidor local sintético (padrão) ou BASE_URL remota ──
DEV_PORT="${DEV_PORT:-8765}"; PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap cleanup EXIT
wait_up() { for _ in $(seq 1 50); do curl -s -o /dev/null "$1" && return 0; sleep 0.2; done; return 1; }
NEEDS_URL=1; [ -n "${CHECKS_ONLY:-}" ] && [[ " $CHECKS_ONLY " != *" D "* && " $CHECKS_ONLY " != *" E "* && " $CHECKS_ONLY " != *" G "* ]] && NEEDS_URL=0
if [ "$NEEDS_URL" = 0 ]; then
  echo "• CHECKS_ONLY='$CHECKS_ONLY' (não precisa de URL)"
elif [ -z "$BASE_URL" ]; then
  "$PY" "$HERE/lib/dev_server.py" --port "$DEV_PORT" --mode mock >/dev/null 2>&1 & PIDS+=($!)
  export BASE_URL="http://127.0.0.1:$DEV_PORT" AUTH_BASE="http://127.0.0.1:$DEV_PORT" AUTH_MODE=mock
  echo "• alvo: servidor local de teste $BASE_URL (dados SINTÉTICOS, sem banco)"
else
  export AUTH_MODE=remote
  if [ -n "${TEST_STUDENT_TOKEN:-}${TEST_PRO_TOKEN:-}" ]; then
    PPORT=$((DEV_PORT+1))
    "$PY" "$HERE/lib/dev_server.py" --port "$PPORT" --mode proxy --target "$BASE_URL" >/dev/null 2>&1 & PIDS+=($!)
    export AUTH_BASE="http://127.0.0.1:$PPORT"
    echo "• alvo remoto: $BASE_URL (telas autenticadas via proxy local SOMENTE-LEITURA, escritas bloqueadas)"
  else
    export AUTH_BASE=""
    echo "• alvo remoto: $BASE_URL (sem TEST_* tokens → telas autenticadas serão puladas)"
  fi
fi
if [ "$NEEDS_URL" = 1 ]; then
  wait_up "$BASE_URL/aluno" || { echo "servidor de teste não subiu" >&2; exit 2; }
  [ -n "${AUTH_BASE:-}" ] && wait_up "$AUTH_BASE/aluno" >/dev/null
fi

# ── executa tudo, sem parar se uma falhar ──
step() { # letra, descrição, comando…
  local k="$1" d="$2"; shift 2
  if [ -n "${CHECKS_ONLY:-}" ] && [[ " $CHECKS_ONLY " != *" $k "* ]]; then return 0; fi
  echo "▶ $k) $d"
  local log="$HERE/reports/$k.log"
  "$@" >"$log" 2>&1
  local rc=$?
  if [ $rc -ne 0 ] || [ ! -f "$HERE/reports/$k.json" ]; then
    "$PY" "$HERE/lib/common.py" --error "$k" "o script terminou com código $rc: $(tail -c 800 "$log")"
  fi
}
step A "dependências vulneráveis"   "$PY" "$HERE/a_deps.py"
step B "varredura de segredos"      "$PY" "$HERE/b_secrets.py"
step C "lint e qualidade estática"  "$PY" "$HERE/c_lint.py"
step D "Lighthouse + PWA"           node "$HERE/d_lighthouse.mjs"
step E "acessibilidade (axe)"       node "$HERE/e_axe.mjs"
step F "tamanho e orçamento"        "$PY" "$HERE/f_size.py"
step G "cabeçalhos e PWA"           "$PY" "$HERE/g_headers.py"
export USER_BASE_URL
step H "testes e2e (smoke)"         "$PY" "$HERE/h_e2e.py"

"$PY" "$HERE/summarize.py"
exit $?
