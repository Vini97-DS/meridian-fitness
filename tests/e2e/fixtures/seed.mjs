#!/usr/bin/env node
// Uso: node fixtures/seed.mjs seed|clean [--scenario=nome]   — SOMENTE branch de TESTE (ver README)
import "dotenv/config";
import { connect, seed, clean, applyScenario, SCENARIOS } from "../lib/seed-lib.mjs";
const [cmd = "seed", ...rest] = process.argv.slice(2);
const scenario = (rest.find((a) => a.startsWith("--scenario=")) || "").split("=")[1];
let c;
try {
  c = await connect();
  if (cmd === "seed") { await seed(c); if (scenario) await applyScenario(c, scenario); console.log(`seed ok (idempotente)${scenario ? ` · cenário ${scenario}` : ""}. Cenários: ${Object.keys(SCENARIOS).join(", ")}`); }
  else if (cmd === "clean") { await clean(c); console.log("dados e2e removidos do banco de teste."); }
  else { console.error("uso: seed.mjs seed|clean [--scenario=default|pendente-ontem|descanso|expirado]"); process.exitCode = 2; }
} catch (e) { console.error(e.message); process.exitCode = 1; } finally { await c?.end(); }
