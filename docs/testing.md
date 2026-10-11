# Estrategia de pruebas

> La estrategia completa (qué se prueba en cada capa) está en [`openspec/changes/fase-2-mundo-vivo/design.md`](../openspec/changes/fase-2-mundo-vivo/design.md#estrategia-de-pruebas). Este documento explica cómo ejecutar y escribir pruebas.

## Pirámide

```
          /\        E2E y smoke (Playwright)   ~10%   flujos críticos del niño y de los padres
         /  \
        /----\      Integración (Vitest)       ~20%   repositorio + IndexedDB simulado, simulación sin interfaz
       /      \
      /--------\    Unitarias (Vitest)         ~70%   dominio, sim, IA, físicas, reglas, migraciones
```

## Comandos

| Comando | Qué ejecuta |
|---|---|
| `npm test` | Unitarias e integración con Vitest (`tests/unit/**` y `tests/integration/**`, entorno node) |
| `npm run test:watch` | Vitest en modo observación |
| `npm run e2e` | E2E y smoke con Playwright (Chromium). Levanta `vite` en el puerto 5199, o reutiliza uno ya abierto. |
| `npm run test:perf` | Pruebas con presupuesto de tiempo real (`tests/perf/**`, `vitest.perf.config.ts`), solas para que otros workers no compitan por la CPU |
| `npm run check` | `tsc --noEmit`, ESLint (incluida la regla de dependencias entre capas) y `npm run trace` |
| `npm run trace` | Trazabilidad: cada escenario de los specs tiene una prueba con su nombre `[capacidad] escenario`, salvo los manuales listados en `scripts/trace.mjs` |
| `npm run perf` | Medición de rendimiento con GPU real (ver `docs/performance.md`) |
| `npm run ci` | `check`, `test`, `test:perf` y `e2e`: es lo mismo que ejecuta GitHub Actions |
| `npm run coverage` | Cobertura de `core`, `domain`, `sim` y `persistence`; falla si `domain` o `sim` bajan del 85 % |

La primera vez, instala el navegador de Playwright con `npx playwright install chromium`.

## Estructura

```
tests/
  unit/          pruebas unitarias (Vitest)
  integration/   pruebas de integración (Vitest + fake-indexeddb)
    persistence/ repositoryContract.ts: suite de contrato de WorldRepository que se ejecuta contra
                 cada implementación (memoria y Dexie); sesión, autoguardado e importación v1
  fixtures/      datos reales de versiones anteriores (v1-world.json: mundo guardado por la v1.0.0)
  e2e/           pruebas E2E y smoke (Playwright)
    helpers/     utilidades: errores de consola, conteo de colores del canvas
    __screenshots__/  imágenes de referencia de las pruebas visuales
```

Cada prueba E2E corre en un contexto nuevo del navegador, así que empieza con IndexedDB y `localStorage` vacíos. Con `?seed=X` el juego abre el mundo de esa semilla o lo crea, y al recargar con la misma URL vuelve a abrir el mismo mundo.

## Convenciones

- **Nombres trazables**: cada prueba se nombra `[<capacidad>] <escenario>`, usando el nombre de la capacidad y del escenario del spec. Por ejemplo: `[mundos-y-persistencia] Crear un mundo nuevo guarda primero`. Así, cada escenario de un spec se puede rastrear hasta su prueba.
- **Determinismo**: la lógica de `core`, `domain` y `sim` usa `Rng` con semilla y `Clock` inyectable. ESLint prohíbe `Math.random()`, `Date.now()`, `window` y `document` en esas carpetas.
- **WebGL en E2E**: Playwright lanza Chromium con SwiftShader (`--use-angle=swiftshader`), así que el render funciona sin GPU. El smoke comprueba que el canvas tiene más de 20 colores distintos (no está en blanco).
- **Modo de pruebas**: `?test=1` expone `window.__santi` (solo en desarrollo) para adelantar el reloj, crear entidades y leer el estado. Llega en el incremento 1.
