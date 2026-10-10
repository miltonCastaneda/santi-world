# ADR 0005: IA con máquinas de estado finitas por especie, definidas con datos

- **Estado**: Propuesto
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
