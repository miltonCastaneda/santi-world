// npm run perf -- [--ms=60000] [--headless] [--record] [--label="incremento 2"]
//
// Compila, levanta `vite preview`, abre `?perf=1` (semilla perf-001) en Chromium con GPU real,
// espera a que la ruta de cámara termine y compara el resultado con el presupuesto de
// docs/constitution.md. Con --record agrega una fila a docs/performance.md.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const durationMs = Number(args.ms ?? 60_000);
const port = 5399;
const vite = [process.execPath, `${root}node_modules/vite/bin/vite.js`];

const BUDGET = { p95: 20, drawCalls: 300, mesherMainMs: 4, heapMb: 500 };

console.log("Compilando…");
const build = spawnSync(vite[0], [vite[1], "build"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(vite[0], [vite[1], "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: "pipe" });
const stop = () => server.kill();
process.on("exit", stop);

await waitForServer(`http://localhost:${port}/`, 30_000);

const browser = await chromium.launch({
  headless: Boolean(args.headless),
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => console.error("Error en la página:", e.message));  const extra = args.workers !== undefined ? `&workers=${args.workers}` : "";
  await page.goto(`http://localhost:${port}/?perf=1&perfMs=${durationMs}${extra}`);
  console.log(`Recorriendo la ruta de cámara durante ${durationMs / 1000} s…`);
  await page.waitForFunction(() => window.__perfResult !== undefined, null, { timeout: durationMs + 120_000, polling: 1000 });
  const result = await page.evaluate(() => ({
    ...window.__perfResult,
    heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }));

  const checks = [
    ["Tiempo de frame p95", result.p95, BUDGET.p95, "ms", result.p95 <= BUDGET.p95],
    ["Draw calls máx.", result.drawCallsMax, BUDGET.drawCalls, "", result.drawCallsMax < BUDGET.drawCalls],
    ["Mesher en el hilo principal (p99 por frame)", result.mesherMainP99Ms, BUDGET.mesherMainMs, "ms", result.mesherMainP99Ms <= BUDGET.mesherMainMs],
    ["Memoria JS", result.heapMb, BUDGET.heapMb, "MB", result.heapMb === null || result.heapMb < BUDGET.heapMb],
  ];
  console.log(`\nGPU: ${result.gpu}`);
  console.log(`Carga inicial: ${result.loadMs} ms · frames: ${result.frames} · FPS medio: ${result.fpsAvg.toFixed(1)}`);
  console.log(`p50 ${result.p50.toFixed(1)} ms · p95 ${result.p95.toFixed(1)} ms · p99 ${result.p99.toFixed(1)} ms · máx. ${result.maxFrame.toFixed(1)} ms`);
  console.log(`Mesher en workers: ${result.mesherWorkerMsAvg.toFixed(2)} ms de media por chunk`);
  console.log(`Mesher en el hilo principal: máx. ${result.mesherMainMaxMs.toFixed(1)} ms en un frame (incluye pausas del GC)\n`);
  for (const [name, value, budget, unit, ok] of checks) {
    const shown = typeof value === "number" ? `${Number(value.toFixed(1))}${unit}` : "n/d";
    console.log(`${ok ? "OK   " : "FALLA"} ${name}: ${shown} (presupuesto ${budget}${unit})`);
    if (!ok) failed = true;
  }

  if (args.record) record(result, typeof args.label === "string" ? args.label : "sin etiqueta");
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);

async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite preview no respondió en ${url}`);
}

function record(r, label) {
  const file = `${root}docs/performance.md`;
  const date = new Date().toISOString().slice(0, 10);
  const row = `| ${label} | ${date} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.drawCallsMax} | ${r.mesherMainP99Ms.toFixed(1)} / ${r.mesherMainMaxMs.toFixed(1)} | ${r.loadMs} | ${r.gpu} |`;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const header = lines.findIndex((l) => l.startsWith("| Incremento |"));
  if (header < 0) throw new Error("No encontré la tabla de resultados en docs/performance.md");
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith("|")) end++;
  lines.splice(end, 0, row);
  writeFileSync(file, lines.join("\n"));
  console.log(`Resultado agregado a docs/performance.md`);
}
