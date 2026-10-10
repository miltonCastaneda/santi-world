# Tasks: Fase 2 "Mundo vivo"

> **Qué es este documento (SDD)**: es la lista de trabajo que ejecuta `/opsx-apply`. Cada `- [ ]` es una tarea que se marca como `- [x]` al terminarla. Cada **incremento** (`## N.`) es un *vertical slice*: termina en algo que se puede **demostrar en el navegador**, con sus propias pruebas y docs.
>
> - **DoD común a todos los incrementos** (constitution §4):
>   - `npm run check`, `npm test` y `npm run e2e` pasan.
>   - El CHANGELOG y los docs indicados están actualizados.
>   - Hay una demo en `npm run dev`.
>   - Si el incremento es visible para el niño, se aplica la checklist de prueba con Santi.
> - Las tareas asumen los **valores por defecto** de [`preguntas-abiertas.md`](preguntas-abiertas.md). Si cambias alguno, primero se actualizan los specs con `/opsx-update`.

## Orden recomendado y dependencias

```
0 Fundaciones --> 1 Refactor modular --> 2 Chunks + render --> 3 Persistencia + Mis Mundos
                                                                    |
                                       +----------------------------+-------------+
                                       v                                          v
                              4 Vista de padres (paralelo con 5)          5 Personaje + herramientas + audio
                                                                                  |
                                                                                  v
                                                                   6 Animales + granja   <-- HITO JUGABLE (v1.2.0)
                                                                                  |
                                                                                  v
                                                                   7 Ciclo día/noche + reaparición
                                                                                  |
                                                                                  v
                                                                   8 Zombis --> 9 Inventario, carne y antorchas
                                                                                  |
                                                       +--------------------------+------------+
                                                       v                                       v
                                            10 Lobos (paralelo con 11)            11 Diamantes
                                                       |                                       |
                                                       +-------------------+-------------------+
                                                                           v
                                                    12 Cerdo-gallina --> 13 Arco + dragón --> 14 Pulido final
```

**Por qué este orden**:

- **0 a 2** son la base escalable: todo lo demás depende de tener módulos puros, el bucle de paso fijo y los chunks. Hacerlo después obligaría a reescribir cada funcionalidad.
- **3 y 4** van temprano porque son la red de seguridad de la constitution ("nada se pierde") y porque el niño ya construye hoy.
- **5 y 6** completan el primer hito jugable (personaje y animales) para probar con Santi.
- **7** (el reloj) es requisito de la reaparición, de los zombis y del dragón. **8** valida el pathfinding que después reutilizan los lobos.
- **12 va antes que 13** porque el dragón se come cerdo-gallinas.
- **10 y 11** son independientes entre sí, igual que **4 y 5**.

## 0. Fundaciones de calidad y documentación

