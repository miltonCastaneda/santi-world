# Arquitectura

> Este documento describe la arquitectura **vigente**. Cada change que modifique módulos o límites lo actualiza. Las decisiones y sus alternativas están en [`docs/adr/`](adr/).

## Estado actual (Fase 2, incremento 1)

El juego v1 funciona igual que antes, pero ya está repartido en capas con un bucle de simulación de paso fijo.

```
index.html --> src/apps/game/main.ts   (raíz de composición: crea Game, bucle, render, input y HUD)
src/
  core/         rng.ts (mulberry32 con semilla), clock.ts (Clock, FakeClock), events.ts (EventBus),
                math.ts (Vec3, Aabb, rayo vs AABB, DDA de vóxeles)                       (puro)
  domain/       blocks.ts (catálogo), world/voxelWorld.ts (reglas de poner/quitar/deshacer),
                picking.ts (bloque apuntado y celda adyacente con DDA)                    (puro)
  sim/          loop.ts (FixedStepLoop, 20 Hz, máx. 5 pasos por frame, pausa),
                game.ts (Game: cola de intents, eventos, createHeadlessGame)              (puro)
  persistence/  legacyLocalStorage.ts (mundo v1 en localStorage)
  render/       renderApp.ts (escena, cámara orbital, luces), worldMesh.ts (InstancedMesh por tipo)
  input/        pointerInput.ts (toque/clic a intents "use"; arrastre = cámara)
  ui/           hud.ts (paleta, modos, deshacer, reset, pantalla completa), style.css
  testing/      testApi.ts (window.__santi, solo en desarrollo con ?test=1)
```

### Flujo de un clic

1. `input/` convierte el clic en un rayo en coordenadas de bloque y envía `{ type: "use", ray }`.
2. `Game` aplica los intents al inicio del siguiente paso (como mucho 50 ms después).
3. `domain/picking` encuentra el bloque y `VoxelWorld` aplica las reglas.
4. `Game` emite `blockChanged`; `apps/game` reconstruye la malla y guarda.

La simulación nunca lee el reloj del navegador: el bucle recibe el tiempo desde `requestAnimationFrame` y la pausa al ocultar la pestaña. Con `createHeadlessGame({ seed, clock })` el juego completo corre en Node para las pruebas.

## Arquitectura objetivo (Fase 2)

La propuesta detallada está en [`openspec/changes/fase-2-mundo-vivo/design.md`](../openspec/changes/fase-2-mundo-vivo/design.md). Esta sección se completa a medida que se implementan los incrementos.

```
src/
  core/         ids, RNG con semilla, reloj, bus de eventos, matemática   (puro)
  domain/       bloques, chunks, worldgen, entidades, reglas              (puro)
  sim/          bucle de paso fijo y sistemas (física, IA, spawn, día/noche, combate)  (puro)
  persistence/  WorldRepository, implementación con IndexedDB, migraciones, autoguardado
  render/       mesher de chunks, atlas, vistas de entidades, cielo, partículas
  input/        teclado y mouse a intenciones
  audio/        AudioService con buses
  ui/           HUD del niño, Mis Mundos, panel de padres
  testing/      API de pruebas (solo desarrollo)
  apps/game/    punto de entrada de "/"
  apps/parents/ punto de entrada de "/padres/"
```

### Regla de dependencias

```
apps --> ui, render, input, audio, persistence, sim, domain, core, testing
ui, render, input, audio --> sim, domain, core
persistence --> domain, core
testing --> sim, domain, core (nunca apps)
sim --> domain, core
domain --> core
core --> (nada)
```

ESLint (`@typescript-eslint/no-restricted-imports`) la verifica en `npm run check`. En `core`, `domain` y `sim` además están prohibidos `window`, `document`, `localStorage`, `performance`, `requestAnimationFrame`, `Math.random` y `Date.now`.
