// Helpers comuns das checagens em Node (D, E). Somente leitura sobre o app.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CHECKS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPORTS = join(CHECKS, "reports");
export const budgets = JSON.parse(readFileSync(join(CHECKS, "budgets.json"), "utf8"));
export const FAKE_PID = "00000000-0000-4000-8000-000000000001";
export const NAMES = { D: "Lighthouse + PWA instalável", E: "Acessibilidade e contraste (axe)" };

export function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
      const p = join(base, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]) if (existsSync(p)) return p;
  return undefined;
}

export class Result {
  constructor(check) { this.check = check; this.name = NAMES[check]; this.status = "ran"; this.notes = []; this.findings = []; this.meta = {}; this.t0 = Date.now(); }
  note(t) { this.notes.push(t); }
  skip(t) { this.status = "skipped"; this.notes.push(t); }
  add({ severity, rule, key, title, location = "", description = "", suggestion = "", blocking = false }) {
    const id = createHash("sha1").update(`${this.check}|${rule}|${key}`).digest("hex").slice(0, 12);
    if (this.findings.some((f) => f.id === id)) return;
    this.findings.push({ id, severity, blocking, rule, title, location, description, suggestion });
  }
  save() {
    mkdirSync(REPORTS, { recursive: true });
    writeFileSync(join(REPORTS, `${this.check}.json`), JSON.stringify({
      check: this.check, name: this.name, status: this.status, notes: this.notes, findings: this.findings,
      meta: this.meta, seconds: Math.round((Date.now() - this.t0) / 100) / 10 }, null, 2));
  }
}

// Telas avaliadas. `auth` precisa de AUTH_BASE (mock local ou proxy com tokens TEST_*).
export function screens() {
  const pub = (process.env.BASE_URL || "").replace(/\/$/, "");
  const auth = (process.env.AUTH_BASE || "").replace(/\/$/, "");
  const pid = process.env.TEST_PERSONAL_ID || FAKE_PID;
  const mock = process.env.AUTH_MODE === "mock";
  const synth = mock ? " (dados SINTÉTICOS)" : "";
  return [
    { key: "aluno-login", label: "Login do aluno", url: pub + "/aluno", auth: false },
    { key: "aluno-home", label: "Home do aluno" + synth, url: auth + `/aluno/${pid}`, auth: true, accent: true },
    { key: "aluno-execucao", label: "Execução do treino" + synth, url: auth + `/aluno/${pid}`, execUrl: auth + `/aluno/${pid}?exec=1`, auth: true, accent: true, exec: true },
    { key: "pro-dashboard", label: "Painel do profissional" + synth, url: auth + "/dashboard", auth: true },
  ];
}
export const authMissingReason = (key) =>
  `${key}: pulada — defina TEST_STUDENT_TOKEN + TEST_PERSONAL_ID (aluno) / TEST_PRO_TOKEN (profissional) com BASE_URL remota.`;
export function screenAvailable(s) {
  if (!s.auth) return true;
  if (!process.env.AUTH_BASE) return false;
  if (process.env.AUTH_MODE === "mock") return true;
  return s.key.startsWith("aluno") ? !!process.env.TEST_STUDENT_TOKEN : !!process.env.TEST_PRO_TOKEN;
}
export const sevMap = { critical: "critical", serious: "high", moderate: "medium", minor: "low" };
