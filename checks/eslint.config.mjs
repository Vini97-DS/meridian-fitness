import js from "@eslint/js";
import globals from "globals";
// Regras básicas: só `parsing error` é bloqueante (tratado em c_lint.py).
export default [
  { ignores: ["**/node_modules/**", "**/*.min.js", "fonts/**", "icons/**"] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 2023, sourceType: "script",
      globals: { ...globals.browser, ...globals.serviceworker, Chart: "readonly" } } },
];
