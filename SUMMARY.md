# SUMMARY — Resultados consolidados dos testes (Meridian Fitness Hub)

_Gerado em 2026-10-08 · branch `claude/gallant-lamport-mk987g` · nenhum arquivo do app foi alterado: tudo abaixo é diagnóstico._

Este documento reúne **todos os testes feitos até agora**, separados por origem, e transforma cada achado num item com **ID, tipo, prioridade e recomendação**, para decidirmos o que entra em cada rodada.

## 0. Como ler

**Origem dos achados (prefixo do ID)**

| Prefixo | Suíte | Onde fica | Como rodar |
|---|---|---|---|
| `CHK-A…G` | **Checagens estáticas e de qualidade** (deps, segredos, lint, Lighthouse, axe, tamanho, cabeçalhos) | `checks/` | `./checks/run_all.sh` (≈2,5 min) |
| `E2E-n.n` | **Testes de fumaça ponta a ponta** (Playwright, 8 fluxos) | `tests/e2e/` | `local/run-local.sh` (local) ou `npm run e2e:smoke` (branch de teste) |
| `LOAD-n` | **Teste de carga k6** (250 alunos falsos, p95) | `tests/load/` | `tests/load/run-matrix.sh` e `run-matrix2.sh` |
| `OBS-n` | **Observações** feitas lendo o código enquanto os testes eram escritos (não confirmadas por teste) | — | — |

**Tipo do item**

| Selo | Significado |
|---|---|
| 🐞 **BUG** | O app faz algo errado hoje |
| 🔒 **SEGURANÇA** | Risco de acesso indevido / segredo / dependência vulnerável |
| 💾 **DADOS** | Risco de perder ou duplicar dado do aluno |
| ⚡ **DESEMPENHO** | Lentidão ou risco sob carga |
| ♿ **A11Y** | Acessibilidade / contraste / toque |
| 🧩 **LACUNA** | Funcionalidade pedida na especificação que **ainda não existe** (o teste já está pronto e passa quando for construída) |
| 🧪 **TESTE/AMBIENTE** | Não é problema do app (falso positivo, limite do ambiente de teste) — já tratado ou documentado |

**Prioridade:** **P0** = resolver antes de crescer/usar com alunos reais · **P1** = próxima rodada · **P2** = melhoria / backlog.

## 1. Placar geral

| Suíte | Resultado | Resumo |
|---|---|---|
| Checagens (A–G) | ❌ 3 bloqueantes + alertas | A: 2 dependências vulneráveis · B: 1 achado (falso positivo) · C: 93 itens de lint (0 erro de sintaxe) · D: PWA instalável ✅, 1 alerta de LCP · E: 3 altos + 5 médios · F: ok · G: 2 médios + 3 baixos |
| E2E (47 testes, Android/Chromium) | **25 ok · 1 bug · 21 lacunas · 0 instáveis** | Smoke (fluxos 1,2,3,5): 28 testes em 282 s · completo: 404 s |
| Carga (5 execuções × 328 s) | ✅ latência boa · ❌ **fila offline** | p95 do tráfego contínuo com 250 alunos: **63 ms**; rajada de reenvio sem jitter: **1.309 ms** (76 % de falhas com o banco apertado) |

**Os 5 itens mais importantes (P0):** `LOAD-1` (fila offline descarta treino em erro 5xx) · `LOAD-2` (reenvio em rajada sem jitter) · `LOAD-3` (pool de conexões) · `OBS-1` (rota de perfil do profissional sem checagem de dono) · `CHK-A1/A2` (dependências sem correção).

---

## 2. Achados e recomendações (todos, por prioridade)

### P0 — resolver primeiro

