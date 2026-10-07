"""
api.py — Backend Meridian Fitness
Auth: JWT proprio com bcrypt + python-jose
Banco: Neon (Postgres)
Rodar: uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta, timezone
import psycopg2
import psycopg2.extras
import os
import re
import json
import hmac
import hashlib
import secrets
import urllib.request
from html import escape as html_escape
import bcrypt
from fastapi.responses import Response
from jose import jwt, JWTError
from dotenv import load_dotenv
import anthropic

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

app = FastAPI(title="Meridian Fitness API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files servidos pelo Vercel diretamente

JWT_SECRET    = os.getenv("JWT_SECRET", "meridian-dev-secret-mude-em-producao")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES   = 60 * 24 * 7

def get_db():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL nao configurada")
    conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()

def query(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return [dict(row) for row in cur.fetchall()]

def execute(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        conn.commit()
        try:
            return dict(cur.fetchone())
        except Exception:
            return {"ok": True}

# ── Paginas HTML ─────────────────────────────────────────────────
@app.get("/")
def serve_login():
    return FileResponse("index.html")

@app.get("/dashboard")
def serve_dashboard():
    return FileResponse("dashboard.html")

@app.get("/primeiro-acesso")
def serve_first_access():
    return FileResponse("primeiro-acesso.html")

@app.get("/recuperar-senha")
def serve_forgot_password():
    return FileResponse("recuperar-senha.html")

@app.get("/minha-conta")
def serve_my_account():
    return FileResponse("minha-conta.html")

# ── JWT helpers ──────────────────────────────────────────────────
def create_token(user_id: str, email: str, name: str) -> str:
    payload = {
        "sub":   user_id,
        "email": email,
        "name":  name,
        "exp":   datetime.utcnow() + timedelta(minutes=JWT_EXPIRES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalido ou expirado")

security = HTTPBearer(auto_error=False)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token nao fornecido")
    payload = verify_token(credentials.credentials)
    if payload.get("typ") == "student":
        raise HTTPException(status_code=403, detail="Token de aluno nao acessa area do profissional")
    return payload

def get_current_student(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token nao fornecido")
    payload = verify_token(credentials.credentials)
    if payload.get("typ") != "student":
        raise HTTPException(status_code=403, detail="Apenas contas de aluno")
    return payload

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

# ── Cria tabela users no startup ─────────────────────────────────
@app.on_event("startup")
def create_users_table():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL nao configurada — pulando criacao de tabela")
        return
    try:
        conn = psycopg2.connect(db_url)
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name       TEXT NOT NULL,
                    email      TEXT UNIQUE NOT NULL,
                    password   TEXT NOT NULL,
                    role       TEXT DEFAULT 'personal',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS password_resets (
                    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id    UUID NOT NULL REFERENCES users(id),
                    token      TEXT UNIQUE NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used       BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS payment_methods (
                    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    personal_id UUID NOT NULL REFERENCES personals(id),
                    type        TEXT NOT NULL,
                    label       TEXT NOT NULL,
                    value       TEXT NOT NULL,
                    instruction TEXT,
                    is_default  BOOLEAN DEFAULT FALSE,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
        # Add personals/students columns if missing (safe: IF NOT EXISTS)
        # IMPORTANTE: usa um cursor novo — o "cur" acima já foi fechado pelo
        # "with" que terminou logo ali em cima (psycopg2 fecha o cursor no
        # __exit__), reaproveitá-lo aqui faz todo cur.execute() falhar
        # silenciosamente com "cursor already closed", engolido pelo except.
        with conn.cursor() as cur2:
            for col_sql in [
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS whatsapp TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS instagram TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS site TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS cidade TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Brasil'",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS moeda TEXT DEFAULT 'BRL'",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS especialidade TEXT",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date DATE",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Brasil'",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS state TEXT",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS city TEXT",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS payment_link TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS pix_key TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS payment_instruction TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meta_anual NUMERIC(12,2)",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS canais_atendimento TEXT[]",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS formas_pagamento TEXT[]",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_student_id UUID REFERENCES students(id)",
                "ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_other TEXT",
                # Nivel 2 (negocio do Meridian: quanto cada profissional paga
                # pelo Hub) — distinto do Nivel 1 (quanto cada profissional
                # fatura com os alunos dele, ja coberto por subscriptions)
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meridian_plan TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meridian_status TEXT DEFAULT 'tester'",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meridian_started_at DATE",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meridian_price_paid NUMERIC(10,2)",
                # so usada quando meridian_plan = 'outro' (valor manual fora
                # dos planos padrao Mensal/Semestral/Anual)
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS meridian_plan_duration_months INTEGER",
                # Suporte a multiplas moedas (Nivel 1 — cada profissional opera
                # na moeda do pais onde atua). O nome "price_brl" mentia sobre
                # o conteudo assim que o primeiro profissional fora do Brasil
                # existisse — vira apenas "price", sem perda de dado (RENAME).
                # Falha (e e ignorada) em todo restart apos a primeira vez,
                # pois price_brl deixa de existir — mesmo padrao tolerante das
                # outras migracoes desse bloco.
                "ALTER TABLE plans RENAME COLUMN price_brl TO price",
                # Tema do profissional no app do aluno (white-label)
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS brand_name TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS brand_logo_url TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS brand_primary TEXT",
                "ALTER TABLE personals ADD COLUMN IF NOT EXISTS brand_accent TEXT",
            ]:
                try:
                    cur2.execute(col_sql)
                    conn.commit()
                except Exception:
                    conn.rollback()
            # platform_settings — tabela singleton com a meta anual do
            # proprio Meridian (nao confundir com personals.meta_anual,
            # que e a meta de cada profissional)
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS platform_settings (
                        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        meta_anual NUMERIC(12,2),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                conn.commit()
                cur2.execute("SELECT COUNT(*) AS n FROM platform_settings")
                if cur2.fetchone()[0] == 0:
                    cur2.execute("INSERT INTO platform_settings (meta_anual) VALUES (NULL)")
                conn.commit()
            except Exception:
                conn.rollback()
            # acquisition_costs — lançamento manual de custo de aquisição
            # (trafego pago/conteudo/outro), pra alimentar o CAC do Nivel 2.
            # "amount" e sempre o equivalente em EUR (convertido a mao pelo
            # Vinicius antes de lancar); "currency" e so anotacao de onde o
            # dinheiro saiu de fato, nao entra em nenhuma conta.
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS acquisition_costs (
                        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        amount      NUMERIC(10,2) NOT NULL,
                        currency    TEXT DEFAULT 'EUR',
                        category    TEXT NOT NULL,
                        description TEXT,
                        date        DATE NOT NULL DEFAULT CURRENT_DATE,
                        created_at  TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                conn.commit()
            except Exception:
                conn.rollback()
            # Conta do aluno (login sem senha por código de e-mail). Separada
            # de students: uma conta pode ser vinculada a registros de students.
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS student_accounts (
                        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email      TEXT UNIQUE NOT NULL,
                        name       TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS student_account_links (
                        student_id UUID PRIMARY KEY REFERENCES students(id),
                        account_id UUID NOT NULL REFERENCES student_accounts(id),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS login_codes (
                        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email      TEXT NOT NULL,
                        code_hash  TEXT NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL,
                        attempts   INT DEFAULT 0,
                        used       BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email, created_at DESC)")
                # Limite por IP nas rotas de login do aluno — login_codes so
                # grava linha pra e-mail valido, entao um e-mail invalido
                # repetido nao tinha nenhum freio antes disso. Testado antes
                # num branch do Neon (br-patient-sunset-aqxbtk23, deletado).
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS auth_rate_limit (
                        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        rl_key     TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("CREATE INDEX IF NOT EXISTS auth_rate_limit_key_idx ON auth_rate_limit(rl_key, created_at DESC)")
                conn.commit()
            except Exception:
                conn.rollback()
            # Treino (2.2): biblioteca de exercícios do personal e fichas.
            # Tudo escopado por personal_id; seed global não existe — o seed é
            # copiado pra biblioteca de cada personal (editável por ele).
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS exercises (
                        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        personal_id  UUID NOT NULL REFERENCES personals(id),
                        name         TEXT NOT NULL,
                        muscle_group TEXT NOT NULL,
                        instructions TEXT,
                        video_url    TEXT,
                        created_at   TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE (personal_id, name)
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS workouts (
                        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        personal_id UUID NOT NULL REFERENCES personals(id),
                        name        TEXT NOT NULL,
                        created_at  TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS workout_days (
                        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        workout_id UUID NOT NULL REFERENCES workouts(id),
                        label      TEXT NOT NULL,
                        position   INT NOT NULL
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS workout_exercises (
                        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        day_id       UUID NOT NULL REFERENCES workout_days(id),
                        exercise_id  UUID NOT NULL REFERENCES exercises(id),
                        position     INT NOT NULL,
                        sets         INT NOT NULL DEFAULT 3,
                        reps         TEXT NOT NULL DEFAULT '8-12',
                        target_load  TEXT,
                        rest_seconds INT NOT NULL DEFAULT 60,
                        notes        TEXT
                    )
                """)
                conn.commit()
            except Exception:
                conn.rollback()
            # Treino — alinha o modelo ao padrao de mercado: ficha pode ser
            # MODELO (student_id nulo, biblioteca do personal) ou FICHA
            # ATRIBUIDA (student_id preenchido, clone independente do modelo).
            # workout_days vira workout_sessions (nome livre + dias da semana
            # opcionais); reps e carga viram campos estruturados; video_url
            # na ficha e snapshot do exercicio no momento da atribuicao.
            for col_sql in [
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id)",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS goal TEXT",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS level TEXT",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS starts_on DATE",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS ends_on DATE",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS notes TEXT",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS status TEXT",
                "ALTER TABLE workouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
                # idempotente: so funciona na 1a vez, depois workout_days ja nao existe mais
                "ALTER TABLE workout_days RENAME TO workout_sessions",
                "ALTER TABLE workout_sessions RENAME COLUMN label TO name",
                "ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS weekdays INT[]",
                "ALTER TABLE workout_exercises RENAME COLUMN day_id TO session_id",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS reps_min INT NOT NULL DEFAULT 8",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS reps_max INT NOT NULL DEFAULT 12",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS load_value NUMERIC(6,2)",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS load_unit TEXT NOT NULL DEFAULT 'kg'",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS video_url TEXT",
                # Metodo de execucao (drop set, bi-set, etc) — chave estavel
                # (nao o rotulo traduzido), nullable, aditivo. Validado antes
                # num branch do Neon (br-frosty-resonance-aq4equxa).
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS method TEXT",
                "ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS method_other TEXT",
                # colunas antigas (texto livre), substituidas pelas estruturadas acima
                "ALTER TABLE workout_exercises DROP COLUMN IF EXISTS reps",
                "ALTER TABLE workout_exercises DROP COLUMN IF EXISTS target_load",
            ]:
                try:
                    cur2.execute(col_sql)
                    conn.commit()
                except Exception:
                    conn.rollback()
            try:
                # 1 ficha ativa por aluno — garantido no banco, nao so na aplicacao
                cur2.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS one_active_workout_per_student
                    ON workouts (student_id) WHERE status = 'ativa'
                """)
                conn.commit()
            except Exception:
                conn.rollback()
            # Treino (2.4): registro de execucao de series + avaliacao pos-
            # treino. client_key e gerado no app (localStorage) e sobrevive a
            # reenvios offline — UNIQUE garante que um reenvio apos
            # reconexao nunca duplica a mesma serie/execucao. Testado antes
            # num branch do Neon (br-soft-silence-aqqf4z02, deletado).
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS workout_executions (
                        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        student_id    UUID NOT NULL REFERENCES students(id),
                        workout_id    UUID NOT NULL REFERENCES workouts(id),
                        session_id    UUID NOT NULL REFERENCES workout_sessions(id),
                        session_name  TEXT NOT NULL,
                        started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        finished_at   TIMESTAMPTZ,
                        effort_score  INT,
                        mood_score    INT,
                        comment       TEXT,
                        client_key    TEXT UNIQUE NOT NULL,
                        created_at    TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT workout_executions_effort_check CHECK (effort_score IS NULL OR (effort_score BETWEEN 1 AND 5)),
                        CONSTRAINT workout_executions_mood_check CHECK (mood_score IS NULL OR (mood_score BETWEEN 1 AND 5))
                    )
                """)
                cur2.execute("CREATE INDEX IF NOT EXISTS workout_executions_student_idx ON workout_executions(student_id, started_at DESC)")
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS workout_execution_sets (
                        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        execution_id        UUID NOT NULL REFERENCES workout_executions(id) ON DELETE CASCADE,
                        workout_exercise_id UUID REFERENCES workout_exercises(id),
                        exercise_name       TEXT NOT NULL,
                        set_number          INT NOT NULL,
                        reps_target_min     INT,
                        reps_target_max     INT,
                        load_target         NUMERIC(6,2),
                        load_unit           TEXT DEFAULT 'kg',
                        reps_done           INT,
                        load_done           NUMERIC(6,2),
                        completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        client_key          TEXT UNIQUE NOT NULL,
                        created_at          TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur2.execute("CREATE INDEX IF NOT EXISTS workout_execution_sets_execution_idx ON workout_execution_sets(execution_id)")
                conn.commit()
            except Exception:
                conn.rollback()
            # checkins.type e ENUM (checkin_type) com so semanal/mensal/
            # trimestral — precisa de um 4o valor pro peso opcional lancado
            # pelo proprio aluno no fim do treino (2.4). Aditivo, testado
            # antes num branch do Neon (br-super-wave-aq80vw8d, deletado).
            try:
                cur2.execute("ALTER TYPE checkin_type ADD VALUE IF NOT EXISTS 'treino'")
                conn.commit()
            except Exception:
                conn.rollback()
            # Privacidade do aluno: aceite versionado de termos + pedidos de
            # exclusao/exportacao de dados (processados manualmente por ora).
            # Testado antes num branch do Neon (br-aged-tooth-aqt8dopv, deletado).
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS student_consents (
                        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        account_id  UUID NOT NULL REFERENCES student_accounts(id),
                        version     TEXT NOT NULL,
                        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE (account_id, version)
                    )
                """)
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS privacy_requests (
                        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        account_id  UUID NOT NULL REFERENCES student_accounts(id),
                        type        TEXT NOT NULL,
                        status      TEXT NOT NULL DEFAULT 'pendente',
                        note        TEXT,
                        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        resolved_at TIMESTAMPTZ,
                        CONSTRAINT privacy_requests_type_check CHECK (type IN ('exclusao','exportacao')),
                        CONSTRAINT privacy_requests_status_check CHECK (status IN ('pendente','concluido'))
                    )
                """)
                cur2.execute("CREATE INDEX IF NOT EXISTS privacy_requests_status_idx ON privacy_requests(status, created_at DESC)")
                conn.commit()
            except Exception:
                conn.rollback()
            # student_acquisition_costs — custo de CADA PROFISSIONAL adquirir
            # um ALUNO (Nivel 1), nao confundir com acquisition_costs acima
            # (custo do Meridian adquirir um PROFISSIONAL, Nivel 2). "amount"
            # e salvo na moeda do proprio profissional (personals.moeda),
            # sem conversao automatica — mesma regra do multi-moeda.
            try:
                cur2.execute("""
                    CREATE TABLE IF NOT EXISTS student_acquisition_costs (
                        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        personal_id UUID NOT NULL REFERENCES personals(id),
                        amount      NUMERIC(10,2) NOT NULL,
                        currency    TEXT DEFAULT 'BRL',
                        category    TEXT NOT NULL,
                        description TEXT,
                        date        DATE NOT NULL DEFAULT CURRENT_DATE,
                        created_at  TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                conn.commit()
            except Exception:
                conn.rollback()
            # Backfill: convite cujo e-mail já tem conta criada nunca era
            # marcado como usado (o UPDATE correspondente nunca existiu em
            # /api/auth/register) — corrige o que já ficou pra trás.
            try:
                cur2.execute("""
                    UPDATE invites SET used = TRUE
                    WHERE used = FALSE AND email IN (SELECT email FROM users)
                """)
                conn.commit()
            except Exception:
                conn.rollback()
        conn.close()
        print("Tabela users OK")
    except Exception as e:
        print(f"Erro startup (nao critico): {e}")

# ═══════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════
class RegisterData(BaseModel):
    name:     str
    email:    str
    password: str
    role:     Optional[str] = "personal"

class LoginData(BaseModel):
    email:    str
    password: str

@app.get("/api/auth/check-invite")
def check_invite(email: str, conn=Depends(get_db)):
    rows = query(conn,
        "SELECT id, used FROM invites WHERE email = %s",
        (email.lower().strip(),))
    if not rows:
        raise HTTPException(404, "E-mail não encontrado. Solicite um convite ao administrador.")
    if rows[0]["used"]:
        raise HTTPException(400, "Este convite já foi utilizado.")
    return {"ok": True}

@app.post("/api/auth/register")
def register(data: RegisterData, conn=Depends(get_db)):
    existing = query(conn, "SELECT id FROM users WHERE email = %s", (data.email.lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="Email ja cadastrado")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter minimo 8 caracteres")
    hashed = hash_password(data.password)
    user   = execute(conn, """
        INSERT INTO users (name, email, password, role)
        VALUES (%s, %s, %s, %s)
        RETURNING id, name, email, role
    """, (data.name.strip(), data.email.lower().strip(), hashed, data.role or 'personal'))
    execute(conn, "UPDATE invites SET used = TRUE WHERE email = %s", (data.email.lower().strip(),))
    token = create_token(str(user["id"]), user["email"], user["name"])
    return {"token": token, "user": {"id": str(user["id"]), "name": user["name"], "email": user["email"], "role": user.get("role","personal")}}

@app.post("/api/auth/login")
def login(data: LoginData, conn=Depends(get_db)):
    rows = query(conn, "SELECT id, name, email, password, role FROM users WHERE email = %s", (data.email.lower(),))
    if not rows:
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    user = rows[0]
    if not check_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    token = create_token(str(user["id"]), user["email"], user["name"])
    return {"token": token, "user": {"id": str(user["id"]), "name": user["name"], "email": user["email"], "role": user.get("role","personal")}}

@app.get("/api/auth/me")
def me(current_user=Depends(get_current_user), conn=Depends(get_db)):
    """Retorna usuario + personal_id para o dashboard."""
    user_id = current_user.get("sub")
    user_row = query(conn, "SELECT role FROM users WHERE id = %s", (user_id,))
    role = user_row[0]["role"] if user_row else "personal"
    personal = query(conn, "SELECT id FROM personals WHERE clerk_user_id = %s", (user_id,))
    if not personal:
        result = execute(conn,
            "INSERT INTO personals (clerk_user_id, name, email) VALUES (%s,%s,%s) ON CONFLICT (clerk_user_id) DO UPDATE SET name=EXCLUDED.name RETURNING id",
            (user_id, current_user.get("name","Personal"), current_user.get("email",""))
        )
        personal_id = str(result.get("id", user_id))
    else:
        personal_id = str(personal[0]["id"])
    return {**current_user, "personal_id": personal_id, "role": role}

class ForgotPasswordData(BaseModel):
    email: str

class ResetPasswordData(BaseModel):
    token:        str
    new_password: str

class ChangePasswordData(BaseModel):
    current_password: str
    new_password:      str

@app.post("/api/auth/forgot-password")
def forgot_password(data: ForgotPasswordData, conn=Depends(get_db)):
    rows = query(conn, "SELECT id FROM users WHERE email = %s", (data.email.lower().strip(),))
    if not rows:
        raise HTTPException(status_code=404, detail="E-mail nao encontrado")
    token      = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    execute(conn, """
        INSERT INTO password_resets (user_id, token, expires_at)
        VALUES (%s, %s, %s)
        RETURNING id
    """, (rows[0]["id"], token, expires_at))
    return {"token": token}

@app.post("/api/auth/reset-password")
def reset_password(data: ResetPasswordData, conn=Depends(get_db)):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter minimo 8 caracteres")
    rows = query(conn, """
        SELECT id, user_id, expires_at, used FROM password_resets WHERE token = %s
    """, (data.token,))
    if not rows:
        raise HTTPException(status_code=400, detail="Token invalido")
    reset = rows[0]
    if reset["used"]:
        raise HTTPException(status_code=400, detail="Token ja utilizado")
    if reset["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado")
    hashed = hash_password(data.new_password)
    execute(conn, "UPDATE users SET password = %s WHERE id = %s", (hashed, reset["user_id"]))
    execute(conn, "UPDATE password_resets SET used = TRUE WHERE id = %s", (reset["id"],))
    return {"ok": True}

@app.patch("/api/auth/change-password")
def change_password(data: ChangePasswordData, current_user=Depends(get_current_user), conn=Depends(get_db)):
    user_id = current_user.get("sub")
    rows = query(conn, "SELECT password FROM users WHERE id = %s", (user_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    if not check_password(data.current_password, rows[0]["password"]):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter minimo 8 caracteres")
    hashed = hash_password(data.new_password)
    execute(conn, "UPDATE users SET password = %s WHERE id = %s", (hashed, user_id))
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════
#  HEALTH
# ═══════════════════════════════════════════════════════════════
@app.get("/api/health")
def health(conn=Depends(get_db)):
    result = query(conn, "SELECT NOW() as time")
    return {"status": "ok", "db": result[0]}

# ═══════════════════════════════════════════════════════════════
#  METRICAS BI
# ═══════════════════════════════════════════════════════════════
@app.get("/api/metrics/{personal_id}")
def get_metrics(personal_id: str, period: int = 365, conn=Depends(get_db), _=Depends(get_current_user)):
    return _compute_bi_metrics(conn, personal_id, period)

def _compute_bi_metrics(conn, personal_id: str, period: int = 365):
    period = max(7, min(int(period), 1095))
    mrr = query(conn, """
        SELECT COUNT(DISTINCT sub.student_id) AS active_students,
               COALESCE(SUM(sub.price_paid / NULLIF(p.duration_months,0)),0) AS mrr,
               COALESCE(AVG(sub.price_paid),0) AS avg_ticket
        FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id
        WHERE sub.personal_id = %s AND sub.status = 'active'
          AND sub.expires_at >= CURRENT_DATE
    """, (personal_id,))
    e7 = query(conn, """
        SELECT COUNT(*) AS count, COALESCE(SUM(price_paid),0) AS value
        FROM subscriptions WHERE personal_id = %s AND status = 'active'
          AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
    """, (personal_id,))
    e30 = query(conn, """
        SELECT COUNT(*) AS count, COALESCE(SUM(price_paid),0) AS value
        FROM subscriptions WHERE personal_id = %s AND status = 'active'
          AND expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    """, (personal_id,))
    pending_forms = query(conn, """
        SELECT COUNT(*) AS count
        FROM form_tokens WHERE personal_id = %s AND used = false AND expires_at > NOW()
    """, (personal_id,))
    mrr_history = query(conn, f"""
        SELECT TO_CHAR(DATE_TRUNC('month', sub.starts_at), 'Mon/YY') AS month,
               SUM(sub.price_paid / NULLIF(p.duration_months,0)) AS mrr
        FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id
        WHERE sub.personal_id = %s
          AND sub.starts_at >= NOW() - INTERVAL '{period} days'
        GROUP BY DATE_TRUNC('month', sub.starts_at)
        ORDER BY DATE_TRUNC('month', sub.starts_at)
    """, (personal_id,))
    # Canais de aquisição
    channels = query(conn,
        "SELECT channel, COUNT(DISTINCT student_id) AS count FROM subscriptions sub "
        "JOIN students s ON s.id = sub.student_id "
        "WHERE sub.personal_id = %s AND sub.status = %s AND s.channel IS NOT NULL "
        "GROUP BY channel ORDER BY count DESC",
        (personal_id, 'active'))

    # Taxa de renovação por plano — de contratos que já venceram nesse plano,
    # quantos tiveram uma assinatura seguinte (renovaram, em qualquer plano)
    renewal_by_plan = query(conn,
        "SELECT p.name AS plan_name, p.duration_months, "
        "COUNT(*) FILTER (WHERE sub.expires_at < CURRENT_DATE) AS expired_count, "
        "COUNT(*) FILTER (WHERE sub.expires_at < CURRENT_DATE AND EXISTS ("
        "  SELECT 1 FROM subscriptions sub2 WHERE sub2.student_id = sub.student_id "
        "    AND sub2.starts_at > sub.starts_at"
        ")) AS renewed_count "
        "FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id "
        "WHERE sub.personal_id = %s "
        "GROUP BY p.name, p.duration_months "
        "HAVING COUNT(*) FILTER (WHERE sub.expires_at < CURRENT_DATE) > 0 "
        "ORDER BY p.duration_months",
        (personal_id,))
    for r in renewal_by_plan:
        expired = int(r.pop("expired_count") or 0)
        renewed = int(r.pop("renewed_count") or 0)
        r["renewal_rate"] = round(renewed / expired * 100) if expired else 0

    # Mix de planos — base ativa agora (status active E ainda não vencido)
    active_plan_mix = query(conn,
        "SELECT p.name AS plan_name, p.duration_months, COUNT(*) AS active_count "
        "FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id "
        "WHERE sub.personal_id = %s AND sub.status = 'active' AND sub.expires_at >= CURRENT_DATE "
        "GROUP BY p.name, p.duration_months ORDER BY p.duration_months",
        (personal_id,))

    # Receita por canal
    revenue_by_channel = query(conn,
        "SELECT s.channel, "
        "COALESCE(SUM(sub.price_paid), 0) AS revenue, "
        "COUNT(DISTINCT sub.student_id) AS students "
        "FROM subscriptions sub "
        "JOIN students s ON s.id = sub.student_id "
        "WHERE sub.personal_id = %s AND s.channel IS NOT NULL "
        "GROUP BY s.channel ORDER BY revenue DESC",
        (personal_id,))

    # Novos alunos por mês
    student_flow = query(conn, f"""
        SELECT TO_CHAR(DATE_TRUNC('month', starts_at), 'Mon/YY') AS month,
               COUNT(DISTINCT student_id) AS new_students
        FROM subscriptions WHERE personal_id = %s AND starts_at IS NOT NULL
          AND starts_at >= NOW() - INTERVAL '{period} days'
        GROUP BY DATE_TRUNC('month', starts_at)
        ORDER BY DATE_TRUNC('month', starts_at) LIMIT 12
    """, (personal_id,))

    # Sazonalidade — matrículas por mês do ano (Jan-Dez), somando todos os anos
    seasonality = query(conn,
        "SELECT EXTRACT(MONTH FROM starts_at)::int AS month_num, "
        "COUNT(DISTINCT student_id) AS new_students "
        "FROM subscriptions WHERE personal_id = %s AND starts_at IS NOT NULL "
        "GROUP BY month_num ORDER BY month_num",
        (personal_id,))

    # Taxa de renovação, churn e LTV médio
    renov_data = query(conn,
        "SELECT COUNT(*) FILTER (WHERE status=\'active\') AS active, COUNT(*) AS total "
        "FROM subscriptions WHERE personal_id=%s",
        (personal_id,))
    ltv_data = query(conn,
        "SELECT COALESCE(AVG(total),0) AS avg_ltv FROM "
        "(SELECT student_id, SUM(price_paid) AS total FROM subscriptions "
        " WHERE personal_id=%s GROUP BY student_id) t",
        (personal_id,))
    rd = renov_data[0] if renov_data else {}
    total_s  = int(rd.get("total") or 0)
    active_s = int(rd.get("active") or 0)
    renewal_rate = round(active_s / total_s * 100) if total_s > 0 else 0
    avg_ltv = float((ltv_data[0] if ltv_data else {}).get("avg_ltv") or 0)

    # Churn: % de alunos cuja assinatura mais recente esta vencida ou cancelada
    # (perda real — plano venceu e nao foi renovado — nao apenas cancelamento
    # explicito, que na pratica quase nunca acontece; personal trainer so para
    # de renovar). Nao usa "status" bruto porque status nunca vira sozinho ao
    # vencer (mesmo padrao ja conhecido de expires_at neste projeto).
    churn_data = query(conn, """
        WITH latest_sub AS (
            SELECT DISTINCT ON (sub.student_id) sub.student_id, sub.status, sub.expires_at
            FROM subscriptions sub WHERE sub.personal_id = %s
            ORDER BY sub.student_id, sub.starts_at DESC
        )
        SELECT COUNT(*) AS total_students,
               COUNT(*) FILTER (WHERE status = 'cancelled' OR expires_at < CURRENT_DATE) AS churned_students
        FROM latest_sub
    """, (personal_id,))
    cd = churn_data[0] if churn_data else {}
    total_students   = int(cd.get("total_students") or 0)
    churned_students = int(cd.get("churned_students") or 0)
    churn_rate = round(churned_students / total_students * 100) if total_students > 0 else 0

    # CAC (Nivel 1): custo de aquisicao lancado no periodo / novos alunos no
    # mesmo periodo. "Novo aluno" = MIN(starts_at) da 1a assinatura dele cai
    # dentro do periodo (mesma definicao ja usada em student_since/BI) — nao
    # conta renovacao como aquisicao nova.
    custo_periodo_row = query(conn, f"""
        SELECT COALESCE(SUM(amount),0) AS total FROM student_acquisition_costs
        WHERE personal_id = %s AND date >= CURRENT_DATE - INTERVAL '{period} days'
    """, (personal_id,))
    novos_alunos_row = query(conn, f"""
        WITH first_sub AS (
            SELECT student_id, MIN(starts_at) AS first_start
            FROM subscriptions WHERE personal_id = %s
            GROUP BY student_id
        )
        SELECT COUNT(*) AS n FROM first_sub
        WHERE first_start >= CURRENT_DATE - INTERVAL '{period} days'
    """, (personal_id,))
    custo_periodo  = float((custo_periodo_row[0] if custo_periodo_row else {}).get("total") or 0)
    novos_alunos   = int((novos_alunos_row[0] if novos_alunos_row else {}).get("n") or 0)
    cac = round(custo_periodo / novos_alunos, 2) if custo_periodo > 0 and novos_alunos > 0 else None

    # Receita acumulada no ano corrente (pra progresso da meta anual em Config)
    receita_ano_data = query(conn, """
        SELECT COALESCE(SUM(price_paid),0) AS receita_ano
        FROM subscriptions WHERE personal_id = %s
          AND DATE_TRUNC('year', starts_at) = DATE_TRUNC('year', CURRENT_DATE)
    """, (personal_id,))
    receita_ano = float((receita_ano_data[0] if receita_ano_data else {}).get("receita_ano") or 0)

    m = mrr[0] if mrr else {}
    return {
        "active_students": int(m.get("active_students") or 0),
        "mrr":             float(m.get("mrr") or 0),
        "avg_ticket":      float(m.get("avg_ticket") or 0),
        "renewal_rate":    renewal_rate,
        "churn_rate":      churn_rate,
        "cac":             cac,
        "avg_ltv":         round(avg_ltv, 2),
        "receita_ano":     round(receita_ano, 2),
        "expiring_7d":     {"count": int((e7[0] if e7 else {}).get("count") or 0),
                            "value": float((e7[0] if e7 else {}).get("value") or 0)},
        "expiring_30d":    {"count": int((e30[0] if e30 else {}).get("count") or 0)},
        "pending_forms":   int((pending_forms[0] if pending_forms else {}).get("count") or 0),
        "mrr_history":     mrr_history,
        "student_flow":    student_flow,
        "seasonality":     seasonality,
        "channels":            channels,
        "renewal_by_plan":     renewal_by_plan,
        "active_plan_mix":     active_plan_mix,
        "revenue_by_channel":  revenue_by_channel,
    }

# ═══════════════════════════════════════════════════════════════
#  INSIGHTS + GEO
# ═══════════════════════════════════════════════════════════════
@app.get("/api/insights/{personal_id}")
def get_insights(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    gender  = query(conn,
        "SELECT gender, COUNT(*) AS c FROM students WHERE personal_id=%s AND gender IS NOT NULL "
        "GROUP BY gender ORDER BY c DESC LIMIT 1", (personal_id,))
    age = query(conn,
        "SELECT CASE "
        "  WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 25 THEN '18-24' "
        "  WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 35 THEN '25-34' "
        "  WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 45 THEN '35-44' "
        "  ELSE '45+' END AS faixa, COUNT(*) AS c "
        "FROM students WHERE personal_id=%s AND birth_date IS NOT NULL "
        "GROUP BY faixa ORDER BY c DESC LIMIT 1", (personal_id,))
    goal    = query(conn,
        "SELECT goal, COUNT(*) AS c FROM students WHERE personal_id=%s AND goal IS NOT NULL "
        "GROUP BY goal ORDER BY c DESC LIMIT 1", (personal_id,))
    plan    = query(conn,
        "SELECT p.name, COUNT(*) AS c FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id "
        "WHERE sub.personal_id=%s GROUP BY p.name ORDER BY c DESC LIMIT 1", (personal_id,))
    channel = query(conn,
        "SELECT channel, COUNT(*) AS c FROM students WHERE personal_id=%s AND channel IS NOT NULL "
        "GROUP BY channel ORDER BY c DESC LIMIT 1", (personal_id,))
    peak    = query(conn,
        "SELECT EXTRACT(HOUR FROM responded_at) AS hora, COUNT(*) AS c "
        "FROM checkins WHERE personal_id=%s AND responded_at IS NOT NULL "
        "GROUP BY hora ORDER BY c DESC LIMIT 1", (personal_id,))
    return {
        "genero_dominante":   gender[0]["gender"]  if gender  else "—",
        "faixa_etaria_top":   age[0]["faixa"]       if age     else "—",
        "objetivo_principal": goal[0]["goal"]       if goal    else "—",
        "plano_preferido":    plan[0]["name"]       if plan    else "—",
        "canal_principal":    channel[0]["channel"] if channel else "—",
        "pico_horario":       int(peak[0]["hora"])  if peak    else None,
    }

@app.get("/api/geo/{personal_id}")
def get_geo(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn,
        "SELECT state, COUNT(*) AS total FROM students "
        "WHERE personal_id=%s AND state IS NOT NULL "
        "GROUP BY state ORDER BY total DESC", (personal_id,))

@app.get("/api/sales/metrics/{personal_id}")
def get_sales_metrics(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return _compute_sales_metrics(conn, personal_id)

def _compute_sales_metrics(conn, personal_id: str):
    current_month = query(conn, """
        SELECT COUNT(*) AS vendas_mes,
               COALESCE(SUM(price_paid), 0) AS receita_mes
        FROM subscriptions
        WHERE personal_id = %s
          AND DATE_TRUNC('month', starts_at) = DATE_TRUNC('month', CURRENT_DATE)
          AND status IN ('active', 'renewed')
    """, (personal_id,))
    pipeline = query(conn, """
        SELECT COUNT(*) AS total_leads,
               COUNT(*) FILTER (WHERE status='proposta') AS propostas
        FROM leads WHERE personal_id = %s
    """, (personal_id,))
    by_channel = query(conn, """
        SELECT channel,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status='fechado') AS fechados
        FROM leads
        WHERE personal_id = %s
        GROUP BY channel
    """, (personal_id,))
    # Tempo medio entre 1o contato e desfecho final (fechado OU perdido —
    # qualquer resultado conta, nao so venda). Nao existe historico de
    # mudanca de status, entao usa created_at (criacao do lead) ate
    # updated_at (ultima alteracao do registro) como aproximacao — se
    # alguem editar notas de um lead ja fechado, o tempo desse lead fica
    # inflado, mas e o unico dado disponivel sem criar rastreamento novo.
    tempo_medio_row = query(conn, """
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_seconds
        FROM leads
        WHERE personal_id = %s AND status IN ('fechado', 'perdido')
    """, (personal_id,))
    avg_seconds = (tempo_medio_row[0] or {}).get('avg_seconds') if tempo_medio_row else None
    tempo_medio_dias = round(avg_seconds / 86400, 1) if avg_seconds is not None else None
    cm = current_month[0] if current_month else {}
    pl = pipeline[0] if pipeline else {}
    total_leads = int(pl.get('total_leads') or 0)
    propostas   = int(pl.get('propostas') or 0)

    conversion_by_channel = []
    for row in by_channel:
        total    = int(row['total'])
        fechados = int(row['fechados'])
        conversion_by_channel.append({
            "channel":    row['channel'],
            "total":      total,
            "fechados":   fechados,
            "rate":       round(fechados / total * 100) if total > 0 else 0,
            "low_sample": total < 3,
        })
    conversion_by_channel.sort(key=lambda c: c["rate"], reverse=True)

    return {
        "vendas_mes":            int(cm.get('vendas_mes') or 0),
        "receita_mes":           float(cm.get('receita_mes') or 0),
        "taxa_fechamento":       round(propostas / total_leads * 100) if total_leads > 0 else 0,
        "total_leads":           total_leads,
        "conversion_by_channel": conversion_by_channel,
        "tempo_medio_dias":      tempo_medio_dias,
    }

# ═══════════════════════════════════════════════════════════════
#  CUSTO DE AQUISIÇÃO DE ALUNO (Nivel 1 — custo do profissional pra
#  adquirir alunos dele, alimenta o CAC da aba BI. Nao confundir com
#  acquisition_costs, que e o custo do Meridian pra adquirir PROFISSIONAIS)
# ═══════════════════════════════════════════════════════════════
STUDENT_ACQUISITION_CATEGORIES = ("trafego_pago", "conteudo", "indicacao_paga", "outro")

class AcquisitionCostCreate(BaseModel):
    personal_id: str
    amount:      float
    category:    str
    currency:    Optional[str] = None
    description: Optional[str] = None
    date:        Optional[str] = None

@app.get("/api/acquisition-costs/{personal_id}")
def list_student_acquisition_costs(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn, """
        SELECT * FROM student_acquisition_costs
        WHERE personal_id = %s ORDER BY date DESC, created_at DESC LIMIT 100
    """, (personal_id,))

@app.post("/api/acquisition-costs")
def create_student_acquisition_cost(data: AcquisitionCostCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(400, "Valor deve ser maior que zero")
    if data.category not in STUDENT_ACQUISITION_CATEGORIES:
        raise HTTPException(400, "Categoria invalida")
    currency = data.currency
    if not currency:
        personal = query(conn, "SELECT moeda FROM personals WHERE id=%s", (data.personal_id,))
        currency = (personal[0]["moeda"] if personal else None) or "BRL"
    return execute(conn, """
        INSERT INTO student_acquisition_costs (personal_id, amount, currency, category, description, date)
        VALUES (%s, %s, %s, %s, %s, COALESCE(%s, CURRENT_DATE))
        RETURNING id
    """, (data.personal_id, data.amount, currency, data.category, data.description, data.date))

# ═══════════════════════════════════════════════════════════════
#  CONTA DO ALUNO — login sem senha (código por e-mail), tema do
#  profissional (white-label) e manifest do PWA
# ═══════════════════════════════════════════════════════════════
LOGIN_CODE_TTL_MIN = 10
LOGIN_CODE_MAX_ATTEMPTS = 5
LOGIN_CODE_MAX_PER_HOUR = 5
IP_REQUEST_CODE_MAX_PER_HOUR = 10
IP_VERIFY_CODE_MAX_PER_HOUR = 30

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _rate_limited(conn, key: str, max_per_hour: int) -> bool:
    """True se o limite ja foi atingido — e sempre REGISTRA a tentativa
    atual (mesmo quando o resultado e sim), pra nao dar brecha de contar
    so chamadas bem-sucedidas."""
    n = query(conn, "SELECT COUNT(*) AS n FROM auth_rate_limit WHERE rl_key=%s AND created_at > NOW() - INTERVAL '1 hour'", (key,))
    execute(conn, "INSERT INTO auth_rate_limit (rl_key) VALUES (%s)", (key,))
    return int(n[0]["n"]) >= max_per_hour
STUDENT_TOKEN_DAYS = 30
RESEND_FROM = os.getenv("RESEND_FROM", "Meridian <acesso@meridianstrategy.de>")
DEFAULT_BRAND_PRIMARY = "#C9A84C"
DEFAULT_BRAND_ACCENT = "#4F46E5"

def _rel_luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(int(h[i:i+2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def _contrast(a: str, b: str) -> float:
    la, lb = sorted((_rel_luminance(a), _rel_luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def validate_brand_color(color: str, label: str) -> str:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(color)):
        raise HTTPException(400, f"{label}: use o formato #RRGGBB")
    best_text = max(_contrast(color, "#ffffff"), _contrast(color, "#111111"))
    if best_text < 4.5:
        raise HTTPException(400, f"{label}: contraste insuficiente para texto (mínimo 4.5:1)")
    return color.lower()

def _login_code_hash(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{code}:{JWT_SECRET}".encode()).hexdigest()

def create_student_token(account_id: str, email: str, name: str) -> str:
    payload = {
        "sub": account_id, "email": email, "name": name, "typ": "student",
        "exp": datetime.utcnow() + timedelta(days=STUDENT_TOKEN_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _send_login_code_email(to: str, code: str, brand_name: Optional[str]) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise HTTPException(500, "Envio de e-mail nao configurado")
    who = html_escape(brand_name or "Meridian")
    body_html = (
        f"<p>Seu código de acesso ao app de treino de <strong>{who}</strong>:</p>"
        f"<p style='font-size:28px;letter-spacing:6px;font-weight:700'>{code}</p>"
        f"<p>Válido por {LOGIN_CODE_TTL_MIN} minutos. Se você não pediu este código, ignore este e-mail.</p>"
    )
    payload = json.dumps({
        "from": RESEND_FROM, "to": [to],
        "subject": f"Seu código de acesso: {code}", "html": body_html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=payload, method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=10).read()

class StudentCodeRequest(BaseModel):
    email: str

class StudentCodeVerify(BaseModel):
    email: str
    code:  str

@app.post("/api/aluno/auth/request-code")
def aluno_request_code(data: StudentCodeRequest, request: Request, conn=Depends(get_db)):
    email = data.email.strip().lower()
    generic = {"ok": True}
    # Limite por IP ANTES de olhar se o e-mail existe — sem isso, e-mail
    # invalido repetido nao tinha freio nenhum (login_codes so grava pra
    # e-mail valido, entao o contador por e-mail nunca entrava em jogo)
    if _rate_limited(conn, "req:" + _client_ip(request), IP_REQUEST_CODE_MAX_PER_HOUR):
        return generic
    owner = query(conn, """
        SELECT p.name AS personal_name, p.brand_name
        FROM students s JOIN personals p ON p.id = s.personal_id
        WHERE lower(s.email) = %s AND COALESCE(s.status,'active') != 'cancelled'
        LIMIT 1
    """, (email,))
    if not owner:
        return generic
    recent = query(conn,
        "SELECT COUNT(*) AS n FROM login_codes WHERE email=%s AND created_at > NOW() - INTERVAL '1 hour'",
        (email,))
    if int(recent[0]["n"]) >= LOGIN_CODE_MAX_PER_HOUR:
        return generic
    code = f"{secrets.randbelow(1_000_000):06d}"
    execute(conn, """
        INSERT INTO login_codes (email, code_hash, expires_at)
        VALUES (%s, %s, NOW() + (%s * INTERVAL '1 minute'))
    """, (email, _login_code_hash(email, code), LOGIN_CODE_TTL_MIN))
    _send_login_code_email(email, code, owner[0]["brand_name"] or owner[0]["personal_name"])
    return generic

@app.post("/api/aluno/auth/verify-code")
def aluno_verify_code(data: StudentCodeVerify, request: Request, conn=Depends(get_db)):
    email = data.email.strip().lower()
    code = data.code.strip()
    invalid = HTTPException(401, "Código inválido ou expirado")
    if _rate_limited(conn, "verify:" + _client_ip(request), IP_VERIFY_CODE_MAX_PER_HOUR):
        raise invalid
    rows = query(conn, """
        SELECT id, code_hash, attempts FROM login_codes
        WHERE email=%s AND used=false AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
    """, (email,))
    if not rows or rows[0]["attempts"] >= LOGIN_CODE_MAX_ATTEMPTS:
        raise invalid
    row = rows[0]
    execute(conn, "UPDATE login_codes SET attempts = attempts + 1 WHERE id=%s", (row["id"],))
    if not hmac.compare_digest(row["code_hash"], _login_code_hash(email, code)):
        raise invalid
    execute(conn, "UPDATE login_codes SET used=true WHERE id=%s", (row["id"],))
    account = execute(conn, """
        INSERT INTO student_accounts (email) VALUES (%s)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
        RETURNING id, email, name
    """, (email,))
    execute(conn, """
        INSERT INTO student_account_links (student_id, account_id)
        SELECT s.id, %s FROM students s WHERE lower(s.email) = %s
        ON CONFLICT (student_id) DO NOTHING
    """, (account["id"], email))
    return {"token": create_student_token(str(account["id"]), email, account.get("name") or email)}

@app.get("/api/aluno/me")
def aluno_me(current=Depends(get_current_student), conn=Depends(get_db)):
    students_rows = query(conn, """
        SELECT s.id, s.name, s.personal_id,
               p.name AS personal_name, p.brand_name, p.brand_logo_url,
               p.brand_primary, p.brand_accent
        FROM student_account_links l
        JOIN students s ON s.id = l.student_id
        JOIN personals p ON p.id = s.personal_id
        WHERE l.account_id = %s
    """, (current["sub"],))
    return {"email": current["email"], "name": current.get("name"), "students": students_rows}

# ═══════════════════════════════════════════════════════════════
#  PRIVACIDADE DO ALUNO — termos versionados + exclusão/exportação
# ═══════════════════════════════════════════════════════════════
# RASCUNHO — texto placeholder. O Vinicius substitui pelo texto jurídico
# definitivo antes de usar com alunos reais; o mecanismo de versionamento
# já funciona (bump em TERMS_VERSION força todo mundo a re-aceitar).
TERMS_VERSION = "1.0"
TERMS_TEXT = """TERMOS DE USO E POLÍTICA DE PRIVACIDADE (rascunho v1.0)

