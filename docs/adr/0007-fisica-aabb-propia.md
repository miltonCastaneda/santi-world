# ADR 0007: Física propia de AABB contra vóxeles y proyectiles balísticos

- **Estado**: Aceptado (incremento 5; los proyectiles se implementan con el Arco)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `personaje-y-herramientas`, `animales-y-granja` y `enemigos-nocturnos`)

## Contexto

El personaje, los animales y los enemigos necesitan gravedad, colisión con bloques, subida de escalones y no atravesar nada. El Arco necesita flechas con gravedad e impacto contra bloques y entidades (el dragón). Todo debe ser determinista y ejecutarse sin render.

## Decisión

- Colisión **AABB contra vóxeles con barrido por eje** (Y, luego X y luego Z), gravedad de 25 bloques/s², velocidad terminal de 30 bloques/s y subida de escalones de 1 bloque.
- Separación suave entre entidades mediante el índice espacial (sin cuerpos rígidos).
- **Proyectiles**: integración a 20 Hz con 3 subpasos, travesía DDA contra vóxeles y un rayo contra AABB contra entidades. Gravedad de 10 bloques/s², vida de 3 s y asistencia de puntería en un cono de 12°.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| AABB propia (elegida) | El estándar de los juegos de vóxeles; determinista; unas pocas centenas de líneas; sin dependencias | Hay que escribir y probar los casos límite |
| Rapier (WASM) | Robusta y rápida | Unos 400 KB de WASM; hay que convertir el mundo de vóxeles a colliders y mantenerlos sincronizados al editar; excesiva |
| cannon-es | En JS | Mismo problema de sincronización con los vóxeles; determinismo no garantizado; mantenimiento irregular |
| Three.js `Raycaster` para el picking | Ya se usa | Depende del render (rompe la pureza del dominio) y es lento contra geometría grande |

## Consecuencias

- Positivas: física predecible, pruebas numéricas simples y picking dentro del dominio.
- Negativas: no hay física "realista" (empujes ni apilado), lo cual no hace falta.
- Reversión: las interfaces `collideAabb` y `raycastVoxels` están aisladas.

## Implementación (incremento 5)

- `src/domain/physics/collide.ts`: `moveBody(body, dt, query)` integra la gravedad (25), limita a la velocidad terminal (30) y barre Y, X y Z contra las cajas de las celdas. La interfaz quedó como `moveBody` en lugar de `collideAabb`.
- `CollisionQuery(x, y, z)` devuelve la altura de colisión de la celda: 1 para un bloque, 1,5 para una cerca (ocupa también media celda de arriba), 0 para aire y agua, e `Infinity` fuera del mundo en horizontal (el borde invisible). La implementa `Game.collision`.
- El escalón de 1 bloque se sube **saltando** (velocidad de salto 8,2: unos 1,3 bloques de altura, que alcanzan para un bloque pero no para una cerca). No hay subida automática: para un niño de 4 años saltar es parte del juego y evita subir sin querer a los muros que construye.
- Un cuerpo atascado (alguien le puso un bloque encima) puede salir caminando: el barrido ignora las celdas con las que ya se superponía.
- El jugador mide 0,6 x 1,8 (ojos a 1,6) y camina a 4,3 bloques/s; el alcance de 6 bloques se mide desde los ojos al punto más cercano de la celda.
- Pruebas: `tests/unit/domain/physics.test.ts` (muro, escalón, cerca, hueco, borde, velocidad terminal y atascado) y `tests/unit/sim/player.test.ts`.
- Pendiente: proyectiles del Arco (incremento del dragón) y separación entre entidades (incremento de animales).
