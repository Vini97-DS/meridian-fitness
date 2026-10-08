import "dotenv/config";
import { existsSync } from "node:fs";
import { defineConfig, devices, webkit } from "@playwright/test";
import { assertSafeTarget, config } from "./lib/guard.mjs";

assertSafeTarget(); // ⛔ recusa produção / BASE_URL ausente — antes de qualquer teste

const common = { timezoneId: config.timezone, locale: config.locale, serviceWorkers: "allow" };
const projects = [{ name: "android-pixel", use: { ...devices["Pixel 7"], ...common } }];
let hasWebkit = false;
try { hasWebkit = existsSync(webkit.executablePath()); } catch { /* não instalado */ }
if (hasWebkit && !process.env.E2E_NO_WEBKIT) projects.push({ name: "iphone-webkit", use: { ...devices["iPhone 14"], ...common } });
else console.warn("⚠ WebKit indisponível (rode `npx playwright install webkit`): só o projeto Android/Chromium será executado.");

export default defineConfig({
  testDir: "./specs",
  testMatch: /.*\.spec\.mjs/,
  outputDir: "./reports/artifacts",
  globalSetup: "./lib/global-setup.mjs",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,          // banco de teste compartilhado → execução sequencial
  retries: 1,          // 1 retry só para detectar instabilidade (flaky) — não esconde falha real
  reporter: [["list"], ["json", { outputFile: "reports/results.json" }], ["html", { outputFolder: "reports/html", open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects,
});
