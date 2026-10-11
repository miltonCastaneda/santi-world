import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/domain/**", "src/sim/**", "src/persistence/**"],
      // Mínimo de la constitución para la lógica pura (tarea 14.5).
      thresholds: {
        "src/domain/**": { lines: 85, statements: 85, functions: 85 },
        "src/sim/**": { lines: 85, statements: 85, functions: 85 },
      },
    },
  },
});
