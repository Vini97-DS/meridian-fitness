"""
api.py — Backend Meridian Fitness
Auth: JWT proprio com bcrypt + python-jose
Banco: Neon (Postgres)
Rodar: uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
import psycopg2
import psycopg2.extras
import os
import bcrypt
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

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
    return verify_token(credentials.credentials)

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

class LoginData(BaseModel):
    email:    str
    password: str

@app.post("/api/auth/register")
def register(data: RegisterData, conn=Depends(get_db)):
    existing = query(conn, "SELECT id FROM users WHERE email = %s", (data.email.lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="Email ja cadastrado")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter minimo 8 caracteres")
    hashed = hash_password(data.password)
    user   = execute(conn, """
        INSERT INTO users (name, email, password)
        VALUES (%s, %s, %s)
        RETURNING id, name, email
    """, (data.name.strip(), data.email.lower().strip(), hashed))
    token = create_token(str(user["id"]), user["email"], user["name"])
    return {"token": token, "user": {"id": str(user["id"]), "name": user["name"], "email": user["email"]}}

@app.post("/api/auth/login")
def login(data: LoginData, conn=Depends(get_db)):
    rows = query(conn, "SELECT id, name, email, password FROM users WHERE email = %s", (data.email.lower(),))
    if not rows:
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    user = rows[0]
    if not check_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    token = create_token(str(user["id"]), user["email"], user["name"])
    return {"token": token, "user": {"id": str(user["id"]), "name": user["name"], "email": user["email"]}}

@app.get("/api/auth/me")
def me(current_user=Depends(get_current_user), conn=Depends(get_db)):
    """Retorna usuario + personal_id para o dashboard."""
    user_id = current_user.get("sub")
    personal = query(conn, "SELECT id FROM personals WHERE clerk_user_id = %s", (user_id,))
    if not personal:
        result = execute(conn,
            "INSERT INTO personals (clerk_user_id, name, email) VALUES (%s,%s,%s) ON CONFLICT (clerk_user_id) DO UPDATE SET name=EXCLUDED.name RETURNING id",
            (user_id, current_user.get("name","Personal"), current_user.get("email",""))
        )
        personal_id = str(result.get("id", user_id))
    else:
        personal_id = str(personal[0]["id"])
    return {**current_user, "personal_id": personal_id}

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
def get_metrics(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    mrr = query(conn, """
        SELECT COUNT(DISTINCT student_id) AS active_students,
               COALESCE(SUM(price_paid),0) AS mrr,
               COALESCE(AVG(price_paid),0) AS avg_ticket
        FROM subscriptions
        WHERE personal_id = %s
          AND status = 'active'
          AND student_id IN (
              SELECT DISTINCT ON (student_id) student_id
              FROM subscriptions
              WHERE personal_id = %s AND status = 'active'
              ORDER BY student_id, starts_at DESC
          )
    """, (personal_id, personal_id))
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
    mrr_history = query(conn, """
        SELECT TO_CHAR(DATE_TRUNC('month', starts_at), 'Mon/YY') AS month,
               SUM(price_paid) AS mrr
        FROM subscriptions
        WHERE personal_id = %s
          AND starts_at IS NOT NULL
        GROUP BY DATE_TRUNC('month', starts_at)
        ORDER BY DATE_TRUNC('month', starts_at)
        LIMIT 18
    """, (personal_id,))
    m = mrr[0] if mrr else {}
    return {
        "active_students": int(m.get("active_students") or 0),
        "mrr":             float(m.get("mrr") or 0),
        "avg_ticket":      float(m.get("avg_ticket") or 0),
        "expiring_7d":     {"count": int((e7[0] if e7 else {}).get("count") or 0)},
        "expiring_30d":    {"count": int((e30[0] if e30 else {}).get("count") or 0)},
        "mrr_history":     mrr_history,
    }

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

@app.get("/api/students/{personal_id}")
def get_students(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    return query(conn, """
        SELECT DISTINCT ON (s.id)
            s.id, s.name, s.phone, s.email, s.goal, s.channel,
            s.weight_initial, s.weight_current, s.bf_initial, s.bf_current,
            s.created_at AS student_since,
            sub.plan_id, sub.price_paid, sub.starts_at, sub.expires_at,
            sub.status,
            p.name AS plan_name,
            p.duration_months,
            (sub.expires_at - CURRENT_DATE) AS days_to_expire,
            COALESCE((SELECT SUM(s2.price_paid) FROM subscriptions s2
                      WHERE s2.student_id = s.id), 0) AS ltv_total,
            GREATEST((SELECT COUNT(*) FROM subscriptions s3
                      WHERE s3.student_id = s.id) - 1, 0) AS renewals_count
        FROM students s
        JOIN subscriptions sub ON sub.student_id = s.id
        JOIN plans p ON p.id = sub.plan_id
        WHERE s.personal_id = %s
          AND COALESCE(s.status, 'active') != 'cancelled'
        ORDER BY s.id, sub.starts_at DESC
    """, (personal_id,))

@app.post("/api/students")
def create_student(data: StudentCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO students (personal_id, name, phone, email, goal, channel, weight_initial, height_cm, bf_initial, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, name, phone, created_at
    """, (data.personal_id, data.name, data.phone, data.email, data.goal, data.channel,
          data.weight_initial, data.height_cm, data.bf_initial, data.notes))

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

