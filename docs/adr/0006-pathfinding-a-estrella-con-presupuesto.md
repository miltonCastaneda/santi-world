# ADR 0006: Pathfinding A* sobre la rejilla de vóxeles con presupuesto e invalidación por versión de chunk

- **Estado**: Aceptado (incremento 6: animales de granja)
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

## Implementación (incremento 6)

- `src/sim/systems/pathfinding.ts`: A* en 8 direcciones con montículo binario. Una celda es transitable si la de abajo es sólida y de altura 1 (una cerca de 1,5 no sirve de suelo ni se salta) y hay espacio libre para la altura de la entidad; los que nadan pueden estar sobre la superficie del agua. Se sube 1 bloque y se cae hasta 3 (`MAX_DROP`); las diagonales no cortan esquinas.
- La búsqueda se limita a una región del rectángulo entre el origen y el destino más un margen de 20 bloques, y a `MAX_NODES = 2000` nodos. Así, un destino encerrado falla rápido y de forma acotada.
- `PathQueue`: como máximo `SEARCHES_PER_TICK = 3` búsquedas por tick, por prioridad (más baja primero) y en orden de llegada. Pedir otra ruta para la misma entidad reemplaza la anterior. Por ahora la prioridad es: volver a casa y seguir a la gallina 1, deambular y nadar 2; la prioridad 0 queda para los zombis cerca del jugador (incremento 8). Huir no usa A*: el animal se aleja en línea recta de la amenaza y, si choca contra algo, se desliza de costado (tiene que reaccionar en 1 s o menos, sin esperar turno en la cola).
- Cada ruta guarda la versión de los chunks que cruza (`Path.chunks`), y `isPathValid` la compara con `chunkVersion`: colocar o quitar un bloque en uno de esos chunks hace que la entidad pida otra ruta en su siguiente "pensar". En vez de escuchar `BlockChanged`, se consulta la versión que ya lleva el chunk (más simple y sin suscripciones).
- Pruebas unitarias (`tests/unit/sim/pathfinding.test.ts`): escalón de 1, muro de 2, caída de 3 y no de 4, cerca no saltable y hueco de 2, esquinas, invalidación al colocar un bloque, límite de nodos, agua y cola con 3 búsquedas por tick por prioridad.

## Implementación (incremento 8)

- Los zombis comparten la `PathQueue` de los animales: perseguir tiene prioridad 0 (sea el jugador o un animal; la persecución es lo que el niño ve) y pasear, 3, detrás de todo lo de los animales. Con 8 zombis y 15 animales la cola sigue en 3 búsquedas por tick.
- Un objetivo sin camino (por ejemplo, un corral cerrado) queda marcado como inalcanzable 5 s en el zombi, que mientras tanto pasea: así un muro no provoca búsquedas fallidas en cada "pensar". La prueba de integración "Muro protector" confirma con `findPath` que el corral no tiene entrada y que en una noche entera no se pierde ningún animal.
- El zombi recalcula si el objetivo se aleja más de 2 bloques de la meta (como mucho cada 0,5 s) o si su ruta deja de ser válida por un cambio de chunk; la prueba "Recalcular camino" verifica que encuentra el rodeo en 2 s o menos tras levantar un muro.
