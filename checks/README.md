# /checks — suíte de checagens (somente leitura)

Não altera código do app, não corrige nada, não toca em produção.

## Rodar
```bash
./checks/run_all.sh        # ou: make -C checks check
```
Na 1ª vez cria `checks/.venv` e `checks/node_modules` (só dev; nada vai ao deploy — a Vercel só lê o `requirements.txt`
da raiz e não há `package.json` na raiz). Roda A→G sem parar se uma falhar, imprime a tabela e sai com **exit 1** se houver
achado **bloqueante** (não aceito) ou erro de execução. Relatórios em `checks/reports/` (ignorado pelo git):
`SUMMARY.md` (consolidado, por gravidade) + `A-dependencias.md … G-headers.md` (+ `.json`/`.log`).

## O que roda
| | Checagem | Ferramenta | Bloqueia em |
|---|---|---|---|
| A | Dependências vulneráveis | pip-audit (+ npm audit se houver `package.json` na raiz) | alta/crítica (pip-audit não informa severidade → tratada como alta) |
| B | Segredos (árvore + histórico git) | gitleaks se disponível (`checks/bin/` ou PATH); senão detect-secrets | qualquer achado (valor nunca é gravado; só arquivo, linha, tipo, máscara) |
| C | Lint | ruff, eslint (JS + `<script>` inline), html-validate | só erro de sintaxe |
| D | Lighthouse mobile + PWA instalável | lighthouse + Chromium (CDP) | PWA não instalável |
| E | Acessibilidade/contraste | axe-core + Playwright; 3 acentos × (cor primária/secundária) × claro/escuro | axe `serious`/`critical` |
| F | Tamanho/orçamento | script próprio | nunca (alerta) |
| G | Cabeçalhos/PWA (passivo) + inspeção do limite de login | GETs simples + leitura de código | `sw.js` com cache longo, HTTPS ausente |

Orçamentos em `budgets.json`. Telas: login do aluno, home do aluno, execução do treino, painel do profissional.

## Alvo (BASE_URL) e variáveis — ver `.env.example` (copie para `checks/.env`)
- **Sem `BASE_URL`** (padrão): sobe `lib/dev_server.py` em `127.0.0.1:$DEV_PORT` (8765) com **dados sintéticos, sem banco**
  (rotas do `vercel.json` + API falsa em memória). Telas autenticadas rodam com esses dados. G não avalia cabeçalhos ao vivo
  (refletiriam o servidor de teste, não a Vercel).
- **Com `BASE_URL`** = preview da Vercel (branch de teste do Neon): telas autenticadas só rodam se houver
  `TEST_STUDENT_TOKEN` + `TEST_PERSONAL_ID` (aluno) e/ou `TEST_PRO_TOKEN` (profissional); senão são **puladas** (nunca falham).
  Elas passam por um proxy local que repassa só GET/HEAD e **bloqueia qualquer escrita**. A suíte recusa a URL de produção.
- `CHECKS_ONLY="A B C F"` roda só algumas checagens (usado no CI).

## Interpretar
`FALHOU` = há bloqueante · `ALERTA` = só não-bloqueantes · `OK` · `PULADO` · `ERRO` (a checagem quebrou; conta como falha).
Cada achado tem `id` estável (hash de checagem+regra+local, sem nº de linha no lint).

## Aceitar um achado (baseline)
Copie o `id` do `SUMMARY.md` para `baseline.json`:
```json
{"accepted": [{"id": "2e808592ce8e", "reason": "falso positivo: 'client_key' não é segredo", "date": "2026-10-08"}]}
```
Achado aceito não bloqueia e aparece como “aceito”. Itens do baseline que sumiram são listados no resumo para limpeza.

## Ferramentas instaladas (e por quê) — todas só dev
- Python (`requirements-dev.txt`): **pip-audit** (A), **detect-secrets** (B, fallback do gitleaks), **ruff** (C).
- Node (`package.json`): **lighthouse** (D), **playwright-core** + **@axe-core/playwright** (D/E; usa o Chromium já instalado, sem baixar navegador),
  **eslint** + `@eslint/js` + `globals` (C), **html-validate** (C).
- Opcional: **gitleaks** (binário) — coloque em `checks/bin/gitleaks` ou no PATH.
