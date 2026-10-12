# recursos-e-inventario Specification

## Purpose

Define los recursos que el niño puede recolectar (diamantes, carne y cerdo-gallinas) y un inventario simple y visual para ver cuántos tiene, sin necesidad de leer ni contar números grandes.

## Requirements

### Requirement: Diamantes en la montaña de rocas
Cada mundo nuevo SHALL tener una montaña de roca con al menos 10 bloques de mineral de diamante visibles desde fuera o a 2 bloques o menos de la superficie. Un clic con el Pico sobre un bloque de diamante SHALL convertirlo en piedra y sumar 1 diamante al inventario, con un efecto de brillo.

#### Scenario: Minar un diamante
- **GIVEN** el Pico activo y un bloque de diamante a 3 bloques
- **WHEN** el niño hace clic sobre él
- **THEN** en 300 ms o menos el bloque se vuelve piedra, aparece un brillo y el contador de diamantes sube en 1

#### Scenario: Diamante con otra herramienta
- **WHEN** el niño hace clic sobre un diamante con la Espada
- **THEN** el bloque no cambia y no se suma ningún diamante

#### Scenario: Diamantes que vuelven
- **GIVEN** el niño minó todos los diamantes de la montaña
- **WHEN** pasan 3 días del juego
- **THEN** reaparecen diamantes en la montaña, en bloques de piedra que no colocó el niño

### Requirement: Carne de los animales de granja
Un golpe de Espada a un animal de granja (oveja, vaca, cabra, gallina, pollo o pato) SHALL hacerlo desaparecer con un "poof" y dejar en su lugar un ícono cartoon de carne flotante, sin sangre. Ese animal queda pendiente de reaparecer al amanecer. El cerdo-gallina SHALL NOT convertirse en carne.

#### Scenario: Golpear una vaca
- **GIVEN** la Espada activa y una vaca a 2 bloques
- **WHEN** el niño la golpea 1 vez
- **THEN** la vaca hace "poof" y aparece 1 carne flotando en su lugar

#### Scenario: Recoger carne
- **GIVEN** una carne flotando
- **WHEN** el personaje camina a 1,5 bloques o menos de ella, o el niño hace clic sobre ella
- **THEN** la carne desaparece y el contador de carne sube en 1

#### Scenario: Carne no recogida
- **GIVEN** una carne flotando sin recoger
- **WHEN** pasan 5 minutos
- **THEN** la carne sigue ahí (no desaparece sola) y se conserva al guardar

#### Scenario: Golpear con el Pico o la Mano
- **WHEN** el niño golpea un animal de granja con el Pico o la Mano
- **THEN** el animal solo retrocede con un "boing" y no se convierte en carne

### Requirement: Inventario visual
El juego SHALL mostrar un inventario con íconos grandes para diamantes, carne y cerdo-gallinas, con un contador junto a cada uno. Para cantidades de 1 a 5 el contador muestra además puntos visuales. El inventario se abre con E o con un ícono de mochila, y se conserva con el mundo.

#### Scenario: Abrir el inventario
- **WHEN** el niño pulsa E o el ícono de mochila
- **THEN** en 200 ms o menos se muestra el inventario con los 3 recursos y sus cantidades

#### Scenario: Persistencia del inventario
- **GIVEN** el inventario tiene 4 diamantes y 2 carnes
- **WHEN** se cierra el juego y se vuelve a abrir el mismo mundo
- **THEN** el inventario sigue teniendo 4 diamantes y 2 carnes

#### Scenario: Inventario independiente por mundo
- **GIVEN** el mundo "A" tiene 4 diamantes y el mundo "B" tiene 0
- **WHEN** el niño cambia de "A" a "B"
- **THEN** el inventario muestra 0 diamantes

#### Scenario: El inventario no se pierde
- **GIVEN** el personaje tiene 3 diamantes
- **WHEN** pierde todos sus corazones y reaparece
- **THEN** sigue teniendo 3 diamantes

### Requirement: Bloques infinitos para construir
Los bloques de construcción de la barra (hierba, tierra, piedra, madera, tablones, hojas, cerca, antorcha, agua y colores) SHALL ser ilimitados y SHALL NOT consumir el inventario de recursos.

#### Scenario: Construir sin límite
- **WHEN** el niño coloca 500 bloques de piedra
- **THEN** puede seguir colocando piedra y el inventario de recursos no cambia
