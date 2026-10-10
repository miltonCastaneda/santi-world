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
| `npm run check` | `tsc --noEmit` y ESLint, incluida la regla de dependencias entre capas |
| `npm run perf` | Medición de rendimiento (llega en el incremento 2) |
| `npm run ci` | `check`, luego `test` y luego `e2e`: es lo mismo que ejecuta GitHub Actions |
| `npx vitest run --coverage` | Cobertura de `core`, `domain`, `sim` y `persistence` |

La primera vez, instala el navegador de Playwright con `npx playwright install chromium`.

## Estructura

```
tests/
  unit/          pruebas unitarias (Vitest)
  integration/   pruebas de integración (Vitest + fake-indexeddb)
  e2e/           pruebas E2E y smoke (Playwright)
    helpers/     utilidades: errores de consola, conteo de colores del canvas
```

## Convenciones

- **Nombres trazables**: cada prueba se nombra `[<capacidad>] <escenario>`, usando el nombre de la capacidad y del escenario del spec. Por ejemplo: `[mundos-y-persistencia] Crear un mundo nuevo guarda primero`. Así, cada escenario de un spec se puede rastrear hasta su prueba.
- **Determinismo**: la lógica de `core`, `domain` y `sim` usa `Rng` con semilla y `Clock` inyectable. ESLint prohíbe `Math.random()`, `Date.now()`, `window` y `document` en esas carpetas.
- **WebGL en E2E**: Playwright lanza Chromium con SwiftShader (`--use-angle=swiftshader`), así que el render funciona sin GPU. El smoke comprueba que el canvas tiene más de 20 colores distintos (no está en blanco).
- **Modo de pruebas**: `?test=1` expone `window.__santi` (solo en desarrollo) para adelantar el reloj, crear entidades y leer el estado. Llega en el incremento 1.
