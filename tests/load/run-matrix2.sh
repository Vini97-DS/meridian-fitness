#!/usr/bin/env bash
# Segunda bateria: com pooler e com limite de conexões do banco reduzido (mostra o modo de falha "conexões esgotadas").
set -u; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE=pooled PROFILE=stress STUDENTS=250 POOL_SIZE=50 LABEL=stress-pooler "$HERE/run-load.sh"
MODE=direct PROFILE=stress STUDENTS=250 PG_MAXCONN=40 LABEL=stress-direto-max40 "$HERE/run-load.sh"
MODE=pooled PROFILE=stress STUDENTS=250 PG_MAXCONN=40 POOL_SIZE=30 LABEL=stress-pooler-max40 "$HERE/run-load.sh"
python3 "$HERE/report.py" stress-direto stress-pooler stress-direto-max40 stress-pooler-max40