- **Objetivo**: tener las herramientas de prueba, lint y CI funcionando antes de tocar la lógica.
- **Módulos**: `package.json`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml` y `tests/`.
- **Specs**: `plataforma-escalable` (requisito "Calidad verificable con un comando").
- **Depende de**: nada. **Paralelizable**: no (es la base).
- **Demo**: `npm run ci` en verde, con el juego v1 sin cambios.

- [x] 0.1 Instalar `vitest`, `fake-indexeddb`, `@playwright/test`, `eslint` y `typescript-eslint` (ADR-0011) y verificar que `npm install` termina sin errores
- [x] 0.2 Crear los scripts `test`, `test:watch`, `e2e`, `check` (`tsc --noEmit` + `eslint`), `perf` (vacío por ahora) y `ci`, y verificar que cada uno se ejecuta
- [x] 0.3 Configurar ESLint con la regla de capas (`no-restricted-imports`) y `no-restricted-globals` (`Math.random`, `Date.now`, `window` y `document` en `core`, `domain` y `sim`), y verificarlo con un archivo de prueba que viole la regla y haga fallar `npm run check`
- [x] 0.4 Escribir una prueba unitaria de ejemplo y un smoke E2E del juego v1 (carga sin errores en consola y el canvas no está en blanco), y verificar que `npm test` y `npm run e2e` pasan
- [x] 0.5 Crear el workflow de GitHub Actions (`check` + `test` + `e2e` smoke) y verificar que pasa en un push a la rama
- [x] 0.6 Completar `docs/testing.md` (comandos reales y convención de nombres `[capacidad] escenario`) y el README (scripts), agregar la entrada al CHANGELOG, y verificar que los comandos documentados funcionan tal cual

## 1. Refactor a arquitectura modular y bucle de paso fijo (sin cambiar el comportamiento)

- **Objetivo**: separar `core`, `domain`, `sim`, `render`, `input`, `ui` y `apps`, con el bucle de paso fijo y picking en el dominio, manteniendo el juego v1 idéntico para el usuario.
- **Módulos**: todo `src/`, que pasa a la estructura del design D2, y `index.html`.
- **Specs**: `plataforma-escalable` (simulación sin interfaz, determinismo y límites entre módulos).
- **Depende de**: 0. **Paralelizable**: no.
- **Demo**: el mismo juego v1 (poner, quitar, deshacer), ahora sobre la nueva arquitectura.

- [x] 1.1 Crear `core/` (`rng` con semilla, `Clock` y `FakeClock`, bus de eventos tipado, `vec3`, `aabb` y raycast DDA de vóxeles) y verificarlo con pruebas unitarias (RNG reproducible y DDA que atraviesa las celdas esperadas)
- [x] 1.2 Mover el registro de bloques y las reglas de colocación y deshacer a `domain/`, sin dependencias de Three.js ni del DOM, y verificar que las pruebas unitarias de las reglas actuales pasan (vecino requerido, capa 0 indestructible, deshacer)
- [x] 1.3 Implementar `sim/loop.ts` (20 Hz, acumulador, máximo 5 pasos, pausa con la pestaña oculta) y `createHeadlessGame({ seed, clock })`, y verificar con una prueba que N ticks avanzan exactamente N×50 ms y que el resultado es el mismo a 30 y a 144 FPS simulados
- [x] 1.4 Mover el render a `render/` (escena, cámara orbital provisional, `WorldMesh` actual) y la entrada a `input/` (que produce intents con un rayo); el picking pasa a usar el DDA del dominio. Verificar con el smoke E2E que poner y quitar funcionan igual
- [x] 1.5 Crear `apps/game/main.ts` como raíz de composición y verificar que `npm run check` no reporta violaciones de capas
- [x] 1.6 Agregar `testing/testApi` (`window.__santi`, solo con `?test=1` en desarrollo) y verificar con un E2E que no existe en `npm run build`
- [x] 1.7 Actualizar `docs/architecture.md` (módulos reales y regla de dependencias), marcar ADR-0001 y ADR-0004 como Aceptados y agregar la entrada al CHANGELOG

## 2. Mundo por chunks, mesher, texturas y mundo de 256x256 con zonas

- **Objetivo**: un mundo grande, con texturas y generado por semilla, dibujado por chunks dentro del presupuesto y sin artefactos.
- **Módulos**: `domain/world` (Chunk, ChunkStore, procedencia), `domain/worldgen`, `render/ChunkMesher`, `render/TextureAtlas`, `render/Sky` y `public/textures/`.
- **Specs**: `mundos-y-persistencia` ("Mundo más grande" y "Carga y descarga progresiva") y `rendimiento-y-estabilidad-visual`.
- **Depende de**: 1. **Paralelizable**: no (el resto depende de él). Conseguir las texturas CC0 sí puede hacerse en paralelo.
- **Demo**: recorrer con la cámara orbital un mundo de 256x256 con granja (todavía vacía), montañas, río y estanque.

- [x] 2.1 Implementar `Chunk` (16x16x64, bitset `placed`, `version`) y `ChunkStore` (lectura y escritura entre chunks) y verificarlo con pruebas unitarias de coordenadas en bordes y de procedencia
- [x] 2.2 Implementar el generador por semilla y `generatorVersion`: terreno, río, estanque, granja con cercas y establo, montaña boscosa (con al menos 20 árboles con `TreeId`), montaña de roca (con al menos 10 diamantes con `OreId`) y borde natural. Verificar con pruebas de hash por chunk (*golden values*) y de presencia de las zonas
- [x] 2.3 Agregar los bloques nuevos al registro (tablones, hojas, cerca con colisión de 1,5, antorcha con luz, mineral de diamante, arena, nieve y lana) y verificar con pruebas de sus propiedades
- [x] 2.4 Implementar `ChunkMesher` (caras visibles entre chunks vecinos, geometría opaca y transparente, AO) y verificar con pruebas unitarias (2 bloques adyacentes no generan caras internas; un bloque en el borde genera las caras correctas en los dos chunks)
- [x] 2.5 Implementar la luz por vértice (`skyLight` y `blockLight` con BFS) y el material con `uDaylight` (`onBeforeCompile`), y verificar con una prueba unitaria la propagación de la luz de una antorcha
- [x] 2.6 Implementar `TextureAtlas` (márgenes de 2 px, `NearestFilter`, mipmaps por tile) con texturas CC0, y documentar la fuente y la licencia en `docs/assets.md` (nuevo)
- [x] 2.7 Cola de remallado con presupuesto de 4 ms por frame, prioridad por distancia y por edición, y carga y descarga con radio 6 e histéresis 8. Verificar con el overlay F3 que nunca hay más de 4 ms de mesher por frame
- [x] 2.8 Quitar las sombras dinámicas del terreno (y con ello el bug de sombras recortadas) y configurar `near`/`far`. Verificar con pruebas visuales (`toHaveScreenshot` con semilla fija) que no hay huecos entre chunks, z-fighting ni sangrado, y que el agua no parpadea
- [x] 2.9 Implementar el overlay de debug F3 (FPS, tiempo de frame, draw calls, chunks) y el primer `npm run perf` (ruta de cámara fija y semilla `perf-001`), y registrar los resultados en `docs/performance.md`
- [x] 2.10 Actualizar `docs/architecture.md`, marcar ADR-0003 como Aceptado y agregar la entrada al CHANGELOG

## 3. Persistencia con IndexedDB, autoguardado, migración heredada y "Mis Mundos"

- **Objetivo**: varios mundos guardados de forma segura, sin pérdidas, y con el mundo actual de Santi importado.
- **Módulos**: `persistence/` (puerto, Dexie, memoria, migraciones, `AutosaveService`, `legacyImport`), `sim/game` (`GameSession`), `ui/kid/MisMundos` y `render` (miniaturas).
- **Specs**: `mundos-y-persistencia` (todos los requisitos de guardado) y `plataforma-escalable` (persistencia intercambiable e IDs).
- **Depende de**: 2. **Paralelizable**: no.
- **Demo**: crear 3 mundos, cambiar entre ellos, cerrar el navegador y recuperarlos. "Mi primer mundo" contiene la construcción v1.

- [x] 3.1 Instalar `dexie` (ADR-0002), definir `WorldRepository` y una suite de pruebas de contrato compartida, e implementar `InMemoryWorldRepository`. Verificar que la suite pasa contra memoria
- [x] 3.2 Implementar `DexieWorldRepository` (tablas del design D4; `saveSnapshot` en una sola transacción) y verificar que la misma suite de contrato pasa con `fake-indexeddb`
- [x] 3.3 Implementar el usuario por defecto con UUID y las marcas `version` y `updatedAt` en el mundo, los chunks y el estado, y verificarlo con una prueba (escenario "Usuario por defecto")
- [x] 3.4 Implementar la persistencia de **solo los chunks modificados** (los demás se regeneran con la semilla) y verificar con una prueba que se recarga idéntico tras editar 3 chunks
- [x] 3.5 Implementar `AutosaveService` (cada 30 s, `visibilitychange`, `pagehide` y `blur`, vuelo único) y verificar con pruebas de integración y `FakeClock` los escenarios "Autoguardado periódico", "Cerrar la pestaña" y "El guardado no congela el juego"
- [x] 3.6 Implementar `GameSession.switchWorld()` y `createWorld()` con "guardar antes de limpiar" y que un guardado fallido aborte la operación, y verificar con pruebas de integración los escenarios "Crear un mundo nuevo guarda primero", "Falla el guardado previo" y "Clics repetidos"
- [x] 3.7 Implementar las migraciones (`db.version(n).upgrade` y `migrations[n]` puras) y la importación heredada `legacyImport` (de `localStorage` v2 a "Mi primer mundo", con los bloques `placed` y la clave renombrada a `-backup`). Verificar con un fixture real de v1 los escenarios "Migración del mundo heredado" y "Migración fallida"
- [x] 3.8 Generar miniaturas (WebP de 320x180 al guardar) y crear el panel "Mis Mundos" del niño (tarjetas grandes, "Crear nuevo mundo" y sin borrar), y verificar con un E2E "construir, guardar, recargar y recuperar" y "crear un mundo nuevo y comprobar que el anterior se guardó"
- [x] 3.9 Reemplazar "Empezar de nuevo" por "Crear nuevo mundo" y llamar a `navigator.storage.persist()` en el primer guardado, y verificar con un E2E que ningún botón del niño borra un mundo
- [x] 3.10 Actualizar `docs/guia-padres.md` (dónde se guardan los mundos y el respaldo heredado), `docs/guia-nino.md` (Mis Mundos), README y `docs/architecture.md`, marcar ADR-0002 como Aceptado y agregar la entrada al CHANGELOG

## 4. Vista de padres en `/padres/`

- **Objetivo**: los padres ven el histórico, abren mundos en solo lectura, borran con papelera y configuran el juego.
- **Módulos**: `padres/index.html`, `apps/parents/`, `ui/parents/`, `render` (visor reutilizado), `persistence` (papelera y purga) y `vite.config.ts`.
- **Specs**: `vista-de-padres` (todos los requisitos).
- **Depende de**: 3. **Paralelizable**: sí, con el incremento 5.
- **Demo**: en `/padres/` se listan los mundos, se abre uno en el visor, se borra, se restaura y se cambia la duración de la noche.

- [x] 4.1 Configurar Vite multipágina y el redirect de `/padres` a `/padres/` (ADR-0008), y verificar con un E2E que ambas URLs cargan la vista de padres y no el juego
- [x] 4.2 Crear la lista de mundos (miniatura, nombre, fechas y día del juego, ordenados por `updatedAt`, con imagen genérica si no hay miniatura) y verificarlo con un E2E del escenario "Lista con miniaturas"
- [x] 4.3 Crear el visor de solo lectura (mesher y atlas con `OrbitControls`, sin `sim` y sin guardar) y verificar con un E2E que `updatedAt` no cambia tras abrir el visor
- [x] 4.4 Implementar el borrado con confirmación, la papelera, la restauración y la purga a los 30 días, y verificar con pruebas de integración (`FakeClock`) y un E2E de "borrar con confirmación, cancelar y restaurar"
- [x] 4.5 Implementar la configuración por mundo (día y noche de 2 a 30 min, noche tranquila y volúmenes, con los límites aplicados) y verificar con pruebas unitarias de validación de rango
- [x] 4.6 Implementar el PIN opcional (hash PBKDF2, bloqueo de 60 s tras 5 fallos, desactivado por defecto; ADR-0012) y verificarlo con pruebas unitarias y un E2E del escenario "PIN activo e incorrecto"
- [x] 4.7 Implementar `BroadcastChannel` para refrescar la lista cuando el juego guarda, el uso de almacenamiento (`estimate()`) y exportar o importar un mundo, y verificar con un E2E con dos pestañas
- [x] 4.8 Escribir un E2E que confirme que **la UI del niño no tiene ningún enlace ni atajo a `/padres`** (escenario "Sin enlaces desde la UI del niño")
- [x] 4.9 Actualizar `docs/guia-padres.md` (cómo entrar, borrar, restaurar, configurar, PIN y restablecerlo), marcar ADR-0008 y ADR-0012 como Aceptados y agregar la entrada al CHANGELOG

## 5. Personaje, cámara en tercera persona, herramientas y servicio de audio

- **Objetivo**: el niño camina con su personaje, construye y rompe con herramientas grandes y oye la respuesta.
- **Módulos**: `sim/systems/playerController`, `sim/systems/physics`, `domain/rules/tools`, `render` (modelo del personaje, cámara y animaciones), `input` (WASD, arrastre y protecciones del navegador), `ui/kid` (ToolBar, HotBar, corazones, ayuda de controles y Mute) y `audio/`.
- **Specs**: `personaje-y-herramientas` y `experiencia-infantil` (jugar sin leer, audio, navegador a prueba de niños).
- **Depende de**: 3. **Paralelizable**: sí, con el incremento 4.
- **Demo**: Santi camina con WASD, salta, pone bloques con la Mano, rompe con el Pico, gira la cámara y silencia el audio.

- [x] 5.1 Implementar la física AABB (barrido por eje, gravedad, escalón de 1 bloque y borde del mundo; ADR-0007) y verificar con pruebas unitarias "Chocar contra un muro", "Saltar un escalón", "Caer en un hueco" y "Borde del mundo"
- [x] 5.2 Implementar el controlador del jugador (intents, velocidad de 4,3 bloques/s, alcance de 6 bloques, sin colocar bloques en la celda propia) y verificarlo con pruebas unitarias "Fuera de alcance" y "Atascado dentro de un bloque"
- [x] 5.3 Crear el modelo del personaje con cajas, la "S" y las animaciones idle, caminar, saltar y acción (ADR-0010), y verificar con un E2E de los tiempos de transición (100 ms o menos al caminar y 300 ms o menos al pasar a idle)
- [x] 5.4 Implementar la cámara de brazo de resorte con colisión, el giro con el botón derecho y la vuelta detrás del personaje, quitando `OrbitControls` del juego, y verificar con un E2E que la cámara nunca queda dentro de un bloque
- [x] 5.5 Implementar la entrada (WASD y flechas, espacio, 1 a 9, rueda, E, soltar las teclas en `blur`, sin menú contextual ni zoom) y verificar con E2E "Pérdida de foco", "Teclas no asignadas", "Menú contextual" y "Zoom accidental"
- [x] 5.6 Crear la barra vertical de herramientas (Mano, Pico, Espada, Arco y Collar), la hotbar inferior y la ayuda de controles según la referencia visual (íconos de 64 px o más), y verificar con un E2E "Tamaño de los objetivos" y "Elegir herramienta con un clic"
- [x] 5.7 Implementar los corazones (5, invulnerabilidad de 1 s, recuperación de 1 corazón cada 20 s, "poof" y reaparición en la granja sin perder nada, con 5 s de invulnerabilidad) y verificarlo con pruebas unitarias de los escenarios de "Corazones y reaparición sin pérdida"
- [x] 5.8 Implementar `AudioService` (buses, tope de 0,8, reanudación con la primera interacción, voces con prioridad y botón de silencio; ADR-0009) con sonidos CC0 de pasos, bloques y UI, y verificarlo con pruebas unitarias con un contexto falso ("Silencio" y tope) y documentarlo en `docs/assets.md`
- [ ] 5.9 Actualizar `docs/guia-nino.md` (controles con íconos) y `docs/architecture.md`, marcar ADR-0007, 0009 y 0010 como Aceptados, agregar la entrada al CHANGELOG y hacer la prueba de juego con Santi (checklist)

## 6. Animales y granja (HITO JUGABLE, v1.2.0)

- **Objetivo**: animales autónomos con sonido y físicas que viven en la granja y escapan si se abre la cerca.
- **Módulos**: `domain/entities` (componentes y especies como datos), `sim/systems/ai`, `sim/systems/pathfinding`, `sim/systems/spawn`, `render/EntityRenderer`, `audio` (sonidos de animales) y `persistence` (entidades).
- **Specs**: `animales-y-granja` (salvo la reaparición al amanecer y el cerdo-gallina) y `rendimiento-y-estabilidad-visual` (límites de entidades).
- **Depende de**: 5. **Paralelizable**: los modelos y los sonidos de cada especie sí, entre sí.
- **Demo**: la granja con ovejas, vacas, cabras, gallinas, pollos y patos que se mueven y suenan. Si se rompe la cerca, algunos escapan.

- [x] 6.1 Implementar `EntityStore`, el índice espacial y el intérprete de máquinas de estado definidas con datos, que piensa cada 4 ticks (ADR-0005), y verificarlo con pruebas unitarias de transiciones genéricas con RNG con semilla
- [x] 6.2 Implementar el pathfinding A* con presupuesto, cola por prioridad e invalidación por versión de chunk (ADR-0006), y verificar con pruebas unitarias de escalones, caídas, cerca no saltable, invalidación al colocar un bloque y límite de nodos
- [x] 6.3 Definir las especies oveja, vaca y cabra (Idle, Wander, Graze, Rest, Flee y ReturnHome) y verificar con pruebas unitarias "Huir de una amenaza" y "Cerca de 1 bloque"
- [x] 6.4 Definir gallina, pollo (FollowLeader) y pato (Swim), y verificar con pruebas unitarias "Pollos siguen a gallinas" y que el pato flota
- [x] 6.5 Crear la población inicial con spawn slots en la granja y el estanque, y verificarlo con una prueba de integración del escenario "Población inicial"
- [x] 6.6 Implementar `EntityRenderer` (InstancedMesh por especie y parte, animaciones procedurales, parpadeo y "poof", sombra plana, sin dibujar a más de 64 bloques) y verificar con el overlay que las entidades suman 60 draw calls o menos
- [x] 6.7 Agregar los sonidos por especie (CC0, atenuación hasta 24 bloques y como máximo 3 voces) y verificarlo con pruebas unitarias "Sonido por especie" y "Muchos animales"
- [x] 6.8 Persistir las entidades (snapshot por mundo) y verificar con una prueba de integración que se recargan con la misma posición y el mismo estado
- [x] 6.9 Verificar con una prueba de integración sin interfaz "Escapar por un hueco", "Animales vivos sin intervención" y "Determinismo" (10 min con la misma semilla)
- [ ] 6.10 Ejecutar `npm run perf` con todos los animales y registrar los resultados en `docs/performance.md`; actualizar `docs/guia-nino.md` (animales) y `docs/architecture.md`, marcar ADR-0005 y 0006 como Aceptados, agregar la entrada al CHANGELOG, hacer la prueba de juego con Santi y etiquetar `v1.2.0`

## 7. Ciclo día/noche y reaparición al amanecer

- **Objetivo**: el tiempo pasa; anochece y amanece de forma visible, y los animales que faltan vuelven al amanecer.
- **Módulos**: `sim/systems/dayNight` (`WorldClock`), `sim/systems/respawn`, `render/Sky` (`uDaylight`, cielo, niebla y nubes), `ui/kid/HudClock`, `audio` (música de día y de noche) y `persistence` (hora y `pendingRespawns`).
- **Specs**: `ciclo-dia-noche` y `animales-y-granja` ("Reaparición al amanecer").
- **Depende de**: 6. **Paralelizable**: no.
- **Demo**: con `?test=1`, adelantar el reloj y ver el atardecer, la noche con antorchas, el amanecer, el día 2 y la reaparición de un animal que había desaparecido.

- [x] 7.1 Implementar `WorldClock` (fases, eventos `PhaseChanged`, duraciones desde la configuración y pausa con la pestaña oculta) y verificar con pruebas unitarias (`FakeClock`) "Duración por defecto", "Pestaña oculta" y "Contador de días", con 2 y 30 min
- [x] 7.2 Implementar la transición visual (`uDaylight`, cielo, niebla, sol y luna, al menos 30 s) y verificar con pruebas visuales y unitarias "Atardecer gradual" y "Visibilidad nocturna mínima"
- [x] 7.3 Crear el HUD de tiempo sin texto (sol o luna, día N y arco de cuenta regresiva, con aviso un minuto antes) según la referencia, y verificarlo con un E2E "Aviso de que se acerca la noche"
- [x] 7.4 Implementar la reaparición por slots solo al amanecer, sin duplicados y persistente, y verificar con pruebas unitarias e integración "Solo reaparecen los que faltan" y "La reaparición sobrevive a recargar"
- [x] 7.5 Implementar la música de día y de noche con un cruce de 5 s o más, y verificarlo con una prueba unitaria del cruce y la checklist de "música que no asusta"
- [x] 7.6 Aplicar la configuración de los padres en caliente (duración y noche tranquila) y verificar con un E2E "Cambiar la duración de la noche"
- [x] 7.7 Actualizar `docs/guia-padres.md` (ciclo y configuración) y `docs/guia-nino.md` (sol y luna) y agregar la entrada al CHANGELOG

## 8. Zombis nocturnos

- **Objetivo**: de noche aparecen zombis cartoon que persiguen respetando lo construido, se derrotan de 1 golpe y se van al amanecer.
- **Módulos**: `domain/entities/species/zombie`, `sim/systems/spawn` (`NightSpawner`), `sim/systems/combat`, `render` (modelo y destellos) y `audio`.
- **Specs**: `enemigos-nocturnos` (requisitos de zombis) y `personaje-y-herramientas` (recibir golpes).
- **Depende de**: 7. **Paralelizable**: no.
- **Demo**: de noche llegan zombis lentos, un corral cerrado protege a las ovejas, un golpe hace "poof" y al amanecer desaparecen.

- [x] 8.1 Implementar `NightSpawner` (uno cada 20 s, máximo 8, a más de 24 bloques, sin techo y con `blockLight` menor que 8, respetando la noche tranquila) y verificar con pruebas unitarias "Límite de zombis", "Distancia de aparición", "Refugio iluminado" y "Noche sin enemigos"
- [x] 8.2 Definir la máquina de estados del zombi (Seek, Chase y Bump, al 60% de la velocidad, recálculo de camino en 2 s o menos) y verificar con pruebas unitarias "Recalcular camino" y "Velocidad"
- [x] 8.3 Implementar el combate: un zombi que toca a un animal provoca su "poof" (pendiente de reaparecer) y uno que toca al jugador le quita 1 corazón con empuje; **zombi = 1 golpe** con Mano, Pico o Espada. Verificarlo con la tabla de reglas de daño en pruebas unitarias
- [x] 8.4 Implementar la retirada al amanecer (todos hacen "poof" en 5 s o menos) y verificar con una prueba de integración sin interfaz "Amanecer" (0 zombis y exactamente N reapariciones)
- [x] 8.5 Verificar con una prueba de integración de noche completa: con el corral cerrado y techado se pierden 0 animales ("Muro protector")
- [x] 8.6 Crear el modelo de zombi cartoon, los destellos y los sonidos suaves, y verificar con la checklist "Revisión de efectos" (violencia solo cartoon)
- [x] 8.7 Ejecutar `npm run perf` de noche con 8 zombis y registrar los resultados; actualizar `docs/guia-nino.md` ("construye muros") y `docs/guia-padres.md` (noche tranquila) y agregar la entrada al CHANGELOG

## 9. Inventario, carne y antorchas

- **Objetivo**: el niño junta carne de la granja, ve su inventario y coloca antorchas que alejan a los zombis.
- **Módulos**: `domain/rules` (inventario y carne), `sim/systems/interaction` (recoger objetos), `ui/kid/Inventory`, `render` (objeto de carne flotante) y el bloque antorcha (luz).
- **Specs**: `recursos-e-inventario` ("Carne de los animales de granja", "Inventario visual" y "Bloques infinitos").
- **Depende de**: 8. **Paralelizable**: no.
- **Demo**: Espada sobre una vaca, que hace "poof" y deja carne; recogerla, abrir el inventario con E; colocar una antorcha y ver que de noche no aparecen zombis cerca.

- [x] 9.1 Implementar la Espada sobre un animal de granja ("poof", carne flotante y slot pendiente; el cerdo-gallina no da carne; Pico y Mano solo hacen "boing") y verificarlo con pruebas unitarias de la tabla de herramientas
- [x] 9.2 Implementar la recogida de la carne (a 1,5 bloques o menos, o con un clic) y su persistencia sin que desaparezca, y verificar con pruebas unitarias "Recoger carne" y "Carne no recogida"
- [x] 9.3 Crear el inventario visual (E o mochila, contadores con puntos de 1 a 5, por mundo y persistente) y verificar con un E2E "Abrir el inventario", "Persistencia del inventario" e "Inventario independiente por mundo"
- [x] 9.4 Implementar la antorcha como bloque de la hotbar (luz por vértice) y verificar con un E2E "Refugio iluminado"
- [x] 9.5 Actualizar `docs/guia-nino.md` (inventario y antorchas) y agregar la entrada al CHANGELOG

## 10. Lobos, su montaña y la domesticación con el Collar

- **Objetivo**: lobos que cazan animales de la granja si pueden llegar a ellos y que se vuelven amigos con el Collar.
- **Módulos**: `domain/entities/species/wolf`, `sim/systems/ai` (Hunt, Follow y Guard), `domain/rules/tools` (Collar), `render` (modelo, collar y corazones) y `audio`.
- **Specs**: `lobos` (todos los requisitos).
- **Depende de**: 9. **Paralelizable**: sí, con el incremento 11.
- **Demo**: un lobo sale a cazar y se le cierra el paso con bloques; otro se domestica con el Collar y sigue a Santi.

- [x] 10.1 Poblar la montaña con 4 a 6 lobos con spawn slots y verificarlo con una prueba de integración "Lobos en su montaña"
- [x] 10.2 Definir la máquina de estados del lobo salvaje (Hunt una vez por día del juego, Stalk, ReturnDen, sin dañar al niño) y verificar con pruebas de integración "Granja abierta", "Granja bien cerrada", "El niño cierra el hueco a tiempo" y "Lobos y el niño"
- [x] 10.3 Implementar el Collar (un clic a 3 bloques o menos domestica; sobre otro animal hace "boing") y que la domesticación persista, y verificarlo con pruebas unitarias "Domesticar", "Collar sobre un animal que no es lobo" y "Lobo amigo persistente"
- [x] 10.4 Definir el lobo amigo (Follow de 2 a 5 bloques, como máximo 3 lo siguen, teletransporte a más de 30, Guard en la granja y ChaseZombie) y verificar con pruebas unitarias "Seguir al niño", "Cuarto lobo amigo" y "Proteger de zombis"
- [x] 10.5 Implementar los golpes a un lobo salvaje (retrocede; 2 espadazos provocan "poof" y reaparición al amanecer; el lobo amigo no sufre daño) y verificar con pruebas unitarias "Golpe con la espada", "Dos golpes" y "Golpe accidental a un lobo amigo"
- [x] 10.6 Crear el modelo del lobo, el collar visible, el efecto de corazones y los sonidos, y verificarlo con la checklist visual
- [x] 10.7 Actualizar `docs/guia-nino.md` (el collar y los lobos amigos) y agregar la entrada al CHANGELOG

## 11. Montaña de rocas y diamantes

- **Objetivo**: el niño mina diamantes con el Pico y los ve en su inventario.
- **Módulos**: `domain/worldgen` (vetas con `OreId`), `domain/rules` (minería), `sim/systems/regrowth` y `render` (brillo).
- **Specs**: `recursos-e-inventario` ("Diamantes en la montaña de rocas").
- **Depende de**: 9. **Paralelizable**: sí, con el incremento 10.
- **Demo**: Santi va a la montaña de roca, mina 3 diamantes y los ve en el inventario.

- [ ] 11.1 Implementar el Pico sobre un diamante (se vuelve piedra, +1 diamante y brillo; con la Espada no pasa nada) y verificarlo con pruebas unitarias "Minar un diamante" y "Diamante con otra herramienta"
- [ ] 11.2 Implementar la reaparición de diamantes cada 3 días del juego, solo en piedra natural (`placed=0`), y verificarlo con una prueba unitaria "Diamantes que vuelven"
- [ ] 11.3 Verificar con una prueba de generación que hay al menos 10 diamantes accesibles (visibles o a 2 bloques o menos de la superficie) en varias semillas
- [ ] 11.4 Actualizar `docs/guia-nino.md` (diamantes) y agregar la entrada al CHANGELOG

## 12. Cerdo-gallina volador

- **Objetivo**: el cerdo-gallina vuela, se captura con un clic y se puede soltar.
- **Módulos**: `domain/entities/species/pigChicken`, `sim/systems/physics` (vuelo), `domain/rules` (capturar y soltar), `render` y `audio`.
- **Specs**: `animales-y-granja` ("Cerdo-gallina volador").
- **Depende de**: 10 y 11 (por orden de integración; técnicamente solo necesita el 9). **Paralelizable**: no.
- **Demo**: atrapar un cerdo-gallina en vuelo y soltarlo en la granja.

- [ ] 12.1 Definir la máquina de estados del cerdo-gallina (Walk, Fly en arcos de hasta 8 bloques, Land y Flee) y verificar con pruebas unitarias que nunca supera los 8 bloques de altura ni atraviesa bloques
- [ ] 12.2 Implementar la captura con un clic a 4 bloques o menos con cualquier herramienta, en el suelo o en vuelo, y verificar con pruebas unitarias "Captura con un clic" y "Captura en vuelo"
- [ ] 12.3 Implementar soltarlo y el límite de 3 libres, con la reaparición al amanecer de los que faltan, y verificar con pruebas unitarias "Soltar un cerdo-gallina" y "Límite de libres"
- [ ] 12.4 Crear el modelo (cerdo rosado con alas y cresta, como en la referencia), las animaciones y los sonidos, y verificarlo con la checklist visual
- [ ] 12.5 Actualizar `docs/guia-nino.md` (el cerdo-gallina) y agregar la entrada al CHANGELOG

## 13. Arco, proyectiles y dragón

- **Objetivo**: el dragón pasa a medianoche, quema 2 árboles y se come un cerdo-gallina, y se derrota con 5 flechas.
- **Módulos**: `sim/systems/physics` (proyectiles), `domain/rules/tools` (Arco), `sim/systems/dragonDirector`, `sim/systems/regrowth` (árboles), `render` (modelo del dragón, fuego cartoon y flechas) y `audio`.
- **Specs**: `enemigos-nocturnos` ("Dragón nocturno" y "Derrotar al dragón con 5 disparos").
- **Depende de**: 12. **Paralelizable**: el modelo y el arte del dragón sí pueden hacerse en paralelo con 13.1 a 13.3. Si crece demasiado, se divide en 13a (arco) y 13b (dragón).
- **Demo**: a medianoche aparece el dragón; Santi le dispara 5 flechas y desaparece en estrellas. Al amanecer, los árboles rebrotan.

- [ ] 13.1 Implementar el proyectil balístico (30 bloques/s, gravedad de 10, 3 subpasos, DDA y rayo contra AABB, vida de 3 s, como máximo 3 por segundo) y verificar con pruebas unitarias "Física de la flecha" y "Disparos muy rápidos"
- [ ] 13.2 Implementar la asistencia de puntería (cono de 12° y posición prevista) y verificarla con una prueba unitaria "Asistencia de puntería"
- [ ] 13.3 Implementar `DragonDirector` (aparece en `midnight`, ruta fija, quema exactamente 2 árboles naturales, se come 1 cerdo-gallina si hay alguno libre, nunca toca bloques `placed` y respeta la noche tranquila) y verificar con pruebas unitarias "Paso del dragón", "Respeta las construcciones" y "Sin cerdo-gallinas libres"
- [ ] 13.4 Implementar la regla **dragón = 5 impactos** (4 no bastan; el contador se reinicia la noche siguiente) y verificar con pruebas unitarias "Cinco impactos" y "Cuatro impactos"
- [ ] 13.5 Implementar que los árboles quemados rebroten al amanecer solo en las celdas libres, y verificarlo con una prueba unitaria "Los árboles rebrotan"
- [ ] 13.6 Crear el modelo del dragón (partes en cajas y aleteo), el fuego cartoon, las flechas y los sonidos, y verificarlo con la checklist "Revisión de efectos" (que no asuste)
- [ ] 13.7 Verificar con una prueba de integración sin interfaz una noche completa con el dragón (árboles, cerdo-gallina, 5 impactos y amanecer)
- [ ] 13.8 Actualizar `docs/guia-nino.md` (el arco y el dragón) y `docs/guia-padres.md` (qué pasa de noche) y agregar la entrada al CHANGELOG

## 14. Integración final: rendimiento, estabilidad visual y aceptación

- **Objetivo**: verificar el sistema completo contra el presupuesto y la experiencia infantil, solo con comprobaciones de integración (las pruebas y los docs de cada incremento ya se entregaron).
- **Módulos**: ajustes puntuales donde fallen las mediciones.
- **Specs**: `rendimiento-y-estabilidad-visual`, `experiencia-infantil` y `plataforma-escalable` (verificación completa).
- **Depende de**: 13. **Paralelizable**: no.
- **Demo**: una sesión completa de Santi (día, noche, zombis, dragón y amanecer) a 60 FPS.

- [ ] 14.1 Ejecutar `npm run perf` en el equipo de referencia con el escenario de máximo de entidades (día y noche) y verificar que p95 ≤ 20 ms, p50 ≤ 16,7 ms, menos de 300 draw calls y 60 entidades o menos; registrar los resultados en `docs/performance.md`
- [ ] 14.2 Ejecutar la suite visual completa (bordes de chunks, agua, antorchas y noche) y la prueba de "Contexto perdido", y verificar que no hay regresiones
- [ ] 14.3 Ejecutar el E2E de 1000 acciones aleatorias del niño ("Secuencia aleatoria de acciones") y "Cerrar el navegador de golpe", y verificar que no hay errores ni pérdidas de más de 30 s
- [ ] 14.4 Medir el arranque (menos de 3 s hasta poder jugar) y verificar el escenario "Primer momento jugable"
- [ ] 14.5 Comprobar que cada escenario de los 11 specs tiene al menos una prueba con su nombre `[capacidad] escenario` (script de trazabilidad) y que la cobertura de `domain` y `sim` es de al menos 85%
- [ ] 14.6 Hacer la prueba de juego final con Santi y la revisión de la referencia visual ("Revisión visual"), y registrar los hallazgos en el CHANGELOG y etiquetar `v2.0.0`

## Workflow follow-up

- Al cerrar cada hito (después de los incrementos 4, 6, 9 y 14), ejecutar `/opsx-sync` para consolidar los specs implementados en `openspec/specs/`.
- Cuando todos los incrementos estén hechos y revisados, ejecutar `/opsx-archive` para archivar `fase-2-mundo-vivo` y verificar el resultado archivado.
