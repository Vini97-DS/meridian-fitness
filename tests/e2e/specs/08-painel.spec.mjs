import { test, expect } from "../lib/test.mjs";
import { gap, loginAsPro } from "../lib/app.mjs";
import { SESSION_NAMES } from "../lib/seed-lib.mjs";

const SHORT = { timeout: 4000 };
async function abrirAluno(page, nome = "Aluno E2E") {
  await page.getByRole("button", { name: /Acompanhamento de Alunos/ }).click();
  await page.locator("#studentSearchInput").fill("");                       // o campo vem preenchido com o 1º aluno (filtraria a lista)
  await page.locator(".student-search-item", { hasText: nome }).first().click();
}

test.describe("8. Painel do profissional", () => {
  test.beforeEach(async ({ page }) => { await loginAsPro(page);
    page.on("response", async (r) => { if (r.url().includes("/api/") && r.status() >= 400) console.log(`[api ${r.status()}] ${r.url().replace(/.*\/api/, "/api")} ${(await r.text().catch(() => "")).slice(0, 160)}`); });
    await page.goto("/dashboard"); });

  test("8.1 abre com a sessão de teste (sem voltar ao login)", async ({ page }) => {
    await expect(page.getByRole("button", { name: /BI & Negócio/ })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("8.2 lista os alunos", async ({ page }) => {
    await page.getByRole("button", { name: /Acompanhamento de Alunos/ }).click();
    await page.locator("#studentSearchInput").fill("");
    await expect(page.locator(".student-search-item", { hasText: "Aluno E2E" }).first()).toBeVisible();
    await expect(page.locator(".student-search-item", { hasText: "Aluna Dois E2E" })).toBeVisible();
  });

  test("8.3 abre a ficha de um aluno", async ({ page }) => {
    await abrirAluno(page);
    const ficha = page.locator("#student-treino-ativa");
    await expect(ficha).toContainText(/Ficha E2E/i);
    for (const n of Object.values(SESSION_NAMES)) await expect(ficha).toContainText(new RegExp(n.replace(/[()]/g, "\\$&"), "i"));   // a UI põe em maiúsculas (CSS)
  });

  test("8.4 Acompanhamento mostra as sessões feitas", async ({ page }) => {
    await abrirAluno(page);
    await page.getByRole("button", { name: /TREINOS EXECUTADOS/i }).click();
    const lista = page.locator("#student-execucoes");
    await expect(lista).toContainText(/A - Peito e tríceps/i);
    await expect(lista.getByText(/\d+ min · \d+ séries/).first()).toBeVisible();
  });

  test("8.5 Acompanhamento mostra pulado e expirado com marcadores próprios", async ({ page, scenario }) => {
    gap(test, "Estados 'pulado' e 'expirado' ainda não existem (ver fluxo 5).");
    await scenario("expirado");
    await abrirAluno(page);
    await page.getByRole("button", { name: /TREINOS EXECUTADOS/i }).click();
    await expect(page.locator("#student-execucoes").getByText(/pulad[oa]/i).first()).toBeVisible(SHORT);
    await expect(page.locator("#student-execucoes").getByText(/expirad[oa]|n[ãa]o realizad[oa]/i).first()).toBeVisible(SHORT);
  });
});
