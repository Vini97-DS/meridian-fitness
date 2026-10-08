// E) Acessibilidade + contraste (axe) com 3 cores de acento do profissional, claro/escuro, emulação de celular.
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import { Result, chromePath, screens, screenAvailable, authMissingReason, sevMap, FAKE_PID } from "./lib/common.mjs";

const r = new Result("E");
const ACCENTS = ["#E8B04B", "#F5D77A", "#3B82F6"];
const SCHEMES = ["light", "dark"];
const SLOTS = ["primária", "secundária"]; // --brand (botões/chips) e --brand-accent (links/botões de série); a outra fica no padrão da API
const DEF = { primary: "#C9A84C", accent: "#4F46E5" };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const lum = (hex) => { const h = hex.replace("#", ""); const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const toHex = (css) => { const m = css.match(/\d+(\.\d+)?/g); if (!m) return null; return "#" + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, "0")).join(""); };

const exe = chromePath();
if (!exe) { r.status = "error"; r.note("Chromium não encontrado (defina CHROME_PATH)."); r.save(); process.exit(0); }
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const grouped = new Map(); // regra|tela -> {impact, help, helpUrl, variants: Map, nodes: []}
const custom = new Map();

async function measurePage(page, scr, variant) {
  return page.evaluate(() => {
    const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest(".hidden"); };
    const sel = (el) => el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
    const targets = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button]")].filter(vis)
      .map((el) => { const b = el.getBoundingClientRect(); return { sel: sel(el), w: Math.round(b.width), h: Math.round(b.height), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30) }; })
      .filter((t) => Math.min(t.w, t.h) < 44);
    const cs = getComputedStyle(document.documentElement);
    return { targets, vars: { brand: cs.getPropertyValue("--brand").trim(), accent: cs.getPropertyValue("--brand-accent").trim(), on: cs.getPropertyValue("--on-brand").trim(), bg: cs.getPropertyValue("--bg").trim(), surface: cs.getPropertyValue("--surface").trim() } };
  });
}

async function focusCheck(page) {
  await page.evaluate(() => { document.activeElement?.blur(); window.__sig = new Map();
    const sig = (el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineWidth, c.boxShadow, c.borderColor, c.backgroundColor, c.color].join("|"); };
    window.__sigf = sig;
    document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [tabindex]").forEach((el, i) => { el.dataset.chkI = i; window.__sig.set(String(i), sig(el)); }); });
  const bad = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const res = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body || el.dataset.chkI === undefined) return null;
      const c = getComputedStyle(el); const now = window.__sigf(el); const before = window.__sig.get(el.dataset.chkI);
      const hasOutline = c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || el.closest(".hidden")) return null;
      return { ok: hasOutline || now !== before, sel: el.id ? "#" + el.id : el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""), key: el.dataset.chkI }; });
    if (res && !res.ok) bad.add(res.sel);
  }
  return [...bad];
}

async function openScreen(ctx, scr, scheme, accent, slot, { exec }) {
  const page = await ctx.newPage();
  if (accent) {
    await page.route("**/api/aluno/brand/**", async (route) => {
      let body = { display_name: "Studio Teste", logo_url: null };
      try { body = await (await route.fetch()).json(); } catch { /* mock puro */ }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...body, primary: slot === "primária" ? accent : DEF.primary, accent: slot === "secundária" ? accent : DEF.accent }) });
    });
  }
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(scr.url, { waitUntil: "networkidle", timeout: 45000 });
  if (exec) {
    await page.waitForSelector("#btn-iniciar-treino", { timeout: 15000 });
    await page.click("#btn-iniciar-treino");
    await page.waitForSelector("#step-execucao:not(.hidden)", { timeout: 10000 });
  } else if (scr.key === "aluno-home") await page.waitForSelector("#step-home:not(.hidden)", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  return page;
}

