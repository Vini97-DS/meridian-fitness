#!/usr/bin/env bash
# Roda a matriz de cenários em sequência (≈6 min cada). Resultado em reports/RESULTADO.md
set -u; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE=direct PROFILE=baseline STUDENTS=250 LABEL=baseline-direto "$HERE/run-load.sh"
MODE=direct PROFILE=stress   STUDENTS=250 LABEL=stress-direto   "$HERE/run-load.sh"
MODE=pooled PROFILE=stress   STUDENTS=250 LABEL=stress-pooler   "$HERE/run-load.sh"
python3 "$HERE/report.py" baseline-direto stress-direto stress-pooler
