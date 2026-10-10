# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- Constitution del proyecto (`docs/constitution.md`) y plantilla de ADR.
- README con la guía de ejecución local, esqueletos de arquitectura, pruebas, rendimiento y guías de uso.
- Change de OpenSpec `fase-2-mundo-vivo` con proposal, specs, design y tasks (solo planeación).
- ADRs 0001 a 0012 en estado "Propuesto".
- Herramientas de calidad (incremento 0): Vitest 5 (con cobertura v8), fake-indexeddb, Playwright (Chromium con SwiftShader), ESLint 9 con typescript-eslint y la regla de dependencias entre capas, y el workflow de GitHub Actions `CI`.
- Scripts `test`, `test:watch`, `e2e`, `check`, `perf` y `ci`.
- Prueba unitaria del mundo v1 y smoke E2E (sin errores en consola y canvas dibujado).
- Bucle de simulación de paso fijo a 20 Hz (máximo 5 pasos por frame, se pausa con la pestaña oculta) y `createHeadlessGame` para correr el juego sin navegador (incremento 1).
- API de pruebas `window.__santi`, solo en desarrollo con `?test=1`, y E2E que verifica que no existe en producción.

### Cambiado
- El código se reorganizó en capas `core`, `domain`, `sim`, `persistence`, `render`, `input`, `ui`, `testing` y `apps` sin cambiar el comportamiento del juego. El punto de entrada ahora es `src/apps/game/main.ts`.
- La selección del bloque apuntado usa un DDA de vóxeles del dominio en lugar del raycast de Three.js.
- ADR-0001 y ADR-0004 pasan a "Aceptado".

## [1.0.0] - 2026-10-10

### Agregado
- Sandbox de vóxeles local de 32x32x12: poner y quitar bloques, 8 tipos de bloque, deshacer, empezar de nuevo y pantalla completa.
- Mundo guardado en `localStorage` (`minecraf-de-santi-world-v2`).
