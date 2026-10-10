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
- Mundo de 256x256x64 por chunks de 16x16x64, generado con semilla y `GENERATOR_VERSION` (incremento 2): granja con cercas y establo, río con puente, estanque, montaña boscosa con árboles (`TreeId`), montaña de roca con nieve y mineral de diamante (`OreId`) y borde natural.
- Bloques nuevos: tablones, hojas, cerca (colisión de 1,5), antorcha (luz 14), mineral de diamante (no construible), arena, nieve y lana.
- Mesher de caras visibles con AO, luz de cielo y de antorchas por vértice y uniforme `uDaylight`, en un Web Worker con presupuesto de 4 ms por frame en el hilo principal (ADR-0013).
- Texturas pixel art de 16 px generadas por código (CC0, `docs/assets.md`) en un `DataArrayTexture`; cielo con niebla.
- Overlay de debug `F3`, `npm run perf` con la ruta de cámara de la semilla `perf-001` (resultados en `docs/performance.md`) y pruebas visuales con imágenes de referencia (`tests/e2e/visual.spec.ts`).
- Parámetros de URL `?seed=`, `?view=`, `?workers=` y `?perf=1`.
- ADR-0013 (mesher en Web Worker y texturas como arreglo de capas), en estado "Aceptado".

### Cambiado
- El mundo de 32x32 se reemplaza por el mundo generado. En este incremento **el mundo nuevo no se guarda**: el mundo v1 de `localStorage` queda intacto y el incremento 3 lo importará como "Mi primer mundo".
- Sin sombras dinámicas en el terreno (desaparece el bug de sombras recortadas); `near` 0,1 y `far` 250.
- ADR-0003 pasa a "Aceptado", con los ajustes de ADR-0013.
- El código se reorganizó en capas `core`, `domain`, `sim`, `persistence`, `render`, `input`, `ui`, `testing` y `apps` sin cambiar el comportamiento del juego. El punto de entrada ahora es `src/apps/game/main.ts`.
- La selección del bloque apuntado usa un DDA de vóxeles del dominio en lugar del raycast de Three.js.
- ADR-0001 y ADR-0004 pasan a "Aceptado".

## [1.0.0] - 2026-10-10

### Agregado
- Sandbox de vóxeles local de 32x32x12: poner y quitar bloques, 8 tipos de bloque, deshacer, empezar de nuevo y pantalla completa.
- Mundo guardado en `localStorage` (`minecraf-de-santi-world-v2`).
