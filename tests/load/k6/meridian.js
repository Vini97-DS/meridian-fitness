// Teste de carga k6 — Meridian (app do aluno + painel). SOMENTE contra a cópia de TESTE com alunos falsos
// (tests/e2e/fixtures/seed-load.mjs). Nada de produção. Variáveis: BASE_URL, DATA_FILE, PROFILE (baseline|stress), LABEL.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:8123').replace(/\/$/, '');
const PROFILE = __ENV.PROFILE || 'stress';
const LABEL = __ENV.LABEL || PROFILE;
const FILE = __ENV.DATA_FILE || '../reports/load-data.json';
const students = new SharedArray('students', () => JSON.parse(open(FILE)).students);
const personals = new SharedArray('personals', () => JSON.parse(open(FILE)).personals);
const VUS = PROFILE === 'baseline' ? 40 : Math.min(students.length, +(__ENV.VUS || 250));
const HERD = PROFILE === 'baseline' ? 40 : Math.min(students.length, 150);
const HOLD = +(__ENV.HOLD_S || 150);
const T_HERD = 40 + HOLD + 20 + 15;   // depois do tráfego contínuo
const T_JITTER = T_HERD + 50;
const T_LOGIN = T_JITTER + 50;

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const think = (a, b) => sleep(a + Math.random() * (b - a));   // tempos de espera ENCURTADOS (descanso real é ~60s); a carga aqui é maior que a real

const loginStatus = new Counter('login_abuse_status');

// ── orçamento p95 por endpoint (ms) ─────────────────────────────
const EP = {
  html_aluno: 500, aluno_brand: 400, aluno_termos_status: 400, aluno_me: 400, aluno_treino: 600, aluno_peso_status: 400,
  exec_iniciar: 800, exec_series: 800, exec_finalizar: 800, aluno_historico: 800,
  pro_metrics: 1500, pro_students: 1000, pro_acompanhamento: 1000, pro_execucoes: 800,
};
const thresholds = {
  'http_req_failed{scenario:students_peak}': ['rate<0.01'],
  'http_req_failed{scenario:pro_dashboard}': ['rate<0.01'],
  'http_req_failed{scenario:offline_herd}': ['rate<0.01'],
  'http_req_failed{scenario:offline_herd_jitter}': ['rate<0.01'],
  'http_req_duration{scenario:students_peak}': ['p(95)<600'],
  'http_req_duration{scenario:pro_dashboard}': ['p(95)<1500'],
  'http_req_duration{scenario:offline_herd}': ['p(95)<1000'],
  'http_req_duration{scenario:offline_herd_jitter}': ['p(95)<1000'],
  'http_req_duration{endpoint:login_request_code}': ['p(95)<800'],
  'http_req_duration{endpoint:login_verify_code}': ['p(95)<800'],
};
for (const [k, v] of Object.entries(EP)) thresholds[`http_req_duration{endpoint:${k}}`] = [`p(95)<${v}`];

