# Arquitectura

> Este documento describe la arquitectura **vigente**. Cada change que modifique módulos o límites lo actualiza. Las decisiones y sus alternativas están en [`docs/adr/`](adr/).

## Estado actual (Fase 2, incremento 7)

Mundo de 256x256x64 por chunks, generado con semilla (granja, establo, río con puente, estanque, montaña boscosa, montaña de roca con diamantes y borde natural), con texturas, luz por vértice y un mesher en Web Worker. Varios mundos guardados en IndexedDB con autoguardado, "Mis Mundos" y el mundo v1 importado como "Mi primer mundo". Vista de padres en `/padres/`. Se juega con un personaje en tercera persona (física AABB, cámara con brazo de resorte, herramientas, corazones) y hay audio. En la granja y el estanque viven 15 animales con IA por máquinas de estado y pathfinding A*. Hay ciclo de día y noche con reloj en el HUD, música y reaparición de animales al amanecer.

```
index.html --> src/apps/game/main.ts   (raíz de composición: repositorio, importación v1, sesión, autoguardado,
                                         Game, bucle, render, input, audio, HUD, Mis Mundos, F3, ruta de perf)
padres/index.html --> src/apps/parents/main.ts   (repositorio, PIN, vista de padres; viewer.ts: visor de
                                         solo lectura con readOnly(repo) y RenderApp, cargado bajo demanda)
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
                repository/worldRepository.ts (puerto WorldRepository), settings.ts (clampSettings),
                physics/collide.ts (moveBody: AABB con barrido Y, X, Z, gravedad, borde invisible),
                rules/tools.ts (Mano, Pico, Espada, Arco y Collar; alcance de 6),
                entities/fsm.ts (máquinas de estado por datos y su intérprete), entities/species.ts
                (6 especies como datos), entities/entityStore.ts (entidades + índice espacial),
                entities/population.ts (población inicial y spawn slots con semilla)             (puro)
  sim/          loop.ts (FixedStepLoop, 20 Hz), game.ts (intents, eventos, replaceWorld, colisión,
                createHeadlessGame), player.ts (Player: movimiento, salto, corazones, reaparición,
                animación), session.ts (GameSession: abrir, crear y cambiar de mundo; guardar antes
                de limpiar; guarda posición, rumbo, corazones, herramienta y animales),
                systems/animals.ts (AnimalSystem: percibir, pensar cada 4 ticks, moverse, sonidos),
                systems/pathfinding.ts (A* con presupuesto, PathQueue, invalidación por versión de
                chunk), systems/dayNight.ts (WorldClock: fases, eventos, duraciones en caliente),
                systems/respawn.ts (reaparición por slots al amanecer), entitySnapshots.ts
                (entidad <-> EntitySnapshot)                                                      (puro)
  persistence/  dexieRepository.ts (IndexedDB, esquema db.version(n)), inMemoryRepository.ts (pruebas),
                autosave.ts (AutosaveService), migrations.ts (migrations[n] puras), legacyImport.ts
                (v1 a "Mi primer mundo"), exportFormat.ts, errorLog.ts, storage.ts (persist()),
                legacyLocalStorage.ts (formato v1), pin.ts (PinGuard, PBKDF2), broadcast.ts
                (BroadcastChannel 'santi': saved, worldsChanged, settingsChanged)
  render/       renderApp.ts (escena; en el juego FollowCamera + PlayerModel, en el visor cámara orbital;
                sin sombras, near 0,1 / far 250), followCamera.ts (brazo de resorte de 6 bloques a 20°,
                se acorta con un DDA para no entrar en los bloques, giro con el botón derecho),
                playerModel.ts (personaje de cajas con la "S" y animación procedural),
                entityRenderer.ts (animales: InstancedMesh por especie y parte, sombra, "poof"),
                chunkRenderer.ts (cola con prioridad, presupuesto de 4 ms, radio 6 / descarga 8),
                meshWorker.ts (luz + mesher en un Web Worker), chunkMesher.ts (caras visibles, AO),
                tiles.ts y textures.ts (tiles procedurales de 16 px), blockMaterial.ts
                (DataArrayTexture + MeshBasicMaterial con uDaylight), sky.ts (cielo, niebla, sol, luna
                y estrellas), lighting.ts (skyLighting: colores y luces según la luz del día)
  input/        pointerInput.ts (clic izquierdo a intent "useTool"), gameInput.ts (WASD/flechas relativas
                a la cámara, Espacio, 1 a 9, rueda, E; protecciones del navegador; suelta todo en blur)
  audio/        audioService.ts (buses con tope 0,8, silencio, voces de animales, posicional, música
                con cruce), synth.ts (efectos y música sintetizados CC0), gameAudio.ts (eventos del
                juego a sonidos y a la pista de música)
  ui/           hud.ts (corazones, herramientas, barra de bloques, deshacer, Mis Mundos, nuevo mundo,
                silencio, pantalla completa, "muy lejos"), kid/misMundos.ts (tarjetas con miniatura,
                sin borrar), kid/saveWarning.ts (ícono si falla el guardado), kid/hudClock.ts (sol o
                luna, arco, "Día N" y aviso de noche), debugOverlay.ts (F3), style.css,
                parents/parentsView.ts (histórico, papelera, configuración, PIN, exportar/importar), parents.css
  testing/      testApi.ts (window.__santi) y parentsTestApi.ts (window.__padres), solo en desarrollo con ?test=1
```

