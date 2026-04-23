import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/", ".astro/", "node_modules/", "analysis/", "election-6/"],
  },
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
];
