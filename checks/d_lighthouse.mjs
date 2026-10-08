// D) Lighthouse (celular, 4G simulada) + instalabilidade PWA (CDP). Orçamentos em budgets.json.
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "playwright-core";
import { gzipSync } from "node:zlib";
import { Result, budgets, chromePath, screens, screenAvailable, authMissingReason } from "./lib/common.mjs";

const r = new Result("D");
const B = budgets.lighthouse;
const exe = chromePath();
if (!exe) { r.status = "error"; r.note("Chromium não encontrado (defina CHROME_PATH)."); r.save(); process.exit(0); }
process.env.CHROME_PATH = exe;
const kb = (n) => Math.round(n / 102.4) / 10;

async function inlineJsGzip(url) { // JS inline do HTML também conta no "JS total"
  try { const html = await (await fetch(url, { headers: { "accept-encoding": "identity" } })).text();
    return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].reduce((a, m) => a + gzipSync(m[1]).length, 0);
  } catch { return 0; } }

const chrome = await chromeLauncher.launch({ chromePath: exe, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
const rows = [];
try {
  for (const scr of screens()) {
    if (!screenAvailable(scr)) { r.note(authMissingReason(scr.key)); continue; }
    const url = scr.execUrl || scr.url;
    try {
      const res = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices"], formFactor: "mobile" });
      const lhr = res.lhr; const sc = (k) => Math.round((lhr.categories[k].score ?? 0) * 100);
      const lcp = lhr.audits["largest-contentful-paint"].numericValue;
      const reqs = lhr.audits["network-requests"].details?.items || [];
      const extJs = reqs.filter((x) => x.resourceType === "Script").reduce((a, x) => a + (x.transferSize || 0), 0);
      const inl = await inlineJsGzip(scr.url);
      const row = { key: scr.key, label: scr.label, perf: sc("performance"), a11y: sc("accessibility"), bp: sc("best-practices"), lcp, jsKb: kb(extJs + inl), url };
      rows.push(row);
      r.note(`${scr.label}: perf ${row.perf} | a11y ${row.a11y} | boas práticas ${row.bp} | LCP ${(lcp / 1000).toFixed(2)}s | JS comprimido ${row.jsKb} KB (externo ${kb(extJs)} + inline ${kb(inl)})${scr.exec ? " — tela de execução aberta automaticamente após a carga" : ""}`);
      const loc = `${scr.label} — ${scr.url}`;
      const chk = (cond, rule, title, desc, sug) => cond && r.add({ severity: "high", rule, key: scr.key, title, location: loc, description: desc, suggestion: sug });
      chk(row.perf < B.performance_min, `lh-perf`, `Performance ${row.perf} < ${B.performance_min}`, `LCP ${(lcp / 1000).toFixed(2)}s, TBT ${Math.round(lhr.audits["total-blocking-time"].numericValue)}ms.`, "Reduzir JS inline/bloqueante e adiar o que não é crítico.");
      chk(row.a11y < B.accessibility_min, `lh-a11y`, `Acessibilidade ${row.a11y} < ${B.accessibility_min}`, "Ver achados do axe (checagem E) para o detalhe.", "Corrigir as violações apontadas pelo axe.");
      chk(row.bp < B.best_practices_min, `lh-bp`, `Boas práticas ${row.bp} < ${B.best_practices_min}`, Object.values(lhr.categories["best-practices"].auditRefs).filter((a) => lhr.audits[a.id].score === 0).map((a) => lhr.audits[a.id].title).join("; ").slice(0, 300), "Corrigir as auditorias reprovadas.");
      chk(lcp > B.lcp_ms_max, `lh-lcp`, `LCP ${(lcp / 1000).toFixed(2)}s > ${B.lcp_ms_max / 1000}s`, "Medido com throttling simulado (Lighthouse mobile, 4G lenta).", "Reduzir o que bloqueia a renderização inicial.");
      if (scr.key === "aluno-home") chk(row.jsKb > B.student_home_js_kb_max, `lh-js`, `JS da home do aluno ${row.jsKb} KB > ${B.student_home_js_kb_max} KB (comprimido)`, "Soma de scripts externos + inline (gzip).", "Dividir/atrasar o JS não essencial.");
    } catch (e) { r.note(`${scr.key}: Lighthouse falhou (${String(e.message).split("\n")[0].slice(0, 200)})`); }
  }
} finally { await chrome.kill(); }
r.meta.lighthouse = rows;

// ── PWA instalável (Lighthouse 12 removeu a categoria PWA → checagem via CDP do Chromium) ──
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const pwaScreens = screens().filter((s) => s.key === "aluno-home" || s.key === "aluno-login").concat(screens().filter((s) => s.key === "pro-dashboard"));
for (const scr of pwaScreens) {
  if (!screenAvailable(scr)) continue;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "pt-BR" });
  const page = await ctx.newPage();
  try {
    await page.goto(scr.url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    const man = await cdp.send("Page.getAppManifest");
    const sw = await page.evaluate(async () => { try { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, j) => setTimeout(() => j(), 5000))]); return !!reg.active; } catch { return false; } });
    const errs = installabilityErrors.filter((e) => e.errorId !== "in-incognito").map((e) => e.errorId + (e.errorArguments?.length ? `(${e.errorArguments.map((a) => a.value).join(",")})` : ""));
    r.note(`PWA ${scr.label}: manifest ${man.url ? "ok" : "AUSENTE"}; service worker ativo: ${sw ? "sim" : "não"}; erros de instalabilidade: ${errs.length ? errs.join(", ") : "nenhum → INSTALÁVEL"}${scr.key === "aluno-login" ? " (esperado: /aluno sem id é só a ponte de login; o app instalável é /aluno/{id})" : ""}`);
    // O login do aluno em /aluno (modo resolver) é só uma ponte; o app instalável é /aluno/{id}.
    const mustInstall = scr.key !== "aluno-login";
    if (mustInstall && (errs.length || !man.url)) r.add({ severity: "critical", rule: "pwa-installable", key: scr.key, title: `PWA NÃO instalável em ${scr.label}`, location: scr.url,
      description: `Erros do Chromium: ${errs.join(", ") || "manifest ausente"}.`, suggestion: "Corrigir manifest/ícones/service worker conforme os erros listados.", blocking: true });
    if (scr.key === "aluno-home" && !sw) r.add({ severity: "high", rule: "pwa-sw", key: scr.key, title: `Service worker não ficou ativo em ${scr.label}`, location: scr.url, description: "navigator.serviceWorker.ready não resolveu em 5s.", suggestion: "Verificar registro do SW e escopo." });
  } catch (e) { r.note(`PWA ${scr.key}: erro (${String(e.message).split("\n")[0].slice(0, 160)})`); }
  await ctx.close();
}
await b.close();
r.save();
