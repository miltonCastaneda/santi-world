# Design: Fase 2 "Mundo vivo"

> **Qué es este documento (SDD)**: el *design* explica **cómo** se cumplirán los specs. El motivo está en [`proposal.md`](proposal.md#why) y los requisitos en [`specs/`](specs/). Cada decisión importante tiene su ADR en [`docs/adr/`](../../../docs/adr/), con sus alternativas y trade-offs. Aquí se resume y se conecta todo.

## Context

- El estado actual y los riesgos están en [`proposal.md`](proposal.md#contexto-actual-as-is). Lo que condiciona el diseño:
  - Ya hay un stack que funciona (Vite, TypeScript estricto y Three.js 0.170) y un desarrollador con experiencia en software, pero nuevo en SDD.
  - El objetivo es desktop con GPU integrada, así que el rendimiento manda sobre la fidelidad visual (ver [constitution §5](../../../docs/constitution.md#5-rendimiento-y-estabilidad-visual)).
  - Es local y de un solo usuario hoy, pero tiene que poder pasar a online sin reescribir el dominio.
  - Hay que conservar el mundo actual de Santi (está en `localStorage`).
- La referencia visual [`lookandfeel/minecraft-santi-lookandfeel.png`](../../../lookandfeel/minecraft-santi-lookandfeel.png) fija:
  - La cámara en tercera persona.
  - La disposición del HUD.
  - Texturas pixel-art.
  - Las zonas del mundo: granja con establo rojo, montaña de lobos, montaña de diamantes, río y estanque.

## Goals / Non-Goals

**Goals:**

- Una arquitectura por capas con un núcleo puro (`core`, `domain` y `sim`) que se pueda probar sin navegador y sea determinista.
- Render por chunks dentro del presupuesto de rendimiento, sin artefactos visuales.
- Persistencia transaccional que guarda solo lo que cambió, con migraciones, detrás de `WorldRepository`.
- Un sistema de entidades sencillo y eficiente para unas 60 entidades, con IA de máquinas de estado y pathfinding con presupuesto.
- Incrementos verticales que se puedan demostrar (ver `tasks.md`).

**Non-Goals:**

- Un motor genérico reutilizable, ECS de alto rendimiento para miles de entidades, multihilo con Web Workers (queda como posible mejora si el mesher no cumple el presupuesto), sombras dinámicas del terreno, iluminación global y física de fluidos (el agua es un bloque estático).
- Backend, cuentas o sincronización (solo se deja el diseño preparado).

## Decisions

### D1. Stack: se mantienen Vite, TypeScript y Three.js ([ADR-0001](../../../docs/adr/0001-mantener-vite-typescript-threejs.md))

Ya funciona, es liviano y Three.js da control fino del render (BufferGeometry, InstancedMesh, materiales). La UI se hace con DOM y TypeScript, sin framework: el HUD es sencillo y el DOM resuelve bien los botones grandes y la accesibilidad.

### D2. Módulos y regla de dependencias

```
src/
  core/           ids (UUID), rng (con semilla), clock, events (bus tipado), math (vec3, aabb, dda)
  domain/
    blocks/       registro de bloques: id, textura, sólido, transparente, altura de colisión, luz
    world/        Chunk, ChunkStore, coordenadas, procedencia (natural o del jugador)
    worldgen/     generador por semilla y por versión, zonas, árboles, granja, minerales
    entities/     componentes, definiciones de especies (datos), EntityStore
    rules/        daño, alcance de herramientas, inventario, límites de población
  sim/
    loop.ts       bucle de paso fijo a 20 Hz
    systems/      playerController, ai, pathfinding, physics, combat, interaction,
                  spawn, respawn, dayNight, dragonDirector, regrowth
    game.ts       createGame({seed, settings, clock, repository?}) + API de intents
  persistence/    WorldRepository (puerto), DexieWorldRepository, InMemoryWorldRepository,
                  migrations/, serializers/, AutosaveService, legacyImport
  render/         RenderApp, ChunkMesher, TextureAtlas, EntityRenderer, Sky, Particles, Camera
  input/          InputManager: teclado y mouse a intents; protecciones del navegador
  audio/          AudioService (buses), SoundRegistry, voces con prioridad
  ui/
    kid/          HUD (reloj, aviso de noche, corazones), ToolBar, HotBar, Inventario, MisMundos, Mute
    parents/      Lista de mundos, Visor, Papelera, Configuración, PIN
  apps/
    game/main.ts       compone todo para "/"
    parents/main.ts    compone persistencia, visor y UI de padres para "/padres/"
  testing/        testApi (window.__santi), solo en desarrollo y pruebas
```

Regla (verificada con ESLint `no-restricted-imports` en `npm run check`):

```
core      <-- domain <-- sim
  ^           ^          ^
  |           |          |
persistence --+          |
render, input, audio, ui ---> sim, domain, core (solo lectura de estado y eventos)
apps ---> todos
```

`domain` y `sim` no usan `window`, `document`, `three` ni `Date.now()`. El tiempo viene de `Clock` y el azar de `Rng`.

### D3. Modelo de datos

```
User        { id: UUID, name, createdAt }                      -- hoy: 1 usuario por defecto
World       { id: UUID, ownerId, name, seed, generatorVersion, schemaVersion,
              createdAt, updatedAt, deletedAt?, dayCount, thumbnailId?,
              settings: { dayMinutes=15, nightMinutes=15, quietNight=false,
                          volume: { master=0.6, music=0.5, sfx=0.8 } } }
Chunk       { worldId, cx, cz, version, updatedAt,
              blocks: Uint8Array(16*16*64),        -- id de bloque por celda
              placed: Uint8Array(16*16*64/8) }     -- bitset: celda colocada por el jugador
GameState   { worldId, version, updatedAt, timeOfCycleMs, dayCount,
              player: { pos, yaw, hearts, selectedTool, selectedBlock },
              inventory: { diamond, meat, pigChicken },
              pendingRespawns: SlotId[], burntTrees: TreeId[], minedOres: OreId[],
              dragon: { hitsTaken, defeatedTonight } }
EntitySnapshot { id: UUID, worldId, kind, species, pos, vel, state, slotId?,
                 tamed?, homeId?, hp?, data }
```

- **Solo se guardan los chunks modificados**. Como el generador es determinista (semilla más `generatorVersion`), un chunk que no está en la base de datos se regenera igual. Esto reduce el almacenamiento de unos 4 MB a unos pocos KB por mundo típico. Si en el futuro cambia el generador, cada mundo conserva su `generatorVersion`.
- **Procedencia de los bloques** (`placed`): permite que el dragón solo queme árboles naturales, que los diamantes reaparezcan solo en piedra natural y que la reaparición nunca pise construcciones del niño.
- La "partida" del enunciado corresponde a `GameState` (el estado vivo de un mundo). Un usuario tiene N mundos, y cada mundo tiene un `GameState` y N chunks y entidades.

### D4. Persistencia: IndexedDB con Dexie, detrás de `WorldRepository` ([ADR-0002](../../../docs/adr/0002-persistencia-indexeddb-dexie.md))

- **Tablas** (`db.version(1)`):
  - `users(id)`
  - `worlds(id, ownerId, updatedAt, deletedAt)`
  - `chunks([worldId+cx+cz], worldId)`
  - `states(worldId)`
  - `entities(worldId)` (una fila por mundo, con un array)
  - `thumbnails(worldId)` (Blob WebP de 320x180)
  - `meta(key)`: `legacyImported`, `pinHash`, etc.
- **Puerto**:

```ts
interface WorldRepository {
  ensureDefaultUser(): Promise<User>;
  listWorlds(ownerId: string, opts?: { includeDeleted?: boolean }): Promise<World[]>;
  createWorld(input: NewWorld): Promise<World>;
  loadWorld(worldId: string): Promise<{ world: World; state: GameState; entities: EntitySnapshot[] }>;
  loadChunk(worldId: string, cx: number, cz: number): Promise<Chunk | null>;
  saveSnapshot(s: { world: World; state: GameState; entities: EntitySnapshot[]; dirtyChunks: Chunk[]; thumbnail?: Blob }): Promise<void>; // 1 transacción
  softDelete(worldId: string): Promise<void>;
  restore(worldId: string): Promise<void>;
  purgeExpired(now: number, retentionMs: number): Promise<number>;
  exportWorld(worldId: string): Promise<Blob>;
  importWorld(file: Blob): Promise<World>;
}
```

- **`AutosaveService`**:
  - Los cambios marcan como sucios los chunks, el estado y las entidades.
  - Hay guardado de vuelo único (si ya hay un guardado en curso, se encola uno solo).
  - Disparadores: cada 30 s si hay cambios, `visibilitychange: hidden`, `pagehide` y `blur`. Las operaciones que limpian el mundo usan `await saveNow()`, y si falla, se aborta la operación.
- **Garantía "guardar antes de limpiar"**: `GameSession.switchWorld()` y `createWorld()` son los únicos caminos para reemplazar el mundo, y los dos hacen `await autosave.saveNow()` antes de descargar nada. Un botón "ocupado" evita las operaciones dobles.
- **Migraciones** en dos niveles:
  1. La estructura de IndexedDB, con `db.version(n).upgrade()`.
  2. Los documentos (`schemaVersion` en `World` y `GameState`), con funciones puras `migrations[n](doc) => doc` que se prueban de forma unitaria con fixtures de cada versión.
- **Importación del mundo heredado**:
  - Al arrancar, si existe `minecraf-de-santi-world-v2` y `meta.legacyImported` no está, se crea "Mi primer mundo" con el generador `legacy-flat` (pradera plana de 256x256).
  - Los bloques antiguos se colocan en el centro marcados como `placed`, para que estén protegidos.
  - Se marca `legacyImported`, y la clave original se renombra a `...-v2-backup` (no se borra).
- **Robustez**:
  - Se llama a `navigator.storage.persist()` en el primer guardado, para pedir que el navegador no desaloje los datos.
  - La vista de padres muestra el espacio usado (`estimate()`) y permite exportar un mundo a un archivo como respaldo.
- **Futuro online**:
  - `HttpWorldRepository` implementará el mismo puerto.
  - `updatedAt` y `version` por chunk permiten sincronizar por chunk (al principio, gana la última escritura).
  - El criterio para crear el backend (ver ADR-0002) es tener 2 o más dispositivos, multiusuario o publicación.

### D5. Mundo por chunks y render ([ADR-0003](../../../docs/adr/0003-mundo-por-chunks-y-mesher.md))

- **Chunks** de 16x16x64. El mundo mide 16x16 chunks (256x256), con radio de vista de 6 chunks (unos 113 chunks visibles) y descarga con histéresis a 8 chunks.
- **`ChunkMesher`**:
  - Genera solo las caras visibles (entre un bloque sólido y aire o un bloque transparente), consultando a los **vecinos de los chunks adyacentes**. Así se evitan huecos y caras internas.
  - Emite una `BufferGeometry` por chunk para lo opaco y otra para lo transparente (agua y hojas), con `depthWrite` controlado.
  - Calcula oclusión ambiental (AO) por vértice.
  - Si un bloque cambia en un borde, también se vuelve a generar el chunk vecino.
  - El trabajo se reparte en una cola con un presupuesto de 4 ms por frame, dando prioridad a lo más cercano y a lo editado.
- **Iluminación**:
  - Cada vértice lleva dos atributos: `skyLight` y `blockLight` (antorchas, propagadas por inundación BFS al generar la geometría).
  - El material es `MeshLambertMaterial` con `onBeforeCompile` y un uniforme `uDaylight` (de 0 a 1) que viene del ciclo día/noche, así que cambiar la hora **no** obliga a regenerar la geometría.
  - Esto también decide la regla "zombis no aparecen junto a antorchas" (`blockLight` de 8 o más).
- **Atlas de texturas**:
  - PNG de tiles de 16 px con 2 px de margen replicado, `NearestFilter` y mipmaps generados por tile con margen. Esto evita el sangrado de texturas.
  - Las texturas son CC0 (por ejemplo, Kenney) o pixel-art propio, y se documentan en `docs/assets.md`.
- **Sin sombras dinámicas del terreno**: la AO y la luz por vértice dan la profundidad, y las entidades llevan sombras planas ("blob"). Así se elimina el bug actual de sombras recortadas y se ahorran muchas draw calls en GPU integrada.
- **Z-fighting**: no se generan caras coplanares. Las partículas y los efectos usan `polygonOffset`, y los planos de la cámara quedan en `near` = 0,1 y `far` = 250.
- **Entidades**:
  - Los modelos están hechos de cajas por partes (cuerpo, cabeza y patas).
  - Hay un `InstancedMesh` por cada combinación de especie y parte, y la animación procedural rota las partes por instancia ([ADR-0010](../../../docs/adr/0010-modelos-de-cajas-y-animacion-procedural.md)). Son unas 5 draw calls por especie y unas 60 en total, independientemente de cuántas entidades haya.
  - Las entidades a más de 64 bloques no se dibujan.
- **Interpolación**: el render dibuja interpolando entre los dos últimos estados de la simulación (`alpha`), para que se vea fluido a 60 FPS o más con la simulación a 20 Hz.
- **Pérdida de contexto gráfico**: en `webglcontextrestored` se recrean el atlas y las geometrías a partir del estado del dominio, que es la fuente de verdad.

### D6. Simulación: paso fijo y ECS-lite ([ADR-0004](../../../docs/adr/0004-simulacion-paso-fijo-ecs-lite.md))

- **Bucle de paso fijo** a 20 Hz (50 ms) con acumulador y un máximo de 5 pasos por frame para evitar la espiral de recuperación. Se pausa con `visibilitychange: hidden`, así que el tiempo del mundo no avanza con la pestaña oculta.
- **`EntityStore`**: entidades con id y componentes opcionales en objetos planos:
  - `transform`, `body` (AABB), `velocity`, `brain` (estado de la máquina de estados), `health`, `species`, `slot`, `tame`, `projectile` e `item`.
  - Hay un índice espacial (hash de celdas de 8 bloques) para las consultas de vecinos.
- **Orden de los sistemas por tick**:

  ```
  intents --> playerController --> ai --> pathfinding (cola con presupuesto) --> physics
          --> combat/interaction --> spawn/despawn --> dayNight --> dragonDirector --> events
  ```

- **Eventos del dominio** (bus tipado): `BlockChanged`, `EntityPoofed`, `EntityTamed`, `ItemCollected`, `PhaseChanged(dusk|night|midnight|dawn|day)`, `PlayerHit`, `DragonHit` y otros. Render, audio y UI **solo** reaccionan a eventos y leen el estado; nunca lo modifican. La UI envía *intents* a la simulación.
- **Selección de objetivos** (picking): un raycast DDA por vóxeles y un rayo contra AABB se calculan **en el dominio**, a partir de un rayo (origen y dirección) que envía `input`. Así es determinista y se puede probar sin Three.js.

### D7. IA: máquinas de estado por especie, definidas con datos ([ADR-0005](../../../docs/adr/0005-ia-maquinas-de-estado.md))

Cada especie declara sus estados, transiciones (condiciones sobre la percepción), velocidades, radios de percepción y sonidos. Cada entidad "piensa" cada 4 ticks, escalonado por id, para repartir la carga.

| Especie | Estados principales |
|---|---|
| Oveja, vaca, cabra | Idle, Wander (dentro de su hogar si está cerrado), Graze, Rest, Flee y ReturnHome |
| Gallina | Idle, Wander, Peck y Flee. Los pollos usan FollowLeader hacia la gallina más cercana. |
| Pato | Wander, Swim (flota en el agua) y Flee |
| Cerdo-gallina | Walk, Fly (arcos de hasta 8 bloques), Land y Flee |
| Lobo salvaje | Idle, Wander, Rest, Hunt (una vez por día del juego), Stalk, ReturnDen y Flee (tras un golpe) |
| Lobo amigo | Follow (2 a 5 bloques; si está a más de 30 se teletransporta), Guard (en la granja), ChaseZombie y Happy |
| Zombi | Spawn, Seek (lo más cercano alcanzable a 24 bloques o menos), Chase, Bump y Wander. Al amanecer pasa a Poof. |
| Dragón | Director con una ruta fija: Enter, Cruise, BurnTrees(2), SeekPigChicken, Exit. Si recibe 5 impactos pasa a Poof. |

Los escapes de la granja **no** son un estado especial. `Wander` elige destinos alcanzables dentro del radio de su hogar, así que si la cerca tiene un hueco, los destinos de fuera pasan a ser alcanzables. El comportamiento emerge del pathfinding.

### D8. Pathfinding ([ADR-0006](../../../docs/adr/0006-pathfinding-a-estrella-con-presupuesto.md))

- A* sobre la rejilla de vóxeles:
  - Una celda es transitable si hay un bloque sólido debajo y aire a la altura de la entidad (1 bloque para animales, 2 para zombis).
  - Se puede subir 1 bloque y caer hasta 3.
  - Las cercas tienen una altura de colisión de 1,5, así que no se pueden saltar.
- **Presupuesto**: como máximo 2000 nodos por búsqueda y 3 búsquedas por tick, con una cola por prioridad (primero zombis cerca del jugador, luego lobos cazando y por último el deambular).
- **Invalidación**: cada ruta guarda las `version` de los chunks que atraviesa, y `BlockChanged` invalida las rutas afectadas, que se recalculan en 2 s o menos (spec de zombis y lobos).
- **Si no hay camino**, la entidad deambula (zombi) o desiste y vuelve a su guarida (lobo).

### D9. Física ([ADR-0007](../../../docs/adr/0007-fisica-aabb-propia.md))

- AABB contra vóxeles con barrido por eje (primero Y, luego X y luego Z), gravedad de 25 bloques/s², velocidad terminal de 30 bloques/s y subida automática de escalones de 1 bloque al saltar.
- Separación suave entre entidades con el índice espacial (sin respuesta rígida).
- **Proyectiles**:
  - Velocidad de 30 bloques/s, gravedad de 10 bloques/s², 3 subpasos por tick y travesía DDA contra bloques más un rayo contra AABB contra entidades. Vida máxima de 3 s.
  - **Asistencia de puntería**: si el dragón está a 12° o menos de la dirección de disparo, se calcula la velocidad inicial hacia su posición prevista.
  - Cadencia de 3 flechas por segundo como máximo.

### D10. Ciclo día/noche, aparición y reaparición

- **`WorldClock`** (en `sim`): `timeOfCycleMs` avanza con los ticks. Las fases son day, dusk (30 s), night, midnight (evento) y dawn (30 s). Las duraciones salen de `world.settings`. `uDaylight` se interpola de forma suave.
- **Spawn slots**: el generador crea "slots" de población (especie, zona de hogar y punto de aparición). Cada animal y lobo lleva su `slotId`. Al hacer "poof", el slot pasa a `pendingRespawns`. Al amanecer, se rellenan **solo** los slots pendientes, en el punto libre más cercano a 8 bloques o menos del original.
- **Zombis**: un `NightSpawner` que hace aparecer uno cada 20 s hasta un máximo de 8 (a más de 24 bloques, sin techo encima, con `blockLight` menor que 8 y sin la noche tranquila). Al amanecer se hace `poof` de todos.
- **Dragón**: `DragonDirector` en el evento `midnight`. Los árboles naturales tienen un `TreeId` (del generador). Al quemarse, sus celdas `placed=0` pasan a aire y el árbol se agrega a `burntTrees`. Al amanecer se regenera solo en las celdas que siguen libres.
- **Diamantes**: los `OreId` del generador se marcan en `minedOres`. Cada 3 días del juego, al amanecer, se restauran en las celdas que siguen siendo piedra natural.

### D11. Personaje, cámara, input y herramientas

- **Controlador del jugador** (en `sim`): las intents son `move(x, z)`, `jump`, `useTool(ray)`, `selectTool`, `selectBlock`, `toggleInventory` y `release(ray)`. Velocidad de 4,3 bloques/s.
- **Herramientas** (`domain/rules/tools.ts`):

| Herramienta | Sobre un bloque | Sobre un animal | Sobre un lobo salvaje | Sobre un zombi | Sobre el dragón |
|---|---|---|---|---|---|
| Mano | pone el bloque seleccionado | "boing" | "boing" | 1 golpe y "poof" | nada |
| Pico | rompe o mina | "boing" | retrocede (1 golpe) | 1 golpe y "poof" | nada |
| Espada | nada | "poof" y carne | 2 golpes y "poof" | 1 golpe y "poof" | nada |
| Arco | flecha | flecha: "boing" | flecha: retrocede | flecha: "poof" | flecha: 1 de 5 |
| Collar | nada | "boing" | lo domestica | nada | nada |

  En todos los casos, un clic sobre un cerdo-gallina a 4 bloques o menos lo captura.
- **Cámara** (en `render`): brazo de resorte detrás del jugador (6 bloques, pitch de 20°), que se acorta con un raycast DDA si choca con bloques. Se gira arrastrando con el botón derecho (sin capturar el puntero) y vuelve detrás del personaje a los 3 s de soltar.
- **Protecciones del navegador** (en `input`):
  - `contextmenu.preventDefault()`.
  - `wheel` con `passive: false` y `preventDefault` (incluido Ctrl con la rueda).
  - Se bloquean las teclas de zoom.
  - `user-select: none`.
  - En `blur` se sueltan todas las teclas.

### D12. Audio ([ADR-0009](../../../docs/adr/0009-audio-web-audio-buses.md))

- `AudioContext` que se reanuda con el primer `pointerdown` o `keydown`. Los buses son `master` (con tope de 0,8), `music`, `sfx` y `ambient`.
- Sonido posicional simple: atenuación lineal hasta 24 bloques y `StereoPannerNode` según el ángulo respecto a la cámara.
- Gestor de voces: como máximo 3 voces de animales, con prioridad por distancia.
- La música de día y de noche se cruza en 5 s o más.
- Los assets son OGG CC0 en `public/audio/`, con sus licencias en `docs/assets.md`.

### D13. Rutas y apps ([ADR-0008](../../../docs/adr/0008-rutas-vite-multipagina.md)) y protección de padres ([ADR-0012](../../../docs/adr/0012-proteccion-vista-de-padres.md))

- Vite multipágina con `build.rollupOptions.input = { main: 'index.html', padres: 'padres/index.html' }`. Hay un pequeño middleware en el servidor de desarrollo y vista previa que redirige `/padres` a `/padres/`.
- El bundle del niño no importa nada de `ui/parents`, y una prueba E2E verifica que no hay ningún enlace a la vista de padres.
- **Visor de solo lectura**: reutiliza `render` (mesher y atlas) con `OrbitControls` y un repositorio de solo lectura. No arranca `sim` y nunca llama a `saveSnapshot`.
- **Concurrencia entre pestañas** (el niño juega mientras los padres revisan): la vista de padres lee el último guardado. Si los padres borran el mundo abierto, el juego sigue guardando sobre él (queda en la papelera con los datos más recientes) y en el siguiente arranque se abre otro. Se usa `BroadcastChannel('santi')` para avisar a la vista de padres de que hay datos nuevos.
- **PIN**: desactivado por defecto. Se guarda un hash PBKDF2 (WebCrypto, con sal) en `meta`, con un bloqueo de 60 s tras 5 fallos. Es **disuasorio**, no seguridad real (los datos son locales); la autenticación real llega con el modo online.

### D14. Herramientas de calidad ([ADR-0011](../../../docs/adr/0011-herramientas-de-calidad.md))

Vitest (entorno node para `core`, `domain`, `sim` y `persistence`), `fake-indexeddb`, Playwright (Chromium), ESLint con `typescript-eslint` y `no-restricted-imports`, y GitHub Actions (`check` + `test` + `e2e` smoke). Scripts: `test`, `test:watch`, `e2e`, `check`, `perf` y `ci`.

## Estrategia de pruebas

```
           /\          E2E y smoke (Playwright)               ~10%
          /--\         Visual (capturas con semilla fija) + perf (local)
         /----\        Integración (Vitest + fake-indexeddb)  ~20%
        /------\       Unitarias (Vitest, node)               ~70%
```

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unitaria `core` | RNG reproducible, DDA, AABB, bus de eventos | Vitest |
| Unitaria `domain` | Reglas de bloques, procedencia, generador determinista (hash del chunk por semilla), zonas presentes, tabla de herramientas | Hash de chunks como *golden values* |
| Unitaria `sim` (IA) | Transiciones de cada máquina de estados con **RNG con semilla** y **`FakeClock`**: oveja huye de un lobo a 6 bloques o menos, pollo sigue a gallina, el lobo caza solo una vez por día, el lobo amigo sigue al niño (máximo 3) | `createHeadlessGame({ seed, clock })` y `advance(ms)` |
| Unitaria (pathfinding) | Caminos con escalones y caídas, cerca no saltable, invalidación al colocar un bloque, presupuesto de nodos | Mundos pequeños construidos en la prueba |
| Unitaria (física) | Colisión con muro, subida de escalón, caída, borde del mundo, trayectoria balística de la flecha | Comparaciones numéricas con tolerancia |
| Unitaria (reglas de daño) | **Zombi = 1 golpe**, **dragón = 5 impactos (4 no bastan)**, lobo = 2 espadazos, Collar domestica, la Espada sobre un animal deja carne, el cerdo-gallina no da carne | Tabla de casos |
| Unitaria (día/noche) | Duraciones por defecto y configuradas (2 y 30 min), atardecer de 30 s o más, contador de días, pausa con la pestaña oculta, `midnight` dispara al dragón | `FakeClock` |
| Unitaria (reaparición) | **Solo reaparecen los slots pendientes**, sin duplicados, persistencia de `pendingRespawns` | |
| Unitaria (migraciones) | Cada `migrations[n]` con fixtures de cada versión, más la importación heredada (fixture real del `localStorage` v2) | |
| Integración (persistencia) | Contrato de `WorldRepository` ejecutado contra Dexie (fake-indexeddb) **y** en memoria; transacción atómica; orden "guardar antes de limpiar" (que el fallo de guardado aborte); deduplicación de clics; papelera y purga a los 30 días | Suite de contrato compartida |
| Integración (simulación) | Noche completa sin interfaz: granja cerrada con 0 pérdidas; granja abierta con al menos 1 pérdida; zombis 8 o menos; al amanecer 0 zombis y exactamente N reapariciones; determinismo a 30 vs 144 FPS | Simulación sin interfaz con semilla |
| E2E (Playwright) | **Construir, guardar, recargar y recuperar**; **crear un mundo nuevo y comprobar que el anterior se guardó**; **padres: listar, ver, borrar con confirmación, restaurar**; sin enlace a `/padres` en la UI del niño; configuración de la noche aplicada; smoke (sin errores en consola y canvas no vacío); 1000 acciones aleatorias sin errores | `?test=1` y `window.__santi` (adelantar el reloj, fijar la semilla, leer el estado) |
| Visual | Huecos y costuras entre chunks, z-fighting, agua y sangrado del atlas | `toHaveScreenshot` con semilla y cámara fijas y tolerancia |
| Rendimiento | p50 y p95 del tiempo de frame, draw calls y entidades | `npm run perf` con el navegador visible y GPU real (local, fuera de CI), resultados en `docs/performance.md` |

- **Trazabilidad**: cada prueba se nombra `[<capacidad>] <escenario>`, de modo que cada escenario de los specs tenga al menos una prueba.
- **Cobertura mínima**: 85% de líneas en `domain` y `sim`.

## Plan de documentación

| Documento | Se crea | Se actualiza cuando... |
|---|---|---|
| `README.md` | Ya existe | Cambian los scripts, requisitos o forma de ejecutar (incrementos 0, 3 y 4) |
| `CHANGELOG.md` | Ya existe | **Cada** incremento (en `[Sin publicar]`), y se versiona en cada hito |
| `docs/constitution.md` | Ya existe | Solo mediante un ADR |
| `docs/architecture.md` | Esqueleto | Incrementos 1, 2, 3, 5 y 6 (nuevos módulos o límites) |
| `docs/adr/NNNN-*.md` | 0001 a 0012 | Cada decisión nueva, o un ADR que reemplaza a otro |
| `docs/testing.md` | Esqueleto | Incremento 0 (herramientas) y cuando se agregan suites |
| `docs/performance.md` | Esqueleto | Incrementos 2, 6, 8 y 14 (tabla de resultados) |
| `docs/guia-padres.md` | Mínima | Incrementos 3, 4, 7 y 14 |
| `docs/guia-nino.md` | Mínima | Cada incremento visible para el niño (5 a 13), con capturas |
| `docs/assets.md` | En el incremento 2 | Cada asset CC0 nuevo (fuente y licencia) |
| `openspec/specs/**` | Al hacer sync o archive | `/opsx-sync` al cerrar cada hito; `/opsx-archive` al final |

## Risks / Trade-offs

- **[Rendimiento con muchas entidades en GPU integrada]**: InstancedMesh por especie y parte, "pensar" cada 4 ticks, no dibujar más allá de 64 bloques, límites por especie, medición con `npm run perf` en los incrementos 6, 8 y 14.
- **[El mesher no cumple los 4 ms por frame]**: cola con prioridad y presupuesto. Si aun así no alcanza, se mueve el mesher a un Web Worker (que un ADR nuevo apruebe). El mesh greedy queda como plan B.
- **[Pathfinding caro o inconsistente en un mundo que cambia]**: presupuesto de nodos, cola con prioridad, invalidación por versión de chunk y deambular como respaldo. Pruebas con mundos pequeños que se modifican.
- **[Consistencia del guardado (pestaña cerrada a mitad de escritura)]**: transacción única por snapshot (o todo o nada), guardado en `visibilitychange` (más confiable que `pagehide`), autoguardado cada 30 s (pérdida máxima de 30 s, según el spec), `storage.persist()` y exportación manual.
- **[Desalojo del almacenamiento por el navegador]**: `persist()`, aviso en la vista de padres si no se concede, y exportación o importación de mundos.
- **[Alcance demasiado grande para un solo change]**: incrementos independientes, un hito jugable en los incrementos 0 a 6, `/opsx-sync` por hito, y cada incremento se fusiona por separado. Si un incremento crece, se divide (por ejemplo, el 13 en 13a "arco" y 13b "dragón").
- **[Assets (texturas, sonidos y modelos) consumen tiempo]**: packs CC0 y modelos de cajas procedurales. Las texturas provisionales se aceptan en el incremento 2 y se pulen en el 14.
- **[La IA no determinista rompe las pruebas]**: prohibido usar `Math.random` y `Date.now` en `domain` y `sim` (regla de lint) y paso fijo.
- **[Usabilidad real con un niño de 4 años]**: checklist de prueba con Santi al final de cada incremento visible (¿lo entendió sin ayuda?, ¿se frustró?, ¿se asustó?), con los hallazgos en el CHANGELOG o como nuevas tasks.
- **[Contenido que asusta (zombis, dragón, noche)]**: noche tranquila por defecto **desactivada**, pero visible en la guía de padres; arte y música revisados con la checklist.
- **[Trade-off: sin sombras del terreno]**: menos realismo que la imagen de referencia, pero estabilidad y FPS; la AO compensa.
- **[Trade-off: mundo finito de 256x256]**: no es infinito, pero acota la memoria y las pruebas. El formato por chunks permite crecer.

## Migration Plan

1. Los incrementos 0 a 2 no tocan los datos:
   - En los incrementos 0 y 1 el mundo v1 sigue en `localStorage` (clave `minecraf-de-santi-world-v2`) mientras se refactoriza.
   - En el incremento 2 el mundo de 256x256 por chunks **no se guarda** (es una demo) y la clave v2 **no se lee ni se escribe**, para que el mundo de Santi llegue intacto a la importación del incremento 3.
2. El incremento 3 introduce IndexedDB:
   - En el primer arranque se importa el `localStorage` v2 como "Mi primer mundo".
   - La clave original se renombra a `minecraf-de-santi-world-v2-backup` y no se borra.
3. **Rollback**: volver a la etiqueta `v1.0.0` sigue funcionando, porque el respaldo puede restaurarse renombrando la clave (documentado en la guía de padres).
4. Las versiones siguientes del esquema se migran con `db.version(n).upgrade` y `migrations[n]`, siempre con fixtures de prueba.
5. Se versiona con etiquetas por hito: `v1.1.0` (incrementos 0 a 4), `v1.2.0` (5 y 6), `v1.3.0` (7 a 9) y `v2.0.0` (10 a 14).

## Open Questions

Preguntas que se pueden diferir sin cambiar los specs, el enfoque ni las tasks:

- Qué pack CC0 concreto se usa para texturas y sonidos (Kenney u otro) y si se dibujan tiles propios para el establo y el cerdo-gallina.
- Cómo se nombran automáticamente los mundos nuevos (el niño no escribe). Propuesta: "Mundo N", más una miniatura.
- Resolución final de las miniaturas (320x180 propuesto).
- Las preguntas de producto con su opción por defecto están en [`preguntas-abiertas.md`](preguntas-abiertas.md).
