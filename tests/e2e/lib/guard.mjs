// Trava de segurança: recusa rodar contra produção. Importado pela config, pelo seed e pelos fixtures.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const config = JSON.parse(readFileSync(join(E2E_DIR, "config.json"), "utf8"));

const hostMatch = (host, list) => list.some((b) => host === b.toLowerCase() || host.endsWith("." + b.toLowerCase()));

export function assertSafeTarget({ needBaseUrl = true } = {}) {
  const problems = [];
  if ((process.env.APP_ENV || "").toLowerCase() === "production") problems.push("APP_ENV=production");
  const base = process.env.BASE_URL;
  if (needBaseUrl && !base) problems.push("BASE_URL não definida (use um preview da Vercel de TESTE ou http://localhost:PORT)");
  if (base) {
    let host = "";
    try { host = new URL(base).hostname.toLowerCase(); } catch { problems.push(`BASE_URL inválida: ${base}`); }
    if (host && hostMatch(host, config.blockedHosts)) problems.push(`BASE_URL (${host}) está na lista de PRODUÇÃO (config.json → blockedHosts)`);
  }
  if (problems.length) {
    throw new Error(`\n\n⛔ TESTES E2E RECUSADOS — ${problems.join("; ")}.\n   Estes testes escrevem dados (execuções de treino) e só podem rodar num ambiente de TESTE.\n`);
  }
}

export function assertSafeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("\n\n⛔ DATABASE_URL (branch de TESTE) não definida.\n");
  const host = new URL(url).hostname.toLowerCase();
  const allow = (process.env.TEST_DB_HOST_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (hostMatch(host, config.blockedDbHosts)) throw new Error(`\n\n⛔ SEED/DB RECUSADO — host ${host} é o banco de PRODUÇÃO.\n`);
  if (!allow.length) throw new Error("\n\n⛔ SEED/DB RECUSADO — defina TEST_DB_HOST_ALLOWLIST com o host do branch de TESTE do Neon.\n");
  if (!allow.includes(host)) throw new Error(`\n\n⛔ SEED/DB RECUSADO — host ${host} não está em TEST_DB_HOST_ALLOWLIST (${allow.join(", ")}).\n`);
  return url;
}