| ID | Tipo | Onde | Evidência | Recomendação |
|---|---|---|---|---|
| **LOAD-1** | 💾 DADOS · 🐞 | `aluno.html:850` (`tryOrQueue`) e `:875` (`flushQueue`) | Qualquer resposta HTTP com `status` é tratada como erro de validação e o item é **descartado** da fila — inclui 500/502/503/504. Com o banco apertado (40 conexões) houve 908 falhas em 1.200 requisições da rajada; cada uma seria perdida pelo app. | Só descartar erros **definitivos** (400/403/404/409/422). Em 5xx, 429, 408 e erro de rede **manter na fila** e tentar de novo. No `tryOrQueue`, enfileirar também em 5xx. Teste de regressão: rodar `run-load.sh` com `PG_MAXCONN=40` e conferir que nenhuma execução some. |
| **LOAD-2** | ⚡ DESEMPENHO | `aluno.html:880` (`online` → `flushQueue()` imediato) e `:882` (`setInterval` fixo de 15 s) | 150 celulares reenviando juntos: p95 **1.309 ms** sem espera vs **60 ms** com espera aleatória de 0–15 s; com o banco apertado, **76 % de falhas vs 0 %**. | Backoff **exponencial com jitter** (ex.: base 2 s, ×2, teto 60 s, sorteio total) e atraso aleatório de 0–15 s ao receber o evento `online`. Opcional: enviar a fila em lote (uma chamada com várias séries). A idempotência por `client_key` já protege contra duplicar (0 duplicados em todas as execuções). |
| **LOAD-3** | ⚡ DESEMPENHO · infra | `api.py:52-55` (`get_db`) | Cada requisição abre uma conexão nova (sem pool). Pico: 15 → 51 conexões (40 → 250 alunos). Com o banco limitado a 40: **389 erros “too many clients”**; com pgbouncer (modo transação) no mesmo limite: **0 erros**. | Usar a string de conexão **com pool do Neon** (host `...-pooler...`) na `DATABASE_URL` da Vercel. O `CLAUDE.md` documenta o host **sem** `-pooler`: **conferir o valor real na Vercel**. Compatível com psycopg2 (sem prepared statements). |
| **OBS-1** | 🔒 SEGURANÇA (a confirmar) | `api.py` — `PATCH /api/personals/{id}` (≈l.2150) e `GET /api/personals/{id}` (≈l.2174) | Só exigem um profissional logado (`Depends(get_current_user)`); não chamam `_assert_own_personal`. Pelo código, um profissional poderia ler/alterar a marca e o perfil de outro. O `CLAUDE.md` diz que toda rota confere o dono. | Adicionar `_assert_own_personal` nas duas rotas e um teste de isolamento nas duas direções (profissional A tenta ler/editar B → 403). **Confirmar com um teste antes de corrigir.** |
| **CHK-A1** | 🔒 SEGURANÇA | `requirements.txt` — `python-jose` 3.5.0 (CVE-2026-85394) | Sem versão corrigida publicada. O app usa só HS256 com segredo em texto, então a exposição prática parece pequena. | Migrar para **PyJWT** (troca pequena: `jwt.encode/decode`) e remover `python-jose`. Fixar versões no `requirements.txt`. |
| **CHK-A2** | 🔒 SEGURANÇA | `ecdsa` 0.19.2 (CVE-2024-23342, timing “Minerva”) | Dependência indireta do `python-jose`; sem correção. O app não assina com ECDSA. | Some junto com `CHK-A1`. |
| **CHK-G1** | 🔒 SEGURANÇA | `api.py` — `JWT_SECRET` e `ADMIN_KEY` com valor padrão no código | Se a variável faltar em produção, o app sobe com segredo público (tokens e painel admin forjáveis). | Falhar o boot quando faltar em produção (sem default fora de `APP_ENV=dev`). |
| **E2E-6.4** | 🐞 BUG | `api.py` — `validate_brand_color` | Só valida contraste do texto (melhor entre branco e preto), cujo mínimo possível é ≈4,58:1, então **nunca rejeita nenhuma cor**. A cor `#0d0d14` (quase igual ao fundo escuro) foi aceita. | Validar também o contraste do acento **contra os fundos do app** (claro `#F5F6F8` e escuro `#0B0B10`, ≥3:1) e devolver mensagem clara. Decidir a regra com o produto. |

