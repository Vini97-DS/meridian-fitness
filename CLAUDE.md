# CLAUDE.md — Meridian Fitness Performance Hub

## Contexto do Projeto
SaaS de gestão para personal trainers/nutricionistas. Dashboard que
centraliza dados de alunos, MRR, leads, formulários de evolução,
acompanhamento físico e um módulo completo de treino (biblioteca de
exercícios, montagem de ficha, execução e avaliação pelo próprio aluno
via app dedicado). Inclui um painel administrativo separado para o
Vinicius acompanhar o negócio do Meridian em si (quanto cada
profissional paga pela plataforma).

**Repositório:** https://github.com/Vini97-DS/meridian-fitness
**Deploy:** https://meridian-fitness.vercel.app
**Stack:** FastAPI (Python 3, um único arquivo `api.py`) + HTML/CSS/JS
vanilla (sem framework/bundler) + Neon Postgres 17 + Vercel
(`@vercel/python` serverless + arquivos estáticos)

---

## Como rodar localmente
```bash
pip install -r requirements.txt
# .env na raiz com as variáveis da seção "Variáveis de ambiente" abaixo
uvicorn api:app --reload
```
Não há build step — `dashboard.html`, `aluno.html`, `admin.html` etc.
são servidos como estáticos e chamam a API em `/api/...` via `fetch`
direto (sem proxy, sem CORS especial além do que já está em `api.py`).

### Variáveis de ambiente
```
DATABASE_URL       # connection string do Neon (obrigatória)
JWT_SECRET          # assina os dois tipos de token (profissional e aluno)
ADMIN_KEY           # chave do painel /admin (query param / body, não é JWT)
RESEND_API_KEY      # envio do código de login do aluno por e-mail
RESEND_FROM         # opcional, default "Meridian <acesso@meridianstrategy.de>"
ANTHROPIC_API_KEY   # presente no ambiente, não usada em lógica de produto hoje
```
`JWT_SECRET` e `ADMIN_KEY` foram confirmados fortes/únicos em produção
(checado sem expor valores no chat). Nunca têm default de desenvolvimento
expostos publicamente em `api.py` além do fallback local
`ADMIN_KEY = os.getenv("ADMIN_KEY", "meridian-admin-dev")` — **esse
fallback só vale pra rodar local**, produção sempre tem a env var real
setada no Vercel.

---

## Estrutura de Arquivos
```
meridian-fitness/
├── api.py               # FastAPI — TODAS as rotas (um arquivo só, ~2800 linhas)
├── index.html            # Landing/login do profissional
├── primeiro-acesso.html  # Cadastro do profissional (via convite)
├── recuperar-senha.html  # Fluxo de esqueci minha senha (profissional)
├── minha-conta.html      # Trocar senha (profissional)
├── dashboard.html        # Dashboard principal do profissional (6 abas)
├── aluno.html             # App do aluno — PWA em /aluno/{personal_id}
├── admin.html             # Painel interno do Meridian em /admin
├── form.html              # Formulário público de check-in (via token)
├── sw.js                  # Service worker do PWA do aluno
├── icon.svg                # Ícone do PWA
├── vercel.json              # Config de deploy (builds + routes)
├── requirements.txt
├── docs/
│   └── privacidade.md     # Inventário de dados + política de exclusão/anonimização (LGPD)
├── css/style.css
└── js/
    ├── dashboard.js        # Toda a lógica do dashboard do profissional
    └── auth.js             # Login/registro do profissional
```
`aluno.html` e `admin.html` têm o CSS/JS inline no próprio arquivo (não
usam `js/dashboard.js`) — são bundles separados e só por isso alguns
dicionários de rótulo (ex: `METHOD_LABELS`) existem duplicados entre
`js/dashboard.js` e `aluno.html`, de propósito.

---

## Banco de Dados — Neon Postgres

**Host:** `ep-rapid-mud-aqm3dzos.c-8.us-east-1.aws.neon.tech`
**DB:** `neondb` | **User:** `neondb_owner`

