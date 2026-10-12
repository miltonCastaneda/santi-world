# Spec Delta: lobos

## Purpose

Define a los lobos como la amenaza de día para la granja: viven en su montaña boscosa, cazan animales de granja cuando pueden llegar a ellos y se pueden domesticar con el Collar para convertirse en amigos del niño.

## ADDED Requirements

### Requirement: Montaña de lobos
Cada mundo nuevo SHALL tener una montaña boscosa (con al menos 20 árboles) donde viven entre 4 y 6 lobos salvajes. Los lobos salvajes deambulan y descansan cerca de su montaña cuando no están cazando.

#### Scenario: Lobos en su montaña
- **WHEN** se crea un mundo nuevo
- **THEN** hay entre 4 y 6 lobos salvajes a 20 bloques o menos del centro de la montaña de lobos

### Requirement: Caza de animales de granja
Un lobo salvaje SHALL intentar cazar un animal de granja como máximo una vez por día del juego. Solo puede alcanzarlo caminando, respetando los bloques (no atraviesa, no rompe y no salta más de 1 bloque). Si lo alcanza, el animal hace "poof" (sin violencia gráfica) y queda pendiente de reaparecer al amanecer.

#### Scenario: Granja abierta
- **GIVEN** una granja con un hueco en la cerca y un lobo salvaje que salió a cazar
- **WHEN** el lobo encuentra un camino hasta un animal
- **THEN** llega hasta él y el animal hace "poof"

#### Scenario: Granja bien cerrada
- **GIVEN** una granja totalmente cercada, sin huecos y con cercas de 1 bloque que los lobos no pueden saltar
- **WHEN** pasa 1 día del juego completo con todos los lobos salvajes buscando caza
- **THEN** ningún animal de dentro de la granja desaparece por un lobo

#### Scenario: El niño cierra el hueco a tiempo
- **GIVEN** un lobo se dirige a la granja por un hueco
- **WHEN** el niño coloca un bloque que cierra el hueco antes de que el lobo entre
- **THEN** el lobo recalcula su camino en 2 s o menos y, al no encontrar ninguno, desiste y vuelve a su montaña

#### Scenario: Lobos y el niño
- **GIVEN** un lobo salvaje
- **WHEN** el personaje del niño está a 2 bloques o menos de él
- **THEN** el lobo no le hace daño (solo caza animales de granja)

### Requirement: Domesticar con el Collar
Un clic con el Collar sobre un lobo salvaje a 3 bloques o menos SHALL domesticarlo de inmediato. El lobo muestra un efecto de corazones, aparece un collar visible en su cuello y pasa a ser amigo de forma permanente (se conserva al guardar).

#### Scenario: Domesticar
- **GIVEN** el Collar está activo y hay un lobo salvaje a 2 bloques
- **WHEN** el niño hace clic sobre el lobo
- **THEN** en 500 ms o menos aparecen corazones, el lobo muestra un collar y deja de ser salvaje

#### Scenario: Collar sobre un animal que no es lobo
- **WHEN** el niño usa el Collar sobre una oveja
- **THEN** no ocurre nada dañino y suena un "boing" suave

#### Scenario: Lobo amigo persistente
- **GIVEN** un lobo domesticado
- **WHEN** se guarda y se vuelve a abrir el mundo
- **THEN** el lobo sigue siendo amigo y conserva su collar

### Requirement: Comportamiento del lobo amigo
Un lobo amigo SHALL NOT cazar animales de granja. Como máximo 3 lobos amigos siguen al niño a una distancia de 2 a 5 bloques; si se alejan más de 30 bloques, reaparecen junto a él. Los demás lobos amigos se quedan cuidando la granja. Cualquier lobo amigo ahuyenta a los zombis que toca (el zombi hace "poof").

#### Scenario: Seguir al niño
- **GIVEN** 1 lobo amigo
- **WHEN** el niño camina 40 bloques
- **THEN** el lobo lo sigue y termina a 5 bloques o menos de él

#### Scenario: Cuarto lobo amigo
- **GIVEN** 3 lobos amigos ya siguen al niño
- **WHEN** el niño domestica un cuarto lobo
- **THEN** el cuarto lobo va a la granja y se queda cuidándola

#### Scenario: Proteger de zombis
- **GIVEN** un lobo amigo cerca de la granja y un zombi a 6 bloques o menos
- **WHEN** el lobo alcanza al zombi
- **THEN** el zombi hace "poof"

### Requirement: Golpear a un lobo salvaje sin el Collar
Un golpe con cualquier herramienta que no sea el Collar SHALL dejar al lobo salvaje: retrocede con un parpadeo cartoon. Con 2 golpes de espada hace "poof" y queda pendiente de reaparecer en su montaña al amanecer. Un lobo amigo SHALL NOT recibir daño de las herramientas del niño.

#### Scenario: Golpe con la espada
- **GIVEN** un lobo salvaje
- **WHEN** el niño lo golpea 1 vez con la Espada
- **THEN** el lobo retrocede y sigue siendo salvaje

#### Scenario: Dos golpes
- **GIVEN** un lobo salvaje que ya recibió 1 golpe
- **WHEN** recibe un segundo golpe de Espada
- **THEN** hace "poof" y reaparece en su montaña al siguiente amanecer

#### Scenario: Golpe accidental a un lobo amigo
- **WHEN** el niño golpea con la Espada a un lobo amigo
- **THEN** el lobo no sufre daño, salta contento y sigue siendo amigo