### P1 — próxima rodada

| ID | Tipo | Onde | Evidência | Recomendação |
|---|---|---|---|---|
| **CHK-E1** | ♿ A11Y | Execução do treino — botão “Concluir” (`.btn-set`, `aluno.html:78`) | Texto `#fff` fixo sobre o acento **secundário**: 1,95:1 com `#E8B04B`, 1,41:1 com `#F5D77A`, 3,68:1 com `#3B82F6` (mín. 4,5:1). O acento primário já escolhe preto/branco automaticamente. | Calcular a cor do texto do acento secundário como no primário (`contrastText`) e aplicar também em links/banner de atualização. |
| **CHK-E2** | ♿ A11Y | Painel — abas `.nav-tab` | Contraste 4,08:1 (`#6b7f94` sobre `#0d1e30`), 25 elementos. | Clarear o texto das abas inativas. |
| **CHK-E3** | ♿ A11Y | Painel — `#table-top-students` | Região com rolagem sem acesso por teclado. | `tabindex="0"` + `role`/`aria-label`. |
| **CHK-E4** | ♿ A11Y | App do aluno e painel | Alvos de toque < 44 px: “Meus treinos”, “Sair”, `.session-pill` (40 px), “Privacidade e meus dados” (16 px), `#btn-exec-sair`, campos de série e “Concluir” (40 px), `#theme-btn` (34 px), abas do painel (41 px). | `min-height: 44px` nesses controles. |
| **LOAD-4** | ⚡ DESEMPENHO | `api.py` — `_attach_sessions` (≈l.1922), `historico_execucoes_*` (≈l.1470 e 1522), `acompanhamento_treino` (≈l.1551) | Consultas dentro de laço (N+1): a ficha do aluno faz ≈6 consultas, o histórico até 22 (uma por execução), o acompanhamento mais um laço por sessão. Local tudo < 0,3 ms, mas no Neon cada ida ao banco custa rede. | Trazer sessões+exercícios em 1–2 consultas (`json_agg` ou `WHERE workout_id = ANY(...)`) e as séries do histórico em 1 consulta com `execution_id = ANY(...)`. |
| **LOAD-5** | ⚡ DESEMPENHO | `api.py:137` (`@app.on_event("startup")`) | Cada partida a frio roda ≈**80 comandos** de migração (cada um com commit). Local: 0,03 s; no Neon (uma ida ao banco por comando) estimo algumas centenas de ms por cold start — **não medido**. | Tirar as migrações do startup: rodar uma vez no deploy (script `migrate.py`) ou proteger com flag `RUN_MIGRATIONS=1`. |
| **LOAD-6** | 🐞 UX · ⚡ | `api.py` — `aluno_request_code` / `_rate_limited` (≈l.1033–1140) | (a) Quando o limite bloqueia, o app responde “ok” igual: o aluno espera um código que nunca chega. (b) Limites **por IP** (10 pedidos e 30 verificações/h) valem para todos de um mesmo Wi-Fi (academia). (c) Cada chamada grava uma linha em `auth_rate_limit` (59 linhas para 59 chamadas) sem rotina de limpeza. Funciona: 12 pedidos para o mesmo e-mail geraram só 5 códigos. | Mensagem neutra “se o e-mail existir, enviaremos; aguarde X min”; limite por **IP + e-mail** (e IP mais alto); job que apaga linhas com mais de 1 dia; teto global diário de e-mails para proteger o Resend. |
| **OBS-2** | ⚡ / 🐞 | `dashboard.html` (Chart.js do CDN) | Se o CDN não responde, `Chart is not defined` derruba **toda** a inicialização do painel (alunos, KPIs). Visto na prática no ambiente de teste. | Hospedar o Chart.js junto do app e/ou `try/catch` ao redor dos gráficos. |
| **CHK-D1** | ⚡ DESEMPENHO | Painel do profissional | LCP 2,88 s (> 2,5 s) com dados sintéticos; JS 55 KB comprimido. | Adiar scripts/gráficos abaixo da dobra; medir de novo no preview real. |
| **CHK-G2** | 🔒 hardening | `vercel.json` | Sem bloco `headers` (nosniff, referrer-policy, cache do `sw.js` ficam no padrão da Vercel); CORS `*`; limite por IP confia no 1º valor de `X-Forwarded-For`. | Declarar `headers` (nosniff, Referrer-Policy, `Cache-Control: no-cache` para `/sw.js`); restringir CORS ao domínio; documentar a premissa do `X-Forwarded-For`. |
| **LOAD-7** | ⚡ (preventivo) | Índices | Todas as consultas quentes < 0,3 ms com 250 alunos / 39 mil séries, mas várias usam Seq Scan por falta de índice: `student_account_links(account_id)`, `workout_sessions(workout_id)`, `workout_exercises(session_id)`, `students(personal_id)`, `subscriptions(student_id)`, `checkins(student_id)`. As tabelas-base do Neon podem já ter alguns. | Rodar `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public'` no Neon; aplicar o que faltar no **branch de teste** primeiro. Lista pronta em `tests/load/recomendacoes-indices.sql` (**não aplicada**). |

