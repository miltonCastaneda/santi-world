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
- Varios mundos guardados en IndexedDB con Dexie (incremento 3), detrás del puerto `WorldRepository` con implementaciones Dexie y en memoria que pasan la misma suite de contrato. Usuario por defecto con UUID y marcas `version` y `updatedAt` en el mundo, el estado y los chunks.
- Solo se guardan los chunks modificados; el resto se regenera con la semilla.
- Autoguardado cada 30 s, al ocultar o cerrar la pestaña y al perder el foco, de vuelo único. `navigator.storage.persist()` en el primer guardado.
- Panel "Mis Mundos" con tarjetas grandes y miniaturas WebP de 320x180, y botón "Crear nuevo mundo" que guarda primero (si el guardado falla no reemplaza nada y muestra un ícono de aviso).
- Importación del mundo v1 como "Mi primer mundo" (pradera plana con la construcción en el centro); la clave original se conserva como `minecraf-de-santi-world-v2-backup`.
- Migraciones de documentos (`migrations[n]` puras) y esquema versionado de IndexedDB.
- Exportar e importar un mundo a un archivo, papelera y purga en el repositorio.
- Vista de padres en `/padres/` (incremento 4), una página aparte (Vite multipágina, redirect de `/padres`) sin ningún enlace ni atajo desde el juego del niño: histórico con miniaturas, visor 3D de solo lectura, borrado con confirmación, papelera con restauración y purga a los 30 días, configuración por mundo (día y noche de 2 a 30 min, noche tranquila y volúmenes), exportar e importar, espacio usado y PIN opcional (PBKDF2, bloqueo de 60 s tras 5 fallos).
- `BroadcastChannel('santi')`: la vista de padres se actualiza cuando el juego guarda, y el juego aplica en caliente la configuración que cambian los padres.
- `WorldRepository.updateSettings` y `readOnly()` (el visor no tiene métodos que escriban). Guardar desde el juego conserva la configuración y la papelera que pusieron los padres.
- Personaje en tercera persona (incremento 5): modelo de cajas con la "S" en la camisa y animaciones procedurales idle, caminar, saltar y acción (ADR-0010). Camina con WASD o flechas (4,3 bloques/s, relativo a la cámara) y salta con Espacio.
- Física AABB propia con barrido por eje, gravedad, salto de 1 bloque, cercas de 1,5 y borde invisible del mundo (ADR-0007).
- Cámara con brazo de resorte: sigue al personaje por detrás, nunca queda dentro de un bloque, gira arrastrando con el botón derecho y vuelve detrás a los 3 s.
- Barra vertical de herramientas (Mano, Pico, Espada, Arco y Collar), barra de bloques con atajos 1 a 9 y rueda, corazones (5, invulnerabilidad de 1 s, uno nuevo cada 20 s, "poof" y reaparición en la granja sin perder nada) y ayuda de controles con pictogramas. Todos los botones miden 64 px o más.
- Alcance de 6 bloques con un indicador "muy lejos"; no se puede poner un bloque donde está el personaje.
- `AudioService` con buses master (tope de 0,8), music, sfx y ambient, botón de silencio, reanudación con la primera interacción y como máximo 3 voces de animales (ADR-0009). Sonidos de pasos, bloques, salto, golpe y UI generados por código (CC0, `docs/assets.md`).
- Navegador a prueba de niños: sin menú contextual, sin zoom (Ctrl + rueda, Ctrl + "+"), sin desplazar ni seleccionar texto, sin atajos de recargar, buscar o imprimir, y se sueltan las teclas al perder el foco.
- El estado guardado incluye la posición, el rumbo y los corazones del personaje, y la herramienta elegida.
- Animales de granja (incremento 6): 3 ovejas, 2 vacas, 2 cabras, 3 gallinas y 3 pollitos en la granja, y 2 patos en el estanque, con spawn slots deterministas por semilla. Deambulan, pastan, descansan, huyen de una amenaza a 6 bloques o menos, vuelven a casa, los pollitos siguen a la gallina y los patos nadan y flotan.
- Máquinas de estado por datos con un intérprete genérico que piensa cada 4 ticks (ADR-0005) y pathfinding A* con presupuesto de 2000 nodos y 3 búsquedas por tick, cola por prioridad e invalidación por versión de chunk (ADR-0006). La cerca no se salta: con un hueco, alguno se escapa.
- `EntityRenderer`: animales de cajas con un `InstancedMesh` por especie y parte, animaciones procedurales, sombra plana, "poof" y sin dibujar a más de 64 bloques (19 draw calls con los 15 animales). Luz direccional sin sombras para los modelos.
- Voces de animales sintetizadas (CC0): `baa`, `moo`, `meh`, `cluck`, `peep` y `quack`, posicionales hasta 24 bloques y como máximo 3 a la vez.
- Las entidades se guardan con el mundo (posición, rumbo y estado) y se recargan igual. Los mundos anteriores reciben su población una sola vez al abrirse.
- Overlay `F3` y `npm run perf` con entidades dibujadas, sus draw calls (presupuesto de 60) y los nodos del A*.

### Cambiado
- "Empezar de nuevo" se reemplaza por "Crear nuevo mundo": ningún botón del niño borra un mundo.
- El mundo de 32x32 se reemplaza por el mundo generado (en el incremento 2 no se guardaba; desde el 3 se guarda en IndexedDB).
- ADR-0002 pasa a "Aceptado".
- ADR-0008 y ADR-0012 pasan a "Aceptado".
- Sin sombras dinámicas en el terreno (desaparece el bug de sombras recortadas); `near` 0,1 y `far` 250.
- ADR-0003 pasa a "Aceptado", con los ajustes de ADR-0013.
- El código se reorganizó en capas `core`, `domain`, `sim`, `persistence`, `render`, `input`, `ui`, `testing` y `apps` sin cambiar el comportamiento del juego. El punto de entrada ahora es `src/apps/game/main.ts`.
- La selección del bloque apuntado usa un DDA de vóxeles del dominio en lugar del raycast de Three.js.
- ADR-0001 y ADR-0004 pasan a "Aceptado".
- El juego ya no usa la cámara orbital (queda solo en el visor de padres): poner es la Mano y romper es el Pico, con clic izquierdo; el botón derecho gira la cámara. Los botones de "poner" y "quitar" desaparecen.
- El HUD sigue la referencia visual: corazones arriba a la izquierda, botones grandes de íconos arriba a la derecha (deshacer, Mis Mundos, nuevo mundo, silencio y pantalla completa) y herramientas a la derecha.
- ADR-0007, ADR-0009 y ADR-0010 pasan a "Aceptado".
- `SCHEMA_VERSION` pasa a 2 (migración de estado: `animalsSpawned`). No se puede poner un bloque donde hay un animal.
- ADR-0005 y ADR-0006 pasan a "Aceptado".

## [1.0.0] - 2026-10-10

### Agregado
- Sandbox de vóxeles local de 32x32x12: poner y quitar bloques, 8 tipos de bloque, deshacer, empezar de nuevo y pantalla completa.
- Mundo guardado en `localStorage` (`minecraf-de-santi-world-v2`).