Praticamente todo o schema é criado/migrado em `api.py`, no hook
`@app.on_event("startup")` (`create_users_table()`), num bloco tolerante
que roda `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS` statement por statement, cada um no seu próprio
try/except — uma migração que falha (ex: coluna já existe, ou já foi
renomeada numa execução anterior) não derruba o boot nem as seguintes.
Então **o schema vive versionado no próprio código**, não em arquivos
de migração separados.

### Tabelas — negócio do profissional (Nível 1: o que o profissional fatura)
```sql
users               -- login do profissional (email, password hash, role)
personals           -- perfil do profissional (clerk_user_id FK users; nome,
                     --   bio, especialidade, branding do app do aluno:
                     --   brand_name/brand_logo_url/brand_primary/brand_accent;
                     --   dados de Nível 2: meridian_plan/status/price_paid)
students             -- alunos (personal_id, name, phone, email, goal, channel,
                     --   weight_initial/current, bf_initial/current, status)
subscriptions         -- assinaturas (student_id, personal_id, plan_id,
                     --   price_paid, starts_at, expires_at, status)
plans                  -- planos do profissional (name, duration_months, price, is_active)
checkins                -- respostas de formulário + check-ins manuais
                     --   (student_id, personal_id, type [enum: semanal/
                     --   mensal/trimestral/treino], trainings_done,
                     --   mood_score, energy_score, weight_reported, ...)
leads                    -- pipeline de vendas (personal_id, name, phone, channel, status)
form_tokens               -- tokens do formulário público (7 dias de validade)
progress_photos            -- fotos de progresso (Cloudinary URL)
payment_methods              -- formas de pagamento que o profissional exibe ao aluno
student_acquisition_costs     -- custo de CADA profissional adquirir um ALUNO (CAC nível 1)
invites                        -- convites de e-mail pra novo profissional se cadastrar
password_resets                  -- tokens de "esqueci minha senha" (profissional)
```

### Tabelas — negócio do Meridian em si (Nível 2: o que CADA PROFISSIONAL paga pelo Hub)
```sql
platform_settings    -- singleton com a meta anual do próprio Meridian
acquisition_costs    -- custo do Meridian adquirir um PROFISSIONAL (CAC nível 2)
-- colunas extras em personals: meridian_plan, meridian_status,
--   meridian_started_at, meridian_price_paid, meridian_plan_duration_months
```

### Tabelas — conta e login do aluno (app separado, `aluno.html`)
```sql
student_accounts        -- conta do aluno (email único, sem senha)
student_account_links   -- vínculo account_id ↔ student_id (1 conta pode
                         --   estar ligada a alunos de profissionais diferentes)
login_codes              -- código de 6 dígitos (hash sha256, 10min TTL, uso único,
                         --   5 tentativas, 5 pedidos/hora por e-mail)
auth_rate_limit            -- limite POR IP nas rotas de login do aluno
                         --   (10 pedidos/h, 30 verificações/h) — cobre o
                         --   caso de e-mail inválido repetido, que não gera
                         --   linha em login_codes e por isso escaparia do
                         --   limite por e-mail
student_consents           -- aceite versionado dos Termos de Uso/Privacidade
                         --   (account_id, version) — UNIQUE(account_id, version)
privacy_requests             -- pedidos de exclusão/exportação de dados do
                         --   aluno, processados manualmente via /admin
```

### Tabelas — módulo Treino
```sql
exercises              -- biblioteca de exercícios DO PROFISSIONAL (seed
                        --   inicial de 80 exercícios, editável por ele;
                        --   UNIQUE (personal_id, name))
workouts                -- ficha: MODELO (student_id NULL, biblioteca do
                        --   profissional) ou ATRIBUÍDA (student_id
                        --   preenchido, status 'ativa'/'encerrada' — índice
                        --   único garante 1 ficha ativa por aluno no banco)
workout_sessions          -- treino dentro da ficha (nome livre tipo "A" ou
                        --   "Peito e tríceps", weekdays opcional INT[] 0=Seg)
workout_exercises           -- exercício dentro do treino (sets, reps_min/max,
                        --   load_value/unit, rest_seconds, method [chave
                        --   estável, rótulo só no front], video_url
                        --   [SNAPSHOT do exercise.video_url na hora de
                        --   criar/atribuir, não é referência viva])
workout_executions            -- UMA execução de um treino pelo aluno
                        --   (started_at/finished_at, effort_score,
                        --   mood_score, comment, client_key único — chave
                        --   de idempotência gerada no app pra resync offline)
workout_execution_sets          -- séries realizadas (reps_done, load_done,
                        --   snapshot do alvo no momento, client_key único)
```

