// Antes de tudo: o alvo está no ar, as credenciais de teste existem e valem, e (se houver) o banco é o de teste.
import { assertSafeTarget, assertSafeDb } from "./guard.mjs";

export default async function globalSetup() {
  assertSafeTarget();
  const base = process.env.BASE_URL.replace(/\/$/, "");
  const fail = (m) => { throw new Error(`\n\n⚠ PRÉ-REQUISITO DOS E2E: ${m}\n   Veja tests/e2e/README.md.\n`); };
  const r = await fetch(base + "/aluno").catch((e) => fail(`BASE_URL (${base}) inacessível: ${e.message}`));
  if (!r.ok) fail(`GET ${base}/aluno devolveu ${r.status}`);
  for (const [name, path] of [["TEST_STUDENT_TOKEN", "/api/aluno/me"], ["TEST_PRO_TOKEN", "/api/auth/me"]]) {
    if (!process.env[name]) fail(`${name} não definido`);
    const res = await fetch(base + path, { headers: { Authorization: "Bearer " + process.env[name] } });
    if (res.status === 401 || res.status === 403) fail(`${name} rejeitado pelo app (${res.status}) — token expirado ou emitido com outro JWT_SECRET`);
    if (!res.ok) fail(`${path} devolveu ${res.status} com ${name}`);
  }
  assertSafeDb(); // os testes conferem/limpam dados no banco de TESTE
}
