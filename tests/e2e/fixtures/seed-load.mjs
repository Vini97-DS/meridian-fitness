#!/usr/bin/env node
// Alunos FALSOS para teste de carga (k6) — SOMENTE branch/banco de TESTE (mesma trava do seed e2e).
// Uso: node fixtures/seed-load.mjs seed [--students=250] [--personals=4] [--out=../load/reports/load-data.json] | clean
// Marcador: e-mails @load.meridian.test (tudo é removível por ele). Tokens são assinados com JWT_SECRET de TESTE e
// gravados só no arquivo de saída (ignorado pelo git), nunca impressos.
import "dotenv/config";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { connect, termsVersion } from "../lib/seed-lib.mjs";

const DOM = "load.meridian.test", LIKE = `%@${DOM}`;
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=")[1];
const cmd = process.argv[2] || "seed";
const N = +arg("students", 250), P = +arg("personals", 4);
const OUT = resolve(arg("out", "../load/reports/load-data.json"));

async function clean(c) {
  const sub = "(SELECT id FROM students WHERE email LIKE $1)";
  const q = (s) => c.query(s, [LIKE]);
  await q(`DELETE FROM workout_execution_sets WHERE execution_id IN (SELECT id FROM workout_executions WHERE student_id IN ${sub})`);
  await q(`DELETE FROM workout_executions WHERE student_id IN ${sub}`);
  await q(`DELETE FROM workout_exercises WHERE session_id IN (SELECT ws.id FROM workout_sessions ws JOIN workouts w ON w.id=ws.workout_id WHERE w.student_id IN ${sub})`);
  await q(`DELETE FROM workout_sessions WHERE workout_id IN (SELECT id FROM workouts WHERE student_id IN ${sub})`);
  await q(`DELETE FROM workouts WHERE student_id IN ${sub}`);
  await q(`DELETE FROM student_consents WHERE account_id IN (SELECT id FROM student_accounts WHERE email LIKE $1)`);
  await q(`DELETE FROM student_account_links WHERE student_id IN ${sub}`);
  await q(`DELETE FROM student_accounts WHERE email LIKE $1`);
  await q(`DELETE FROM login_codes WHERE email LIKE $1`);
  await q(`DELETE FROM subscriptions WHERE student_id IN ${sub}`);
  await q(`DELETE FROM students WHERE email LIKE $1`);
  await q(`DELETE FROM exercises WHERE personal_id IN (SELECT id FROM personals WHERE email LIKE $1)`);
  await q(`DELETE FROM plans WHERE personal_id IN (SELECT id FROM personals WHERE email LIKE $1)`);
  await q(`DELETE FROM personals WHERE email LIKE $1`);
  await q(`DELETE FROM users WHERE email LIKE $1`);
}

const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b64({ alg: "HS256", typ: "JWT" }) + "." + b64(p); return h + "." + createHmac("sha256", secret).update(h).digest("base64url"); };

