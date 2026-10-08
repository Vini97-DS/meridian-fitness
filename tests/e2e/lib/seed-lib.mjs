// Seed/limpeza do branch de TESTE. Idempotente: tudo é identificado por UUIDs fixos e e-mails @e2e.meridian.test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, assertSafeDb, E2E_DIR } from "./guard.mjs";
import { isoWeekdayOffset, tsDaysAgo } from "./dates.mjs";
import pg from "pg";

export const IDS = config.ids;
export const EMAIL = (n) => `${n}@${config.emailDomain}`;
export const STUDENT_EMAIL = EMAIL("aluno");
const uid = (n) => `e2e0000a-0000-4000-8000-${String(n).padStart(12, "0")}`; // exercícios/sessões/itens do seed

export async function connect() {
  const url = assertSafeDb();
  const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

export function termsVersion() {
  try { return /TERMS_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(join(E2E_DIR, "../../api.py"), "utf8"))[1]; } catch { return "1.0"; }
}

export async function assertSchema(c) {
  const need = ["users", "personals", "students", "plans", "subscriptions", "student_accounts", "student_account_links", "exercises", "workouts",
    "workout_sessions", "workout_exercises", "workout_executions", "workout_execution_sets", "student_consents", "login_codes", "auth_rate_limit"];
  const { rows } = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  const have = new Set(rows.map((r) => r.table_name));
  const miss = need.filter((t) => !have.has(t));
  if (miss.length) throw new Error(`Schema incompleto no banco de teste (faltam: ${miss.join(", ")}). Suba o app uma vez apontando para este banco (o startup cria as tabelas) e rode o seed de novo.`);
}

export async function clean(c) {
  const sid = [IDS.student, IDS.studentB], pid = IDS.personal;
  const run = (sql, p = []) => c.query(sql, p);
  await run("DELETE FROM workout_execution_sets WHERE execution_id IN (SELECT id FROM workout_executions WHERE student_id = ANY($1))", [sid]);
  await run("DELETE FROM workout_executions WHERE student_id = ANY($1)", [sid]);
  await run("DELETE FROM workout_exercises WHERE session_id IN (SELECT id FROM workout_sessions WHERE workout_id IN (SELECT id FROM workouts WHERE personal_id=$1))", [pid]);
  await run("DELETE FROM workout_sessions WHERE workout_id IN (SELECT id FROM workouts WHERE personal_id=$1)", [pid]);
  await run("DELETE FROM workouts WHERE personal_id=$1", [pid]);
  await run("DELETE FROM exercises WHERE personal_id=$1", [pid]);
  await run("DELETE FROM student_consents WHERE account_id=$1", [IDS.account]);
  await run("DELETE FROM student_account_links WHERE account_id=$1", [IDS.account]);
  await run("DELETE FROM student_accounts WHERE id=$1 OR email LIKE $2", [IDS.account, `%@${config.emailDomain}`]);
  await run("DELETE FROM login_codes WHERE email LIKE $1", [`%@${config.emailDomain}`]);
  await run("DELETE FROM auth_rate_limit"); // banco de TESTE: zera os limites para a suíte ser repetível
  try { await run("DELETE FROM checkins WHERE student_id = ANY($1)", [sid]); } catch { /* tabela opcional */ }
  await run("DELETE FROM subscriptions WHERE personal_id=$1", [pid]);
  await run("DELETE FROM plans WHERE personal_id=$1", [pid]);
  await run("DELETE FROM students WHERE personal_id=$1", [pid]);
  await run("DELETE FROM personals WHERE id=$1", [pid]);
  await run("DELETE FROM users WHERE id=$1 OR email LIKE $2", [IDS.user, `%@${config.emailDomain}`]);
}

const SESSIONS = [
  { key: "A", n: 1, name: "A - Peito e tríceps", ex: ["Supino reto", "Tríceps corda"] },
  { key: "B", n: 2, name: "B - Costas e bíceps", ex: ["Remada curvada", "Rosca direta"] },
  { key: "C", n: 3, name: "C - Pernas", ex: ["Agachamento livre", "Leg press"] },
];
export const SESSION_NAMES = Object.fromEntries(SESSIONS.map((s) => [s.key, s.name]));
export const SESSION_IDS = Object.fromEntries(SESSIONS.map((s) => [s.key, uid(100 + s.n)]));

// Dias planejados por cenário (offset em dias a partir de hoje; ver README):
export const SCENARIOS = {
  default:          { A: 0, B: 1, C: 2 },          // hoje = A; nada pendente
  "pendente-ontem": { A: -1, B: 0, C: 1 },         // A era de ontem e não foi feito; hoje = B
  descanso:         { A: -1, B: 1, C: 2 },         // A pendente de ontem; hoje é descanso
  expirado:         { A: -4, B: 0, C: 1 },         // A era de 4 dias atrás → expirado
};

export async function applyScenario(c, name = "default") {
  const plan = SCENARIOS[name];
  if (!plan) throw new Error(`cenário desconhecido: ${name}`);
  for (const s of SESSIONS) await c.query("UPDATE workout_sessions SET weekdays=$1 WHERE id=$2", [[isoWeekdayOffset(plan[s.key])], SESSION_IDS[s.key]]);
}

