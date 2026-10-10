import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Regla de dependencias entre capas (docs/architecture.md):
 *   core <- domain <- sim
 *   persistence -> domain, core
 *   render, input, audio, ui -> sim, domain, core
 *   apps -> todo
 */
const layer = (name) => ({ group: [`**/${name}`, `**/${name}/**`], message: `La capa actual no puede depender de "${name}" (ver docs/architecture.md).` });
const pkg = (name) => ({ group: [name, `${name}/**`], message: `La capa actual no puede depender de "${name}" (ver docs/architecture.md).` });

const restrictImports = (...patterns) => ({
  "no-restricted-imports": "off",
  "@typescript-eslint/no-restricted-imports": ["error", { patterns: patterns.map((p) => ({ ...p, allowTypeImports: false })) }],
});

const pureCoreRules = {
  "no-restricted-globals": [
    "error",
    { name: "window", message: "El núcleo es puro: no usa el navegador." },
    { name: "document", message: "El núcleo es puro: no usa el DOM." },
    { name: "localStorage", message: "El núcleo es puro: la persistencia va en persistence/." },
    { name: "performance", message: "El núcleo usa Clock, no el reloj del navegador." },
    { name: "requestAnimationFrame", message: "El núcleo no depende del render." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Usa Rng con semilla (core/rng) para que la simulación sea determinista." },
    { object: "Date", property: "now", message: "Usa Clock (core/clock) para que la simulación sea determinista." },
  ],
};

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["*.config.{js,ts}", "scripts/**", "tests/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["src/core/**"],
    rules: {
      ...restrictImports(layer("domain"), layer("sim"), layer("persistence"), layer("render"), layer("input"), layer("audio"), layer("ui"), layer("apps"), layer("testing"), pkg("three"), pkg("dexie")),
      ...pureCoreRules,
    },
  },
  {
    files: ["src/domain/**"],
    rules: {
      ...restrictImports(layer("sim"), layer("persistence"), layer("render"), layer("input"), layer("audio"), layer("ui"), layer("apps"), layer("testing"), pkg("three"), pkg("dexie")),
      ...pureCoreRules,
    },
  },
  {
    files: ["src/sim/**"],
    rules: {
      ...restrictImports(layer("persistence"), layer("render"), layer("input"), layer("audio"), layer("ui"), layer("apps"), layer("testing"), pkg("three"), pkg("dexie")),
      ...pureCoreRules,
    },
  },
  {
    files: ["src/persistence/**"],
    rules: restrictImports(layer("sim"), layer("render"), layer("input"), layer("audio"), layer("ui"), layer("apps"), layer("testing"), pkg("three")),
  },
  {
    files: ["src/render/**", "src/input/**", "src/audio/**"],
    rules: restrictImports(layer("persistence"), layer("ui"), layer("apps"), layer("testing"), pkg("dexie")),
  },
  {
    files: ["src/ui/**"],
    rules: restrictImports(layer("apps"), layer("testing"), pkg("dexie")),
  },
  {
    files: ["src/testing/**"],
    rules: restrictImports(layer("apps"), pkg("dexie")),
  },
);