for (const scr of screens()) {
  if (!screenAvailable(scr)) { r.note(authMissingReason(scr.key)); continue; }
  const variants = scr.accent ? SLOTS.flatMap((slot) => ACCENTS.flatMap((a) => SCHEMES.map((s) => ({ accent: a, slot, scheme: s })))) : SCHEMES.map((s) => ({ accent: null, scheme: s }));
  for (const v of variants) {
    const vname = `${v.accent ? `${v.slot} ${v.accent}` : "padrão"}/${v.scheme === "dark" ? "escuro" : "claro"}`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", serviceWorkers: "block" });
    let page;
    try {
      page = await openScreen(ctx, scr, v.scheme, v.accent, v.slot, { exec: scr.exec });
      const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const viol of axe.violations) {
        const k = `${viol.id}|${scr.key}`;
        const g = grouped.get(k) || { viol, variants: new Map(), nodes: [], impact: viol.impact };
        g.variants.set(vname, viol.nodes.length);
        for (const n of viol.nodes.slice(0, 3)) {
          const d = (n.any?.[0]?.data) || {};
          const extra = d.contrastRatio ? ` [contraste ${d.contrastRatio}:1, fg ${d.fgColor}, bg ${d.bgColor}, esperado ${d.expectedContrastRatio}]` : "";
          const line = `${vname}: ${n.target.join(" ")}${extra}`;
          if (g.nodes.length < 6 && !g.nodes.includes(line)) g.nodes.push(line);
        }
        if (["critical", "serious"].includes(viol.impact)) g.impact = viol.impact;
        grouped.set(k, g);
      }
      const m = await measurePage(page, scr, vname);
      if (m.targets.length) {
        const ck = `touch|${scr.key}`; const c = custom.get(ck) || { type: "touch", scr, vars: new Set(), items: new Map() };
        c.vars.add(vname); m.targets.forEach((t) => c.items.set(t.sel, `${t.sel} ${t.w}×${t.h}px${t.text ? ` “${t.text}”` : ""}`)); custom.set(ck, c);
      }
      if (v.accent && m.vars.brand) { // contraste da cor de acento (cálculo direto sobre as variáveis CSS efetivas)
        const bgHex = m.vars.bg && m.vars.bg.startsWith("#") ? m.vars.bg : (v.scheme === "dark" ? "#0B0B10" : "#F5F6F8");
        const sec = v.slot === "secundária";
        const color = sec ? m.vars.accent : m.vars.brand;
        const textOn = sec ? "#FFFFFF" : (m.vars.on || "#111111"); // o app usa texto #fff sobre o acento secundário
        const ck = `palette|${scr.key}`; const c = custom.get(ck) || { type: "palette", scr, rows: new Map() };
        c.rows.set(vname, { textRatio: ratio(color, textOn), bgRatio: ratio(color, bgHex), dark: v.scheme === "dark", color, textOn, bg: bgHex }); custom.set(ck, c);
      }
      const fbad = await focusCheck(page);
      if (fbad.length) { const ck = `focus|${scr.key}`; const c = custom.get(ck) || { type: "focus", scr, vars: new Set(), items: new Set() }; c.vars.add(vname); fbad.forEach((x) => c.items.add(x)); custom.set(ck, c); }
    } catch (e) {
      r.note(`${scr.key} [${vname}]: erro ao avaliar (${String(e.message).split("\n")[0].slice(0, 160)})`);
    }
    await ctx.close();
  }
  r.note(`${scr.label}: ${variants.length} variante(s) avaliadas.`);
}

for (const [k, g] of grouped) {
  const [rule, screen] = k.split("|"); const scr = screens().find((s) => s.key === screen);
  const sev = sevMap[g.impact] || "low";
  r.add({ severity: sev, rule: `axe:${rule}`, key: k, title: `axe ${rule}: ${g.viol.help}`, location: `${scr.label} — ${scr.url}`,
    description: `Impacto ${g.impact}. Variantes afetadas (nº de nós): ${[...g.variants].map(([n, c]) => `${n} (${c})`).join(", ")}. Exemplos: ${g.nodes.join(" | ")}. ${g.viol.helpUrl}`,
    suggestion: g.viol.description, blocking: ["critical", "serious"].includes(g.impact) });
}
for (const [k, c] of custom) {
  const loc = `${c.scr.label} — ${c.scr.url}`;
  if (c.type === "touch") r.add({ severity: "medium", rule: "touch-target-44", key: k, title: "Alvos de toque menores que 44px", location: loc,
    description: `Variantes: ${[...c.vars].join(", ")}. Elementos: ${[...c.items.values()].slice(0, 12).join("; ")}${c.items.size > 12 ? ` … (+${c.items.size - 12})` : ""}.`,
    suggestion: "Garantir min-height/min-width de 44px (padding ou área clicável maior)." });
  if (c.type === "focus") r.add({ severity: "medium", rule: "focus-visible", key: k, title: "Foco de teclado sem indicador visível", location: loc,
    description: `Variantes: ${[...c.vars].join(", ")}. Elementos sem mudança visual ao receber foco por Tab: ${[...c.items].join(", ")}.`,
    suggestion: "Definir :focus-visible com outline de 2px e contraste ≥3:1 com o fundo." });
  if (c.type === "palette") {
    const bad = [...c.rows].filter(([, x]) => x.textRatio < 4.5 || (x.dark && x.bgRatio < 3));
    r.note(`Contraste do acento (${c.scr.key}): ` + [...c.rows].map(([n, x]) => `${n}: texto ${x.textRatio.toFixed(1)}:1${x.dark ? `, sobre fundo escuro ${x.bgRatio.toFixed(1)}:1` : ""}`).join(" | "));
    if (bad.length) r.add({ severity: "medium", rule: "accent-contrast", key: k, title: "Acento com contraste abaixo do mínimo (texto sobre o acento ou acento sobre fundo escuro)", location: loc,
      description: bad.map(([n, x]) => `${n}: texto ${x.textOn} sobre ${x.color} = ${x.textRatio.toFixed(2)}:1 (mín 4.5)${x.dark ? `; acento sobre fundo ${x.bg} = ${x.bgRatio.toFixed(2)}:1 (mín 3)` : ""}`).join(" | "),
      suggestion: "O acento primário já tem texto automático (preto/branco). O secundário é usado com texto #fff fixo (ex.: botão 'Concluir') → validar contraste também para ele no cadastro, ou calcular a cor do texto como no primário." });
  }
}
r.meta.accents = ACCENTS;
await browser.close();
r.save();