### Flujo de un clic

1. `input/` convierte el clic en un rayo en coordenadas de vóxel y envía `{ type: "useTool", ray }`.
2. `Game` aplica los intents al inicio del siguiente paso (como mucho 50 ms después).
3. `pickCell` recorre la grilla con DDA (el agua natural no se puede apuntar). Según la herramienta elegida, la Mano pone y el Pico rompe; si la celda está a más de 6 bloques de los ojos del personaje emite `tooFar`, y nunca pone un bloque donde está el personaje. `TerrainWorld` aplica las reglas en el `ChunkStore`, que marca el chunk como sucio.
4. `Game` emite `blockChanged` (y `blockPlaced` o `blockBroken`, que oye el audio); `ChunkRenderer.invalidateBlock` pone primero el chunk editado, luego los vecinos del borde y luego los que alcanza la luz.
5. El worker recibe los chunks modificados de los 3x3 alrededor, regenera el resto con la semilla, calcula la luz y la malla y devuelve arreglos tipados. El hilo principal crea la geometría nueva antes de quitar la vieja (nunca hay un frame con hueco).

### Personaje, cámara y audio

1. `GameInput` traduce las teclas a `{ type: "move", x, z }` en coordenadas del mundo usando el rumbo de la cámara (adelante es hacia donde mira), y lo reenvía si la cámara gira mientras se camina. Al perder el foco o al ocultarse la pestaña suelta todas las teclas.
2. En cada paso, `Player.step` aplica la velocidad pedida, el salto y `moveBody` contra `Game.collision`, y `Game` emite `footstep`, `jumped` y los cambios de corazones. `Game.hitPlayer` resta un corazón (con invulnerabilidad); sin corazones, "poof" y reaparición en la granja con 5 s de invulnerabilidad y nada perdido.
3. En cada frame, `RenderApp.render` lee una vista del jugador (`PlayerView`: posición, rumbo, animación, herramienta), `PlayerModel` la interpola y la anima, y `FollowCamera` coloca la cámara detrás. El render nunca escribe en la simulación.
4. `connectGameAudio` traduce los eventos del juego a sonidos y `AudioService.setListener` recibe la cámara en cada frame para el paneo.

### Animales

