#!/usr/bin/env node
// Emite sessões (JWT HS256) para o aluno e o profissional de TESTE usando o JWT_SECRET do ambiente de TESTE.
// Imprime no terminal — nunca grava em arquivo. Uso: JWT_SECRET=... npm run tokens   (ou --export)
import "dotenv/config";
import { createHmac } from "node:crypto";
import { config } from "../lib/guard.mjs";
import { EMAIL, IDS } from "../lib/seed-lib.mjs";
const secret = process.env.JWT_SECRET;
if (!secret) { console.error("defina JWT_SECRET (do ambiente de TESTE, nunca o de produção)"); process.exit(1); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b64({ alg: "HS256", typ: "JWT" }) + "." + b64(p); return h + "." + createHmac("sha256", secret).update(h).digest("base64url"); };
const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
const student = sign({ sub: IDS.account, email: EMAIL("aluno"), name: "Aluno E2E", typ: "student", exp });
const pro = sign({ sub: IDS.user, email: EMAIL("personal"), name: "Personal E2E", exp });
const pre = process.argv.includes("--export") ? "export " : "";
console.log(`${pre}TEST_STUDENT_TOKEN=${student}\n${pre}TEST_PRO_TOKEN=${pro}`);