const c = await connect();
try {
  await clean(c);
  if (cmd === "clean") { console.log("alunos de carga removidos."); process.exit(0); }
  if (!secret) throw new Error("defina JWT_SECRET (de TESTE) para assinar os tokens");
  await c.query("BEGIN");
  const users = [], personals = [];
  for (let i = 1; i <= P; i++) {
    const u = (await c.query("INSERT INTO users (name,email,password,role) VALUES ($1,$2,'!load','personal') RETURNING id", [`Load Personal ${i}`, `personal${i}@${DOM}`])).rows[0].id;
    const p = (await c.query("INSERT INTO personals (clerk_user_id,name,email,brand_name) VALUES ($1,$2,$3,$4) RETURNING id", [u, `Load Personal ${i}`, `personal${i}@${DOM}`, `Studio Load ${i}`])).rows[0].id;
    await c.query("INSERT INTO plans (personal_id,name,duration_months,price) VALUES ($1,'Plano Load',1,100)", [p]);
    users.push(u); personals.push(p);
    const n = Math.floor(N / P) + (i <= N % P ? 1 : 0);
    await c.query(`INSERT INTO students (personal_id,name,email,phone,status,weight_initial,weight_current)
                   SELECT $1,'Aluno Load '||$2::text||'-'||g,'aluno'||$2||'_'||g||'@${DOM}','119'||lpad(($2::int*1000+g)::text,8,'0'),'active',80,78 FROM generate_series(1,$3) g`, [p, i, n]);
  }
  const sql = async (s, p = []) => c.query(s, p);
  await sql(`INSERT INTO exercises (personal_id,name,muscle_group) SELECT p.id,'Ex '||lpad(g::text,2,'0'),'geral' FROM personals p CROSS JOIN generate_series(1,12) g WHERE p.email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO subscriptions (student_id,personal_id,plan_id,price_paid,starts_at,expires_at,status)
             SELECT s.id,s.personal_id,pl.id,100,CURRENT_DATE-10,CURRENT_DATE+20,'active' FROM students s JOIN plans pl ON pl.personal_id=s.personal_id WHERE s.email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO student_accounts (email,name) SELECT email,name FROM students WHERE email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO student_account_links (student_id,account_id) SELECT s.id,a.id FROM students s JOIN student_accounts a ON a.email=s.email WHERE s.email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO student_consents (account_id,version) SELECT id,$2 FROM student_accounts WHERE email LIKE $1`, [LIKE, termsVersion()]);
  await sql(`INSERT INTO workouts (personal_id,name,student_id,status) SELECT personal_id,'Ficha load',id,'ativa' FROM students WHERE email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO workout_sessions (workout_id,name,position,weekdays)
             SELECT w.id,'Treino '||chr(64+g),g,ARRAY[(g-1)*2] FROM workouts w JOIN students s ON s.id=w.student_id CROSS JOIN generate_series(1,3) g WHERE s.email LIKE $1`, [LIKE]);
  await sql(`WITH ex AS (SELECT id,personal_id,row_number() OVER (PARTITION BY personal_id ORDER BY name) rn FROM exercises WHERE personal_id IN (SELECT id FROM personals WHERE email LIKE $1))
             INSERT INTO workout_exercises (session_id,exercise_id,position,sets,reps_min,reps_max,load_value,load_unit,rest_seconds)
             SELECT ws.id,ex.id,k,3,8,12,40,'kg',60
             FROM workout_sessions ws JOIN workouts w ON w.id=ws.workout_id JOIN students s ON s.id=w.student_id
             CROSS JOIN generate_series(1,4) k JOIN ex ON ex.personal_id=s.personal_id AND ex.rn=((ws.position-1)*4+k) WHERE s.email LIKE $1`, [LIKE]);
  // histórico: 13 treinos concluídos por aluno nos últimos 40 dias, 4 exercícios × 3 séries cada
  await sql(`INSERT INTO workout_executions (student_id,workout_id,session_id,session_name,started_at,finished_at,effort_score,mood_score,client_key)
             SELECT s.id,w.id,ws.id,ws.name,now()-(g||' days')::interval,now()-(g||' days')::interval+interval '50 minutes',3,4,'load-seed-'||s.id||'-'||g
             FROM students s JOIN workouts w ON w.student_id=s.id CROSS JOIN generate_series(3,39,3) g
             JOIN workout_sessions ws ON ws.workout_id=w.id AND ws.position=((g/3-1)%3)+1 WHERE s.email LIKE $1`, [LIKE]);
  await sql(`INSERT INTO workout_execution_sets (execution_id,workout_exercise_id,exercise_name,set_number,reps_target_min,reps_target_max,load_target,load_unit,reps_done,load_done,completed_at,client_key)
             SELECT e.id,wx.id,x.name,n,8,12,40,'kg',10,40,e.finished_at,e.client_key||'-'||wx.id||'-'||n
             FROM workout_executions e JOIN workout_exercises wx ON wx.session_id=e.session_id JOIN exercises x ON x.id=wx.exercise_id
             CROSS JOIN generate_series(1,3) n WHERE e.client_key LIKE 'load-seed-%' AND e.student_id IN (SELECT id FROM students WHERE email LIKE $1)`, [LIKE]);
  await c.query("COMMIT");
  await c.query("ANALYZE");

  const exp = Math.floor(Date.now() / 1000) + 14 * 86400;
  const rows = (await c.query(`
    SELECT s.id AS student_id, s.personal_id, s.email, a.id AS account_id,
      (SELECT json_agg(json_build_object('id',ws.id,'name',ws.name,'exercises',
         (SELECT json_agg(json_build_object('id',we.id,'name',e.name,'sets',we.sets,'reps_min',we.reps_min,'reps_max',we.reps_max,'load',we.load_value) ORDER BY we.position)
          FROM workout_exercises we JOIN exercises e ON e.id=we.exercise_id WHERE we.session_id=ws.id)) ORDER BY ws.position)
       FROM workout_sessions ws JOIN workouts w ON w.id=ws.workout_id WHERE w.student_id=s.id) AS sessions
    FROM students s JOIN student_accounts a ON a.email=s.email WHERE s.email LIKE $1 ORDER BY s.email`, [LIKE])).rows;
  const students = rows.map((r) => ({ ...r, token: sign({ sub: r.account_id, email: r.email, name: "Aluno Load", typ: "student", exp }) }));
  const pros = personals.map((id, i) => ({ id, userId: users[i], token: sign({ sub: users[i], email: `personal${i + 1}@${DOM}`, name: `Load Personal ${i + 1}`, exp }),
    studentIds: students.filter((s) => s.personal_id === id).map((s) => s.student_id) }));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ students, personals: pros }));
  const cnt = (await c.query("SELECT (SELECT count(*) FROM students WHERE email LIKE $1) s,(SELECT count(*) FROM workout_executions WHERE client_key LIKE 'load-seed-%') e,(SELECT count(*) FROM workout_execution_sets WHERE client_key LIKE 'load-seed-%') st", [LIKE])).rows[0];
  console.log(`seed de carga ok: ${cnt.s} alunos, ${P} personais, ${cnt.e} execuções, ${cnt.st} séries → ${OUT} (tokens dentro; gitignored)`);
} catch (e) { try { await c.query("ROLLBACK"); } catch {} console.error(e.message); process.exitCode = 1; } finally { await c.end(); }