1. Al abrir un mundo por primera vez (o uno guardado antes del incremento 6), `Game.spawnPopulation()` crea los animales en los spawn slots que `createSpawnSlots(layout, seed)` calcula de forma determinista: 3 ovejas, 2 vacas, 2 cabras, 3 gallinas y 3 pollitos en la granja, y 2 patos en el estanque. "Mi primer mundo" (pradera plana) no tiene granja ni animales. El estado guardado marca `animalsSpawned` para no volver a crearlos.
2. En cada paso, después del jugador, `AnimalSystem.step` procesa hasta 3 búsquedas de camino de la `PathQueue` y, para cada animal en orden de creación: percibe (amenaza a 6 bloques o menos, fuera del hogar, distancia a la gallina, en el agua), piensa cada 4 ticks con el intérprete de `fsm.ts` y su `Rng` con semilla propia, sigue su camino o huye en línea recta, se separa de los vecinos y se mueve con la misma física AABB que el personaje (los patos flotan).
3. Si el niño coloca un bloque en un chunk que cruza el camino de un animal, la versión del chunk cambia y el animal pide otro camino. No se puede poner un bloque en una celda ocupada por un animal (`bump`).
4. Los animales emiten `animalSound` cada cierto tiempo; el audio lo reproduce posicional en el bus `ambient` con el límite de 3 voces.
5. En cada frame, `EntityRenderer` lee una vista de cada animal (posición, rumbo, animación), la suaviza y escribe las matrices de las instancias. Si un animal desaparece cerca de la cámara hace "poof".
6. Al guardar, `GameSession.collect()` agrega `entitySnapshots(worldId)` (posición, rumbo, estado y tiempos relativos del cerebro, slot, hogar). Al abrir, `restoreEntities` los recrea con el mismo estado; los caminos se vuelven a pedir.

### Día y noche

1. `Game.clock` (`WorldClock`) avanza al final de cada paso de la simulación, así que con la pestaña oculta (bucle en pausa) el tiempo no pasa. Las duraciones vienen de `world.settings` (`Game.configureTime`, también en caliente desde la vista de padres). El atardecer son los últimos 30 s del día y el amanecer, los últimos 30 s de la noche.
2. `advance` devuelve los eventos en orden y `Game` los emite: `nightSoon` (60 s antes), `phaseChanged`, `midnight` y `dawn`. Al amanecer, `respawnPending` recrea en la celda libre más cercana a su slot (8 bloques o menos, nunca sobre una construcción) a los animales cuyo slot quedó pendiente por `Game.removeEntity`, sin duplicar a los que siguen vivos.
3. En cada frame, `RenderApp.setTime` recibe `clock.daylight` (curva suave) y la posición del sol o la luna. `skyLighting` calcula el cielo, la niebla, la luz de los modelos (nunca por debajo de `NIGHT_HEMI`) y las estrellas, y `uDaylight` oscurece el terreno sin regenerar mallas.
4. `hudClock` lee el reloj cada 250 ms. `gameAudio` toca la campanita en `nightSoon` y cambia la música con `phaseChanged` (`AudioService.setMusic`, cruce de 6 s).
5. Se guardan `timeOfCycleMs`, `dayCount` y los slots pendientes en el estado del mundo; al abrir, el reloj se restaura antes de recrear los animales.

### Guardado

- El `ChunkStore` distingue los chunks **modificados** (difieren de la semilla: nunca se descargan de memoria) de los **sucios** (tienen cambios sin guardar). Solo se guardan los modificados; el resto se regenera con la semilla y el generador del mundo.
- `AutosaveService` guarda cada 30 s si hay cambios y con `visibilitychange: hidden`, `pagehide` y `blur`. Es de vuelo único: si llega otro pedido durante un guardado, se encola uno solo.
- `GameSession.collect()` copia de forma síncrona los chunks sucios, el mundo y el estado (con `version` + 1 y `updatedAt`); la miniatura se captura del canvas; `WorldRepository.saveSnapshot()` escribe todo en una sola transacción. Al confirmar, solo se limpian los chunks que no cambiaron durante la escritura.
- `switchWorld()` y `createWorld()` son los únicos caminos para reemplazar el mundo: esperan `autosave.saveNow()` y, si falla, no cambian nada (aviso ⚠️💾 y registro para los padres). "Crear nuevo mundo" ignora los clics repetidos durante la operación y en los 2 s siguientes.
- La configuración (`settings`) y la papelera (`deletedAt`) las cambian solo los padres: `saveSnapshot` las conserva de lo guardado, así el juego (quizá en otra pestaña) nunca las pisa. La vista de padres avisa por `BroadcastChannel` y el juego aplica la configuración en caliente (`GameSession.reloadSettings`).
- Al arrancar, el juego y la vista de padres purgan los mundos con más de 30 días en la papelera.
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
