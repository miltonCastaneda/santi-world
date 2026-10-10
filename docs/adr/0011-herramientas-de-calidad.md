# ADR 0011: Herramientas de calidad (Vitest, fake-indexeddb, Playwright, ESLint y GitHub Actions)

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `plataforma-escalable`)

## Contexto

La constitution exige pruebas unitarias, de integración y E2E, verificar los límites entre módulos y una DoD con pruebas pasando. Hoy no hay ninguna herramienta de calidad. El repo está alojado en GitHub.

## Decisión

| Herramienta | Para qué | Por qué esta |
|---|---|---|
| **Vitest** (v5, con `@vitest/coverage-v8`) | Pruebas unitarias, integración y cobertura (entorno node) | Nativo de Vite (comparte configuración y transformaciones), rápido, API compatible con Jest. Se usa la v5 porque la v3 tiene vulnerabilidades críticas conocidas (tinypool). |
| **fake-indexeddb** | IndexedDB en node para el contrato del repositorio | Implementación completa del estándar; Dexie la soporta |
| **@playwright/test** (Chromium) | E2E, smoke, capturas visuales y `npm run perf` | WebGL en headless (SwiftShader) para el smoke, modo con navegador visible y GPU real para el rendimiento, y `toHaveScreenshot` integrado |
| **ESLint + typescript-eslint** | Lint y la regla de dependencias (`no-restricted-imports`, `no-restricted-globals` para `Math.random` y `Date.now` en el núcleo) | Estándar; no necesita otra herramienta para las capas |
| **GitHub Actions** | CI: `check` + `test` + `e2e` smoke en cada push y PR | El repo ya está en GitHub; sin coste para un repo pequeño |

Scripts: `test`, `test:watch`, `e2e`, `check` (`tsc --noEmit` + `eslint`), `perf` (local) y `ci`.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Jest | Popular | Hay que configurar la transformación de TS y ESM, y duplica la configuración de Vite |
| Cypress | Buena experiencia de desarrollo | Peor soporte de WebGL headless y de varias pestañas; más pesado |
| dependency-cruiser | Reglas de arquitectura más ricas | Otra herramienta; `no-restricted-imports` alcanza para nuestras capas |
| Sin CI (solo local) | Nada que configurar | Se pierde la verificación automática de la DoD |

## Consecuencias

- Positivas: toda la pirámide de pruebas cubierta con 5 dependencias de desarrollo, y la DoD se puede verificar automáticamente.
- Negativas: las pruebas visuales y de rendimiento dependen de la GPU y del sistema operativo. Las capturas de referencia se generan en un entorno fijo (Windows con Chromium), y `perf` no corre en CI.