### P2 — backlog / lacunas de funcionalidade (testes prontos)

São testes **escritos conforme a especificação** que falham porque a funcionalidade ainda não existe. Quando for construída, o teste passa; aí basta remover a marca `gap(...)` do teste.

| ID | Fluxo | O que falta no app | Teste |
|---|---|---|---|
| **E2E-1.6** 🧩 | Login | Mensagem própria de limite de tentativas (hoje sempre “Código inválido ou expirado”) | `01-login` 1.6 |
| **E2E-1.9** 🧩 | Login | Botão voltar do navegador/aparelho: o app não usa a History API e sai da página | 1.9 |
| **E2E-1.10** 🧩 | Termos | Botão “Recusar e sair” | 1.10 |
| **E2E-2.2 / 2.3 / 2.4** 🧩 | Home | Faixa da semana · “x de y treinos” + previsão de término · fontes Albert Sans e Bodoni Moda (hoje fontes do sistema) | `02-home` |
| **E2E-3.2b / 3.3 / 3.6** 🧩 | Execução | Passo/confirmação de “recado ao profissional” · confirmação “Sair do treino?” (o progresso já é mantido) · envio de `local_date` | `03-execucao` |
| **E2E-5.1 … 5.7** 🧩 | Treino pendente | Todo o fluxo: card pendente, “Fazer agora”, “Pular este”, desfazer, expirado (4+ dias), dia de descanso com pendência, previsão de término — **não existe no app nem no backend** (também precisa de `local_date` e de estados pulado/expirado) | `05-pendente` |
| **E2E-6.2 / 6.3 / 6.8** 🧩 | Tema | Atualizar cores ao voltar ao app (`visibilitychange`) · não piscar a cor padrão no carregamento · logo quebrada cair nas iniciais | `06-tema` |
| **E2E-7.4** 🧩 | PWA | Fontes woff2 no cache do service worker (depende de adicionar webfonts) | `07-pwa` |
| **E2E-8.5** 🧩 | Painel | Marcadores de “pulado” e “expirado” no Acompanhamento | `08-painel` |
| **CHK-C** | Lint | 93 itens agrupados, **nenhum erro de sintaxe**: 75 variáveis não usadas (eslint), 22 `E701` + 18 `E702` (várias instruções na mesma linha, `api.py`), HTML (`wcag/h63`, `no-raw-characters`…). | Limpar numa rodada própria, sem misturar com funcionalidade. |
| **CHK-F** | Tamanho | `js/dashboard.js` 206 KB (não é servido ao aluno). Aluno: 159 KB brutos/103 KB gzip, precache do SW 89,5 KB (limite 1,5 MB), sem fontes. | Considerar dividir/minificar o dashboard no futuro. |

