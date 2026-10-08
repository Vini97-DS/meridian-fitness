import { test, expect } from "../lib/test.mjs";
import { gap, loginAsStudent, openHome } from "../lib/app.mjs";
import { SESSION_NAMES } from "../lib/seed-lib.mjs";

test.describe("2. Home e treino de hoje", () => {
  test.beforeEach(async ({ page }) => { await loginAsStudent(page); });

  test("2.1 mostra nome do aluno, nome do profissional e o treino do dia @smoke", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("heading", { name: "Olá, Aluno" })).toBeVisible();
    await expect(page.locator("#brand-name")).toHaveText("Studio E2E");      // marca do profissional, só dentro do app
    await expect(page.getByText("Treino de hoje")).toBeVisible();
    await expect(page.locator("#treino-dia-card")).toContainText(SESSION_NAMES.A);   // cenário default: hoje = A
  });

  test("2.2 mostra a faixa da semana @smoke", async ({ page }) => {
    gap(test, "Home ainda não tem faixa da semana (7 dias com status de cada treino).");
    await openHome(page);
    const faixa = page.getByRole("list", { name: /semana/i }).or(page.getByTestId("week-strip"));
    await expect(faixa).toBeVisible();
    await expect(faixa.getByRole("listitem")).toHaveCount(7);
  });

  test("2.3 mostra 'x de y treinos' e a previsão de término @smoke", async ({ page }) => {
    gap(test, "Home ainda não mostra progresso 'x de y treinos' nem previsão de término.");
    await openHome(page);
    await expect(page.getByText(/\b\d+ de \d+ treinos?\b/i)).toBeVisible();
    await expect(page.getByText(/previs[ãa]o de t[ée]rmino/i)).toBeVisible();
  });

  test("2.4 fontes Albert Sans e Bodoni Moda carregam (sem fallback) @smoke", async ({ page }) => {
    gap(test, "O app usa fontes do sistema; Albert Sans / Bodoni Moda ainda não foram adicionadas.");
    await openHome(page);
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/['"]/g, ""));
      return { loaded, albert: document.fonts.check('16px "Albert Sans"'), bodoni: document.fonts.check('16px "Bodoni Moda"'),
               body: getComputedStyle(document.body).fontFamily };
    });
    expect(r.loaded, `fontes carregadas: ${r.loaded.join(", ") || "nenhuma"}`).toEqual(expect.arrayContaining(["Albert Sans", "Bodoni Moda"]));
    expect(r.body).toMatch(/Albert Sans/);
  });
});
