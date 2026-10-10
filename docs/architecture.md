# Arquitectura

> Este documento describe la arquitectura **vigente**. Cada change que modifique módulos o límites lo actualiza. Las decisiones y sus alternativas están en [`docs/adr/`](adr/).

## Estado actual (Fase 2, incremento 3)

Mundo de 256x256x64 por chunks, generado con semilla (granja, establo, río con puente, estanque, montaña boscosa, montaña de roca con diamantes y borde natural), con texturas, luz por vértice y un mesher en Web Worker. Varios mundos guardados en IndexedDB con autoguardado, "Mis Mundos" y el mundo v1 importado como "Mi primer mundo". Todavía se juega con la cámara orbital de v1.

```
index.html --> src/apps/game/main.ts   (raíz de composición: repositorio, importación v1, sesión, autoguardado,
                                         Game, bucle, render, input, HUD, Mis Mundos, F3, ruta de perf)
src/
  core/         rng.ts, clock.ts, events.ts, math.ts (Vec3, Aabb, rayos, DDA de vóxeles),
                noise.ts (value noise y fbm con semilla)                                    (puro)
  domain/       blocks.ts (16 bloques: forma, sólido, opaco, luz, tiles), picking.ts (pickCell),
                world/chunk.ts (Chunk 16x16x64: Uint8Array + bitset "placed" + versión),
                world/chunkStore.ts (lectura/escritura entre chunks, generación bajo demanda, sucios),
                world/light.ts (luz de cielo y de antorchas por BFS, con margen de 14 bloques),
                world/terrainWorld.ts (reglas de poner/quitar/deshacer sobre el ChunkStore),
                worldgen/layout.ts y generator.ts (generadores "zones" y "legacy-flat", GENERATOR_VERSION),
                repository/model.ts (User, World, GameState, ChunkRecord, SCHEMA_VERSION) y
                repository/worldRepository.ts (puerto WorldRepository)                          (puro)
  sim/          loop.ts (FixedStepLoop, 20 Hz), game.ts (intents, eventos, replaceWorld, createHeadlessGame),
                session.ts (GameSession: abrir, crear y cambiar de mundo; guardar antes de limpiar)  (puro)
  persistence/  dexieRepository.ts (IndexedDB, esquema db.version(n)), inMemoryRepository.ts (pruebas),
                autosave.ts (AutosaveService), migrations.ts (migrations[n] puras), legacyImport.ts
                (v1 a "Mi primer mundo"), exportFormat.ts, errorLog.ts, storage.ts (persist()),
                legacyLocalStorage.ts (formato v1)
  render/       renderApp.ts (escena, cámara orbital, sin sombras, near 0,1 / far 250),
                chunkRenderer.ts (cola con prioridad, presupuesto de 4 ms, radio 6 / descarga 8),
                meshWorker.ts (luz + mesher en un Web Worker), chunkMesher.ts (caras visibles, AO),
                tiles.ts y textures.ts (tiles procedurales de 16 px), blockMaterial.ts
                (DataArrayTexture + MeshBasicMaterial con uDaylight), sky.ts (cielo y niebla)
  input/        pointerInput.ts (toque/clic a intents "use"; arrastre = cámara)
  ui/           hud.ts (paleta, Mis Mundos, Crear nuevo mundo), kid/misMundos.ts (tarjetas con miniatura,
                sin borrar), kid/saveWarning.ts (ícono si falla el guardado), debugOverlay.ts (F3), style.css
  testing/      testApi.ts (window.__santi, solo en desarrollo con ?test=1)
```

### Flujo de un clic

1. `input/` convierte el clic en un rayo en coordenadas de vóxel y envía `{ type: "use", ray }`.
2. `Game` aplica los intents al inicio del siguiente paso (como mucho 50 ms después).
3. `pickCell` recorre la grilla con DDA (el agua natural no se puede apuntar) y `TerrainWorld` aplica las reglas en el `ChunkStore`, que marca el chunk como sucio.
4. `Game` emite `blockChanged`; `ChunkRenderer.invalidateBlock` pone primero el chunk editado, luego los vecinos del borde y luego los que alcanza la luz.
5. El worker recibe los chunks modificados de los 3x3 alrededor, regenera el resto con la semilla, calcula la luz y la malla y devuelve arreglos tipados. El hilo principal crea la geometría nueva antes de quitar la vieja (nunca hay un frame con hueco).

### Guardado

- El `ChunkStore` distingue los chunks **modificados** (difieren de la semilla: nunca se descargan de memoria) de los **sucios** (tienen cambios sin guardar). Solo se guardan los modificados; el resto se regenera con la semilla y el generador del mundo.
- `AutosaveService` guarda cada 30 s si hay cambios y con `visibilitychange: hidden`, `pagehide` y `blur`. Es de vuelo único: si llega otro pedido durante un guardado, se encola uno solo.
- `GameSession.collect()` copia de forma síncrona los chunks sucios, el mundo y el estado (con `version` + 1 y `updatedAt`); la miniatura se captura del canvas; `WorldRepository.saveSnapshot()` escribe todo en una sola transacción. Al confirmar, solo se limpian los chunks que no cambiaron durante la escritura.
- `switchWorld()` y `createWorld()` son los únicos caminos para reemplazar el mundo: esperan `autosave.saveNow()` y, si falla, no cambian nada (aviso ⚠️💾 y registro para los padres). "Crear nuevo mundo" ignora los clics repetidos durante la operación y en los 2 s siguientes.
- El puerto `WorldRepository` y el modelo están en `domain/repository/` para que `sim` (GameSession) dependa de ellos sin depender de `persistence`, que contiene las implementaciones (Dexie y memoria). Ambas pasan la misma suite de contrato (`tests/integration/persistence/repositoryContract.ts`).

### Parámetros de URL

| Parámetro | Efecto |
|---|---|
| `?seed=` | Semilla del mundo (por defecto `santi`; `perf-001` con `?perf`) |
| `?view=` | Radio de vista en chunks, de 2 a 8 (por defecto 6) |
| `?workers=` | Cantidad de workers del mesher, de 0 a 4 (por defecto 1; 0 usa la ruta síncrona) |
| `?perf=1&perfMs=` | Ruta de cámara de `npm run perf` |
| `?test=1` | Instala `window.__santi` (solo en desarrollo) |

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
