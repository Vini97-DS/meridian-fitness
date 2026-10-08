import { test, expect } from "../lib/test.mjs";
import { gap, loginAsStudent, openHome } from "../lib/app.mjs";
import { IDS } from "../lib/seed-lib.mjs";

test.describe("7. PWA", () => {
  test("7.1 manifest dinâmico válido (nome/escopo do profissional; ícones e cor fixos)", async ({ page, request, baseURL }) => {
    const r = await request.get(`${baseURL}/api/aluno/manifest/${IDS.personal}.json`);
    expect(r.ok()).toBe(true);
    expect(r.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
    const m = await r.json();
    expect(m).toMatchObject({ name: "Studio E2E", short_name: "Studio E2E", start_url: `/aluno/${IDS.personal}`, scope: `/aluno/${IDS.personal}`, display: "standalone", theme_color: "#111A2E", background_color: "#111A2E" });
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    const purposes = m.icons.map((i) => i.purpose);
    expect(purposes).toEqual(expect.arrayContaining(["any", "maskable", "monochrome"]));
    expect(purposes.every((p) => !/\s/.test(p)), "purpose nunca combinado ('any maskable')").toBe(true);
    for (const i of m.icons) {
      const ir = await request.get(baseURL + i.src);
      expect(ir.status(), i.src).toBe(200);
      expect(ir.headers()["content-type"], i.src).toMatch(/image\/png/);
    }
    // a página aponta para esse manifest
    await loginAsStudent(page);
    await openHome(page);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", `/api/aluno/manifest/${IDS.personal}.json`);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#111A2E");
  });

  test("7.2 service worker registrado e ativo", async ({ page }) => {
    await loginAsStudent(page);
    await openHome(page);
    const sw = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { state: reg.active?.state, script: reg.active?.scriptURL, scope: reg.scope }; });
    expect(sw.state).toBe("activated");
    expect(sw.script).toMatch(/\/sw\.js$/);
  });

  test("7.3 shell e página no cache; app abre offline", async ({ page, context }) => {
    await loginAsStudent(page);
    await openHome(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const dentro = async () => page.evaluate(async () => {
      const names = (await caches.keys()).filter((k) => k.startsWith("meridian-aluno-shell-"));
      const urls = []; for (const n of names) for (const rq of await (await caches.open(n)).keys()) urls.push(new URL(rq.url).pathname);
      return urls;
    });
    await expect.poll(async () => (await dentro()).includes(`/aluno/${IDS.personal}`)).toBe(true);
    const urls = await dentro();
    for (const u of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/favicon.svg"]) expect(urls, u).toContain(u);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
  });

  test("7.4 fontes (woff2) ficam no cache offline", async ({ page }) => {
    gap(test, "Sem webfonts hoje (fontes do sistema); quando Albert Sans/Bodoni Moda entrarem, precisam estar no cache do SW.");
    await loginAsStudent(page);
    await openHome(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const woff = await page.evaluate(async () => {
      const urls = []; for (const n of await caches.keys()) for (const rq of await (await caches.open(n)).keys()) urls.push(rq.url);
      return urls.filter((u) => /\.woff2?(\?|$)/.test(u));
    });
    expect(woff.length, "nenhum .woff2 no cache do service worker").toBeGreaterThan(0);
  });
});