### IDs de produção (Vinicius, conta de teste/demo)
```
personal_id:  9e29c7ba-2108-4b05-99df-a8175a978ac6
user_id:      6427a0f0-0cb6-4f84-a221-cde9de291c60
```

### Regra de ouro pra mudar schema
Antes de alterar schema em produção, testa num **branch do Neon**
(`mcp__Neon__create_branch` a partir do branch de produção, roda o DDL
lá, confere via `information_schema.columns`, depois deleta o branch).
Mudança precisa ser **aditiva** (`ADD COLUMN IF NOT EXISTS`, nullable,
ou `CREATE TABLE IF NOT EXISTS`) — nunca altera dado existente. Mesmo
padrão pra `ALTER TYPE ... ADD VALUE` em enums do Postgres (ex:
`checkin_type` ganhou o valor `'treino'` assim).

---

## Autenticação — DOIS sistemas de JWT separados

### Profissional
JWT via `python-jose` + bcrypt, assinado com `JWT_SECRET`. Token em
`localStorage.mf_token`. Sessão em `localStorage.mf_user` (`id`, `name`,
`email`, `personal_id`, `bio`, `especialidade`). `get_current_user()`
**rejeita** token de aluno (checa `payload.get("typ") == "student"` → 403).

### Aluno (app `/aluno/{personal_id}`)
Sem senha — login por **código de 6 dígitos** enviado por e-mail
(Resend). Fluxo: `POST /api/aluno/auth/request-code` → código hash
(`sha256(email:code:JWT_SECRET)`) salvo em `login_codes`, 10min TTL, uso
único, até 5 tentativas, até 5 pedidos/hora por e-mail **e** até 10
pedidos/hora por IP (tabela `auth_rate_limit`, independente da
anterior — cobre e-mail inválido). `POST /api/aluno/auth/verify-code`
cria/reaproveita uma `student_accounts` e devolve um JWT com
`typ: "student"`. `get_current_student()` **rejeita** token de
profissional. Token em `localStorage.mf_aluno_token` (chave diferente
da do profissional, propositalmente — os dois tokens nunca se misturam
mesmo que o navegador seja o mesmo).

Antes de ver qualquer treino, o aluno passa pelo gate de **Termos de
Uso versionados** (`student_consents` × `TERMS_VERSION` em `api.py`) —
ver seção Privacidade abaixo.

### Admin (`/admin`)
Não é JWT — é uma `ADMIN_KEY` fixa enviada em query param (`GET`) ou no
corpo (`POST`/`PATCH`) via `_check_admin_key()`. Guardada em
`sessionStorage` no `admin.html` depois do login (não persiste entre
abas/sessões novas).

---

## API — Rotas principais
(lista não exaustiva de parâmetros — ver `api.py` pra detalhe de cada uma)