Este é um texto provisório — será substituído pelo texto jurídico definitivo.

1. QUE DADOS COLETAMOS
Nome, e-mail, telefone, dados físicos (peso, % de gordura, medidas),
respostas de formulários de acompanhamento, fotos de progresso e dados de
treino (séries, cargas, avaliações pós-treino).

2. PARA QUE USAMOS
Para que seu profissional acompanhe sua evolução e monte/ajuste seus
treinos. Não vendemos nem compartilhamos seus dados com terceiros para
fins de marketing.

3. QUEM TEM ACESSO
Você e o profissional responsável pelo seu acompanhamento. A equipe do
Meridian pode acessar dados tecnicamente para suporte e manutenção.

4. ONDE SEUS DADOS FICAM ARMAZENADOS
Dados estruturados (cadastro, treinos, avaliações): banco de dados Neon.
Fotos de progresso: Cloudinary. Hospedagem da aplicação: Vercel. Envio do
código de acesso por e-mail: Resend.

5. SEUS DIREITOS
Você pode solicitar a exclusão da sua conta ou a exportação dos seus
dados a qualquer momento, pelo próprio app, na seção "Privacidade".

6. CONTATO
Dúvidas sobre privacidade: fale com o profissional que te acompanha."""

def _terms_accepted(conn, account_id: str) -> bool:
    rows = query(conn, "SELECT 1 FROM student_consents WHERE account_id=%s AND version=%s", (account_id, TERMS_VERSION))
    return bool(rows)

@app.get("/api/aluno/termos")
def aluno_termos(conn=Depends(get_db)):
    """Publica — o texto precisa aparecer antes mesmo de qualquer aceite."""
    return {"version": TERMS_VERSION, "text": TERMS_TEXT}

@app.get("/api/aluno/termos/status")
def aluno_termos_status(current=Depends(get_current_student), conn=Depends(get_db)):
    return {"accepted": _terms_accepted(conn, current["sub"]), "version": TERMS_VERSION}

class TermosAceite(BaseModel):
    version: str

@app.post("/api/aluno/termos/aceitar")
def aluno_termos_aceitar(data: TermosAceite, current=Depends(get_current_student), conn=Depends(get_db)):
    if data.version != TERMS_VERSION:
        raise HTTPException(400, "Versão dos termos desatualizada — recarregue a página")
    execute(conn, """
        INSERT INTO student_consents (account_id, version) VALUES (%s, %s)
        ON CONFLICT (account_id, version) DO NOTHING
    """, (current["sub"], TERMS_VERSION))
    return {"ok": True}

class PrivacyRequestIn(BaseModel):
    type: str
    note: Optional[str] = None

@app.post("/api/aluno/privacidade/solicitar")
def aluno_privacidade_solicitar(data: PrivacyRequestIn, current=Depends(get_current_student), conn=Depends(get_db)):
    if data.type not in ("exclusao", "exportacao"):
        raise HTTPException(400, "Tipo inválido")
    row = execute(conn, """
        INSERT INTO privacy_requests (account_id, type, note) VALUES (%s, %s, %s)
        RETURNING id, type, status, created_at
    """, (current["sub"], data.type, (data.note or "").strip()[:500] or None))
    return row

@app.get("/api/aluno/privacidade/solicitacoes")
def aluno_privacidade_solicitacoes(current=Depends(get_current_student), conn=Depends(get_db)):
    return query(conn, """
        SELECT id, type, status, note, created_at, resolved_at FROM privacy_requests
        WHERE account_id=%s ORDER BY created_at DESC
    """, (current["sub"],))

# ── Admin: fila de pedidos de privacidade (processamento manual) ───────
@app.get("/api/admin/privacy-requests")
def admin_privacy_requests(admin_key: str, status: Optional[str] = None, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    sql = """
        SELECT pr.id, pr.type, pr.status, pr.note, pr.created_at, pr.resolved_at,
               sa.email AS account_email
        FROM privacy_requests pr JOIN student_accounts sa ON sa.id = pr.account_id
    """
    params = []
    if status:
        sql += " WHERE pr.status=%s"; params.append(status)
    sql += " ORDER BY pr.created_at DESC"
    return query(conn, sql, tuple(params))

class PrivacyRequestResolve(BaseModel):
    admin_key: str
    status: str

@app.patch("/api/admin/privacy-requests/{request_id}")
def admin_privacy_request_resolve(request_id: str, data: PrivacyRequestResolve, conn=Depends(get_db)):
    _check_admin_key(data.admin_key)
    if data.status not in ("pendente", "concluido"):
        raise HTTPException(400, "Status inválido")
    resolved_at = "NOW()" if data.status == "concluido" else "NULL"
    return execute(conn, f"""
        UPDATE privacy_requests SET status=%s, resolved_at={resolved_at} WHERE id=%s
        RETURNING id, status
    """, (data.status, request_id))

@app.get("/api/aluno/treino")
def aluno_treino(personal_id: str, current=Depends(get_current_student), conn=Depends(get_db)):
    """Ficha ATIVA do aluno logado, escopada ao personal_id da URL do app
    (aluno.html e sempre /aluno/{personal_id}). So retorna dado do
    student vinculado a ESSA conta E a ESSE profissional — uma conta
    pode estar ligada a alunos de profissionais diferentes, mas cada
    carregamento do app so enxerga um."""
    link = query(conn, """
        SELECT s.id AS student_id, s.name AS student_name FROM student_account_links l
        JOIN students s ON s.id = l.student_id
        WHERE l.account_id = %s AND s.personal_id = %s
    """, (current["sub"], personal_id))
    if not link:
        raise HTTPException(403, "Esta conta nao esta vinculada a um aluno deste profissional")
    student_id = link[0]["student_id"]
    ativa = query(conn, "SELECT * FROM workouts WHERE student_id=%s AND status='ativa'", (student_id,))
    if ativa:
        _attach_sessions(conn, ativa)
        return {"active": ativa[0], "had_previous": True, "student_name": link[0]["student_name"]}
    any_before = query(conn, "SELECT id FROM workouts WHERE student_id=%s LIMIT 1", (student_id,))
    return {"active": None, "had_previous": bool(any_before), "student_name": link[0]["student_name"]}

# ═══════════════════════════════════════════════════════════════
#  TREINO — execução de séries + avaliação pós-treino (2.4)
# ═══════════════════════════════════════════════════════════════
def _own_student_id_for_session(conn, session_id: str, current: dict) -> tuple[str, str, str]:
    """Confere que a sessao pertence a uma ficha do aluno logado (via
    student_account_links). Retorna (student_id, workout_id, session_name)."""
    rows = query(conn, """
        SELECT w.student_id, w.id AS workout_id, ws.name AS session_name
        FROM workout_sessions ws JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.id = %s
    """, (session_id,))
    if not rows or not rows[0]["student_id"]:
        raise HTTPException(404, "Treino não encontrado")
    link = query(conn, """
        SELECT 1 FROM student_account_links WHERE account_id=%s AND student_id=%s
    """, (current["sub"], rows[0]["student_id"]))
    if not link:
        raise HTTPException(403, "Este treino não pertence a você")
    return str(rows[0]["student_id"]), str(rows[0]["workout_id"]), rows[0]["session_name"]

def _own_execution_by_client_key(conn, execution_client_key: str, current: dict) -> dict:
    """Resolve a execucao pelo client_key (gerado no app) em vez do id do
    servidor — assim a fila offline nunca depende de ter recebido de volta
    o id gerado pelo POST /iniciar antes de poder enfileirar series/finalizar."""
    rows = query(conn, "SELECT * FROM workout_executions WHERE client_key=%s", (execution_client_key,))
    if not rows:
        raise HTTPException(404, "Execução não encontrada — inicie o treino antes de registrar séries")
    link = query(conn, "SELECT 1 FROM student_account_links WHERE account_id=%s AND student_id=%s",
                 (current["sub"], rows[0]["student_id"]))
    if not link:
        raise HTTPException(403, "Esta execução não pertence a você")
    return rows[0]

class ExecucaoStart(BaseModel):
    session_id: str
    client_key: str

class SetLogIn(BaseModel):
    workout_exercise_id: Optional[str] = None
    exercise_name:       str
    set_number:          int
    reps_target_min:     Optional[int] = None
    reps_target_max:     Optional[int] = None
    load_target:         Optional[float] = None
    load_unit:            str = "kg"
    reps_done:           Optional[int] = None
    load_done:           Optional[float] = None
    client_key:          str

class SetsLogIn(BaseModel):
    execution_client_key: str
    sets: list[SetLogIn]

class ExecucaoFinish(BaseModel):
    execution_client_key: str
    effort_score: int
    mood_score:   int
    comment:      Optional[str] = None

@app.post("/api/aluno/treino/execucoes/iniciar")
def iniciar_execucao(data: ExecucaoStart, current=Depends(get_current_student), conn=Depends(get_db)):
    student_id, workout_id, session_name = _own_student_id_for_session(conn, data.session_id, current)
    existing = query(conn, "SELECT * FROM workout_executions WHERE client_key=%s", (data.client_key,))
    if existing:
        execution = existing[0]
    else:
        execution = execute(conn, """
            INSERT INTO workout_executions (student_id, workout_id, session_id, session_name, client_key)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (client_key) DO UPDATE SET client_key = EXCLUDED.client_key
            RETURNING *
        """, (student_id, workout_id, data.session_id, session_name, data.client_key))
    # Referencia "ultima vez" — ultima execucao FINALIZADA dessa mesma sessao
    # (nao necessariamente deste client_key), pra pre-preencher carga/reps.
    last = query(conn, """
        SELECT es.workout_exercise_id, es.set_number, es.reps_done, es.load_done
        FROM workout_execution_sets es
        JOIN workout_executions we ON we.id = es.execution_id
        WHERE we.session_id = %s AND we.student_id = %s AND we.finished_at IS NOT NULL
          AND we.id != %s
        ORDER BY we.finished_at DESC LIMIT 1
    """, (data.session_id, student_id, execution["id"]))
    last_time = {}
    if last:
        # pega so a execucao finalizada mais recente inteira, nao so 1 linha
        last_exec = query(conn, """
            SELECT we.id FROM workout_execution_sets es
            JOIN workout_executions we ON we.id = es.execution_id
            WHERE we.session_id = %s AND we.student_id = %s AND we.finished_at IS NOT NULL AND we.id != %s
            ORDER BY we.finished_at DESC LIMIT 1
        """, (data.session_id, student_id, execution["id"]))
        if last_exec:
            rows = query(conn, """
                SELECT workout_exercise_id, set_number, reps_done, load_done
                FROM workout_execution_sets WHERE execution_id=%s
            """, (last_exec[0]["id"],))
            for r in rows:
                key = str(r["workout_exercise_id"])
                last_time.setdefault(key, []).append(
                    {"set_number": r["set_number"], "reps_done": r["reps_done"], "load_done": float(r["load_done"]) if r["load_done"] is not None else None})
    already_done = query(conn, """
        SELECT workout_exercise_id, set_number, reps_done, load_done FROM workout_execution_sets WHERE execution_id=%s
    """, (execution["id"],))
    return {"execution": execution, "last_time": last_time, "already_done": already_done}

@app.post("/api/aluno/treino/execucoes/series")
def registrar_series(data: SetsLogIn, current=Depends(get_current_student), conn=Depends(get_db)):
    execution = _own_execution_by_client_key(conn, data.execution_client_key, current)
    if execution["finished_at"]:
        raise HTTPException(400, "Este treino já foi finalizado")
    saved = []
    for s in data.sets:
        row = execute(conn, """
            INSERT INTO workout_execution_sets
                (execution_id, workout_exercise_id, exercise_name, set_number,
                 reps_target_min, reps_target_max, load_target, load_unit,
                 reps_done, load_done, client_key)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (client_key) DO UPDATE SET client_key = EXCLUDED.client_key
            RETURNING *
        """, (execution["id"], s.workout_exercise_id, s.exercise_name, s.set_number,
              s.reps_target_min, s.reps_target_max, s.load_target, s.load_unit,
              s.reps_done, s.load_done, s.client_key))
        saved.append(row)
    return {"saved": saved}

@app.post("/api/aluno/treino/execucoes/finalizar")
def finalizar_execucao(data: ExecucaoFinish, current=Depends(get_current_student), conn=Depends(get_db)):
    execution = _own_execution_by_client_key(conn, data.execution_client_key, current)
    if not (1 <= data.effort_score <= 5) or not (1 <= data.mood_score <= 5):
        raise HTTPException(400, "Esforço e humor devem ser de 1 a 5")
    if execution["finished_at"]:
        return execution  # idempotente: ja finalizado (reenvio offline), devolve como esta
    return execute(conn, """
        UPDATE workout_executions
        SET finished_at=NOW(), effort_score=%s, mood_score=%s, comment=%s
        WHERE id=%s RETURNING *
    """, (data.effort_score, data.mood_score, data.comment, execution["id"]))

@app.get("/api/aluno/treino/execucoes")
def historico_execucoes_aluno(current=Depends(get_current_student), conn=Depends(get_db)):
    links = query(conn, "SELECT student_id FROM student_account_links WHERE account_id=%s", (current["sub"],))
    student_ids = [str(l["student_id"]) for l in links]
    if not student_ids:
        return []
    execs = query(conn, """
        SELECT * FROM workout_executions WHERE student_id = ANY(%s::uuid[]) AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 20
    """, (student_ids,))
    for e in execs:
        e["sets"] = query(conn, "SELECT * FROM workout_execution_sets WHERE execution_id=%s ORDER BY set_number", (e["id"],))
    return execs

class PesoIn(BaseModel):
    personal_id: str
    weight:      float

@app.post("/api/aluno/peso")
def registrar_peso_aluno(data: PesoIn, current=Depends(get_current_student), conn=Depends(get_db)):
    link = query(conn, """
        SELECT s.id AS student_id FROM student_account_links l JOIN students s ON s.id = l.student_id
        WHERE l.account_id=%s AND s.personal_id=%s
    """, (current["sub"], data.personal_id))
    if not link:
        raise HTTPException(403, "Aluno não vinculado a este profissional")
    student_id = link[0]["student_id"]
    recent = query(conn, """
        SELECT id FROM checkins WHERE student_id=%s AND weight_reported IS NOT NULL
          AND created_at > NOW() - INTERVAL '7 days'
    """, (student_id,))
    if recent:
        raise HTTPException(400, "Peso já registrado nos últimos 7 dias")
    execute(conn, """
        INSERT INTO checkins (student_id, personal_id, type, weight_reported, responded_at)
        VALUES (%s, %s, 'treino', %s, NOW())
    """, (student_id, data.personal_id, data.weight))
    execute(conn, "UPDATE students SET weight_current=%s WHERE id=%s", (data.weight, student_id))
    return {"ok": True}

@app.get("/api/aluno/peso/status")
def status_peso_aluno(personal_id: str, current=Depends(get_current_student), conn=Depends(get_db)):
    link = query(conn, """
        SELECT s.id AS student_id FROM student_account_links l JOIN students s ON s.id = l.student_id
        WHERE l.account_id=%s AND s.personal_id=%s
    """, (current["sub"], personal_id))
    if not link:
        raise HTTPException(403, "Aluno não vinculado a este profissional")
    recent = query(conn, """
        SELECT id FROM checkins WHERE student_id=%s AND weight_reported IS NOT NULL
          AND created_at > NOW() - INTERVAL '7 days'
    """, (link[0]["student_id"],))
    return {"can_log": not bool(recent)}

# Visao do profissional (perfil do aluno em Acompanhamento)
@app.get("/api/treino/execucoes/{student_id}")
def historico_execucoes_personal(student_id: str, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_student(conn, student_id, current)
    execs = query(conn, """
        SELECT * FROM workout_executions WHERE student_id=%s AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 20
    """, (student_id,))
    for e in execs:
        e["sets"] = query(conn, "SELECT * FROM workout_execution_sets WHERE execution_id=%s ORDER BY set_number", (e["id"],))
    return execs

@app.get("/api/aluno/brand/{personal_id}")
def aluno_brand(personal_id: str, conn=Depends(get_db)):
    rows = query(conn, """
        SELECT name, brand_name, brand_logo_url, brand_primary, brand_accent
        FROM personals WHERE id = %s
    """, (personal_id,))
    if not rows:
        raise HTTPException(404, "Profissional nao encontrado")
    r = rows[0]
    return {
        "display_name": r["brand_name"] or r["name"],
        "logo_url":     r["brand_logo_url"],
        "primary":      r["brand_primary"] or DEFAULT_BRAND_PRIMARY,
        "accent":       r["brand_accent"]  or DEFAULT_BRAND_ACCENT,
    }

@app.get("/api/aluno/manifest/{personal_id}.json")
def aluno_manifest(personal_id: str, conn=Depends(get_db)):
    brand = aluno_brand(personal_id, conn)
    name = brand["display_name"]
    icons = ([{"src": brand["logo_url"], "sizes": "512x512", "purpose": "any"}]
             if brand["logo_url"] else
             [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}])
    manifest = {
        "name": name,
        "short_name": name[:12],
        "start_url": f"/aluno/{personal_id}",
        "scope": f"/aluno/{personal_id}",
        "display": "standalone",
        "background_color": "#0b0b10",
        "theme_color": brand["primary"],
        "icons": icons,
    }
    return Response(content=json.dumps(manifest), media_type="application/manifest+json")

@app.get("/aluno")
@app.get("/aluno/{personal_id}")
def serve_aluno(personal_id: str = ""):
    return FileResponse("aluno.html")

@app.get("/sw.js")
def serve_sw():
    return FileResponse("sw.js", media_type="application/javascript")

# ═══════════════════════════════════════════════════════════════
#  TREINO — biblioteca de exercícios e fichas (2.2)
#  Toda rota abaixo confere que o personal_id pertence ao token logado.
# ═══════════════════════════════════════════════════════════════
EXERCISE_SEED = [
    ("Peito", ["Supino reto com barra", "Supino reto com halteres", "Supino inclinado com barra",
               "Supino inclinado com halteres", "Supino declinado", "Crucifixo reto", "Crucifixo inclinado",
               "Crossover polia alta", "Crossover polia baixa", "Peck deck", "Flexão de braço"]),
    ("Costas", ["Puxada frontal", "Puxada atrás da nuca", "Remada curvada com barra", "Remada unilateral com halter",
                "Remada baixa no triângulo", "Remada cavalinho (T-bar)", "Barra fixa pronada", "Barra fixa supinada",
                "Levantamento terra", "Serrote", "Pullover", "Hiperextensão lombar"]),
    ("Pernas", ["Agachamento livre", "Agachamento no Smith", "Agachamento goblet", "Leg press 45°",
                "Cadeira extensora", "Afundo", "Afundo búlgaro", "Avanço caminhando", "Stiff",
                "Mesa flexora", "Cadeira flexora", "Levantamento terra romeno", "Cadeira adutora",
                "Cadeira abdutora", "Agachamento hack", "Step-up"]),
    ("Glúteos", ["Hip thrust", "Elevação pélvica", "Glúteo de quatro na polia", "Abdução na polia",
                 "Agachamento sumô", "Hiperextensão de quadril"]),
    ("Ombros", ["Desenvolvimento com barra", "Desenvolvimento com halteres", "Desenvolvimento Arnold",
                "Elevação lateral", "Elevação frontal", "Elevação lateral na polia", "Crucifixo inverso",
                "Remada alta", "Encolhimento com halteres", "Face pull"]),
    ("Bíceps", ["Rosca direta com barra", "Rosca alternada com halteres", "Rosca martelo",
                "Rosca concentrada", "Rosca Scott", "Rosca na polia", "Rosca inversa"]),
    ("Tríceps", ["Tríceps testa", "Tríceps corda", "Tríceps francês", "Tríceps no banco",
                 "Tríceps coice", "Mergulho nas paralelas", "Tríceps na polia com barra"]),
    ("Abdômen", ["Abdominal supra", "Abdominal infra", "Prancha", "Prancha lateral", "Abdominal oblíquo",
                 "Abdominal na roda", "Elevação de pernas suspenso"]),
    ("Panturrilha", ["Panturrilha em pé", "Panturrilha sentado", "Panturrilha no leg press"]),
    ("Cardio/Funcional", ["Burpee"]),
]
assert sum(len(names) for _, names in EXERCISE_SEED) == 80
assert len({n for _, names in EXERCISE_SEED for n in names}) == 80

def _assert_own_personal(conn, personal_id: str, current: dict) -> None:
    rows = query(conn, "SELECT clerk_user_id FROM personals WHERE id=%s", (personal_id,))
    if not rows or rows[0]["clerk_user_id"] != current.get("sub"):
        raise HTTPException(403, "Acesso negado a este profissional")

def _assert_own_exercise(conn, exercise_id: str, current: dict) -> str:
    rows = query(conn, "SELECT personal_id FROM exercises WHERE id=%s", (exercise_id,))
    if not rows:
        raise HTTPException(404, "Exercício não encontrado")
    _assert_own_personal(conn, str(rows[0]["personal_id"]), current)
    return str(rows[0]["personal_id"])

def _assert_own_workout(conn, workout_id: str, current: dict) -> None:
    rows = query(conn, "SELECT personal_id FROM workouts WHERE id=%s", (workout_id,))
    if not rows:
        raise HTTPException(404, "Ficha não encontrada")
    _assert_own_personal(conn, str(rows[0]["personal_id"]), current)

def _assert_own_student(conn, student_id: str, current: dict) -> str:
    rows = query(conn, "SELECT personal_id FROM students WHERE id=%s", (student_id,))
    if not rows:
        raise HTTPException(404, "Aluno não encontrado")
    _assert_own_personal(conn, str(rows[0]["personal_id"]), current)
    return str(rows[0]["personal_id"])

def _valid_video_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if not re.match(r"^https://(www\.)?(youtube\.com|youtu\.be|vimeo\.com)/", url):
        raise HTTPException(400, "Vídeo precisa ser link https do YouTube ou Vimeo")
    return url

class ExerciseCreate(BaseModel):
    personal_id:  str
    name:         str
    muscle_group: str
    instructions: Optional[str] = None
    video_url:    Optional[str] = None

class ExerciseUpdate(BaseModel):
    name:         Optional[str] = None
    muscle_group: Optional[str] = None
    instructions: Optional[str] = None
    video_url:    Optional[str] = None

WORKOUT_LEVELS = ("iniciante", "intermediario", "avancado")

# Chave estavel pra persistencia — o rotulo traduzido fica so no front
# (METODO_LABELS em dashboard.js), nunca gravado no banco.
WORKOUT_METHODS = (
    "drop_set", "cluster_set", "rest_pause", "bi_set", "tri_set", "super_serie",
    "pre_exaustao", "pos_exaustao", "ate_falha", "negativa", "isometria",
    "reps_parciais", "piramide_crescente", "piramide_decrescente", "metodo_21",
    "cadencia_controlada", "outro",
)

class WorkoutExerciseIn(BaseModel):
    exercise_id:  str
    sets:         int = 3
    reps_min:     int = 8
    reps_max:     int = 12
    load_value:   Optional[float] = None
    load_unit:    str = "kg"
    rest_seconds: int = 60
    notes:        Optional[str] = None
    method:       Optional[str] = None
    method_other: Optional[str] = None

class WorkoutSessionIn(BaseModel):
    name:      str
    weekdays:  Optional[list[int]] = None
    exercises: list[WorkoutExerciseIn] = []

class WorkoutCreate(BaseModel):
    personal_id: str
    student_id:  Optional[str] = None  # se vier, cria JA atribuida a esse aluno (nao como modelo)
    name:        str
    goal:        Optional[str] = None
    level:       Optional[str] = None
    starts_on:   Optional[str] = None
    ends_on:     Optional[str] = None
    notes:       Optional[str] = None
    sessions:    list[WorkoutSessionIn] = []

class WorkoutAssign(BaseModel):
    student_id: str

class WorkoutStatusUpdate(BaseModel):
    status: str

@app.get("/api/treino/exercicios/{personal_id}")
def list_exercises(personal_id: str, q: Optional[str] = None, group: Optional[str] = None,
                   conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_personal(conn, personal_id, current)
    sql = "SELECT id, name, muscle_group, instructions, video_url FROM exercises WHERE personal_id=%s"
    params = [personal_id]
    if q:
        sql += " AND name ILIKE %s"; params.append(f"%{q}%")
    if group:
        sql += " AND muscle_group=%s"; params.append(group)
    sql += " ORDER BY muscle_group, name"
    return query(conn, sql, tuple(params))

@app.post("/api/treino/exercicios/{personal_id}/seed")
def seed_exercises(personal_id: str, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_personal(conn, personal_id, current)
    values, params = [], []
    for group, names in EXERCISE_SEED:
        for name in names:
            values.append("(%s, %s, %s)")
            params.extend([personal_id, name, group])
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO exercises (personal_id, name, muscle_group) VALUES "
            + ", ".join(values)
            + " ON CONFLICT (personal_id, name) DO NOTHING RETURNING id",
            tuple(params),
        )
        added = len(cur.fetchall())
    conn.commit()
    return {"added": added}

@app.post("/api/treino/exercicios")
def create_exercise(data: ExerciseCreate, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_personal(conn, data.personal_id, current)
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Nome obrigatório")
    return execute(conn, """
        INSERT INTO exercises (personal_id, name, muscle_group, instructions, video_url)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (personal_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name, muscle_group
    """, (data.personal_id, name, data.muscle_group.strip(), data.instructions,
          _valid_video_url(data.video_url)))

@app.patch("/api/treino/exercicios/{exercise_id}")
def update_exercise(exercise_id: str, data: ExerciseUpdate, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_exercise(conn, exercise_id, current)
    fields, values = [], []
    if data.name is not None:         fields.append("name = %s");         values.append(data.name.strip())
    if data.muscle_group is not None: fields.append("muscle_group = %s"); values.append(data.muscle_group.strip())
    if data.instructions is not None: fields.append("instructions = %s"); values.append(data.instructions)
    if data.video_url is not None:    fields.append("video_url = %s");    values.append(_valid_video_url(data.video_url))
    if not fields:
        raise HTTPException(400, "Nada para atualizar")
    values.append(exercise_id)
    return execute(conn, f"UPDATE exercises SET {', '.join(fields)} WHERE id=%s RETURNING id", tuple(values))

def _attach_sessions(conn, workouts: list) -> None:
    for w in workouts:
        w["sessions"] = query(conn, """
            SELECT id, name, weekdays, position FROM workout_sessions
            WHERE workout_id=%s ORDER BY position
        """, (w["id"],))
        for s in w["sessions"]:
            s["exercises"] = query(conn, """
                SELECT we.id, we.exercise_id, e.name AS exercise_name, e.muscle_group,
                       we.position, we.sets, we.reps_min, we.reps_max,
                       we.load_value, we.load_unit, we.rest_seconds, we.notes, we.video_url,
                       we.method, we.method_other
                FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
                WHERE we.session_id=%s ORDER BY we.position
            """, (s["id"],))

def _insert_sessions(conn, workout_id: str, sessions) -> None:
    for pos, s in enumerate(sessions):
        sess = execute(conn, """
            INSERT INTO workout_sessions (workout_id, name, weekdays, position)
            VALUES (%s, %s, %s, %s) RETURNING id
        """, (workout_id, s.name.strip() or f"Treino {pos+1}", s.weekdays, pos))
        for epos, ex in enumerate(s.exercises):
            if ex.method and ex.method not in WORKOUT_METHODS:
                raise HTTPException(400, "Método inválido")
            exrow = query(conn, "SELECT video_url FROM exercises WHERE id=%s", (ex.exercise_id,))
            video = exrow[0]["video_url"] if exrow else None
            execute(conn, """
                INSERT INTO workout_exercises
                    (session_id, exercise_id, position, sets, reps_min, reps_max,
                     load_value, load_unit, rest_seconds, notes, video_url, method, method_other)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (sess["id"], ex.exercise_id, epos, ex.sets, ex.reps_min, ex.reps_max,
                  ex.load_value, ex.load_unit, ex.rest_seconds, ex.notes, video,
                  ex.method or None, ex.method_other if ex.method == "outro" else None))

