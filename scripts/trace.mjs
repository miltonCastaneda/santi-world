// npm run trace
//
// Trazabilidad spec -> prueba (constitution, "Calidad"): cada escenario de los specs de OpenSpec
// debe tener al menos una prueba cuyo nombre empiece con `[capacidad] escenario`. Los escenarios
// que se verifican a mano (una checklist o una prueba de juego) se listan en MANUAL con el lugar
// donde se registran. Sale con código 1 si falta alguno.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Escenarios verificados fuera de las pruebas automáticas, con dónde queda el registro. */
const MANUAL = {
  "experiencia-infantil/Revisión de efectos": "checklist en docs/assets.md",
  "experiencia-infantil/Revisión visual": "prueba de juego final (tarea 14.6) en el CHANGELOG",
  "rendimiento-y-estabilidad-visual/Ruta de medición estándar": "npm run perf (día y --night) en el equipo de referencia, tabla de docs/performance.md",
  "plataforma-escalable/Verificación completa": "npm run ci en .github/workflows/ci.yml (clon limpio + npm ci) y antes de cada commit",
};

/** Specs principales si ya se sincronizaron; si no, los del change en curso. */
function specDirs() {
  const main = join(root, "openspec", "specs");
  if (existsSync(main) && readdirSync(main).some((d) => existsSync(join(main, d, "spec.md")))) return main;
  const changes = join(root, "openspec", "changes");
  for (const c of readdirSync(changes)) {
    const dir = join(changes, c, "specs");
    if (c !== "archive" && existsSync(dir)) return dir;
  }
  throw new Error("No se encontraron specs");
}

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Las comillas no cuentan: `Clics repetidos en "Crear nuevo mundo"` es el mismo nombre sin ellas. */
const plain = (s) => s.replace(/["“”]/g, "");

const specs = specDirs();
const tests = plain(files(join(root, "tests")).map((f) => readFileSync(f, "utf8")).join("\n"));

let total = 0;
const missing = [];
const manual = [];
for (const cap of readdirSync(specs).sort()) {
  const file = join(specs, cap, "spec.md");
  if (!existsSync(file)) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/^#### Scenario: (.+?)\r?$/gm)) {
    const name = m[1].trim();
    total++;
    const key = `${cap}/${name}`;
    if (tests.includes(plain(`[${cap}] ${name}`))) continue;
    if (MANUAL[key]) manual.push(`${key} -> ${MANUAL[key]}`);
    else missing.push(key);
  }
}

if (total === 0) {
  console.error(`No se encontró ningún escenario en ${specs}`);
  process.exit(1);
}
console.log(`Escenarios: ${total}. Con prueba automática: ${total - manual.length - missing.length}. Manuales: ${manual.length}.`);
for (const m of manual) console.log(`  manual: ${m}`);
if (missing.length > 0) {
  console.error(`Sin prueba con su nombre (${missing.length}):`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log("Todos los escenarios tienen al menos una prueba con su nombre.");
