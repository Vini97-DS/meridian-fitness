import { test, expect } from "../lib/test.mjs";
import { gap, loginAsStudent, loginAsPro, openHome, startWorkout, completeAllSets, finishWorkout, dismissWeightModal, executions } from "../lib/app.mjs";
import { SESSION_NAMES } from "../lib/seed-lib.mjs";

const SHORT = { timeout: 4000 };   // funcionalidade possivelmente ausente: não gastar o timeout cheio
const cardPendente = (page) => page.getByRole("region", { name: /pendente/i }).or(page.getByTestId("pending-card"));

async function proAcompanhamento(browser, projectUse, alunoNome = "Aluno E2E") {
  const ctx = await browser.newContext(projectUse);
  const pro = await ctx.newPage();
  await loginAsPro(pro);
  await pro.goto("/dashboard");
  await pro.getByRole("button", { name: /Acompanhamento de Alunos/ }).click();
  await pro.locator("#studentSearchInput").fill("");
  await pro.locator(".student-search-item", { hasText: alunoNome }).first().click();
  return { pro, ctx };
}

test.describe("5. Treino pendente", () => {
  test.beforeEach(async ({ page }) => { gap(test, "Funcionalidade 'treino pendente / pular / expirar' ainda não existe no app nem no backend."); await loginAsStudent(page); });

  test("5.1 ontem não treinou: card pendente com título e ações @smoke", async ({ page, scenario }) => {
    await scenario("pendente-ontem");
    await openHome(page);
    const card = cardPendente(page);
    await expect(card).toBeVisible(SHORT);
    await expect(card).toContainText(SESSION_NAMES.A);
    await expect(card).toContainText(/ontem/i);
    await expect(card.getByRole("button", { name: "Fazer agora" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Pular este" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Escolher outro treino" })).toBeVisible();
  });

  test("5.2 'Fazer agora' abre a execução do pendente; ao concluir, o pendente some e conta como feito @smoke", async ({ page, scenario, db }) => {
    await scenario("pendente-ontem");
    await openHome(page);
    await cardPendente(page).getByRole("button", { name: "Fazer agora" }).click(SHORT);
    await expect(page.locator("#exec-title")).toHaveText(SESSION_NAMES.A);
    await completeAllSets(page);
    await finishWorkout(page);
    await dismissWeightModal(page);
    await page.getByRole("button", { name: "Voltar ao início" }).click();
    await expect(cardPendente(page)).toHaveCount(0);
    expect((await executions(db)).some((e) => e.session_name === SESSION_NAMES.A)).toBe(true);
  });

  test("5.3 'Pular este': some, toast com 'Desfazer', desfazer restaura @smoke", async ({ page, scenario }) => {
    await scenario("pendente-ontem");
    await openHome(page);
    await cardPendente(page).getByRole("button", { name: "Pular este" }).click(SHORT);
    await expect(cardPendente(page)).toHaveCount(0);
    const toast = page.getByRole("status").filter({ hasText: /Desfazer/ }).or(page.getByText(/Desfazer/));
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(cardPendente(page)).toBeVisible();
  });

  test("5.4 o pulado aparece no Acompanhamento do profissional com marcador diferente @smoke", async ({ page, scenario, browser }, testInfo) => {
    await scenario("pendente-ontem");
    await openHome(page);
    await cardPendente(page).getByRole("button", { name: "Pular este" }).click(SHORT);
    const { pro, ctx } = await proAcompanhamento(browser, testInfo.project.use);
    await expect(pro.getByText(/pulad[oa]/i).first()).toBeVisible(SHORT);
    await ctx.close();
  });

  test("5.5 pendência de 4+ dias expira: sem card e conta como não realizado @smoke", async ({ page, scenario, browser }, testInfo) => {
    await scenario("expirado");
    await openHome(page);
    await expect(page.getByText("Treino de hoje")).toBeVisible();
    await expect(cardPendente(page)).toHaveCount(0);
    const { pro, ctx } = await proAcompanhamento(browser, testInfo.project.use);
    await expect(pro.getByText(/n[ãa]o realizad[oa]|expirad[oa]/i).first()).toBeVisible(SHORT);
    await ctx.close();
  });

  test("5.6 dia de descanso: mostra 'Hoje é dia de descanso' e o card pendente continua @smoke", async ({ page, scenario }) => {
    await scenario("descanso");
    await openHome(page);
    await expect(page.getByText("Hoje é dia de descanso")).toBeVisible();
    await expect(cardPendente(page)).toBeVisible(SHORT);
  });

  test("5.7 a previsão de término muda quando há pulado/expirado @smoke", async ({ page, scenario }) => {
    await scenario("default");
    await openHome(page);
    const base = await page.getByText(/previs[ãa]o de t[ée]rmino/i).first().innerText({ timeout: 4000 });
    await scenario("expirado");
    await page.reload();
    const depois = await page.getByText(/previs[ãa]o de t[ée]rmino/i).first().innerText({ timeout: 4000 });
    expect(depois).not.toBe(base);
  });
});
