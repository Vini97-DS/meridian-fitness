import { test, expect } from "../lib/test.mjs";
import { gap, loginAsStudent, openHome, startWorkout, completeAllSets, finishWorkout, dismissWeightModal, executions } from "../lib/app.mjs";
import { SESSION_NAMES } from "../lib/seed-lib.mjs";

test.describe("3. Execução do treino", () => {
  test.beforeEach(async ({ page }) => { await loginAsStudent(page); });

  test("3.1 iniciar, confirmar série com um toque (valores pré-preenchidos) e ver o cronômetro @smoke", async ({ page }) => {
    await page.clock.install({ time: new Date() });                          // relógio controlável (timers reais continuam correndo)
    await openHome(page);
    await startWorkout(page);
    await expect(page.locator("#exec-title")).toHaveText(SESSION_NAMES.A);
    const linha = page.locator("#exec-lista .set-row").first();
    await expect(linha.locator("input").nth(0)).toHaveValue("10");           // reps da última vez (seed)
    await expect(linha.locator("input").nth(1)).toHaveValue("40");           // carga da última vez
    await linha.getByRole("button", { name: "Concluir" }).click();           // 1 toque, sem digitar nada
    await expect(linha.getByRole("button", { name: /feito/ })).toBeVisible();
    const banner = page.locator("#exec-timer-banner");
    await expect(banner).toContainText("Descanso");
    const t1 = await banner.locator(".timer-big").innerText();
    await page.clock.fastForward(5000);                                      // descanso conta
    await expect(banner.locator(".timer-big")).not.toHaveText(t1);
  });

  test("3.2 avançar pelos exercícios, concluir e avaliar (esforço obrigatório) @smoke", async ({ page, db }) => {
    await openHome(page);
    await startWorkout(page);
    await expect(page.locator("#exec-lista").getByText("Supino reto")).toBeVisible();
    await expect(page.locator("#exec-lista").getByText("Tríceps corda")).toBeVisible();
    await completeAllSets(page);
    await expect(page.locator("#exec-lista .set-row .btn-set.done")).toHaveCount(6);
    await finishWorkout(page, { effort: 4, mood: 5, comment: "tudo certo" });
    await dismissWeightModal(page);
    await expect(page.getByRole("button", { name: "Voltar ao início" })).toBeVisible();
    await expect.poll(async () => (await executions(db)).length).toBe(1);
    const [e] = await executions(db);
    expect(e).toMatchObject({ session_name: SESSION_NAMES.A, effort_score: 4, mood_score: 5, comment: "tudo certo", sets: 6 });
    expect(e.finished_at).not.toBeNull();
  });

  test("3.2b enviar recado ao profissional ao concluir @smoke", async ({ page }) => {
    gap(test, "Não existe um passo/confirmação de 'recado ao profissional'; só o campo 'Comentário (opcional)' na avaliação.");
    await openHome(page);
    await startWorkout(page);
    await completeAllSets(page);
    await finishWorkout(page, { comment: "recado e2e" });
    await expect(page.getByText(/recado (enviado|ao profissional)/i)).toBeVisible({ timeout: 4000 });
  });

  test("3.3 sair do treino pede confirmação e mantém o progresso @smoke", async ({ page }) => {
    gap(test, "'Sair' volta à home sem perguntar 'Sair do treino?' (o progresso já é mantido).");
    await openHome(page);
    await startWorkout(page);
    await page.locator("#exec-lista .set-row .btn-set").first().click();
    let dialogMsg = "";
    page.once("dialog", (d) => { dialogMsg = d.message(); d.accept(); });
    await page.locator("#btn-exec-sair").click();
    const naTela = await page.getByText("Sair do treino?").isVisible().catch(() => false);
    expect(naTela || /Sair do treino\?/.test(dialogMsg), "esperava a confirmação 'Sair do treino?'").toBe(true);
    if (naTela) await page.getByRole("button", { name: /^(Sair|Confirmar|Sim)/ }).click();
    // progresso mantido
    await expect(page.getByRole("button", { name: "Continuar treino" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar treino" }).click();
    await expect(page.locator("#exec-lista .set-row .btn-set.done")).toHaveCount(1);
  });

  test("3.4 sair do treino mantém o progresso (série já marcada continua marcada) @smoke", async ({ page }) => {
    await openHome(page);
    await startWorkout(page);
    await page.locator("#exec-lista .set-row .btn-set").first().click();
    await page.locator("#btn-exec-sair").click();
    await page.getByRole("button", { name: "Continuar treino" }).click();
    await expect(page.locator("#exec-lista .set-row .btn-set.done")).toHaveCount(1);
  });

  test("3.5 avaliação pós-treino exige esforço antes de concluir @smoke", async ({ page }) => {
    await openHome(page);
    await startWorkout(page);
    await completeAllSets(page);
    await page.getByRole("button", { name: "Finalizar treino" }).click();
    const modal = page.locator("#modal-avaliacao");
    await expect(modal.getByRole("button", { name: "Concluir" })).toBeDisabled();
    await modal.locator("#av-humor").getByRole("button", { name: "3", exact: true }).click();
    await expect(modal.getByRole("button", { name: "Concluir" })).toBeDisabled();    // só humor não basta
    await modal.locator("#av-esforco").getByRole("button", { name: "3", exact: true }).click();
    await expect(modal.getByRole("button", { name: "Concluir" })).toBeEnabled();
  });

  test("3.6 o app envia a data local do aluno (local_date) ao iniciar o treino @smoke", async ({ page }) => {
    gap(test, "O app ainda não envia local_date nas execuções (necessário para pendente/pulado/expirado no fuso certo).");
    const { localParts } = await import("../lib/dates.mjs");
    let body = null;
    await page.route("**/api/aluno/treino/execucoes/iniciar", async (route) => { body = route.request().postDataJSON(); await route.continue(); });
    await openHome(page);
    await startWorkout(page);
    await expect.poll(() => body).not.toBeNull();
    expect(body.local_date).toBe(localParts().date);
  });
});