### Já resolvido / não é problema do app (🧪)

| ID | O que era | Situação |
|---|---|---|
| **CHK-B1** 🧪 | Segredo em `aluno.html:916` | **Falso positivo** (`client_key = 'exec-' + …` é só um nome de variável). Aceitar no `checks/baseline.json` com o id `2e808592ce8e`. |
| **E2E-env-1** 🧪 | Seletores ambíguos (“Treino concluído” aparece em 2 lugares), nomes em maiúsculas por CSS, campo de busca de alunos já preenchido | Corrigido **nos testes**. |
| **E2E-env-2** 🧪 | Painel não carregava no sandbox (CDN do Chart.js bloqueado) | Teste usa um stub local do Chart.js (ver `OBS-2` para o lado do app). |
| **E2E-env-3** 🧪 | Endpoints de leads/vendas/fotos devolvem 500 no harness local | Schema local é reconstruído (`base-schema.sql`); não ocorre no Neon. |
| **E2E-env-4** 🧪 | iPhone/WebKit não instalável aqui | Só Chromium/Android rodou; WebKit liga sozinho onde estiver instalado. |
| **CHK-env-1** 🧪 | gitleaks não instalável aqui | Usado `detect-secrets` (varre árvore + todo o histórico git); gitleaks entra no CI. |

---

## 3. Resultados detalhados por suíte

### 3.1 Checagens estáticas (`checks/`, execução de 2026-10-08)

| Checagem | Resultado | crítico | alto | médio | baixo |
|---|---|--:|--:|--:|--:|
| A) Dependências vulneráveis | **FALHOU** | 0 | 2 | 0 | 0 |
| B) Varredura de segredos | **FALHOU** (falso positivo) | 1 | 0 | 0 | 0 |
| C) Lint e qualidade estática | ALERTA | 0 | 0 | 0 | 93 |
| D) Lighthouse + PWA instalável | ALERTA | 0 | 1 | 0 | 0 |
| E) Acessibilidade e contraste (axe) | **FALHOU** | 0 | 3 | 5 | 0 |
| F) Tamanho e orçamento | ALERTA | 0 | 0 | 0 | 1 |
| G) Cabeçalhos e login por código | ALERTA | 0 | 0 | 2 | 3 |
| H) Testes e2e (smoke) | PULADA sem URL/credenciais de teste (aviso) | — | — | — | — |

Pontos positivos medidos: Lighthouse **100/100/100** (desempenho/acessibilidade/boas práticas) em login, home e execução do aluno; **PWA instalável** (aluno e profissional); JS da home do aluno 15 KB comprimido; LCP 0,8–1,5 s; login por código com limite por e-mail, por IP e por tentativas.

Limites: telas autenticadas rodaram com **dados sintéticos** (servidor local); cabeçalhos ao vivo (G) só avaliam com `BASE_URL` remota; `npm audit` não se aplica (sem `package.json` na raiz).

### 3.2 Testes e2e (`tests/e2e/`, Android/Chromium, harness local com `api.py` real)

| Fluxo | ok | bug | lacuna |
|---|--:|--:|--:|
| 1. Login e navegação | 7 | 0 | 3 |
| 2. Home e treino de hoje | 1 | 0 | 3 |
| 3. Execução do treino | 4 | 0 | 3 |
| 4. Offline e sincronização | 2 | 0 | 0 |
| 5. Treino pendente | 0 | 0 | 7 |
| 6. Tema do profissional | 4 | 1 | 3 |
| 7. PWA | 3 | 0 | 1 |
| 8. Painel do profissional | 4 | 0 | 1 |
| **Total (47)** | **25** | **1** | **21** |