const only = (__ENV.ONLY || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const scenarios = {};
if (want('students_peak')) scenarios.students_peak = { executor: 'ramping-vus', exec: 'studentSession', startVUs: 0,
  stages: [{ duration: '40s', target: VUS }, { duration: `${HOLD}s`, target: VUS }, { duration: '20s', target: 0 }], gracefulRampDown: '20s' };
if (want('pro_dashboard')) scenarios.pro_dashboard = { executor: 'constant-vus', exec: 'proDashboard', vus: personals.length, duration: `${40 + HOLD + 20}s` };
if (want('offline_herd')) scenarios.offline_herd = { executor: 'per-vu-iterations', exec: 'herd', vus: HERD, iterations: 1, startTime: `${T_HERD}s`, maxDuration: '45s' };
if (want('offline_herd_jitter')) scenarios.offline_herd_jitter = { executor: 'per-vu-iterations', exec: 'herdJitter', vus: HERD, iterations: 1, startTime: `${T_JITTER}s`, maxDuration: '45s' };
if (want('login_abuse')) scenarios.login_abuse = { executor: 'per-vu-iterations', exec: 'loginAbuse', vus: 1, iterations: 1, startTime: `${T_LOGIN}s`, maxDuration: '60s' };

export const options = { scenarios, thresholds, summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'], discardResponseBodies: false };

function call(method, path, body, token, endpoint, expect = [200]) {
  const params = { headers: { 'Content-Type': 'application/json' }, tags: { endpoint }, responseCallback: http.expectedStatuses(...expect.map((c) => ({ min: c, max: c }))) };
  if (token) params.headers.Authorization = 'Bearer ' + token;
  const r = http.request(method, BASE + path, body ? JSON.stringify(body) : null, params);
  check(r, { [`${endpoint} ${expect.join('/')}`]: (x) => expect.includes(x.status) });
  return r;
}

function openApp(st) {
  call('GET', `/aluno/${st.personal_id}`, null, null, 'html_aluno');
  call('GET', `/api/aluno/brand/${st.personal_id}`, null, null, 'aluno_brand');
  call('GET', '/api/aluno/termos/status', null, st.token, 'aluno_termos_status');
  call('GET', '/api/aluno/me', null, st.token, 'aluno_me');
  call('GET', `/api/aluno/treino?personal_id=${st.personal_id}`, null, st.token, 'aluno_treino');
  call('GET', `/api/aluno/peso/status?personal_id=${st.personal_id}`, null, st.token, 'aluno_peso_status');
}

// 1 treino: iniciar → 6 séries (2 exercícios × 3) → finalizar. `gap` = espera entre as chamadas.
function workout(st, gap) {
  const s = st.sessions[exec.scenario.iterationInTest % st.sessions.length];
  const key = 'k6-' + uuid();
  call('POST', '/api/aluno/treino/execucoes/iniciar', { session_id: s.id, client_key: key }, st.token, 'exec_iniciar');
  let n = 0;
  for (const ex of s.exercises.slice(0, 2)) for (let set = 1; set <= 3; set++) {
    n++; if (gap) gap();
    call('POST', '/api/aluno/treino/execucoes/series', { execution_client_key: key, sets: [{ workout_exercise_id: ex.id, exercise_name: ex.name,
      set_number: set, reps_target_min: ex.reps_min, reps_target_max: ex.reps_max, load_target: ex.load, load_unit: 'kg', reps_done: 10, load_done: 40, client_key: `${key}-${ex.id}-${set}` }] }, st.token, 'exec_series');
  }
  if (gap) gap();
  call('POST', '/api/aluno/treino/execucoes/finalizar', { execution_client_key: key, effort_score: 3, mood_score: 4, comment: null }, st.token, 'exec_finalizar');
}

const me = () => students[(exec.vu.idInTest - 1) % students.length];

export function studentSession() {
  const st = me();
  openApp(st);
  think(1, 3);
  workout(st, () => think(1, 3));
  call('GET', '/api/aluno/treino/execucoes', null, st.token, 'aluno_historico');
  think(3, 6);
}

export function proDashboard() {
  const p = personals[(exec.vu.idInTest - 1) % personals.length];
  const sid = p.studentIds[Math.floor(Math.random() * p.studentIds.length)];
  call('GET', `/api/metrics/${p.id}`, null, p.token, 'pro_metrics');
  call('GET', `/api/students/${p.id}`, null, p.token, 'pro_students');
  call('GET', `/api/treino/acompanhamento/${sid}`, null, p.token, 'pro_acompanhamento');
  call('GET', `/api/treino/execucoes/${sid}`, null, p.token, 'pro_execucoes');
  think(4, 8);
}

// Volta da rede de MUITOS celulares ao mesmo tempo, esvaziando a fila sem espera (comportamento atual: sync imediato no evento 'online').
export function herd() { workout(me(), null); }
// Mesma rajada, mas com espera aleatória (0–15 s) antes de reenviar — o que o backoff com jitter faria.
export function herdJitter() { sleep(Math.random() * 15); workout(me(), null); }

export function loginAbuse() {
  const known = students[0].email;
  const post = (email, code, ep, path, body) => { const r = call('POST', path, body, null, ep, [200, 400, 401, 429, 500]); loginStatus.add(1, { endpoint: ep, status: String(r.status) }); return r; };
  for (let i = 0; i < 12; i++) post(known, null, 'login_request_code', '/api/aluno/auth/request-code', { email: known });
  for (let i = 0; i < 12; i++) post(null, null, 'login_request_code', '/api/aluno/auth/request-code', { email: `nao-existe-${i}-${uuid().slice(0, 6)}@exemplo.test` });
  for (let i = 0; i < 35; i++) post(null, null, 'login_verify_code', '/api/aluno/auth/verify-code', { email: known, code: String(100000 + i) });
}

export function handleSummary(data) {
  return { [`../reports/k6-${LABEL}.json`]: JSON.stringify(data) };
}
