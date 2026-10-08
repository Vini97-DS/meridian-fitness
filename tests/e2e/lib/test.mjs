import { test as base, expect } from "@playwright/test";
import { connect, resetRunState, applyScenario } from "./seed-lib.mjs";

export const test = base.extend({
  // uma conexão por worker ao banco de TESTE (guard dentro de connect())
  db: [async ({}, use) => { const c = await connect(); await use(c); await c.end(); }, { scope: "worker" }],
  // todo teste começa com o estado do seed (sem execuções de rodadas anteriores, tema/ consentimento padrão)
  _reset: [async ({ db }, use) => { await resetRunState(db); await use(); }, { auto: true }],
  scenario: async ({ db }, use) => { await use((name) => applyScenario(db, name)); },
});
export { expect };