### Auth profissional
- `POST /api/auth/register` / `POST /api/auth/login` / `GET /api/auth/me`
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` / `PATCH /api/auth/change-password`
- `GET /api/auth/check-invite` — valida convite antes do cadastro

### Dashboard — negócio (Nível 1)
- `GET /api/metrics/{personal_id}` — KPIs: mrr, active_students, avg_ticket, renewal_rate, churn_rate, avg_ltv, mrr_history, student_flow, channels, renewal_by_plan
- `GET /api/sales/metrics/{personal_id}`, `GET /api/insights/{personal_id}`, `GET /api/geo/{personal_id}`
- `GET/POST /api/students`, `POST /api/students/{id}/cancel`, `GET /api/students/{id}/photos`, `POST /api/students/{id}/photos`
- `GET /api/checkins/{student_id}`, `POST /api/checkins`
- `GET /api/plans/{personal_id}?all=true`, `POST /api/plans`, `PATCH /api/plans/{plan_id}`
- `GET/POST /api/leads`, `PATCH /api/leads/{lead_id}`
- `POST /api/subscriptions` — cria assinatura (renovação inclusa)
- `GET/POST/PATCH /api/payment-methods`
- `GET/POST /api/acquisition-costs/{personal_id}` — CAC nível 1
- `GET/PATCH /api/personals/{personal_id}`

### Módulo Treino (profissional, biblioteca + fichas)
- `GET /api/treino/exercicios/{personal_id}`, `POST /api/treino/exercicios`, `PATCH /api/treino/exercicios/{id}`, `POST /api/treino/exercicios/{personal_id}/seed`
- `GET /api/treino/fichas/{personal_id}[?student_id=]`, `POST /api/treino/fichas` (cria modelo OU, com `student_id`, já atribuída direto)
- `POST /api/treino/fichas/{workout_id}/atribuir` — clona modelo pro aluno, encerra ficha ativa anterior automaticamente
- `PATCH /api/treino/fichas/{workout_id}/status` — ativar/encerrar
- `DELETE /api/treino/fichas/{workout_id}`
- `GET /api/treino/execucoes/{student_id}` — histórico de execuções do aluno, visão do profissional

### App do Aluno (`typ: student`)
- `POST /api/aluno/auth/request-code`, `POST /api/aluno/auth/verify-code`
- `GET /api/aluno/me` — contas vinculadas + branding do(s) profissional(is)
- `GET /api/aluno/brand/{personal_id}` (pública), `GET /api/aluno/manifest/{personal_id}.json` (manifest do PWA)
- `GET /api/aluno/treino?personal_id=` — ficha ativa + sessões/exercícios aninhados
- `GET /api/aluno/termos` (pública), `GET /api/aluno/termos/status`, `POST /api/aluno/termos/aceitar`
- `POST /api/aluno/treino/execucoes/iniciar` — idempotente por `client_key`, devolve `last_time` (referência da execução anterior) e `already_done`
- `POST /api/aluno/treino/execucoes/series` — registra séries por `execution_client_key` (não por id do servidor — resiliente a fila offline)
- `POST /api/aluno/treino/execucoes/finalizar` — effort_score/mood_score (1-5) + comment, idempotente
- `GET /api/aluno/treino/execucoes` — histórico simples do próprio aluno
- `POST /api/aluno/peso` (máx. 1x/7 dias, grava em `checkins` tipo `'treino'`), `GET /api/aluno/peso/status`
- `POST /api/aluno/privacidade/solicitar` (`type`: `exclusao`|`exportacao`), `GET /api/aluno/privacidade/solicitacoes`

### Formulário público (sem auth, por token)
- `POST /api/form/generate` (gera token, 7 dias) · `GET /api/form/{token}` · `POST /api/form/{token}` · `GET /form/{token}` (serve `form.html`)

### Admin (`admin_key`)
- `GET /api/admin/overview`, `GET /api/admin/meridian-metrics`, `GET /api/admin/growth`
- `GET /api/admin/personal/{personal_id}/metrics`
- `GET/POST /api/admin/acquisition-costs` (CAC nível 2)
- `GET/PATCH /api/admin/platform-settings`
- `PATCH /api/admin/personal/{personal_id}/meridian` — plano/status de pagamento do profissional
- `GET/POST/DELETE /api/admin/invites` · `/api/admin/invite` · `/api/admin/invite/{email}`
- `GET /api/admin/privacy-requests[?status=]`, `PATCH /api/admin/privacy-requests/{id}`

---

## Dashboard do profissional — Abas (`dashboard.html` + `js/dashboard.js`)

### BI & Negócio
KPIs: MRR, Alunos Ativos, Ticket Médio, Taxa de Renovação, Churn Rate, LTV Médio
Gráficos: Evolução MRR, Base de Alunos, Canal de Aquisição, Renovação por Plano
Tabela: Top 10 alunos por LTV · Painéis: Potencial Churn, Renovações próximos 30 dias

### ⚡ Resumo
Visão rápida consolidada (atalho pros números principais sem navegar pelas outras abas).

### Vendas
KPIs de vendas, Seletor de planos, Form de lead, Kanban de pipeline
Histórico de vendas, Mix de planos (doughnut chart)

### Acompanhamento de Alunos
Busca de aluno (`#studentSearchInput` + `.student-search-item`, não é um
`<select>` simples) → carrega dados reais
Fotos comparativas (início vs atual) · Stats: peso perdido, redução BF
Gráficos: Evolução de Peso, Frequência, Humor · Respostas de formulários, Timeline, Engajamento
Botões: Gerar Link Semanal/Mensal/Trimestral
**Ficha de Treino** do aluno: ativa + histórico + atribuir modelo/criar direto
**Treinos Executados**: histórico de execuções com esforço/humor/comentário (toggle, carrega sob demanda)

