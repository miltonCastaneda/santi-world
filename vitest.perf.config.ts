import { defineConfig } from "vitest/config";

/** Pruebas con presupuesto de tiempo real: van solas, sin otros workers compitiendo por la CPU. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/perf/**/*.test.ts"],
    fileParallelism: false,
  },
});