**O que já funciona (coberto e passando):** e-mail inválido/válido, código errado rejeitado, sessão abre na home, botões de voltar das telas internas, treino de hoje, iniciar → marcar série com um toque (valores pré-preenchidos) → cronômetro de descanso → concluir → avaliação obrigatória (esforço e humor), progresso mantido ao sair, **offline completo** (concluir offline, recarregar, sincronizar sem duplicar, reenvio idempotente 2×), manifest dinâmico válido, service worker ativo, app abre offline, troca de cor pelo profissional chega ao aluno ao reabrir, texto dos botões muda para preto/branco, tema salvo offline, logo com imagem/iniciais, painel lista alunos / ficha / sessões feitas.

**Observação do teste de offline:** séries reenviadas **depois** da finalização são recusadas com 400 (“Este treino já foi finalizado”) — seguro (nada duplica), mas relevante para `LOAD-1` (nunca descartar sem saber por quê).

Tempos: smoke 282 s (28 testes) · completo 404 s (47). Sem testes instáveis (1 retry configurado). **Não coberto:** login completo por código (não há — e não deve haver — “porta dos fundos”; ver proposta abaixo), WebKit/iPhone, push.

### 3.3 Teste de carga (`tests/load/`, k6, 250 alunos falsos, cópia local descartável)

Dados do teste: 250 alunos · 4 personais · 3.250 execuções e 39 mil séries históricas; 4 processos do `api.py`; Postgres com `max_connections=100` (ou 40 nas duas últimas colunas). Esperas encurtadas: a carga é **maior que a real** (pico esperado ≈ algumas dezenas de pessoas).

| Cenário (p95 em ms) | 40 alunos · direto | 250 · direto | 250 · pooler | 250 · direto · banco 40 conn | 250 · pooler · banco 40 conn |
|---|--:|--:|--:|--:|--:|
| Alunos (tráfego contínuo) | **56** | **63** | **60** | **63** (0% falhas) | **60** |
| Painel do profissional | **65** | **79** | **80** | **76** | **74** |
| Fila offline — rajada SEM jitter | **183** | **1,309** | **597** | **572** (76% falhas) | **580** |
| Fila offline — rajada COM jitter (0–15 s) | **60** | **60** | **56** | **60** | **57** |
| Pico de conexões no Postgres | 15 | 51 | 40 | 37 | 38 |
| Erros “too many clients” | 0 | 0 | 0 | 389 | 0 |
| Requisições / req por s | 6,673 / 20 | 36,986 / 113 | 37,084 / 113 | 36,964 / 113 | 37,098 / 113 |

| Endpoint (p95 em ms) | 40 alunos · direto | 250 · direto | 250 · pooler | 250 · direto · banco 40 conn | 250 · pooler · banco 40 conn |
|---|--:|--:|--:|--:|--:|
| `aluno_brand` | 55 | 63 | 62 | 63 | 59 |
| `aluno_historico` | 32 | 64 | 63 | 67 | 58 |
| `aluno_me` | 56 | 66 | 64 | 67 | 63 |
| `aluno_peso_status` | 56 | 69 | 64 | 68 | 64 |
| `aluno_termos_status` | 56 | 66 | 64 | 64 | 60 |
| `aluno_treino` | 60 | 79 | 76 | 79 | 72 |
| `exec_finalizar` | 84 | 234 | 88 | 64 | 75 |
| `exec_iniciar` | 130 | 210 | 274 | 222 | 188 |
| `exec_series` | 108 | 221 | 130 | 68 | 134 |
| `html_aluno` | 48 | 48 | 48 | 48 | 48 |
| `login_request_code` | 56 | 56 | 56 | 56 | 55 |
| `login_verify_code` | 57 | 61 | 56 | 56 | 59 |
| `pro_acompanhamento` | 68 | 87 | 88 | 84 | 87 |
| `pro_execucoes` | 31 | 64 | 68 | 59 | 57 |
| `pro_metrics` | 65 | 72 | 76 | 68 | 66 |
| `pro_students` | 68 | 74 | 75 | 72 | 68 |