### Treinos
Biblioteca de exercícios (busca, criar, seed inicial de 80)
Montagem de ficha: sessões com dias da semana opcionais, exercícios com
busca em combobox, sets/reps/carga estruturados, método de execução
(drop set, bi-set etc. — chave estável no banco, rótulo só no front),
vídeo. "Salvar como modelo" ou "Salvar e atribuir ao aluno" (contexto
`_trDraftStudentId` quando a ficha nasce direto pro aluno)

### ⚙ Configurações
Perfil do personal (nome, bio, especialidade) · Gerenciar planos ·
Gerenciar alunos (cadastrar, renovar, encerrar) · Formas de pagamento

---

## App do Aluno (`aluno.html`, PWA em `/aluno/{personal_id}`)
White-label: `personals.brand_name/brand_logo_url/brand_primary/brand_accent`
aplicados em runtime (cor validada por contraste WCAG ≥4.5:1 no backend).
Login por código de 6 dígitos → **gate de Termos de Uso** (se não
aceitos na versão atual) → home:
- **Treino de hoje**: casa o dia da semana atual com `weekdays` das
  sessões; sem match, mostra o próximo dia com treino e avisa "dia de
  descanso"; sem nenhum `weekdays` definido, cai no 1º treino da
  sequência. Aluno sempre pode trocar manualmente pelos pills.
- **Execução de treino**: marca série por série (carga/reps
  pré-preenchidos com o alvo + última vez), timer de descanso
  resiliente a troca de aba (calculado por timestamp absoluto, não
  contagem), Wake Lock com fallback silencioso, avaliação pós-treino
  obrigatória (esforço 1-5, humor 1-5, comentário opcional), resumo
  final com tonelagem e comparação divertida, peso semanal opcional.
  **Offline**: fila local (`localStorage`) com idempotência por
  `client_key`, resolve tudo por client_key (não por id do servidor)
  pra nunca depender de uma resposta anterior — sincroniza sozinho ao
  reconectar, sem duplicar.
- **Meus treinos**: histórico simples das execuções concluídas
- **Privacidade e meus dados**: solicitar exportação/exclusão, ver status

---

## Painel Admin (`admin.html`, `/admin`)
Visão do negócio do **próprio Meridian** (Nível 2: quanto cada
profissional paga pelo Hub — MRR próprio, CAC, LTV, crescimento por
profissional), gestão de convites de novos profissionais, e a fila de
**Solicitações de Privacidade** dos alunos (ver seção abaixo). Login
por `ADMIN_KEY` (não é JWT).

---

## Privacidade (LGPD) — alunos
Ver `docs/privacidade.md` pro inventário completo de dados por
fornecedor (Neon/Cloudinary/Vercel/Resend) e a política de
exclusão vs. anonimização. Resumo:
- `TERMS_VERSION`/`TERMS_TEXT` em `api.py` — texto hoje é **rascunho
  placeholder**, trocar pelo definitivo quando pronto (só editar e
  subir a versão força todo mundo a reaceitar, automático).
- Pedido de exclusão/exportação cria linha em `privacy_requests`,
  processado **manualmente** por ora (fila visível em `/admin`).
- Fotos de progresso ficam no Cloudinary — exclusão de conta inclui
  apagar lá também (ação manual, fora do Neon).

---

