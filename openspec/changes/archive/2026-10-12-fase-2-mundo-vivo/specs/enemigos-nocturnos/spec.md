# Spec Delta: enemigos-nocturnos

## Purpose

Define los enemigos que aparecen de noche (zombis y dragón): cómo aparecen, cómo persiguen respetando lo construido, cuántos golpes o disparos los derrotan y cómo se retiran, siempre con un tono cartoon y suave para un niño de 4 años.

## ADDED Requirements

### Requirement: Aparición de zombis de noche
Durante la noche (salvo con la noche tranquila activa) SHALL aparecer zombis de forma gradual, con un máximo de 8 a la vez. Aparecen a más de 24 bloques del personaje, nunca dentro de una zona cerrada y techada ni sobre un bloque iluminado por una antorcha a 4 bloques o menos.

#### Scenario: Límite de zombis
- **GIVEN** es de noche
- **WHEN** transcurre la noche completa
- **THEN** nunca hay más de 8 zombis a la vez

#### Scenario: Distancia de aparición
- **WHEN** aparece un zombi
- **THEN** está a más de 24 bloques del personaje

#### Scenario: Refugio iluminado
- **GIVEN** una casa cerrada y techada, con una antorcha dentro
- **WHEN** transcurre la noche
- **THEN** no aparece ningún zombi dentro de la casa

### Requirement: Zombis persiguen respetando los bloques
Los zombis SHALL perseguir al animal o al personaje alcanzable más cercano (a 24 bloques o menos) caminando por caminos válidos. SHALL NOT atravesar, romper ni saltar más de 1 bloque, y se mueven al 60% de la velocidad del personaje. Si el niño construye, recalculan su camino.

#### Scenario: Muro protector
- **GIVEN** un corral cerrado con muros de 2 bloques de alto y techo
- **WHEN** un zombi intenta llegar a un animal de dentro durante 5 minutos
- **THEN** el zombi no entra y el animal no desaparece

#### Scenario: Recalcular camino
- **GIVEN** un zombi que camina hacia el personaje
- **WHEN** el niño coloca bloques que bloquean ese camino
- **THEN** en 2 s o menos el zombi busca otro camino o se queda deambulando si no lo hay

#### Scenario: Velocidad
- **GIVEN** un zombi que persigue al personaje
- **WHEN** el personaje camina alejándose en línea recta durante 10 s
- **THEN** la distancia entre ambos aumenta

### Requirement: Ataques de los zombis
Si un zombi toca a un animal, el animal SHALL hacer "poof" y quedar pendiente de reaparecer al amanecer. Si toca al personaje, el personaje SHALL perder 1 corazón y ser empujado suavemente (ver `personaje-y-herramientas`). No hay sangre ni sonidos de dolor.

#### Scenario: Zombi alcanza a un animal
- **WHEN** un zombi toca a una gallina
- **THEN** la gallina hace "poof" y queda registrada para reaparecer al amanecer

### Requirement: Zombi derrotado de un golpe
Un golpe de Espada, Pico o Mano, o una flecha, SHALL derrotar a un zombi con un único impacto. El zombi hace "poof" con estrellas.

#### Scenario: Un golpe
- **GIVEN** un zombi a 2 bloques del personaje
- **WHEN** el niño lo golpea 1 vez con la Espada
- **THEN** el zombi hace "poof" en 300 ms o menos

### Requirement: Retirada de zombis al amanecer
Al amanecer, todos los zombis SHALL desaparecer con un efecto de destellos en 5 s o menos. Después, los animales que desaparecieron durante la noche reaparecen, y solo esos.

#### Scenario: Amanecer
- **GIVEN** 5 zombis activos y 2 animales desaparecidos
- **WHEN** amanece
- **THEN** en 5 s o menos no queda ningún zombi
- **AND** reaparecen exactamente 2 animales, mientras los vivos se quedan donde estaban

### Requirement: Dragón nocturno
Una vez por noche (salvo con la noche tranquila activa), a mitad de la noche, SHALL aparecer un dragón que recorre el mundo volando. Quema y elimina 2 árboles naturales y, si hay alguno libre, se come 1 cerdo-gallina. SHALL NOT dañar bloques colocados por el niño ni al personaje.

#### Scenario: Paso del dragón
- **GIVEN** es de noche, sin la noche tranquila activa, y hay 3 cerdo-gallinas libres
- **WHEN** llega la mitad de la noche
- **THEN** aparece 1 dragón, quema exactamente 2 árboles naturales y se come 1 cerdo-gallina

#### Scenario: Respeta las construcciones
- **GIVEN** el niño construyó una casa de madera
- **WHEN** el dragón pasa
- **THEN** ningún bloque colocado por el niño cambia

#### Scenario: Los árboles rebrotan
- **GIVEN** el dragón quemó 2 árboles
- **WHEN** amanece
- **THEN** esos 2 árboles vuelven a estar en su lugar

#### Scenario: Sin cerdo-gallinas libres
- **GIVEN** no hay ningún cerdo-gallina libre (todos están capturados en el inventario)
- **WHEN** el dragón pasa
- **THEN** no se come ninguno y el inventario no cambia

### Requirement: Derrotar al dragón con 5 disparos
El Arco SHALL disparar una flecha con cada clic, hacia el centro de la vista, con trayectoria balística (gravedad suave) y flechas infinitas. Hay una asistencia de puntería hacia el dragón. Con 5 impactos el dragón hace un "poof" de estrellas y no vuelve esa noche. Si no se lo derrota, se va al amanecer.

#### Scenario: Cinco impactos
- **GIVEN** un dragón que no recibió ningún impacto
- **WHEN** 5 flechas lo alcanzan
- **THEN** el dragón hace "poof" después del quinto impacto, no antes

#### Scenario: Cuatro impactos
- **GIVEN** un dragón con 4 impactos
- **WHEN** termina la noche
- **THEN** el dragón se va volando y la noche siguiente vuelve con 0 impactos

#### Scenario: Física de la flecha
- **WHEN** el niño dispara horizontalmente
- **THEN** la flecha sale a unos 30 bloques/s, cae gradualmente por gravedad y desaparece al chocar con un bloque o a los 3 s de vuelo

#### Scenario: Asistencia de puntería
- **GIVEN** el dragón está a 12° o menos del centro de la vista
- **WHEN** el niño dispara
- **THEN** la flecha se dirige hacia el dragón y lo alcanza si no hay bloques en medio

#### Scenario: Disparos muy rápidos
- **WHEN** el niño hace 20 clics por segundo con el Arco
- **THEN** se disparan como máximo 3 flechas por segundo
