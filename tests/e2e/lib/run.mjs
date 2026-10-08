#!/usr/bin/env node
// Executa o Playwright e imprime o resumo por fluxo. Falha (exit 1) só para falhas que NÃO são "lacunas conhecidas"
// (testes marcados com gap() cobrem funcionalidades que ainda não existem no app). E2E_STRICT_GAPS=1 conta as lacunas também.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const t0 = Date.now();
const pw = spawnSync("npx", ["playwright", "test", ...args], { cwd: dir, stdio: "inherit", env: process.env });
const file = join(dir, "reports/results.json");
if (!existsSync(file)) process.exit(pw.status || 1);
const res = JSON.parse(readFileSync(file, "utf8"));
const rows = [];
const walk = (suite, file0) => {
  for (const s of suite.suites || []) walk(s, suite.file || file0);
  for (const sp of suite.specs || []) for (const t of sp.tests) {
    const results = t.results || [];
    const last = results[results.length - 1] || {};
    const isGap = (t.annotations || []).some((a) => a.type === "gap");
    const flaky = t.status === "flaky";
    const status = t.status === "skipped" ? "skipped" : (t.status === "expected" || flaky) ? "passed" : "failed";
    rows.push({ flow: (sp.title.match(/^(\d)\./) || [])[1] || "?", title: sp.title, project: t.projectName, status, flaky, gap: isGap,
      gapNote: (t.annotations.find((a) => a.type === "gap") || {}).description, error: (last.error?.message || "").split("\n")[0].replace(/\u001b\[[0-9;]*m/g, "").slice(0, 160), ms: results.reduce((a, r) => a + r.duration, 0) });
  }
};
res.suites.forEach((s) => walk(s, s.file));
const FLOWS = { 1: "Login e navegação", 2: "Home e treino de hoje", 3: "Execução do treino", 4: "Offline e sincronização", 5: "Treino pendente", 6: "Tema do profissional", 7: "PWA", 8: "Painel do profissional" };
console.log("\n" + "=".repeat(86) + "\nRESUMO E2E POR FLUXO\n" + "=".repeat(86));
console.log("fluxo".padEnd(34) + "ok".padStart(5) + "bug?".padStart(6) + "lacuna".padStart(8) + "flaky".padStart(7) + "pulado".padStart(8));
let bad = 0;
for (const [k, name] of Object.entries(FLOWS)) {
  const r = rows.filter((x) => x.flow === k);
  if (!r.length) continue;
  const ok = r.filter((x) => x.status === "passed").length, fl = r.filter((x) => x.flaky).length, sk = r.filter((x) => x.status === "skipped").length;
  const gaps = r.filter((x) => x.status === "failed" && x.gap).length, fails = r.filter((x) => x.status === "failed" && !x.gap).length;
  bad += fails + (process.env.E2E_STRICT_GAPS ? gaps : 0);
  console.log(`${k}. ${name}`.padEnd(34) + String(ok).padStart(5) + String(fails).padStart(6) + String(gaps).padStart(8) + String(fl).padStart(7) + String(sk).padStart(8));
}
console.log("=".repeat(86));
for (const x of rows.filter((r) => r.status === "failed")) console.log(`${x.gap ? "LACUNA" : "FALHA "} [${x.project}] ${x.title}\n         ${x.error}${x.gapNote ? `\n         (esperado: ${x.gapNote})` : ""}`);
console.log(`\nTempo total: ${((Date.now() - t0) / 1000).toFixed(0)}s · testes: ${rows.length} · instáveis (flaky): ${rows.filter((r) => r.flaky).length}`);
console.log("Artefatos de falha (screenshot/vídeo/trace): tests/e2e/reports/artifacts · HTML: tests/e2e/reports/html");
process.exit(bad ? 1 : 0);