## Formulário Público (`form.html`)
Três tipos com campos diferentes:
**Semanal:** frequência (0-7), intensidade (1-5), dor, aderência alimentar (1-5), humor (1-5), obs geral
**Mensal:** frequência, intensidade, dor, alimentação, humor + peso atual + 4 fotos (frontal/costas/esq/dir)
**Trimestral:** tudo do mensal + cintura/quadril + satisfação + resultados + pontos a melhorar + banner de renovação se ≤30 dias para vencer

O aluno acessa via link único com token, preenche e submete. Dados vão
para `checkins`. Fotos sobem **direto do navegador pro Cloudinary**
(unsigned upload preset `meridian_checkin_photos`, cloud `elbxkooi`,
hardcoded em `form.html`) — só a URL resultante vai no JSON pro
backend (ver "Resolvidos recentemente" pra entender por quê).

Tipo "semestral" foi removido (redundante com mensal) — só
semanal/mensal/trimestral existem hoje.

---

## Padrões de código

### JS — funções críticas (`js/dashboard.js`)
- `loadDashboard()` — init, busca personalId, carrega tudo em paralelo
- `loadStudentsFromAPI(data)` — popula select + objeto `students`
- `loadStudentCheckins(studentId)` — busca checkins + detail, calcula engagement
- `updateStudent()` — renderiza painel do aluno selecionado, chama `loadStudentCheckins` uma vez por aluno via flag `_checkinsLoaded`
- `initBICharts(metrics)` — gráficos com dados reais ou `mkEmptyChart()`
- `renderEngagementPanel(eng)` — barras de engajamento dinâmicas
- `gerarLinkFormulario(tipo)` — gera token via API, copia para clipboard
- `loadSalesTable(personalId)` — popula histórico de vendas + mix chart
- `loadStudentTreino(studentId)` / `renderFichaAluno(w, isAtiva)` — ficha ativa + histórico no perfil
- `loadExecucoesTreino()` — treinos executados no perfil (lazy, só carrega ao abrir o toggle)

### JS — `aluno.html` (bundle próprio, não usa `js/dashboard.js`)
- `enterHome()` → checa termos (`entrarNoHome()` só roda depois de aceitos)
- `loadTreino()` / `pickTodaySession(sessions)` — lógica do "treino de hoje"
- `iniciarOuContinuarTreino(session)` / `onToggleSet(btn)` — execução + fila offline (`tryOrQueue`, `flushQueue`, chave `mf_aluno_fila` no localStorage)
- `startRestTimer`/`renderTimerBanner` — timer por timestamp absoluto (`state.timerEnd`), não por contador

### Evitar loops
`updateStudent()` → seta `s._checkinsLoaded = true` antes de chamar `loadStudentCheckins()`
`loadStudentCheckins()` → NÃO chama `updateStudent()` no final, atualiza DOM diretamente

### IDs únicos — regra de ouro
Nunca repetir IDs. Header pills usam `pill-alunos-val` e `pill-mrr-val`.
KPI cards usam `kpi-mrr-val`, `kpi-alunos-val`, `kpi-ticket-val`, etc.
**Atenção:** `kpi-mrr-val` e `kpi-ticket-val` já existem duplicados em
`dashboard.html` hoje (pré-existente, não introduzido nas últimas
entregas) — pendente de limpeza, listado em "Problemas conhecidos".

### Botões dinâmicos
Usar `data-action` + event delegation em vez de `onclick` inline com JSON.stringify.
Exemplo: `<button data-action="renovar" data-id="...">` + listener no container.

### Idempotência / client_key (módulo Treino — execução)
Qualquer escrita que pode ser reenviada (reconexão depois de ficar
offline) carrega um `client_key` gerado no app e guardado localmente;
o backend faz `INSERT ... ON CONFLICT (client_key) DO UPDATE/NOTHING`.
Rotas de série/finalização resolvem a execução **pelo `client_key`**,
não pelo `id` do servidor, pra nunca depender de uma resposta anterior
que pode não ter chegado ainda.

### Multi-tenant / isolamento
Toda rota confere que o recurso pertence ao `personal_id`/`student_id`
do token logado — helpers `_assert_own_personal`, `_assert_own_exercise`,
`_assert_own_workout`, `_assert_own_student` (profissional) e
verificação via `student_account_links` (aluno). Testado nas duas
direções sempre que uma rota nova é criada.

