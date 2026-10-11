# El Mundo de Santi

Un "Minecraft para niños de 4 años": un mundo de bloques 3D en el navegador donde Santi construye libremente. Se juega en desktop con mouse y teclado y, por ahora, de forma local y con un solo usuario.

## Requisitos

- Node.js 22 o superior y npm 10 o superior.
- Un navegador moderno con WebGL 2 (se recomienda Chrome o Edge).

## Ejecución local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Como el servidor escucha en la red local (`host: true`), otro equipo de la misma red también puede abrir el juego con la IP de tu máquina.

Los mundos se guardan en IndexedDB del navegador (local, sin servidor) y el juego tiene autoguardado. Para saber dónde están, cómo respaldarlos y cómo se importó el mundo de la versión 1, ver la [guía para padres](docs/guia-padres.md#dónde-se-guardan-los-mundos).

La **vista de padres** está en `http://localhost:5173/padres/` (no hay enlaces a ella desde el juego): histórico, visor de solo lectura, papelera, configuración por mundo, exportar e importar y PIN opcional. Ver la [guía para padres](docs/guia-padres.md#vista-de-padres). Al publicar el build en un hosting estático, configura que `/padres` redirija a `/padres/` (en `vite` y `vite preview` ya lo hace `vite.config.ts`).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente (Vite). |
| `npm run build` | Verifica tipos (`tsc`) y genera el build de producción en `dist/`. |
| `npm run preview` | Sirve el build de producción. |
| `npm test` | Pruebas unitarias y de integración (Vitest). |
| `npm run e2e` | Pruebas E2E y smoke (Playwright + Chromium). |
| `npm run test:perf` | Pruebas con presupuesto de tiempo real (30 minutos simulados en menos de 10 s). |
| `npm run check` | Tipos (`tsc --noEmit`), lint (incluida la regla de capas) y trazabilidad de escenarios (`npm run trace`). |
| `npm run coverage` | Cobertura (mínimo 85 % en `domain` y `sim`). |
| `npm run perf` | Medición de rendimiento con GPU real (ver [`docs/performance.md`](docs/performance.md)). |
| `npm run ci` | `check`, `test`, `test:perf` y `e2e`: lo mismo que GitHub Actions. |

La primera vez que vayas a ejecutar las E2E, instala el navegador con `npx playwright install chromium`. Los detalles están en [`docs/testing.md`](docs/testing.md).

## Estructura

```
index.html            Punto de entrada del juego
src/                  Código del juego (TypeScript + Three.js)
docs/                 Constitution, arquitectura, ADRs, guías y pruebas
openspec/             Specs y changes (Spec-Driven Development con OpenSpec)
lookandfeel/          Referencia visual del juego
```

## Cómo se trabaja (SDD con OpenSpec)

1. `/opsx-explore`: pensar e investigar, sin escribir código.
2. `/opsx-propose`: crear un change con proposal, specs, design y tasks.
3. `/opsx-apply`: implementar las tasks del change.
4. `/opsx-sync` (opcional) y `/opsx-archive`: consolidar los specs en `openspec/specs/` y cerrar el change.

Antes de proponer o implementar cualquier cosa, lee los principios del proyecto en [`docs/constitution.md`](docs/constitution.md).

## Documentación

- [Constitution](docs/constitution.md)
- [Arquitectura](docs/architecture.md)
- [ADRs](docs/adr/)
- [Estrategia de pruebas](docs/testing.md)
- [Rendimiento](docs/performance.md)
- [Guía para padres](docs/guia-padres.md)
- [Guía para el niño](docs/guia-nino.md)
- [CHANGELOG](CHANGELOG.md)