@app.get("/api/treino/fichas/{personal_id}")
def list_workouts(personal_id: str, student_id: Optional[str] = None,
                   conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_personal(conn, personal_id, current)
    if student_id:
        _assert_own_student(conn, student_id, current)
        workouts = query(conn, """
            SELECT * FROM workouts WHERE personal_id=%s AND student_id=%s ORDER BY created_at DESC
        """, (personal_id, student_id))
    else:
        workouts = query(conn, """
            SELECT * FROM workouts WHERE personal_id=%s AND student_id IS NULL ORDER BY created_at DESC
        """, (personal_id,))
    _attach_sessions(conn, workouts)
    return workouts

@app.post("/api/treino/fichas")
def create_workout(data: WorkoutCreate, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_personal(conn, data.personal_id, current)
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Nome da ficha obrigatório")
    if not data.sessions:
        raise HTTPException(400, "A ficha precisa de pelo menos um treino")
    if data.level and data.level not in WORKOUT_LEVELS:
        raise HTTPException(400, "Nível inválido")
    for s in data.sessions:
        for ex in s.exercises:
            _assert_own_exercise(conn, ex.exercise_id, current)
    if data.student_id:
        _assert_own_student(conn, data.student_id, current)
        execute(conn, "UPDATE workouts SET status='encerrada', updated_at=NOW() WHERE student_id=%s AND status='ativa'",
                (data.student_id,))
        workout = execute(conn, """
            INSERT INTO workouts (personal_id, student_id, name, goal, level, starts_on, ends_on, notes, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ativa') RETURNING id
        """, (data.personal_id, data.student_id, name, data.goal, data.level, data.starts_on, data.ends_on, data.notes))
    else:
        workout = execute(conn, """
            INSERT INTO workouts (personal_id, name, goal, level, starts_on, ends_on, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (data.personal_id, name, data.goal, data.level, data.starts_on, data.ends_on, data.notes))
    _insert_sessions(conn, workout["id"], data.sessions)
    return {"id": str(workout["id"])}

@app.post("/api/treino/fichas/{workout_id}/atribuir")
def assign_workout(workout_id: str, data: WorkoutAssign, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_workout(conn, workout_id, current)
    personal_id = _assert_own_student(conn, data.student_id, current)
    src_rows = query(conn, "SELECT * FROM workouts WHERE id=%s", (workout_id,))
    src = src_rows[0]
    if str(src["personal_id"]) != personal_id:
        raise HTTPException(403, "Ficha não pertence ao profissional deste aluno")
    execute(conn, "UPDATE workouts SET status='encerrada', updated_at=NOW() WHERE student_id=%s AND status='ativa'",
            (data.student_id,))
    clone = execute(conn, """
        INSERT INTO workouts (personal_id, student_id, name, goal, level, starts_on, ends_on, notes, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ativa') RETURNING id
    """, (personal_id, data.student_id, src["name"], src["goal"], src["level"],
          src["starts_on"], src["ends_on"], src["notes"]))
    sessions = query(conn, """
        SELECT id, name, weekdays, position FROM workout_sessions WHERE workout_id=%s ORDER BY position
    """, (workout_id,))
    for s in sessions:
        new_sess = execute(conn, """
            INSERT INTO workout_sessions (workout_id, name, weekdays, position)
            VALUES (%s, %s, %s, %s) RETURNING id
        """, (clone["id"], s["name"], s["weekdays"], s["position"]))
        exs = query(conn, "SELECT * FROM workout_exercises WHERE session_id=%s ORDER BY position", (s["id"],))
        for ex in exs:
            execute(conn, """
                INSERT INTO workout_exercises
                    (session_id, exercise_id, position, sets, reps_min, reps_max,
                     load_value, load_unit, rest_seconds, notes, video_url, method, method_other)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (new_sess["id"], ex["exercise_id"], ex["position"], ex["sets"], ex["reps_min"], ex["reps_max"],
                  ex["load_value"], ex["load_unit"], ex["rest_seconds"], ex["notes"], ex["video_url"],
                  ex["method"], ex["method_other"]))
    return {"id": str(clone["id"])}

@app.patch("/api/treino/fichas/{workout_id}/status")
def update_workout_status(workout_id: str, data: WorkoutStatusUpdate, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_workout(conn, workout_id, current)
    if data.status not in ("ativa", "encerrada"):
        raise HTTPException(400, "Status inválido")
    return execute(conn, "UPDATE workouts SET status=%s, updated_at=NOW() WHERE id=%s RETURNING id",
                    (data.status, workout_id))

@app.delete("/api/treino/fichas/{workout_id}")
def delete_workout(workout_id: str, conn=Depends(get_db), current=Depends(get_current_user)):
    _assert_own_workout(conn, workout_id, current)
    execute(conn, """
        DELETE FROM workout_exercises WHERE session_id IN
          (SELECT id FROM workout_sessions WHERE workout_id=%s)
    """, (workout_id,))
    execute(conn, "DELETE FROM workout_sessions WHERE workout_id=%s", (workout_id,))
    execute(conn, "DELETE FROM workouts WHERE id=%s", (workout_id,))
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════
#  ALUNOS
# ═══════════════════════════════════════════════════════════════
class StudentCreate(BaseModel):
    personal_id:    str
    name:           str
    phone:          str
    email:          Optional[str]   = None
    goal:           Optional[str]   = "emagrecimento"
    channel:        Optional[str]   = "instagram"
    weight_initial: Optional[float] = None
    height_cm:      Optional[int]   = None
    bf_initial:     Optional[float] = None
    notes:          Optional[str]   = None
    gender:                Optional[str]   = None
    birth_date:            Optional[date]  = None
    country:               Optional[str]   = None
    state:                 Optional[str]   = None
    city:                  Optional[str]   = None
    dietary_restrictions:  Optional[str]   = None

@app.get("/api/students/{personal_id}")
def get_students(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn, """
        SELECT DISTINCT ON (s.id)
            s.id, s.name, s.phone, s.email, s.goal, s.channel,
            s.weight_initial, s.weight_current, s.bf_initial, s.bf_current,
            (SELECT MIN(s4.starts_at) FROM subscriptions s4 WHERE s4.student_id=s.id) AS student_since,
            sub.plan_id, sub.price_paid, sub.starts_at, sub.expires_at, sub.status,
            p.name AS plan_name, p.duration_months,
            (sub.expires_at - CURRENT_DATE) AS days_to_expire,
            COALESCE((SELECT SUM(s2.price_paid) FROM subscriptions s2 WHERE s2.student_id=s.id),0) AS ltv_total,
            GREATEST((SELECT COUNT(*) FROM subscriptions s3 WHERE s3.student_id=s.id)-1,0) AS renewals_count,
            (SELECT MAX(c.created_at) FROM checkins c WHERE c.student_id=s.id) AS last_checkin_at,
            (SELECT COUNT(*) = 2 FROM (
                SELECT used, expires_at FROM form_tokens
                WHERE student_id=s.id ORDER BY created_at DESC LIMIT 2
            ) t WHERE t.used = false AND t.expires_at < NOW()) AS missed_last_2_forms
        FROM students s
        JOIN subscriptions sub ON sub.student_id = s.id
        JOIN plans p ON p.id = sub.plan_id
        WHERE s.personal_id = %s
          AND COALESCE(s.status,'active') != 'cancelled'
        ORDER BY s.id, sub.starts_at DESC
    """, (personal_id,))

@app.post("/api/students")
def create_student(data: StudentCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO students (personal_id, name, phone, email, goal, channel,
          weight_initial, height_cm, bf_initial, notes, gender, birth_date, country, state, city,
          dietary_restrictions)
        VALUES (%s,%s,%s,%s,%s::student_goal,%s::acquisition_channel,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id, name, phone, created_at
    """, (data.personal_id, data.name, data.phone, data.email,
          (data.goal or 'outro').lower(), (data.channel or 'outro').lower(),
          data.weight_initial, data.height_cm, data.bf_initial, data.notes,
          data.gender, data.birth_date, data.country, data.state, data.city,
          data.dietary_restrictions))

# ═══════════════════════════════════════════════════════════════
#  PERSONALS — PATCH PERFIL
# ═══════════════════════════════════════════════════════════════
@app.patch("/api/personals/{personal_id}")
def update_personal(personal_id: str, data: dict, conn=Depends(get_db), _=Depends(get_current_user)):
    allowed = ['name','bio','especialidade','whatsapp','instagram','site',
               'cidade','pais','moeda','payment_link','pix_key',
               'payment_instruction','meta_anual',
               'canais_atendimento','formas_pagamento',
               'brand_name','brand_logo_url','brand_primary','brand_accent']
    if data.get("brand_primary"):
        data["brand_primary"] = validate_brand_color(data["brand_primary"], "Cor principal")
    if data.get("brand_accent"):
        data["brand_accent"] = validate_brand_color(data["brand_accent"], "Cor de destaque")
    if data.get("brand_logo_url") and not str(data["brand_logo_url"]).startswith("https://"):
        raise HTTPException(400, "Logo precisa ser uma URL https")
    fields, values = [], []
    for k in allowed:
        if k in data and data[k] is not None:
            fields.append(f"{k} = %s")
            values.append(data[k])
    if not fields:
        raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(personal_id)
    return execute(conn,
        f"UPDATE personals SET {', '.join(fields)} WHERE id=%s RETURNING id",
        values)

@app.get("/api/personals/{personal_id}")
def get_personal(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    rows = query(conn, "SELECT * FROM personals WHERE id=%s", (personal_id,))
    if not rows:
        raise HTTPException(404, "Personal não encontrado")
    return rows[0]

# ═══════════════════════════════════════════════════════════════
#  PAYMENT METHODS
# ═══════════════════════════════════════════════════════════════
def _detect_gateway(url: str):
    u = (url or "").lower()
    if "stripe" in u:                            return "stripe", "Stripe"
    if "mercadopago" in u or "mpago" in u:        return "mercado_pago", "Mercado Pago"
    if "pagseguro" in u or "pagbank" in u:        return "pagseguro", "PagSeguro"
    if "paypal" in u:                             return "paypal", "PayPal"
    return "outro", "Link de Pagamento"

def _migrate_legacy_payment(conn, personal_id: str):
    """Migra payment_link/pix_key/payment_instruction (campos antigos, singulares)
    pra registros em payment_methods, rodando só na primeira vez que a lista
    vem vazia — preserva o que já foi configurado sem exigir recadastro."""
    rows = query(conn, "SELECT payment_link, pix_key, payment_instruction FROM personals WHERE id=%s", (personal_id,))
    if not rows:
        return []
    p = rows[0]
    link, pix, instr = p.get("payment_link"), p.get("pix_key"), p.get("payment_instruction")
    if not link and not pix:
        return []
    inserted = []
    if link:
        gtype, label = _detect_gateway(link)
        inserted.append(execute(conn, """
            INSERT INTO payment_methods (personal_id, type, label, value, instruction, is_default)
            VALUES (%s,%s,%s,%s,%s,TRUE) RETURNING *
        """, (personal_id, gtype, label, link, instr)))
    if pix:
        inserted.append(execute(conn, """
            INSERT INTO payment_methods (personal_id, type, label, value, instruction, is_default)
            VALUES (%s,'pix','PIX',%s,%s,%s) RETURNING *
        """, (personal_id, pix, instr, not link)))
    return inserted

class PaymentMethodCreate(BaseModel):
    personal_id: str
    type:        str
    label:       str
    value:       str
    instruction: Optional[str] = None
    is_default:  Optional[bool] = False

@app.get("/api/payment-methods/{personal_id}")
def get_payment_methods(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    rows = query(conn, "SELECT * FROM payment_methods WHERE personal_id=%s ORDER BY is_default DESC, created_at", (personal_id,))
    if not rows:
        rows = _migrate_legacy_payment(conn, personal_id)
    return rows

@app.post("/api/payment-methods")
def create_payment_method(data: PaymentMethodCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    if data.is_default:
        execute(conn, "UPDATE payment_methods SET is_default=FALSE WHERE personal_id=%s", (data.personal_id,))
    return execute(conn, """
        INSERT INTO payment_methods (personal_id, type, label, value, instruction, is_default)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
    """, (data.personal_id, data.type, data.label, data.value, data.instruction, data.is_default or False))

@app.patch("/api/payment-methods/{method_id}")
def update_payment_method(method_id: str, data: dict, conn=Depends(get_db), _=Depends(get_current_user)):
    rows = query(conn, "SELECT personal_id FROM payment_methods WHERE id=%s", (method_id,))
    if not rows:
        raise HTTPException(404, "Método não encontrado")
    if data.get("is_default"):
        execute(conn, "UPDATE payment_methods SET is_default=FALSE WHERE personal_id=%s", (rows[0]["personal_id"],))
    allowed = ["type", "label", "value", "instruction", "is_default"]
    fields, values = [], []
    for k in allowed:
        if k in data:
            fields.append(f"{k} = %s")
            values.append(data[k])
    if not fields:
        raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(method_id)
    return execute(conn, f"UPDATE payment_methods SET {', '.join(fields)} WHERE id=%s RETURNING *", values)

@app.delete("/api/payment-methods/{method_id}")
def delete_payment_method(method_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    execute(conn, "DELETE FROM payment_methods WHERE id=%s", (method_id,))
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════
#  LEADS
# ═══════════════════════════════════════════════════════════════
class LeadCreate(BaseModel):
    personal_id: str
    name:        str
    phone:       str
    email:       Optional[str] = None
    channel:     Optional[str] = "instagram"
    goal:        Optional[str] = "emagrecimento"
    plan_id:     Optional[str] = None
    notes:       Optional[str] = None
    referred_by_student_id: Optional[str] = None
    referred_by_other:      Optional[str] = None

class LeadUpdate(BaseModel):
    status:        Optional[str] = None
    notes:         Optional[str] = None
    ai_summary:    Optional[str] = None
    converted_to:  Optional[str] = None

def generate_lead_ai_summary(lead_id: str):
    """Roda em background (BackgroundTasks): gera um resumo curto do lead via Anthropic
    e salva em leads.ai_summary. Abre sua própria conexão porque roda depois da resposta,
    quando a conexão da requisição (Depends(get_db)) já pode estar fechada."""
    if not ANTHROPIC_API_KEY:
        return
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return
    conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        rows = query(conn, """
            SELECT l.name, l.channel, l.goal, l.notes, p.name AS plan_name
            FROM leads l LEFT JOIN plans p ON p.id = l.plan_id
            WHERE l.id = %s
        """, (lead_id,))
        if not rows or not rows[0].get("notes"):
            return
        lead = rows[0]

        info = [f"Nome: {lead['name']}"]
        if lead.get("channel"):
            info.append(f"Canal de origem: {lead['channel']}")
        if lead.get("plan_name"):
            info.append(f"Plano de interesse: {lead['plan_name']}")
        info.append(f"Observações do personal trainer sobre o lead: {lead['notes']}")

        prompt = (
            "Você ajuda um personal trainer a lembrar rapidamente do que um lead precisa. "
            "Com base SOMENTE nos dados abaixo, escreva um resumo curto (uma frase, no máximo "
            "25 palavras), em português, direto ao ponto, sem aspas e sem markdown. "
            "O nome já aparece em outro lugar da tela — NÃO repita o nome no resumo, comece "
            "direto pelo que a pessoa quer. "
            "Não invente nenhuma informação que não esteja nos dados.\n\n" + "\n".join(info)
        )

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        summary = "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        ).strip()
        if summary:
            execute(conn, "UPDATE leads SET ai_summary=%s WHERE id=%s", (summary, lead_id))
            print(f"[ai_summary] gerado pro lead {lead_id}: {summary}")
    except Exception as e:
        print(f"[ai_summary] falhou pro lead {lead_id}: {e}")
    finally:
        conn.close()

@app.get("/api/leads/{personal_id}")
def get_leads(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    rows = query(conn, """
        SELECT l.*, p.name AS plan_name, p.price AS plan_price, st.name AS referred_by_student_name
        FROM leads l
        LEFT JOIN plans p ON p.id = l.plan_id
        LEFT JOIN students st ON st.id = l.referred_by_student_id
        WHERE l.personal_id = %s ORDER BY l.updated_at DESC
    """, (personal_id,))
    pipeline = {"novo":[],"contato":[],"proposta":[],"fechado":[],"perdido":[]}
    for row in rows:
        s = row.get("status","novo")
        if s in pipeline: pipeline[s].append(row)
    return pipeline

@app.post("/api/leads")
def create_lead(data: LeadCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO leads (personal_id, name, phone, email, channel, goal, plan_id, notes,
            referred_by_student_id, referred_by_other)
        VALUES (%s,%s,%s,%s,%s::acquisition_channel,%s::student_goal,%s,%s,%s,%s)
        RETURNING id, name, phone, status, created_at
    """, (data.personal_id, data.name, data.phone, data.email,
          (data.channel or 'outro').lower(),
          (data.goal or 'outro').lower(),
          data.plan_id, data.notes,
          data.referred_by_student_id, data.referred_by_other))

@app.patch("/api/leads/{lead_id}")
def update_lead(lead_id: str, data: LeadUpdate, background_tasks: BackgroundTasks, conn=Depends(get_db), _=Depends(get_current_user)):
    notes_changed = False
    if data.notes is not None:
        current = query(conn, "SELECT notes FROM leads WHERE id=%s", (lead_id,))
        current_notes = current[0]["notes"] if current else None
        notes_changed = (data.notes or "") != (current_notes or "")

    fields, values = [], []
    if data.status       is not None: fields.append("status = %s");       values.append(data.status)
    if data.notes        is not None: fields.append("notes = %s");        values.append(data.notes)
    if data.ai_summary   is not None: fields.append("ai_summary = %s");   values.append(data.ai_summary)
    if data.converted_to is not None: fields.append("converted_to = %s"); values.append(data.converted_to)
    if not fields: raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(lead_id)
    result = execute(conn, f"UPDATE leads SET {', '.join(fields)}, updated_at=NOW() WHERE id=%s RETURNING id, status", values)

    if notes_changed:
        background_tasks.add_task(generate_lead_ai_summary, lead_id)

    return result

# ═══════════════════════════════════════════════════════════════
#  PLANOS
# ═══════════════════════════════════════════════════════════════
@app.get("/api/plans/{personal_id}")
def get_plans(personal_id: str, all: bool = False, conn=Depends(get_db), _=Depends(get_current_user)):
    if all:
        return query(conn, "SELECT * FROM plans WHERE personal_id=%s ORDER BY duration_months", (personal_id,))
    return query(conn, "SELECT * FROM plans WHERE personal_id=%s AND is_active=true ORDER BY duration_months", (personal_id,))

# ═══════════════════════════════════════════════════════════════
#  CHECKINS
# ═══════════════════════════════════════════════════════════════
class CheckinCreate(BaseModel):
    student_id:        str
    personal_id:       str
    type:              Optional[str]   = "semanal"
    training_feedback: Optional[str]   = None
    trainings_done:    Optional[int]   = None
    had_pain:          Optional[bool]  = False
    pain_description:  Optional[str]   = None
    nutrition_notes:   Optional[str]   = None
    mood_score:        Optional[int]   = None
    energy_score:      Optional[int]   = None
    weight_reported:   Optional[float] = None
    general_notes:     Optional[str]   = None

@app.get("/api/checkins/{student_id}")
def get_checkins(student_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn, "SELECT * FROM checkins WHERE student_id=%s ORDER BY created_at DESC LIMIT 20", (student_id,))

@app.post("/api/checkins")
def create_checkin(data: CheckinCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    result = execute(conn, """
        INSERT INTO checkins (student_id, personal_id, type, training_feedback, trainings_done,
           had_pain, pain_description, nutrition_notes, mood_score, energy_score,
           weight_reported, general_notes, responded_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id, student_id, created_at
    """, (data.student_id, data.personal_id, data.type, data.training_feedback,
          data.trainings_done, data.had_pain, data.pain_description, data.nutrition_notes,
          data.mood_score, data.energy_score, data.weight_reported, data.general_notes))
    if data.weight_reported:
        execute(conn, "UPDATE students SET weight_current=%s WHERE id=%s", (data.weight_reported, data.student_id))
    return result

# ═══════════════════════════════════════════════════════════════
#  FOTOS
# ═══════════════════════════════════════════════════════════════
class PhotoCreate(BaseModel):
    student_id:    str
    checkin_id:    Optional[str]  = None
    cloudinary_id: str
    url:           str
    angle:         Optional[str]  = "frontal"
    taken_at:      Optional[date] = None
    notes:         Optional[str]  = None

@app.get("/api/photos/{student_id}")
def get_photos(student_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    photos = query(conn,
        "SELECT * FROM progress_photos WHERE student_id=%s ORDER BY taken_at ASC",
        (student_id,))
    angles = ["frontal", "costas", "esquerdo", "direito"]
    comparison = {}
    for angle in angles:
        by_angle = [p for p in photos if p.get("angle") == angle]
        comparison[angle] = {
            "first":  dict(by_angle[0])  if by_angle else None,
            "latest": dict(by_angle[-1]) if by_angle else None,
        }
    return {"comparison": comparison, "all": photos}

@app.post("/api/photos")
def save_photo(data: PhotoCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO progress_photos (student_id, checkin_id, cloudinary_id, url, angle, taken_at, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id, url, taken_at
    """, (data.student_id, data.checkin_id, data.cloudinary_id,
          data.url, data.angle, data.taken_at or date.today(), data.notes))
# ═══════════════════════════════════════════════════════════════
#  PLANOS — CRUD completo
# ═══════════════════════════════════════════════════════════════
class PlanCreate(BaseModel):
    personal_id:     str
    name:            str
    duration_months: int
    price:           float

class PlanUpdate(BaseModel):
    name:            Optional[str]   = None
    duration_months: Optional[int]   = None
    price:           Optional[float] = None
    is_active:       Optional[bool]  = None

@app.post("/api/plans")
def create_plan(data: PlanCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO plans (personal_id, name, duration_months, price)
        VALUES (%s,%s,%s,%s) RETURNING id, name, duration_months, price, is_active
    """, (data.personal_id, data.name, data.duration_months, data.price))

@app.patch("/api/plans/{plan_id}")
def update_plan(plan_id: str, data: PlanUpdate, conn=Depends(get_db), _=Depends(get_current_user)):
    fields, values = [], []
    if data.name            is not None: fields.append("name = %s");            values.append(data.name)
    if data.duration_months is not None: fields.append("duration_months = %s"); values.append(data.duration_months)
    if data.price            is not None: fields.append("price = %s");          values.append(data.price)
    if data.is_active       is not None: fields.append("is_active = %s");       values.append(data.is_active)
    if not fields: raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(plan_id)
    return execute(conn, f"UPDATE plans SET {', '.join(fields)} WHERE id=%s RETURNING id, name, price, is_active", values)

# ═══════════════════════════════════════════════════════════════
#  ASSINATURAS
# ═══════════════════════════════════════════════════════════════
class SubscriptionCreate(BaseModel):
    student_id:     str
    personal_id:    str
    plan_id:        str
    price_paid:     float
    starts_at:      date
    expires_at:     date
    payment_method: Optional[str] = "pix"
    status:         Optional[str] = "active"

@app.post("/api/subscriptions")
def create_subscription(data: SubscriptionCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    try:
        execute(conn,
            "UPDATE subscriptions SET status='renewed' WHERE student_id=%s AND status='active'",
            (data.student_id,))
    except Exception:
        conn.rollback()
    return execute(conn, """
        INSERT INTO subscriptions (student_id, personal_id, plan_id, price_paid,
          starts_at, expires_at, payment_method, status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, student_id, expires_at, status
    """, (data.student_id, data.personal_id, data.plan_id, data.price_paid,
          data.starts_at, data.expires_at, data.payment_method, data.status))

# ═══════════════════════════════════════════════════════════════
#  ENCERRAR CONTRATO
# ═══════════════════════════════════════════════════════════════
@app.post("/api/students/{student_id}/cancel")
def cancel_student(student_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    execute(conn, "UPDATE subscriptions SET status='cancelled', updated_at=NOW() WHERE student_id=%s AND status='active'", (student_id,))
    execute(conn, "UPDATE students SET status='cancelled', updated_at=NOW() WHERE id=%s", (student_id,))
    return {"ok": True, "student_id": student_id}
# ═══════════════════════════════════════════════════════════════
#  ADMIN
# ═══════════════════════════════════════════════════════════════
ADMIN_KEY = os.getenv("ADMIN_KEY", "meridian-admin-dev")

def _check_admin_key(admin_key: str):
    if admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin key inválida")

# Planos que o MERIDIAN vende pros profissionais (Nivel 2 — negocio do
# Meridian). Nao confundir com a tabela "plans", que sao os planos que CADA
# profissional vende pros alunos DELE (Nivel 1).
MERIDIAN_PLANS = {
    "mensal":    {"duration_months": 1,  "price": 19.90,  "label": "Mensal"},
    "semestral": {"duration_months": 6,  "price": 149.90, "label": "Semestral"},
    "anual":     {"duration_months": 12, "price": 289.90, "label": "Anual"},
}
MERIDIAN_CURRENCY_SYMBOL = "€"

@app.get("/api/admin/overview")
def admin_overview(admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    row = query(conn, """
        SELECT
            (SELECT COUNT(*) FROM personals)                                                  AS total_personais,
            (SELECT COUNT(*) FROM students)                                                   AS total_students,
            (SELECT COUNT(*) FROM checkins)                                                   AS total_checkins,
            (SELECT COUNT(*) FROM invites WHERE used = false)                                 AS invites_pending
    """)
    return row[0] if row else {}

@app.get("/api/admin/meridian-metrics")
def admin_meridian_metrics(admin_key: str, conn=Depends(get_db)):
    """KPIs do NEGOCIO DO MERIDIAN (Nivel 2): quanto cada profissional paga
    pelo Hub, nao quanto cada profissional fatura com os alunos dele (isso
    e Nivel 1, ja coberto por /api/admin/growth e pela aba BI de cada um)."""
    _check_admin_key(admin_key)
    rows = query(conn, """
        SELECT p.id, u.role, p.meridian_plan, p.meridian_status,
               p.meridian_started_at, p.meridian_price_paid, p.meridian_plan_duration_months
        FROM personals p JOIN users u ON u.id::text = p.clerk_user_id
    """)
    pagantes   = [r for r in rows if r["meridian_status"] == "pagante"]
    testers    = [r for r in rows if r["meridian_status"] == "tester"]
    cancelados = [r for r in rows if r["meridian_status"] == "cancelado"]

    def monthly_value(r):
        price = float(r["meridian_price_paid"] or 0)
        if r["meridian_plan"] == "outro":
            duration = r["meridian_plan_duration_months"] or 1
            return price / duration
        plan = MERIDIAN_PLANS.get(r["meridian_plan"])
        return (price / plan["duration_months"]) if plan else 0.0

    mrr = sum(monthly_value(r) for r in pagantes)
    ticket_medio = (sum(float(r["meridian_price_paid"] or 0) for r in pagantes) / len(pagantes)) if pagantes else 0

    # Plano mais vendido, segmentado por tipo de profissional
    plano_por_tipo = {}
    for role_key in ("personal", "nutritionist"):
        subset = [r["meridian_plan"] for r in pagantes if r["role"] == role_key and r["meridian_plan"]]
        if subset:
            counts = {}
            for p in subset:
                counts[p] = counts.get(p, 0) + 1
            top_plan = max(counts, key=counts.get)
            label = "Outro" if top_plan == "outro" else MERIDIAN_PLANS.get(top_plan, {}).get("label", top_plan)
            plano_por_tipo[role_key] = {
                "plan": top_plan, "label": label,
                "count": counts[top_plan], "total": len(subset),
            }
        else:
            plano_por_tipo[role_key] = None

    # LTV estimado: tempo de casa (meses desde meridian_started_at) x valor
    # mensal normalizado. E uma ESTIMATIVA por tenure — nao existe hoje um
    # historico de pagamentos ciclo-a-ciclo (so o estado atual), entao nao
    # da pra somar pagamentos reais um por um.
    ltvs = []
    for r in pagantes:
        if r["meridian_started_at"]:
            months = max(1.0, (date.today() - r["meridian_started_at"]).days / 30.44)
            ltvs.append(monthly_value(r) * months)
    ltv_medio = (sum(ltvs) / len(ltvs)) if ltvs else 0

    settings_row = query(conn, "SELECT meta_anual FROM platform_settings LIMIT 1")
    meta_anual = float((settings_row[0] if settings_row else {}).get("meta_anual") or 0)
    run_rate_anual = mrr * 12

    # CAC = soma de todos os custos de aquisicao ja lancados (acumulado,
    # sempre em EUR) / total de profissionais que ja viraram pagantes em
    # algum momento (tem meridian_started_at preenchido, mesmo que tenham
    # cancelado depois — o custo foi pra adquiri-los, nao pra mante-los)
    cost_row = query(conn, "SELECT COALESCE(SUM(amount),0) AS total FROM acquisition_costs")
    total_custos = float(cost_row[0]["total"]) if cost_row else 0.0
    profissionais_adquiridos = len([r for r in rows if r["meridian_started_at"]])
    cac = round(total_custos / profissionais_adquiridos, 2) if total_custos > 0 and profissionais_adquiridos > 0 else None

    return {
        "mrr": round(mrr, 2),
        "ticket_medio": round(ticket_medio, 2),
        "ltv_medio": round(ltv_medio, 2),
        "profissionais_pagantes": len(pagantes),
        "profissionais_tester": len(testers),
        "profissionais_cancelados": len(cancelados),
        "profissionais_total": len(rows),
        "plano_mais_vendido_por_tipo": plano_por_tipo,
        "meta_anual": meta_anual,
        "run_rate_anual": round(run_rate_anual, 2),
        "meta_pct": round(run_rate_anual / meta_anual * 100) if meta_anual > 0 else None,
        "cac": cac,
    }

ACQUISITION_COST_CATEGORIES = ("trafego_pago", "conteudo", "outro")

@app.get("/api/admin/acquisition-costs")
def list_acquisition_costs(admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    return query(conn, "SELECT * FROM acquisition_costs ORDER BY date DESC, created_at DESC LIMIT 100")

@app.post("/api/admin/acquisition-costs")
def add_acquisition_cost(data: dict, conn=Depends(get_db)):
    _check_admin_key(data.get("admin_key", ""))
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Valor invalido")
    if amount <= 0:
        raise HTTPException(400, "Valor deve ser maior que zero")
    category = data.get("category")
    if category not in ACQUISITION_COST_CATEGORIES:
        raise HTTPException(400, "Categoria invalida")
    currency = data.get("currency") or "EUR"
    description = data.get("description") or None
    cost_date = data.get("date") or None
    row = execute(conn, """
        INSERT INTO acquisition_costs (amount, currency, category, description, date)
        VALUES (%s, %s, %s, %s, COALESCE(%s, CURRENT_DATE))
        RETURNING id
    """, (amount, currency, category, description, cost_date))
    return {"ok": True, "id": str(row.get("id"))}

@app.get("/api/admin/platform-settings")
def get_platform_settings(admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    row = query(conn, "SELECT meta_anual FROM platform_settings LIMIT 1")
    return row[0] if row else {"meta_anual": None}

@app.patch("/api/admin/platform-settings")
def update_platform_settings(data: dict, conn=Depends(get_db)):
    _check_admin_key(data.get("admin_key", ""))
    meta_anual = data.get("meta_anual")
    row = query(conn, "SELECT id FROM platform_settings LIMIT 1")
    if row:
        execute(conn, "UPDATE platform_settings SET meta_anual=%s, updated_at=NOW() WHERE id=%s",
                (meta_anual, row[0]["id"]))
    else:
        execute(conn, "INSERT INTO platform_settings (meta_anual) VALUES (%s)", (meta_anual,))
    return {"ok": True}

@app.patch("/api/admin/personal/{personal_id}/meridian")
def update_personal_meridian(personal_id: str, data: dict, conn=Depends(get_db)):
    """Marcacao manual (feita pelo Vinicius no Admin) de plano/status/preco
    do profissional com o Meridian — nao existe cobranca automatica ainda."""
    _check_admin_key(data.get("admin_key", ""))
    plan = data.get("meridian_plan")
    if plan is not None and plan not in MERIDIAN_PLANS and plan not in ("outro", ""):
        raise HTTPException(400, "Plano invalido")
    status = data.get("meridian_status")
    if status is not None and status not in ("tester", "pagante", "cancelado"):
        raise HTTPException(400, "Status invalido")
    fields, values = [], []
    for key in ("meridian_plan", "meridian_status", "meridian_started_at", "meridian_price_paid",
                "meridian_plan_duration_months"):
        if key in data:
            fields.append(f"{key}=%s")
            values.append(data[key] if data[key] != "" else None)
    if not fields:
        return {"ok": True}
    values.append(personal_id)
    execute(conn, f"UPDATE personals SET {', '.join(fields)}, updated_at=NOW() WHERE id=%s", tuple(values))
    return {"ok": True}

def _delta_status(now: float, then: float):
    """Calcula delta% entre dois pontos no tempo, tratando os casos de borda
    (sem base pra comparar, comecou do zero, etc) que uma divisao direta nao cobre."""
    if then == 0 and now == 0:
        return {"pct": None, "status": "no_data"}
    if then == 0:
        return {"pct": None, "status": "new"}
    pct = round((now - then) / then * 100)
    if pct > 0:
        status = "up"
    elif pct < 0:
        status = "down"
    else:
        status = "flat"
    return {"pct": pct, "status": status}

@app.get("/api/admin/growth")
def admin_growth(admin_key: str, months: int = 1, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    months = max(1, min(int(months), 24))
    rows = query(conn, """
        WITH sub_calc AS (
            SELECT sub.personal_id, sub.student_id, sub.price_paid,
                   sub.price_paid / NULLIF(p.duration_months,0) AS price_paid_monthly, sub.starts_at,
                   CASE WHEN sub.status = 'cancelled'
                        THEN LEAST(sub.expires_at, sub.updated_at::date)
                        ELSE sub.expires_at
                   END AS effective_end
            FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id
        )
        SELECT
            p.id AS personal_id, u.name, u.email, u.role, p.moeda,
            p.created_at, p.meridian_started_at,
            COUNT(DISTINCT sc.student_id) FILTER (
                WHERE sc.starts_at <= CURRENT_DATE AND sc.effective_end >= CURRENT_DATE
            ) AS active_now,
            COALESCE(SUM(sc.price_paid_monthly) FILTER (
                WHERE sc.starts_at <= CURRENT_DATE AND sc.effective_end >= CURRENT_DATE
            ), 0) AS mrr_now,
            COUNT(DISTINCT sc.student_id) FILTER (
                WHERE sc.starts_at <= (CURRENT_DATE - (INTERVAL '1 month' * %s))
                  AND sc.effective_end >= (CURRENT_DATE - (INTERVAL '1 month' * %s))
            ) AS active_then,
            COALESCE(SUM(sc.price_paid_monthly) FILTER (
                WHERE sc.starts_at <= (CURRENT_DATE - (INTERVAL '1 month' * %s))
                  AND sc.effective_end >= (CURRENT_DATE - (INTERVAL '1 month' * %s))
            ), 0) AS mrr_then
        FROM personals p
        JOIN users u ON u.id::text = p.clerk_user_id
        LEFT JOIN sub_calc sc ON sc.personal_id = p.id
        GROUP BY p.id, u.name, u.email, u.role, p.moeda, p.created_at, p.meridian_started_at
    """, (months, months, months, months))

    result = []
    for r in rows:
        active_now, active_then = int(r["active_now"] or 0), int(r["active_then"] or 0)
        mrr_now, mrr_then       = float(r["mrr_now"] or 0), float(r["mrr_then"] or 0)
        students_delta = _delta_status(active_now, active_then)
        mrr_delta      = _delta_status(mrr_now, mrr_then)
        # ordenacao: crescimento novo > % de crescimento > estavel > queda > sem dado
        sort_key = {"new": 10**6, "up": students_delta["pct"] or 0, "flat": 0,
                    "down": students_delta["pct"] or 0, "no_data": -(10**6)}[students_delta["status"]]
        result.append({
            "personal_id": r["personal_id"], "name": r["name"], "email": r["email"], "role": r["role"],
            "moeda": r["moeda"] or "BRL",
            "created_at": r["created_at"], "meridian_started_at": r["meridian_started_at"],
            "active_now": active_now, "active_then": active_then, "students_delta": students_delta,
            "mrr_now": mrr_now, "mrr_then": mrr_then, "mrr_delta": mrr_delta,
            "_sort_key": sort_key,
        })
    result.sort(key=lambda x: x["_sort_key"], reverse=True)
    for r in result:
        del r["_sort_key"]
    return result

@app.get("/api/admin/personal/{personal_id}/metrics")
def admin_personal_metrics(personal_id: str, admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    bi    = _compute_bi_metrics(conn, personal_id, 365)
    sales = _compute_sales_metrics(conn, personal_id)
    extra_row = query(conn, """
        SELECT
            p.created_at,
            COUNT(DISTINCT s.id)   AS total_students,
            COUNT(DISTINCT sub.id) AS total_subs,
            COUNT(DISTINCT c.id)   AS total_checkins,
            p.meridian_plan, p.meridian_status, p.meridian_started_at, p.meridian_price_paid,
            p.meridian_plan_duration_months,
            p.moeda
        FROM personals p
        LEFT JOIN students s ON s.personal_id = p.id
        LEFT JOIN subscriptions sub ON sub.student_id = s.id
        LEFT JOIN checkins c ON c.student_id = s.id
        WHERE p.id = %s
        GROUP BY p.id
    """, (personal_id,))
    extra = extra_row[0] if extra_row else {}
    return {**bi, **sales, **extra}

@app.get("/api/admin/invites")
def admin_invites(admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    return query(conn,
        "SELECT email, used, created_at FROM invites ORDER BY created_at DESC")

@app.post("/api/admin/invite")
def add_invite(data: dict, conn=Depends(get_db)):
    _check_admin_key(data.get("admin_key", ""))
    email = data.get("email", "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(400, "E-mail inválido")
    execute(conn,
        "INSERT INTO invites (email) VALUES (%s) ON CONFLICT (email) DO NOTHING",
        (email,))
    return {"ok": True, "email": email}

@app.delete("/api/admin/invite/{email}")
def delete_invite(email: str, admin_key: str, conn=Depends(get_db)):
    _check_admin_key(admin_key)
    execute(conn,
        "DELETE FROM invites WHERE email = %s AND used = false",
        (email.lower().strip(),))
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════
#  FORMULÁRIO PÚBLICO POR TOKEN
# ═══════════════════════════════════════════════════════════════
import secrets

@app.post("/api/form/generate")
def generate_form_token(data: dict, conn=Depends(get_db), _=Depends(get_current_user)):
    student_id  = data.get("student_id")
    personal_id = data.get("personal_id")
    form_type   = data.get("type", "semanal")
    if not student_id or not personal_id:
        raise HTTPException(400, "student_id e personal_id obrigatorios")
    token = secrets.token_urlsafe(16)
    execute(conn, """
        INSERT INTO form_tokens (token, student_id, personal_id, form_type)
        VALUES (%s, %s, %s, %s)
    """, (token, student_id, personal_id, form_type))
    return {"token": token, "url": f"/form/{token}"}

@app.get("/api/form/{token}")
def get_form(token: str, conn=Depends(get_db)):
    rows = query(conn, """
        SELECT ft.token, ft.form_type,
               ft.student_id::text, ft.personal_id::text,
               s.name AS student_name, s.goal,
               p.name AS personal_name,
               (SELECT (sub.expires_at - CURRENT_DATE)
                FROM subscriptions sub
                WHERE sub.student_id = ft.student_id
                  AND sub.status = 'active'
                ORDER BY sub.starts_at DESC LIMIT 1
               ) AS days_to_expire
        FROM form_tokens ft
        JOIN students  s ON s.id = ft.student_id
        JOIN personals p ON p.id = ft.personal_id
        WHERE ft.token = %s
          AND ft.expires_at > NOW()
          AND ft.used = false
    """, (token,))
    if not rows:
        raise HTTPException(404, "Link invalido ou expirado")
    row = dict(rows[0])
    if row.get('days_to_expire') is not None:
        row['days_to_expire'] = int(row['days_to_expire'])
    return row

@app.post("/api/form/{token}")
def submit_form(token: str, data: dict, conn=Depends(get_db)):
    rows = query(conn, """
        SELECT * FROM form_tokens
        WHERE token = %s AND expires_at > NOW() AND used = false
    """, (token,))
    if not rows:
        raise HTTPException(404, "Link invalido ou expirado")
    ft = rows[0]
    execute(conn, """
        INSERT INTO checkins (student_id, personal_id, type,
            training_feedback, trainings_done, had_pain, pain_description,
            nutrition_notes, mood_score, energy_score, weight_reported, bf_measured,
            general_notes, intensity_score, nutrition_score, responded_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
    """, (
        str(ft["student_id"]), str(ft["personal_id"]),
        data.get("form_type", ft.get("form_type","semanal")),
        data.get("training_feedback"),
        data.get("trainings_done"),
        data.get("had_pain", False),
        data.get("pain_description"),
        data.get("nutrition_notes"),
        data.get("mood_score"),
        data.get("energy_score"),
        data.get("weight_reported"),
        data.get("bf_measured"),
        data.get("general_notes"),
        data.get("intensity_score"),
        data.get("nutrition_score"),
    ))
    # Pega id do checkin inserido
    checkin_rows = query(conn,
        "SELECT id FROM checkins WHERE student_id=%s ORDER BY created_at DESC LIMIT 1",
        (str(ft["student_id"]),))
    checkin_id = str(checkin_rows[0]["id"]) if checkin_rows else None

    if data.get("weight_reported"):
        execute(conn, "UPDATE students SET weight_current=%s WHERE id=%s",
                (data["weight_reported"], str(ft["student_id"])))
    if data.get("bf_measured"):
        execute(conn, "UPDATE students SET bf_current=%s WHERE id=%s",
                (data["bf_measured"], str(ft["student_id"])))

    # Salvar fotos (URLs do Cloudinary, upload feito direto do navegador)
    photos = data.get("photos") or {}
    if any(v for v in photos.values() if v):
        execute(conn, """
            INSERT INTO progress_photos
              (student_id, checkin_id, form_type,
               photo_frontal, photo_costas, photo_esq, photo_dir)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            str(ft["student_id"]),
            checkin_id,
            data.get("form_type", ft.get("form_type", "mensal")),
            photos.get("frente") or None,
            photos.get("costas") or None,
            photos.get("esq") or None,
            photos.get("dir") or None,
        ))

    execute(conn, "UPDATE form_tokens SET used=true WHERE token=%s", (token,))
    return {"ok": True}

@app.get("/form/{token}")
def serve_form(token: str):
    return FileResponse("form.html")

@app.get("/api/students/{student_id}/photos")
def get_student_photos(student_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn, """
        SELECT id, checkin_id, form_type,
               weight_at_time,
               COALESCE(created_at, taken_at) AS created_at,
               photo_frontal, photo_costas, photo_esq, photo_dir
        FROM progress_photos
        WHERE student_id = %s
          AND (photo_frontal IS NOT NULL OR photo_costas IS NOT NULL
               OR photo_esq IS NOT NULL OR photo_dir IS NOT NULL)
        ORDER BY COALESCE(created_at, taken_at) ASC NULLS LAST
    """, (student_id,))

@app.post("/api/students/{student_id}/photos")
def save_student_photo(student_id: str, data: dict, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO progress_photos
          (student_id, personal_id, form_type, photo_frontal, photo_costas, photo_esq, photo_dir)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, form_type, created_at
    """, (
        student_id,
        data.get("personal_id"),
        data.get("form_type", "inicial"),
        data.get("photo_frontal"),
        data.get("photo_costas"),
        data.get("photo_esq"),
        data.get("photo_dir"),
    ))
