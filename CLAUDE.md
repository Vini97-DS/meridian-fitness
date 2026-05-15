# CLAUDE.md — Meridian Fitness Performance Hub

## Contexto do Projeto
SaaS de gestão para personal trainers. Dashboard que centraliza dados de alunos, MRR, leads, formulários de evolução e acompanhamento físico.

**Repositório:** https://github.com/Vini97-DS/meridian-fitness  
**Deploy:** https://meridian-fitness.vercel.app  
**Stack:** FastAPI (Python) + HTML/CSS/JS vanilla + Neon Postgres 17 + Vercel

---

## Estrutura de Arquivos

```
meridian-fitness/
├── api.py              # FastAPI backend — todas as rotas da API
├── dashboard.html      # Dashboard principal (4 abas)
├── form.html           # Formulário público por link (alunos)
├── index.html          # Landing/login
├── primeiro-acesso.html
├── vercel.json         # Config de deploy
├── requirements.txt
├── css/style.css
└── js/
    ├── dashboard.js    # Toda a lógica do dashboard
    └── auth.js         # Login/registro
```

---

## Banco de Dados — Neon Postgres

**Host:** `ep-rapid-mud-aqm3dzos.c-8.us-east-1.aws.neon.tech`  
**DB:** `neondb` | **User:** `neondb_owner`

### Tabelas principais
```sql
users          -- autenticação (clerk_user_id, email, name, password_hash)
personals      -- perfil do personal (clerk_user_id FK users)
students       -- alunos (personal_id, name, phone, goal, channel, weight_initial/current, bf_initial/current)
subscriptions  -- assinaturas (student_id, plan_id, price_paid, starts_at, expires_at, status)
plans          -- planos (personal_id, name, duration_months, price_brl, is_active)
checkins       -- respostas de formulários (student_id, type, trainings_done, mood_score, weight_reported...)
leads          -- pipeline de vendas (personal_id, name, phone, channel, status)
form_tokens    -- tokens de formulário público (token, student_id, expires_at, used)
progress_photos -- fotos de progresso
```

### IDs de produção
```
personal_id:  9e29c7ba-2108-4b05-99df-a8175a978ac6
user_id:      6427a0f0-0cb6-4f84-a221-cde9de291c60
```

---

## API — Rotas principais

### Auth
- `POST /api/auth/register` — cadastro
- `POST /api/auth/login` — login, retorna JWT
- `GET  /api/auth/me` — retorna user + personal_id

### Dashboard
- `GET  /api/metrics/{personal_id}` — KPIs: mrr, active_students, avg_ticket, renewal_rate, churn_rate, avg_ltv, mrr_history, student_flow, channels, renewal_by_plan
- `GET  /api/students/{personal_id}` — lista alunos com DISTINCT ON (sem duplicatas de renovação)
- `POST /api/students` — cadastrar aluno
- `POST /api/students/{id}/cancel` — encerrar contrato
- `GET  /api/students/{id}/detail` — detalhes: checkins, avg_freq, avg_mood, timeline
- `GET  /api/checkins/{student_id}` — check-ins do aluno
- `POST /api/checkins` — registrar check-in manual
- `GET  /api/plans/{personal_id}?all=true` — planos (all=true inclui inativos)
- `POST /api/plans` — criar plano
- `PATCH /api/plans/{plan_id}` — editar/ativar/desativar plano
- `GET  /api/leads/{personal_id}` — leads do pipeline
- `POST /api/leads` — criar lead
- `PATCH /api/leads/{lead_id}` — mover lead no kanban
- `POST /api/subscriptions` — criar assinatura (renovação inclusa)

### Formulário público
- `POST /api/form/generate` — gera token de formulário (7 dias de validade)
- `GET  /api/form/{token}` — busca dados do formulário + days_to_expire
- `POST /api/form/{token}` — submete respostas e marca token como usado
- `GET  /form/{token}` — serve form.html

---

## Dashboard — Abas