// Remove execuções criadas DURANTE os testes (mantém só o histórico do seed).
export async function resetRunState(c) {
  await c.query("DELETE FROM workout_execution_sets WHERE execution_id IN (SELECT id FROM workout_executions WHERE student_id=$1 AND client_key NOT LIKE 'e2e-seed-%')", [IDS.student]);
  await c.query("DELETE FROM workout_executions WHERE student_id=$1 AND client_key NOT LIKE 'e2e-seed-%'", [IDS.student]);
  await c.query("DELETE FROM auth_rate_limit");
  await c.query("DELETE FROM login_codes WHERE email LIKE $1", [`%@${config.emailDomain}`]);
  await c.query("UPDATE personals SET brand_name='Studio E2E', brand_logo_url=NULL, brand_primary='#e8b04b', brand_accent='#4f46e5' WHERE id=$1", [IDS.personal]);
  await c.query("INSERT INTO student_consents (account_id, version) VALUES ($1,$2) ON CONFLICT DO NOTHING", [IDS.account, termsVersion()]);
  await applyScenario(c, "default");
}

export async function seed(c) {
  await assertSchema(c);
  await clean(c);
  await c.query("INSERT INTO users (id, name, email, password, role) VALUES ($1,'Personal E2E',$2,'!e2e-sem-login','personal')", [IDS.user, EMAIL("personal")]);
  await c.query(`INSERT INTO personals (id, clerk_user_id, name, email, brand_name, brand_primary, brand_accent)
                 VALUES ($1,$2,'Personal E2E',$3,'Studio E2E','#e8b04b','#4f46e5')`, [IDS.personal, IDS.user, EMAIL("personal")]);
  await c.query("INSERT INTO plans (id, personal_id, name, duration_months, price) VALUES ($1,$2,'Plano E2E',1,100)", [IDS.plan, IDS.personal]);
  for (const [id, name, email, phone] of [[IDS.student, "Aluno E2E", STUDENT_EMAIL, "11900000001"], [IDS.studentB, "Aluna Dois E2E", EMAIL("aluna2"), "11900000002"]]) {
    await c.query("INSERT INTO students (id, personal_id, name, phone, email, status, weight_initial, weight_current) VALUES ($1,$2,$3,$4,$5,'active',80,78)", [id, IDS.personal, name, phone, email]);
    await c.query(`INSERT INTO subscriptions (student_id, personal_id, plan_id, price_paid, starts_at, expires_at, status)
                   VALUES ($1,$2,$3,100, CURRENT_DATE - 10, CURRENT_DATE + 20, 'active')`, [id, IDS.personal, IDS.plan]);
  }
  await c.query("INSERT INTO student_accounts (id, email, name) VALUES ($1,$2,'Aluno E2E')", [IDS.account, STUDENT_EMAIL]);
  await c.query("INSERT INTO student_account_links (student_id, account_id) VALUES ($1,$2)", [IDS.student, IDS.account]);
  await c.query("INSERT INTO student_consents (account_id, version) VALUES ($1,$2)", [IDS.account, termsVersion()]);

  // Biblioteca + ficha ativa A/B/C
  await c.query("INSERT INTO workouts (id, personal_id, name, student_id, status) VALUES ($1,$2,'Ficha E2E',$3,'ativa')", [IDS.workout, IDS.personal, IDS.student]);
  let ex = 0; const wex = {};
  for (const s of SESSIONS) {
    await c.query("INSERT INTO workout_sessions (id, workout_id, name, position, weekdays) VALUES ($1,$2,$3,$4,$5)", [SESSION_IDS[s.key], IDS.workout, s.name, s.n, [0]]);
    let pos = 1;
    for (const name of s.ex) {
      ex += 1; const exId = uid(200 + ex), weId = uid(300 + ex);
      await c.query("INSERT INTO exercises (id, personal_id, name, muscle_group) VALUES ($1,$2,$3,'geral')", [exId, IDS.personal, name]);
      await c.query(`INSERT INTO workout_exercises (id, session_id, exercise_id, position, sets, reps_min, reps_max, load_value, load_unit, rest_seconds)
                     VALUES ($1,$2,$3,$4,3,8,12,40,'kg',30)`, [weId, SESSION_IDS[s.key], exId, pos++]);
      (wex[s.key] ||= []).push({ weId, name });
    }
  }
  // Sessões antigas (7+ dias atrás, fora da janela de "pendente"): servem de "última vez" e de histórico
  const hist = [["A", 7], ["B", 8], ["C", 9], ["A", 14], ["B", 15], ["C", 16]];
  let h = 0;
  for (const [key, ago] of hist) {
    h += 1; const exId = uid(400 + h), ck = `e2e-seed-${h}`;
    await c.query(`INSERT INTO workout_executions (id, student_id, workout_id, session_id, session_name, started_at, finished_at, effort_score, mood_score, comment, client_key)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,3,4,'treino antigo (seed)',$8)`,
      [exId, IDS.student, IDS.workout, SESSION_IDS[key], SESSION_NAMES[key], tsDaysAgo(ago, 10), tsDaysAgo(ago, 11), ck]);
    for (const w of wex[key]) for (let n = 1; n <= 3; n++)
      await c.query(`INSERT INTO workout_execution_sets (execution_id, workout_exercise_id, exercise_name, set_number, reps_target_min, reps_target_max, load_target, load_unit, reps_done, load_done, completed_at, client_key)
                     VALUES ($1,$2,$3,$4,8,12,40,'kg',10,40,$5,$6)`, [exId, w.weId, w.name, n, tsDaysAgo(ago, 10), `${ck}-${w.weId}-${n}`]);
  }
  await applyScenario(c, "default");
}
