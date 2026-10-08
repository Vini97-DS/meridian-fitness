import { test, expect } from "../lib/test.mjs";
import { STUDENT_URL, auth, studentToken, loginAsStudent, openHome, startWorkout, completeAllSets, finishWorkout, dismissWeightModal, executions } from "../lib/app.mjs";

// Lê a fila de sincronização (IndexedDB meridian_aluno_db / store queue) direto da página.
const readQueue = (page) => page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open("meridian_aluno_db");
  open.onerror = () => resolve([]);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains("queue")) return resolve([]);
    const req = db.transaction("queue").objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  };
}));

test.describe("4. Offline e sincronização", () => {
  test("4.1 offline: concluir séries e treino, recarregar, voltar online sem duplicar (idempotente)", async ({ page, context, db, request, baseURL }) => {
    await loginAsStudent(page);
    await openHome(page);
    // app carregado ONLINE: SW ativo, página e ficha em cache
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match(location.pathname)))).toBe(true);
    await page.waitForTimeout(500);                                         // deixa a ficha ir para o cache do IndexedDB

    await context.setOffline(true);
    await expect(page.locator("#offline-banner")).toBeVisible();
    await startWorkout(page);
    await page.locator("#exec-lista .set-row .btn-set").nth(0).click();
    await page.locator("#exec-lista .set-row .btn-set").nth(1).click();

    // recarrega OFFLINE: o app abre e mostra o estado salvo
    await page.reload();
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
    await expect(page.locator("#offline-banner")).toBeVisible();
    await page.getByRole("button", { name: "Continuar treino" }).click();
    await expect(page.locator("#exec-lista .set-row .btn-set.done")).toHaveCount(2);

    await completeAllSets(page);
    await finishWorkout(page, { effort: 3, mood: 4, comment: "feito offline" });
    expect(await executions(db), "nada deve ter chegado ao servidor enquanto offline").toHaveLength(0);
    const fila = await readQueue(page);
    expect(fila.length, "a fila local deve ter as escritas pendentes").toBeGreaterThan(0);

    // volta online → a fila drena sozinha
    await context.setOffline(false);
    await expect.poll(async () => (await readQueue(page)).length, { timeout: 45_000, intervals: [1000] }).toBe(0);
    await expect.poll(async () => (await executions(db)).length).toBe(1);
    const [antes] = await executions(db);
    expect(antes).toMatchObject({ effort_score: 3, mood_score: 4, comment: "feito offline", sets: 6 });
    expect(antes.finished_at).not.toBeNull();

    // idempotência: dispara o sync do app 2x e reenvia 2x os mesmos payloads originais direto à API
    for (let i = 0; i < 2; i++) await page.evaluate(() => window.dispatchEvent(new Event("online")));
    for (let i = 0; i < 2; i++) {
      for (const item of fila) {
        const r = await request.post(baseURL + item.path, { headers: auth(studentToken()), data: item.body });
        // /iniciar e /finalizar são idempotentes (2xx). Séries reenviadas DEPOIS de finalizado são recusadas (400) — seguro: nada duplica.
        const limite = item.path.endsWith("/series") ? 500 : 400;
        expect(r.status(), `${item.path} reenviado → ${r.status()} ${await r.text()}`).toBeLessThan(limite);
      }
    }
    const depois = await executions(db);
    expect(depois, "reenvio não pode criar outra sessão").toHaveLength(1);
    expect(depois[0].sets, "reenvio não pode duplicar séries").toBe(6);
  });

  test("4.2 offline: reabrir o app já mostra a ficha salva (sem rede)", async ({ page, context }) => {
    await loginAsStudent(page);
    await openHome(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match(location.pathname)))).toBe(true);
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
    await expect(page.locator("#treino-dia-card")).toContainText("A - Peito e tríceps");
    await expect(page.locator("#treino-cache-info")).toContainText(/Sem conexão/);
  });
});