### BI & Negócio
KPIs: MRR, Alunos Ativos, Ticket Médio, Taxa de Renovação, Churn Rate, LTV Médio  
Gráficos: Evolução MRR, Base de Alunos, Canal de Aquisição, Renovação por Plano  
Tabela: Top 10 alunos por LTV  
Painéis: Potencial Churn, Renovações próximos 30 dias

### Vendas
KPIs de vendas, Seletor de planos, Form de lead, Kanban de pipeline  
Histórico de vendas, Mix de planos (doughnut chart)

### Acompanhamento de Alunos
Select de aluno → carrega dados reais  
Fotos comparativas (início vs atual)  
Stats: peso perdido, redução BF  
Gráficos: Evolução de Peso, Frequência, Humor  
Respostas de formulários, Timeline, Engajamento  
Botões: Gerar Link Semanal / Mensal / Semestral

### Configurações
Perfil do personal (nome, bio, especialidade)  
Gerenciar planos (criar, editar, ativar/desativar)  
Gerenciar alunos (cadastrar, renovar, encerrar)

---

## Autenticação
JWT via `python-jose` + bcrypt. Token armazenado em `localStorage.mf_token`.  
Sessão em `localStorage.mf_user` com campos: `id`, `name`, `email`, `personal_id`, `bio`, `especialidade`.

---

## Formulário Público (form.html)
Três tipos com campos diferentes:

**Semanal:** frequência (0-7), intensidade (1-5), dor, aderência alimentar (1-5), humor (1-5), obs geral  
**Mensal:** frequência, intensidade, dor, alimentação, humor + peso atual + 4 fotos (frontal/costas/esq/dir)  
**Trimestral:** tudo do mensal + cintura/quadril + satisfação + resultados + pontos a melhorar + banner de renovação se ≤30 dias para vencer

O aluno acessa via link único com token, preenche e submete. Dados vão para tabela `checkins`.

---

## Padrões de código

### JS — funções críticas
- `loadDashboard()` — init, busca personalId, carrega tudo em paralelo
- `loadStudentsFromAPI(data)` — popula select + objeto `students`
- `loadStudentCheckins(studentId)` — busca checkins + detail, calcula engagement
- `updateStudent()` — renderiza painel do aluno selecionado, chama `loadStudentCheckins` uma vez por aluno via flag `_checkinsLoaded`
- `initBICharts(metrics)` — gráficos com dados reais ou `mkEmptyChart()`
- `renderEngagementPanel(eng)` — barras de engajamento dinâmicas
- `gerarLinkFormulario(tipo)` — gera token via API, copia para clipboard
- `loadSalesTable(personalId)` — popula histórico de vendas + mix chart

### Evitar loops
`updateStudent()` → seta `s._checkinsLoaded = true` antes de chamar `loadStudentCheckins()`  
`loadStudentCheckins()` → NÃO chama `updateStudent()` no final, atualiza DOM diretamente

### IDs únicos — regra de ouro
Nunca repetir IDs. Header pills usam `pill-alunos-val` e `pill-mrr-val`.  
KPI cards usam `kpi-mrr-val`, `kpi-alunos-val`, `kpi-ticket-val`, etc.

### Botões dinâmicos
Usar `data-action` + event delegation em vez de `onclick` inline com JSON.stringify.  
Exemplo: `<button data-action="renovar" data-id="...">` + listener no container.

---

## Deploy — Vercel
```json
{
  "routes": [
    { "src": "/api/(.*)", "dest": "api.py" },
    { "src": "/form/(.*)", "dest": "api.py" },
    { "src": "/dashboard", "dest": "/dashboard.html" },
    ...
  ]
}
```
Variáveis de ambiente no Vercel: `DATABASE_URL`, `SECRET_KEY`

---

## Problemas conhecidos (pendentes M1)
1. Link semestral abre 404 — `form_type=semestral` não está mapeado no `form.html` (só semanal/mensal/trimestral)
2. Gráficos BI: sazonalidade, meta vs realizado, performance por canal, ROI — precisam de queries adicionais na API
3. Renovação ainda cria linha duplicada — DISTINCT ON precisa de índice composto no Neon
