import { test, expect } from "../lib/test.mjs";
import { STUDENT_URL, gap, loginAsStudent, openHome } from "../lib/app.mjs";

// E-mail inexistente de propósito: o backend responde igual (genérico) e NÃO envia e-mail nem cria código.
// Nenhum login real é concluído neste fluxo.
const FAKE_EMAIL = "ninguem.e2e@example.test";

async function ateTelaDoCodigo(page) {
  await page.goto(STUDENT_URL);
  await page.getByLabel("E-mail").fill(FAKE_EMAIL);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByRole("heading", { name: "Digite o código" })).toBeVisible();
}

test.describe("1. Login e navegação", () => {
  test("1.1 sem sessão, o app abre na tela de login com a logo Meridian @smoke", async ({ page }) => {
    await page.goto(STUDENT_URL);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.locator("#brand-name")).toHaveText("Meridian");
    await expect(page.locator("#brand-logo")).toHaveText("M");              // sem imagem → inicial M
    await expect(page.locator("#brand-logo img")).toHaveCount(0);
  });

  test("1.2 a raiz '/' oferece 'Sou aluno' / 'Sou profissional' @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sou profissional" })).toBeVisible();
    await page.getByRole("button", { name: "Sou aluno" }).click();
    await expect(page).toHaveURL(/\/aluno\/?$/);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });

  test("1.3 e-mail inválido mostra erro e não avança @smoke", async ({ page }) => {
    await page.goto(STUDENT_URL);
    await page.getByLabel("E-mail").fill("isso-nao-e-email");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByText(/e-?mail válido/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Digite o código" })).toBeHidden();
  });

  test("1.4 e-mail válido avança para a tela do código @smoke", async ({ page }) => {
    await ateTelaDoCodigo(page);
    await expect(page.getByText(FAKE_EMAIL)).toBeVisible();
  });

  test("1.5 código errado é rejeitado @smoke", async ({ page }) => {
    await ateTelaDoCodigo(page);
    await page.getByLabel("Código").fill("000000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/código inválido|código incorreto|expirado/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Digite o código" })).toBeVisible();   // continua na tela do código
  });

  test("1.6 excesso de tentativas mostra a mensagem de limite @smoke", async ({ page }) => {
    gap(test, "O backend responde sempre 'Código inválido ou expirado'; não há mensagem distinta de limite de tentativas.");
    await ateTelaDoCodigo(page);
    for (let i = 0; i < 6; i++) {                                           // 6 > LOGIN_CODE_MAX_ATTEMPTS (5); sem rajada
      await page.getByLabel("Código").fill(String(100000 + i));
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
    }
    await expect(page.getByText(/limite|muitas tentativas|tente novamente (mais tarde|em)/i)).toBeVisible({ timeout: 3000 });
  });

  test("1.7 com sessão, o app abre direto na home @smoke", async ({ page }) => {
    await loginAsStudent(page);
    await openHome(page);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeHidden();
  });

  test("1.8 telas internas têm botão de voltar que retorna à home @smoke", async ({ page }) => {
    await loginAsStudent(page);
    await openHome(page);
    for (const [abrir, titulo] of [["Meus treinos", "Meus treinos"], ["Privacidade e meus dados", "Privacidade e meus dados"]]) {
      await page.getByRole("button", { name: abrir }).click();
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
      await page.getByRole("button", { name: /voltar|←|‹/i }).click();
      await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
    }
  });

  test("1.9 botão voltar do navegador/aparelho volta à tela anterior sem sair do app @smoke", async ({ page }) => {
    gap(test, "O app não usa a History API: o 'voltar' do navegador sai da página em vez de voltar à tela anterior.");
    await loginAsStudent(page);
    await page.goto("/");                                                    // entrada anterior no histórico
    await openHome(page);
    await page.getByRole("button", { name: "Meus treinos" }).click();
    await expect(page.getByRole("heading", { name: "Meus treinos" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${STUDENT_URL}$`));
    await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible();
  });

  test("1.10 termos: 'Recusar e sair' funciona @smoke", async ({ page, db }) => {
    gap(test, "A tela de termos só tem checkbox + 'Continuar'; não existe 'Recusar e sair'.");
    await db.query("DELETE FROM student_consents WHERE account_id=(SELECT id FROM student_accounts WHERE email LIKE 'aluno@e2e%')");
    await loginAsStudent(page);
    await page.goto(STUDENT_URL);
    await expect(page.getByRole("heading", { name: /Termos de Uso/ })).toBeVisible();
    await page.getByRole("button", { name: /Recusar e sair/i }).click();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("mf_aluno_token"))).toBeNull();
  });
});