class LeadUpdate(BaseModel):
    status:     Optional[str] = None
    notes:      Optional[str] = None
    ai_summary: Optional[str] = None

@app.get("/api/leads/{personal_id}")
def get_leads(personal_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    rows = query(conn, """
        SELECT l.*, p.name AS plan_name, p.price_brl FROM leads l
        LEFT JOIN plans p ON p.id = l.plan_id
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
        INSERT INTO leads (personal_id, name, phone, email, channel, goal, plan_id, notes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, name, phone, status, created_at
    """, (data.personal_id, data.name, data.phone, data.email, data.channel, data.goal, data.plan_id, data.notes))

@app.patch("/api/leads/{lead_id}")
def update_lead(lead_id: str, data: LeadUpdate, conn=Depends(get_db), _=Depends(get_current_user)):
    fields, values = [], []
    if data.status     is not None: fields.append("status = %s");     values.append(data.status)
    if data.notes      is not None: fields.append("notes = %s");      values.append(data.notes)
    if data.ai_summary is not None: fields.append("ai_summary = %s"); values.append(data.ai_summary)
    if not fields: raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(lead_id)
    return execute(conn, f"UPDATE leads SET {', '.join(fields)}, updated_at=NOW() WHERE id=%s RETURNING id, status", values)

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
    return query(conn, "SELECT * FROM progress_photos WHERE student_id=%s ORDER BY taken_at DESC", (student_id,))

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
    price_brl:       float

class PlanUpdate(BaseModel):
    name:            Optional[str]   = None
    duration_months: Optional[int]   = None
    price_brl:       Optional[float] = None
    is_active:       Optional[bool]  = None

@app.post("/api/plans")
def create_plan(data: PlanCreate, conn=Depends(get_db), _=Depends(get_current_user)):
    return execute(conn, """
        INSERT INTO plans (personal_id, name, duration_months, price_brl)
        VALUES (%s,%s,%s,%s) RETURNING id, name, duration_months, price_brl, is_active
    """, (data.personal_id, data.name, data.duration_months, data.price_brl))

@app.patch("/api/plans/{plan_id}")
def update_plan(plan_id: str, data: PlanUpdate, conn=Depends(get_db), _=Depends(get_current_user)):
    fields, values = [], []
    if data.name            is not None: fields.append("name = %s");            values.append(data.name)
    if data.duration_months is not None: fields.append("duration_months = %s"); values.append(data.duration_months)
    if data.price_brl       is not None: fields.append("price_brl = %s");       values.append(data.price_brl)
    if data.is_active       is not None: fields.append("is_active = %s");       values.append(data.is_active)
    if not fields: raise HTTPException(400, "Nenhum campo para atualizar")
    values.append(plan_id)
    return execute(conn, f"UPDATE plans SET {', '.join(fields)} WHERE id=%s RETURNING id, name, price_brl, is_active", values)

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

@app.get("/api/students/{student_id}/detail")
def get_student_detail(student_id: str, conn=Depends(get_db), _=Depends(get_current_user)):
    """Retorna dados enriquecidos do aluno: checkins, frequência, progresso."""
    # Checkins recentes
    checkins = query(conn, """
        SELECT id, type, trainings_done, mood_score, weight_reported,
               training_feedback, general_notes,
               responded_at, created_at
        FROM checkins WHERE student_id = %s
        ORDER BY responded_at DESC NULLS LAST LIMIT 20
    """, (student_id,))

    # Frequência média (últimas 8 semanas)
    freq = query(conn, """
        SELECT ROUND(AVG(trainings_done), 1) AS avg_freq,
               COUNT(*) AS total_checkins
        FROM checkins
        WHERE student_id = %s
          AND trainings_done IS NOT NULL
          AND created_at >= NOW() - INTERVAL '8 weeks'
    """, (student_id,))

    # Score de humor médio
    mood = query(conn, """
        SELECT ROUND(AVG(mood_score), 1) AS avg_mood
        FROM checkins
        WHERE student_id = %s AND mood_score IS NOT NULL
    """, (student_id,))

    # Timeline de eventos (assinaturas + checkins importantes)
    timeline = query(conn, """
        SELECT 'renovacao' AS type,
               TO_CHAR(starts_at, 'Mon YYYY') AS date,
               p.name AS title,
               price_paid::text AS detail
        FROM subscriptions sub
        JOIN plans p ON p.id = sub.plan_id
        WHERE sub.student_id = %s
        ORDER BY starts_at DESC LIMIT 10
    """, (student_id,))

    f = freq[0] if freq else {}
    m = mood[0] if mood else {}
    return {
        "checkins":        checkins,
        "avg_freq":        float(f.get("avg_freq") or 0),
        "total_checkins":  int(f.get("total_checkins") or 0),
        "avg_mood":        float(m.get("avg_mood") or 0),
        "timeline":        timeline,
    }

# ═══════════════════════════════════════════════════════════════
#  FORMULÁRIO PÚBLICO POR TOKEN
# ═══════════════════════════════════════════════════════════════
import secrets
from starlette.responses import FileResponse

@app.post("/api/form/generate")
def generate_form_token(data: dict, conn=Depends(get_db), _=Depends(get_current_user)):
    student_id  = data.get("student_id")
    personal_id = data.get("personal_id")
    form_type   = data.get("type", "semanal")
    if not student_id or not personal_id:
        raise HTTPException(400, "student_id e personal_id obrigatórios")
    token = secrets.token_urlsafe(16)
    execute(conn, """
        INSERT INTO form_tokens (token, student_id, personal_id, form_type)
        VALUES (%s, %s, %s, %s)
    """, (token, student_id, personal_id, form_type))
    return {"token": token, "url": f"/form/{token}"}

@app.get("/api/form/{token}")
def get_form(token: str, conn=Depends(get_db)):
    rows = query(conn, """
        SELECT ft.token, ft.form_type, ft.student_id::text, ft.personal_id::text,
               s.name AS student_name, s.goal,
               p.name AS personal_name
        FROM form_tokens ft
        JOIN students  s ON s.id = ft.student_id
        JOIN personals p ON p.id = ft.personal_id
        WHERE ft.token = %s
          AND ft.expires_at > NOW()
          AND ft.used = false
    """, (token,))
    if not rows:
        raise HTTPException(404, "Link inválido ou expirado")
    return rows[0]

@app.post("/api/form/{token}")
def submit_form(token: str, data: dict, conn=Depends(get_db)):
    rows = query(conn, """
        SELECT * FROM form_tokens
        WHERE token = %s AND expires_at > NOW() AND used = false
    """, (token,))
    if not rows:
        raise HTTPException(404, "Link inválido ou expirado")
    ft = rows[0]
    execute(conn, """
        INSERT INTO checkins (student_id, personal_id, type,
            training_feedback, trainings_done, had_pain, pain_description,
            nutrition_notes, mood_score, energy_score, weight_reported,
            general_notes, responded_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
    """, (
        str(ft["student_id"]), str(ft["personal_id"]),
        ft.get("form_type","semanal"),
        data.get("training_feedback"),
        data.get("trainings_done"),
        data.get("had_pain", False),
        data.get("pain_description"),
        data.get("nutrition_notes"),
        data.get("mood_score"),
        data.get("energy_score"),
        data.get("weight_reported"),
        data.get("general_notes"),
    ))
    if data.get("weight_reported"):
        execute(conn, "UPDATE students SET weight_current=%s WHERE id=%s",
                (data["weight_reported"], str(ft["student_id"])))
    execute(conn, "UPDATE form_tokens SET used=true WHERE token=%s", (token,))
    return {"ok": True, "message": "Formulário enviado com sucesso!"}

@app.get("/form/{token}")
def serve_form(token: str):
    return FileResponse("form.html")