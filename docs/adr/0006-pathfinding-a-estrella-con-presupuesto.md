# ADR 0006: Pathfinding A* sobre la rejilla de vóxeles con presupuesto e invalidación por versión de chunk

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `lobos` y `enemigos-nocturnos`)

## Contexto

Los zombis y los lobos tienen que respetar lo que el niño construye: no atraviesan, no rompen y no saltan más de 1 bloque. Tienen que recalcular su camino en 2 s o menos cuando el mundo cambia. La "granja cerrada" tiene que ser realmente segura. El mundo es editable en tiempo real.

## Decisión

- **A\*** sobre celdas transitables (bloque sólido debajo y espacio libre según la altura de la entidad). Se puede subir 1 bloque y caer hasta 3. Las **cercas** tienen una altura de colisión de 1,5, así que no se pueden saltar. La heurística es la distancia octil más la diferencia de altura.
- **Presupuesto**: como máximo 2000 nodos por búsqueda y 3 búsquedas por tick, en una cola con prioridad (zombis cerca del jugador, luego lobos cazando, luego el deambular).
- Cada ruta guarda las `version` de los chunks que atraviesa, y el evento `BlockChanged` invalida las rutas afectadas.
- Si no hay camino: deambular (zombi) o desistir y volver a la guarida (lobo).

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| A* con presupuesto (elegido) | Exacto, determinista y fácil de probar; suficiente para unas 15 entidades que buscan camino | Coste variable; necesita presupuesto y cola |
| Flow fields hacia el jugador | Un solo cálculo para muchos zombis | Hay varios objetivos (animales y jugador); recalcular el campo en cada edición es caro |
| Navmesh precalculado | Muy rápido | El mundo es editable: habría que reconstruirlo en cada cambio |
| Movimiento directo con colisión, sin pathfinding | Trivial | Los enemigos se atascan contra los muros y no buscan huecos: no cumple el spec |
| Librería externa (pathfinding.js, etc.) | Ya escrita | Es para rejillas 2D, no para vóxeles con alturas |

## Consecuencias

- Positivas: comportamiento correcto ante las construcciones, pruebas con mundos pequeños y una carga de CPU acotada.
- Negativas: con muchas búsquedas en cola, algunas entidades esperan unos ticks (aceptable dentro de los 2 s).
- Reversión: está aislado en `sim/systems/pathfinding`. Se puede agregar una caché jerárquica (por chunks) si hiciera falta.
