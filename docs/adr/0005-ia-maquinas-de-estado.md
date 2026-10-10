# ADR 0005: IA con máquinas de estado finitas por especie, definidas con datos

- **Estado**: Aceptado (incremento 6: animales de granja)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `animales-y-granja`, `lobos` y `enemigos-nocturnos`)

## Contexto

Hay 9 tipos de criaturas con comportamientos autónomos (deambular, pastar, huir, seguir, cazar, volar, perseguir, cuidar la granja), además de un dragón con una ruta guionada. Tienen que ser deterministas, fáciles de probar y baratos (unas 60 entidades en GPU y CPU modestas).

## Decisión

Cada especie declara en **datos** (`domain/entities/species/*.ts`):

- Sus estados: Idle, Wander, Graze, Rest, Flee, FollowLeader, Swim, Fly, Hunt, Chase, Follow, Guard, ReturnHome, etc.
- Sus transiciones, como condiciones sobre la percepción (amenaza a N bloques o menos, fase del día, hambre o cooldown, distancia al hogar o al jugador).
- Sus velocidades, radios y sonidos.

Un intérprete genérico ejecuta las máquinas de estado. Cada entidad "piensa" cada 4 ticks, escalonado por id. El dragón usa un **director guionado** (una secuencia de pasos) en lugar de una máquina de estados libre.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Máquinas de estado por datos (elegida) | Simples, deterministas, se pueden probar transición por transición y se leen como una tabla | Pueden crecer en estados si el comportamiento se complica |
| Behavior trees | Componibles y expresivos | Más infraestructura y depuración más difícil; excesivo para el comportamiento requerido |
| Utility AI | Comportamiento más "natural" | Difícil de ajustar y de probar con resultados exactos |
| Steering puro (boids) | Movimiento orgánico | No resuelve las decisiones (cazar o huir) por sí solo; se puede usar como complemento del movimiento |

## Consecuencias

- Positivas: agregar una especie consiste sobre todo en declarar datos; las pruebas de cada transición se hacen con RNG con semilla y `FakeClock`.
- Negativas: los comportamientos compuestos (por ejemplo, "cuidar la granja persiguiendo zombis") necesitan estados explícitos.
- Reversión: el intérprete se puede cambiar por behavior trees por especie sin tocar la física ni el render.

## Implementación (incremento 6)

- `src/domain/entities/fsm.ts`: una máquina es `{ initial, interrupts, states }`. Cada estado tiene una acción (`idle`, `wander`, `graze`, `rest`, `flee`, `returnHome`, `follow`, `swim`), una duración sorteada entre `[min, max]` ms y transiciones `next` en orden; una transición se toma si se cumplen **todas** sus condiciones (`threatNear`, `timeUp`, `arrived`, `chance`, `outsideHome`, `leaderAway`, `leaderNear`, `inWater`, `onLand`). Las `interrupts` se evalúan primero y no reentran si ya se está en ese estado. Todo el azar sale del `Rng` con semilla del sistema de animales.
- `src/domain/entities/species.ts`: oveja, vaca y cabra comparten `grazer()` (Idle, Wander, Graze, Rest, Flee y ReturnHome), la gallina picotea, el pollito sigue a la gallina más cercana (FollowLeader) y el pato nada (Swim). Todas huyen de una amenaza a 6 bloques o menos.
- `src/sim/systems/animals.ts`: cada animal piensa cada 4 ticks, escalonado por su orden de creación (`(tick + seq) % 4`); el movimiento (dirección hacia el siguiente punto del camino, separación suave entre animales, física AABB y flotación) corre en cada tick. Los "escapes" no son un estado: el deambular elige destinos a 30 bloques o menos del centro de la granja, y con la cerca cerrada el A* no encuentra camino hacia afuera.
- `src/domain/entities/entityStore.ts`: entidades planas con componentes opcionales y un índice espacial de celdas de 8 bloques; la iteración sigue el orden de creación (determinismo).
- Pruebas: transiciones genéricas con RNG con semilla (`tests/unit/domain/fsm.test.ts`) e integración sin interfaz de 10 minutos simulados (`tests/integration/sim/animals.test.ts`): población inicial, huida en 1 s o menos, pollitos cerca de la gallina, cerca segura, escape por un hueco y determinismo.

## Implementación (incremento 8)

- El zombi usa el mismo intérprete: `ZOMBIE_MACHINE` en `src/domain/entities/zombie.ts` tiene los estados `seek` (buscar, 300 a 600 ms), `chase` (perseguir, 2 s y vuelve a entrar para recalcular), `bump` (quieto 0,9 a 1,2 s tras un contacto) y `wander` (pasear cuando no hay objetivo alcanzable). Se agregaron las acciones `seek`, `chase` y `bump` y las condiciones `hasTarget` y `noTarget`.
- La percepción (`hasTarget`) y las reglas que no son de la máquina viven en `src/sim/systems/zombies.ts` (`ZombieSystem`): elegir el objetivo más cercano a 24 bloques o menos que no esté marcado como inalcanzable, el contacto y la separación entre zombis. El contacto pasa a `bump` directamente (como una interrupción), porque ocurre en el tick de movimiento y no cada 4.
- El azar del zombi sale de su propio `Rng` con semilla (`seed:zombies`), así que agregar zombis no cambia el comportamiento de los animales.
