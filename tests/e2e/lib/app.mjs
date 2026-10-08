// Helpers de página e API (sem lógica do app). Seletores por papel/texto; ids existentes só quando não há nada melhor.
import { expect } from "@playwright/test";
import { IDS } from "./seed-lib.mjs";

export const STUDENT_URL = `/aluno/${IDS.personal}`;
export const studentToken = () => process.env.TEST_STUDENT_TOKEN;
export const proToken = () => process.env.TEST_PRO_TOKEN;
export const auth = (t) => ({ Authorization: "Bearer " + t, "Content-Type": "application/json" });

export async function loginAsStudent(page) {
  await page.context().addInitScript(([tok]) => {
    try {
      if (!localStorage.getItem("mf_aluno_token")) localStorage.setItem("mf_aluno_token", tok);
      localStorage.setItem("mf_install_prompt_login_shown", "1");   // sem modal de instalação atrapalhando os cliques
      localStorage.setItem("mf_install_prompt_workout_shown", "1");
    } catch (e) {}
  }, [studentToken()]);
}
export async function loginAsPro(page) {
  await page.context().addInitScript(([tok, user]) => {
    try { localStorage.setItem("mf_token", tok); localStorage.setItem("mf_user", JSON.stringify(user)); } catch (e) {}
  }, [proToken(), { id: IDS.user, name: "Personal E2E", email: "personal@e2e.meridian.test", personal_id: IDS.personal, bio: "", especialidade: "" }]);
}
export async function openHome(page) {
  await page.goto(STUDENT_URL);
  await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
}
export async function startWorkout(page, sessionName) {
  if (sessionName) await page.getByRole("button", { name: sessionName }).first().click();
  await page.getByRole("button", { name: /^(Iniciar|Continuar) treino$/ }).click();
  await expect(page.getByRole("button", { name: "Finalizar treino" })).toBeVisible();
}
export const setButtons = (page) => page.locator("#exec-lista .set-row .btn-set");
export async function completeAllSets(page, { max = 20 } = {}) {
  for (let i = 0; i < max; i++) {
    const pending = page.locator("#exec-lista .set-row .btn-set:not(.done)");
    if (!(await pending.count())) return;
    await pending.first().click();
  }
}
export async function finishWorkout(page, { effort = 3, mood = 4, comment = "" } = {}) {
  await page.getByRole("button", { name: "Finalizar treino" }).click();
  const modal = page.locator("#modal-avaliacao");
  await expect(modal.getByRole("heading", { name: "Como foi o treino?" })).toBeVisible();
  const confirm = modal.getByRole("button", { name: "Concluir" });
  await expect(confirm).toBeDisabled();                                   // avaliação obrigatória
  await modal.locator("#av-esforco").getByRole("button", { name: String(effort), exact: true }).click();
  await expect(confirm).toBeDisabled();                                   // só esforço não basta
  await modal.locator("#av-humor").getByRole("button", { name: String(mood), exact: true }).click();
  if (comment) await modal.getByLabel(/coment|recado/i).fill(comment);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Treino concluído")).toBeVisible();
}
export async function dismissWeightModal(page) {
  const agora = page.getByRole("button", { name: "Agora não" });
  if (await agora.isVisible().catch(() => false)) await agora.click();
}
export const gap = (test, reason) => test.info().annotations.push({ type: "gap", description: reason });

export async function executions(db, clientKeyLike = "%") {
  const { rows } = await db.query(
    `SELECT e.id, e.client_key, e.session_name, e.finished_at, e.effort_score, e.mood_score, e.comment,
            (SELECT COUNT(*) FROM workout_execution_sets s WHERE s.execution_id = e.id)::int AS sets
     FROM workout_executions e WHERE e.student_id = $1 AND e.client_key NOT LIKE 'e2e-seed-%' AND e.client_key LIKE $2 ORDER BY e.created_at`,
    [IDS.student, clientKeyLike]);
  return rows;
}