---

## Deploy — Vercel
`vercel.json` lista cada `.html`/`sw.js`/`icon.svg`/`css`/`js` como
build estático e roteia `/api/*`, `/aluno*` e `/form/*` pro `api.py`
(serverless `@vercel/python`); o resto mapeia pra um arquivo estático
fixo (`/dashboard` → `dashboard.html`, `/admin` → `admin.html`, etc).
Variáveis de ambiente no Vercel: `DATABASE_URL`, `JWT_SECRET`,
`ADMIN_KEY`, `RESEND_API_KEY` (+ `RESEND_FROM`, `ANTHROPIC_API_KEY`
opcionais). Deploy automático a cada push em `main` (GitHub integration).

---

## Como trabalhar nesse projeto (preferências do usuário)
- **Comunicação enxuta:** em tarefas de múltiplas etapas, não narra cada
  passo no chat. Trabalha, mantém um log (arquivo, não mensagem) do que
  foi feito e testado, e só manda mensagem pro usuário quando a tarefa
  inteira terminar (ou travar em algo que precise de decisão dele).
  Motivo: economizar o limite de uso da sessão.
- **Mudança de schema (Neon):** antes de alterar schema em produção,
  testa num branch do Neon. Mudança nova deve ser aditiva (coluna
  nullable, `ADD COLUMN IF NOT EXISTS`), nunca alterando dado existente.
- Commit/push só quando o usuário pedir explicitamente ("pode subir").

---

## Problemas conhecidos (pendentes M1)
1. Gráficos BI: sazonalidade, meta vs realizado, performance por canal, ROI — precisam de queries adicionais na API
2. Texto dos Termos de Uso do app do aluno é **rascunho placeholder** — falta o texto jurídico definitivo (trocar `TERMS_TEXT`/subir `TERMS_VERSION` em `api.py`)
3. Exclusão/exportação de dados do aluno é **100% manual** hoje (sem automação que de fato apague/exporte) — fila em `/admin`, processo documentado em `docs/privacidade.md`

## Resolvidos recentemente
- Tipo de formulário "semestral" removido (redundante com mensal) — só semanal/mensal/trimestral
- Envio do form mensal/trimestral quebrava com "Unexpected token 'R', is not valid JSON" — causa raiz: 4 fotos em base64 dentro do JSON estouravam o limite fixo de 4.5MB de request body das Serverless Functions da Vercel (a Vercel rejeita antes do Python rodar, devolvendo texto puro). Corrigido: fotos agora sobem direto do navegador pro Cloudinary (unsigned upload preset `meridian_checkin_photos`, cloud `elbxkooi`, hardcoded em `form.html`) e só a URL resultante vai no JSON pro backend.
- App do aluno completo (login por código, branding white-label, PWA, ficha do dia, execução de séries com timer/offline, avaliação pós-treino, privacidade/termos) — módulo "Treino" das entregas 2.1 a 2.4 + PRIVACIDADE.
- "Renovação cria linha duplicada": investigado a fundo — a query `DISTINCT ON (s.id)` de `/api/students/{personal_id}` já está correta hoje (testada contra o único caso real de renovação em produção, devolve 1 linha). O que existia era uma aluna de dado de demo/seed cadastrada 2x por coincidência (mesmo telefone, timestamps idênticos) — removida manualmente, sem relação com o fluxo de renovação. Band-aid defensivo de dedup no frontend (`loadStudentsFromAPI`) mantido como rede de segurança, inofensivo.
- IDs duplicados em `dashboard.html`: `kpi-mrr-val` e `kpi-ticket-val` apareciam tanto no `<div>` externo quanto no `<span>` interno (copy-paste) — removido do `<div>`, só o `<span>` carrega o id agora (mesmo padrão dos cards de CAC/LTV).
- MRR e demais valores monetários não abreviam mais em notação "K" — `fmtMoney()` sempre mostra o valor exato. Decisão explícita: dado financeiro/de negócio exige clareza total, nunca arredondamento visual.
