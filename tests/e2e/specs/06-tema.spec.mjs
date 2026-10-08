import { test, expect } from "../lib/test.mjs";
import { gap, loginAsStudent, loginAsPro, openHome, auth, proToken } from "../lib/app.mjs";
import { IDS } from "../lib/seed-lib.mjs";

const patchBrand = (request, baseURL, data) =>
  request.patch(`${baseURL}/api/personals/${IDS.personal}`, { headers: auth(proToken()), data });
const brandVar = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim().toLowerCase());
const SHORT = { timeout: 4000 };

test.describe("6. Tema do profissional", () => {
  test("6.1 o profissional troca o acento no painel; o aluno vê a nova cor ao reabrir, sem relogar", async ({ page, browser }, testInfo) => {
    await loginAsStudent(page);
    await openHome(page);
    expect(await brandVar(page)).toBe("#e8b04b");

    const ctx = await browser.newContext(testInfo.project.use);              // sessão separada do profissional
    const pro = await ctx.newPage();
    await loginAsPro(pro);
    await pro.goto("/dashboard");
    await pro.getByRole("button", { name: /Configurações/ }).click();
    await pro.locator("#cfg-marca-primary").fill("#2a9d8f");
    await pro.getByRole("button", { name: "Salvar Identidade" }).click();
    await expect(pro.getByText("Identidade salva")).toBeVisible();
    await ctx.close();

    await page.reload();                                                    // reabrir o app
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();   // sem pedir login de novo
    expect(await brandVar(page)).toBe("#2a9d8f");
  });

  test("6.2 ao voltar ao app (visibilitychange) a cor nova aparece sem recarregar", async ({ page, request, baseURL }) => {
    gap(test, "O app só lê a marca no carregamento; não reconsulta ao voltar ao app (visibilitychange).");
    await loginAsStudent(page);
    await openHome(page);
    expect((await patchBrand(request, baseURL, { brand_primary: "#2a9d8f" })).ok()).toBe(true);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => brandVar(page), { timeout: 4000 }).toBe("#2a9d8f");
  });

  test("6.3 sem piscar a cor padrão no carregamento", async ({ page, request, baseURL }) => {
    gap(test, "Até a marca chegar da API o cabeçalho usa o padrão Meridian (#C9A84C) — intencional hoje (login/splash Meridian), mas a spec pede sem piscar com sessão ativa.");
    expect((await patchBrand(request, baseURL, { brand_primary: "#2a9d8f" })).ok()).toBe(true);
    await loginAsStudent(page);
    await page.addInitScript(() => {
      window.__logoColors = [];
      const tick = () => { const el = document.getElementById("brand-logo"); if (el) { const c = getComputedStyle(el).backgroundColor; if (window.__logoColors.at(-1) !== c) window.__logoColors.push(c); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await openHome(page);
    await page.waitForTimeout(500);
    const seq = await page.evaluate(() => window.__logoColors);
    expect(seq, `sequência de cores do logo: ${seq.join(" → ")}`).toEqual(["rgb(42, 157, 143)"]);
  });

  test("6.4 cor com contraste ruim é bloqueada com a mensagem esperada", async ({ page }) => {
    await loginAsPro(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Configurações/ }).click();
    await page.locator("#cfg-marca-primary").fill("#0d0d14");               // quase igual ao fundo escuro do app
    await page.getByRole("button", { name: "Salvar Identidade" }).click();
    await expect(page.locator("#cfg-marca-erro")).toBeVisible(SHORT);
    await expect(page.locator("#cfg-marca-erro")).toContainText(/contraste/i);
  });

  test("6.5 texto dos botões vira preto/branco conforme a cor", async ({ page, request, baseURL }) => {
    await loginAsStudent(page);
    for (const [cor, esperado] of [["#f5d77a", "rgb(17, 17, 17)"], ["#1d3557", "rgb(255, 255, 255)"]]) {
      expect((await patchBrand(request, baseURL, { brand_primary: cor })).ok()).toBe(true);
      await page.goto(`/aluno/${IDS.personal}`);
      const btn = page.getByRole("button", { name: /^(Iniciar|Continuar) treino$/ });
      await expect(btn).toBeVisible();
      expect(await btn.evaluate((el) => getComputedStyle(el).color), `cor do texto sobre ${cor}`).toBe(esperado);
    }
  });

  test("6.6 offline o app usa o último tema salvo", async ({ page, context, request, baseURL }) => {
    expect((await patchBrand(request, baseURL, { brand_primary: "#2a9d8f" })).ok()).toBe(true);
    await loginAsStudent(page);
    await openHome(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match(location.pathname)))).toBe(true);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
    expect(await brandVar(page)).toBe("#2a9d8f");
  });

  test("6.7 logo: com logo_url mostra a imagem; sem logo mostra as iniciais", async ({ page, request, baseURL }) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await page.route("https://logo.e2e.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: png }));
    await loginAsStudent(page);
    expect((await patchBrand(request, baseURL, { brand_logo_url: "https://logo.e2e.test/logo.png" })).ok()).toBe(true);
    await openHome(page);
    await expect(page.locator("#brand-logo img")).toBeVisible();
    await expect(page.locator("#brand-logo img")).toHaveAttribute("src", "https://logo.e2e.test/logo.png");
    // sem logo → iniciais (o seed restaura brand_logo_url=NULL; aqui limpamos pela API não é possível, então via seed-state do teste seguinte)
  });

  test("6.8 sem logo mostra as iniciais; logo quebrada cai nas iniciais", async ({ page, request, baseURL }) => {
    await loginAsStudent(page);
    await openHome(page);
    await expect(page.locator("#brand-logo img")).toHaveCount(0);
    await expect(page.locator("#brand-logo")).toHaveText("S");              // "Studio E2E" → S
    gap(test, "A logo quebrada não cai nas iniciais: o app injeta <img> sem onerror e mostra a imagem quebrada.");
    await page.route("https://logo-quebrada.e2e.test/**", (r) => r.abort());
    expect((await patchBrand(request, baseURL, { brand_logo_url: "https://logo-quebrada.e2e.test/x.png" })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
    await expect(page.locator("#brand-logo")).toHaveText("S", SHORT);
  });
});
