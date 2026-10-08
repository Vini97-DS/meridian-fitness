# tests/load — teste de carga (k6)

Mede latência (p95) do app do aluno e do painel com ~250 alunos **falsos**, numa cópia de teste descartável. Nada toca em produção.

```bash
tests/load/run-matrix.sh          # baseline(40) + stress(250) direto + stress com pooler  (≈6 min cada)
tests/load/run-matrix2.sh         # pooler + limite de conexões do banco reduzido (mostra "conexões esgotadas")
MODE=direct|pooled PROFILE=baseline|stress STUDENTS=250 API_WORKERS=4 PG_MAXCONN=100 POOL_SIZE=50 LABEL=x tests/load/run-load.sh   # 1 execução
python3 tests/load/report.py <labels...>   # tabelas p95 por cenário/endpoint → reports/RESULTADO.md
```
Requer `k6` (no PATH ou `K6=...`), Postgres (binários do servidor) e, para `MODE=pooled`, `pgbouncer`.
**Contra um branch de teste do Neon** (em vez do Postgres local): rode `node tests/e2e/fixtures/seed-load.mjs seed --students=250` com `DATABASE_URL` do branch de teste,
`TEST_DB_HOST_ALLOWLIST` e `JWT_SECRET` de teste (o seed se recusa em produção), e `k6 run` em `tests/load/k6/meridian.js` com `BASE_URL=<preview de teste>`. `... seed-load.mjs clean` remove tudo.

Cenários (k6/meridian.js): `students_peak` (abre o app + treino completo, rampa até 250 VUs), `pro_dashboard` (4 personais),
`offline_herd` (150 celulares reenviando a fila ao mesmo tempo, sem espera), `offline_herd_jitter` (idem, com espera aleatória 0–15 s), `login_abuse` (1 IP).
Orçamentos de p95 por endpoint estão no topo do script. Os tempos de pensar/descansar são **encurtados** (descanso real ≈ 60 s), então a carga é maior que a real.
`index-audit.sql` roda EXPLAIN ANALYZE das consultas quentes com o volume do seed; `recomendacoes-indices.sql` lista índices sugeridos (**não aplicados**).
