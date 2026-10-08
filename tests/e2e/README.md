# tests/e2e — testes de fumaça (Playwright)

Simulam uso do **app do aluno** e do **painel do profissional**. Escrevem dados (execuções de treino, tema do profissional),
por isso rodam **só num ambiente de TESTE**: preview da Vercel ligado a um **branch de teste do Neon**, ou localhost.
A suíte **recusa rodar** se `BASE_URL` estiver em `config.json → blockedHosts`, se `APP_ENV=production`, ou se o banco não
estiver na `TEST_DB_HOST_ALLOWLIST`. Não altera lógica do app e não usa `data-testid` (seletores por papel/texto; poucos ids existentes).

## Rodar
```bash
cd tests/e2e && npm install && npx playwright install chromium   # 1x (o iPhone/WebKit é opcional: npx playwright install webkit)
cp .env.example .env                                              # preencher (ver abaixo)
npm run e2e:smoke      # fluxos 1, 2, 3 e 5 (@smoke)
npm run e2e            # todos os fluxos (1–8)
npm run e2e:headed     # depurar, 1 worker, janela visível
```
Saída: resumo por fluxo (ok / **bug?** / **lacuna** / flaky). Falhas guardam screenshot, vídeo e trace em `reports/artifacts/`
(HTML em `reports/html`, ambos no `.gitignore`). Projetos: `android-pixel` (Chromium, Pixel 7) e `iphone-webkit` (só se o WebKit estiver instalado).

## Configurar o branch de teste
1. Crie um branch do Neon a partir do de produção (ou vazio), **nunca** use o de produção. Suba o app (preview da Vercel de um
   branch git de teste) com `DATABASE_URL` desse branch e um `JWT_SECRET` **de teste**; o startup do app cria as tabelas.
2. Em `tests/e2e/.env`: `BASE_URL` (preview), `APP_ENV=test`, `DATABASE_URL` (branch de teste), `TEST_DB_HOST_ALLOWLIST` (host desse branch).
3. `npm run seed` — cria profissional, aluno (+ conta/consentimento), ficha A/B/C com exercícios e 6 sessões antigas (7–16 dias atrás).
   Idempotente; `npm run seed:clean` remove tudo. Cenários de data (relativos a hoje): `node fixtures/seed.mjs seed --scenario=pendente-ontem|descanso|expirado|default`
   (os testes já trocam de cenário sozinhos e restauram o estado antes de cada teste).
4. Emita as sessões de teste: `JWT_SECRET=<secret do ambiente de TESTE> npm run tokens` → cole `TEST_STUDENT_TOKEN` e `TEST_PRO_TOKEN` no `.env`.
   (Os tokens usam os IDs fixos do seed. Nada é gravado em arquivo versionado.)

## Local (sem Neon)
`local/run-local.sh [args do playwright]` sobe um Postgres descartável, o `api.py` real, um gateway que imita o roteamento da Vercel,
roda seed + testes e destrói tudo. Usa `local/base-schema.sql` (reconstrução mínima das tabelas-base que o `api.py` não cria) — só para o harness local.

## Login por código
Os testes cobrem a UI até a tela do código, a rejeição de código errado e as tentativas repetidas, **sem concluir login**, usando um
e-mail inexistente (o backend responde igual e não envia e-mail). Não existe nem deve existir “porta dos fundos”.

## Lacunas conhecidas
Testes de funcionalidade que ainda **não existe** no app chamam `gap(test, "motivo")`: falham, mas aparecem como **lacuna** (não bug) e não
quebram o exit code (`E2E_STRICT_GAPS=1` conta como falha). Quando a funcionalidade for construída, o teste passa — remova o `gap(...)`.

## Adicionar um fluxo
Crie `specs/NN-nome.spec.mjs`; título começando com `N.` (número do fluxo, usado no resumo; acrescente em `FLOWS` de `lib/run.mjs`);
use `{ test, expect } from "../lib/test.mjs"` (fixtures `db`, `scenario`; estado resetado antes de cada teste) e os helpers de `lib/app.mjs`.
Adicione `@smoke` ao título para entrar no `e2e:smoke`. Datas: `lib/dates.mjs`. Dados novos: `lib/seed-lib.mjs` (idempotente, só ids `e2e…`).

## Integração com /checks
`checks/run_all.sh` roda a checagem **H · Testes e2e** (`e2e:smoke`) quando `BASE_URL`, `TEST_STUDENT_TOKEN`, `TEST_PRO_TOKEN`,
`DATABASE_URL` e `TEST_DB_HOST_ALLOWLIST` estão definidos; senão é **pulada com aviso**.