Leitura: com banco folgado o app responde rápido em qualquer cenário (p95 ≈ 60 ms nos fluxos normais). O único ponto frágil é a **rajada de reenvio da fila**, que sem jitter multiplica a latência por ~20 e, com o banco apertado, derruba 76 % das chamadas. O **pooler** elimina os erros de conexão; o **jitter** elimina o pico. Em todas as execuções: **0 execuções duplicadas** (`duplicated_client_keys=0`).

Limites do teste: Postgres local sem latência de rede e sem as tabelas/índices reais do Neon; o gargalo real na Vercel+Neon é a conexão por requisição e o número de idas ao banco (`LOAD-3`, `LOAD-4`, `LOAD-5`).

---

## 4. Ordem sugerida de correção

1. **Rodada 1 — não perder dado (P0):** `LOAD-1`, `LOAD-2` (fila offline), `LOAD-3` (conferir/trocar para `-pooler`), `OBS-1` (confirmar e fechar a rota de perfil), `CHK-G1` (sem segredo padrão em produção). Depois repetir `run-matrix2.sh` e esperar **0 itens perdidos** e rajada < 1 s.
2. **Rodada 2 — dependências e brand:** migrar `python-jose` → PyJWT (`CHK-A1/A2`), corrigir `validate_brand_color` (`E2E-6.4`), aceitar `CHK-B1` no baseline.
3. **Rodada 3 — acessibilidade:** `CHK-E1…E4` (contraste do acento secundário, abas do painel, alvos de 44 px). Rodar `checks` (E) + e2e 7/8.
4. **Rodada 4 — desempenho do backend:** `LOAD-4` (N+1), `LOAD-5` (migrações fora do startup), `LOAD-6` (mensagem e limpeza do limite), `OBS-2` (Chart.js), índices (`LOAD-7`) no branch de teste.
5. **Redesign / novas funcionalidades:** fluxos 2 e 5 e demais lacunas (`E2E-…`); cada uma vira verde sozinha quando implementada. Incluir `local_date` no envio de execuções (pré-requisito de pendente/pulado/expirado).

## 5. O que falta configurar para a próxima execução “de verdade”

- **Branch de teste do Neon + preview da Vercel** apontando para ele (nunca produção); preencher `tests/e2e/.env` e `checks/.env` (`BASE_URL`, `DATABASE_URL`, `TEST_DB_HOST_ALLOWLIST`, `JWT_SECRET` de teste); `npm run seed` e `npm run tokens`. Com isso a checagem **H** e os e2e rodam contra o ambiente real, e o k6 pode apontar para o preview (`node tests/e2e/fixtures/seed-load.mjs seed`).
- **Login completo por código (proposta, não implementada):** em vez de “porta dos fundos” no app, usar um **e-mail de teste interceptável** (caixa de teste do próprio Resend/Mailpit no ambiente de TESTE) e ler o código por API do provedor. Risco: depende do provedor de e-mail e de segredo extra no CI; nunca habilitar em produção.
- Instalar o **gitleaks** no CI (o workflow já baixa) e o **WebKit** onde for possível para cobrir iPhone.

## 6. Onde estão os relatórios e como reproduzir

- Checagens: `checks/reports/SUMMARY.md` (+ um `.md` por checagem) · baseline em `checks/baseline.json` · README em `checks/README.md`.
- E2E: `tests/e2e/reports/` (HTML, screenshots, vídeos, traces; ignorados pelo git) · README em `tests/e2e/README.md` · lacunas marcadas com `gap(test, "motivo")`.
- Carga: `tests/load/reports/RESULTADO.md` (tabelas completas por endpoint) · `index-audit-*.txt` (planos EXPLAIN) · README em `tests/load/README.md`.
- Estes relatórios gerados ficam fora do git; este `SUMMARY.md` é o consolidado versionado — atualize-o a cada rodada de revisão.
