# Privacidade — Meridian Fitness Performance Hub

Documento técnico interno. Serve de base para os termos de uso definitivos
(ainda pendentes — o app roda hoje com um texto placeholder, ver
`TERMS_VERSION`/`TERMS_TEXT` em `api.py`) e para qualquer acordo de
processamento de dados com os fornecedores abaixo.

## 1. Dados coletados sobre o aluno

| Categoria | Campos | Onde fica |
|---|---|---|
| Identificação | nome, e-mail, telefone | Neon (`students`, `student_accounts`) |
| Físico | peso, % gordura, medidas, altura | Neon (`students`, `checkins`) |
| Formulários de acompanhamento | humor, dor, aderência alimentar, observações | Neon (`checkins`) |
| Fotos de progresso | frontal/costas/lateral | Cloudinary (URL salva em `progress_photos`) |
| Treino | ficha, séries executadas, carga/reps, avaliação pós-treino | Neon (`workouts`, `workout_execution_sets`, `workout_executions`) |
| Acesso | código de login (hash), token de sessão | Neon (`login_codes`, JWT assinado, nunca persistido em texto puro) |

## 2. Fluxo por fornecedor (para acordos de processamento)

**Neon (Postgres)** — armazena todos os dados estruturados acima. Host
`ep-rapid-mud-aqm3dzos.c-8.us-east-1.aws.neon.tech`, região US East.
Acesso só via a API do Meridian (`DATABASE_URL`, variável de ambiente
privada no Vercel).

**Cloudinary** — recebe upload direto do navegador do aluno (unsigned
upload preset `meridian_checkin_photos`, cloud `elbxkooi`). Armazena as
fotos de progresso; só a URL resultante trafega pelo backend do Meridian.

**Vercel** — hospeda a aplicação (frontend + API serverless) e processa
toda requisição HTTP, incluindo logs de acesso padrão da plataforma
(IP, timestamp, rota) por tempo limitado conforme política própria da
Vercel.

**Resend** — processa o envio do e-mail com o código de login de 6
dígitos (`RESEND_API_KEY`). Recebe apenas e-mail do destinatário, o
código e o nome da marca do profissional — nenhum outro dado do aluno.

## 3. Exclusão vs. anonimização

Quando uma solicitação de **exclusão de conta** (`privacy_requests.type
= 'exclusao'`) é processada:

**É deletado:**
- `student_accounts` (linha da conta: e-mail, nome)
- `student_account_links` (vínculo conta↔aluno)
- `login_codes` referentes ao e-mail
- `student_consents` da conta
- Fotos no Cloudinary vinculadas ao aluno (ação manual — pedir exclusão
  via painel/API do Cloudinary)
- Dados diretamente identificáveis em `students` (nome, telefone,
  e-mail) — substituídos por placeholder (`"Aluno removido"` / `null`)

**É mantido, anonimizado, como histórico agregado do negócio do
profissional** (MRR histórico, contagem de alunos, taxa de renovação —
dados que o profissional precisa pra sua própria gestão e que não
identificam mais o aluno):
- `subscriptions`, `checkins`, `workout_executions`,
  `workout_execution_sets` — linha permanece para as métricas
  agregadas (MRR, churn, volume de treino), mas desvinculada de
  qualquer campo identificável após a exclusão de `students`/`student_accounts`.

Uma **exportação de dados** (`type = 'exportacao'`) reúne as mesmas
tabelas da seção 1, hoje consultadas manualmente pelo Vinicius via SQL
direto no Neon e entregues ao aluno em arquivo (CSV/JSON). Automação
completa (botão "baixar meus dados") fica para uma fase futura.

## 4. Processo manual atual

1. Aluno solicita pelo app (`/aluno/{personal_id}` → "Privacidade e meus
   dados" → Exportar ou Excluir). Isso cria uma linha em
   `privacy_requests` com `status='pendente'`.
2. Vinicius vê a fila em `/admin` → seção "Solicitações de Privacidade"
   (`GET /api/admin/privacy-requests`).
3. Processa manualmente (export: consulta SQL + entrega; exclusão:
   roda o script de exclusão seguindo a seção 3 acima).
4. Marca como concluído no painel (`PATCH /api/admin/privacy-requests/{id}`).

Não existe hoje automação que execute a exclusão sozinha — é
intencional, para evitar apagar dado por engano antes do processo
amadurecer.

## 5. Versionamento dos termos

`TERMS_VERSION` em `api.py` controla a versão aceita. Qualquer aluno
sem um registro em `student_consents` para a versão atual vê a tela de
termos bloqueante antes de acessar o treino — inclusive quem já usava o
app antes dessa versão existir. Trocar o texto definitivo não exige
migração: só editar `TERMS_TEXT` e subir `TERMS_VERSION` (ex: `"1.1"`)
força todo mundo a reaceitar.
