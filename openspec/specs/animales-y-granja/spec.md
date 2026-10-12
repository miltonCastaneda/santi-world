# animales-y-granja Specification

## Purpose

Llena el mundo de animales autónomos, animados y con sonido, que viven en una granja cercada, interactúan entre ellos y reaparecen cuando desaparecen, incluido el especial cerdo-gallina que vuela.

## Requirements

### Requirement: Especies de animales
El mundo SHALL incluir ovejas, gallinas, pollos, cabras, patos, vacas y cerdo-gallinas (los lobos están en el spec `lobos`). Cada especie tiene un aspecto de bloques reconocible, al menos las animaciones de idle, caminar y su acción propia, y su sonido característico.

#### Scenario: Población inicial
- **WHEN** se crea un mundo nuevo
- **THEN** la granja contiene al menos 3 ovejas, 2 vacas, 2 cabras, 3 gallinas, 3 pollos y 2 patos (en el estanque o cerca de él)
- **AND** hay 3 cerdo-gallinas libres en el mundo

#### Scenario: Sonido por especie
- **GIVEN** el personaje está a 10 bloques o menos de una vaca
- **WHEN** la vaca emite su sonido
- **THEN** se oye un "muu" con un volumen que disminuye con la distancia y que no se oye a más de 24 bloques

### Requirement: Comportamiento autónomo
Cada animal SHALL actuar solo, alternando comportamientos propios de su especie: deambular, pastar o picotear, descansar, seguir a su grupo y huir de amenazas (lobos salvajes, zombis o un golpe). Los patos nadan y los cerdo-gallinas vuelan. Los comportamientos SHALL ser reproducibles con la misma semilla.

#### Scenario: Animales vivos sin intervención
- **GIVEN** un mundo recién creado
- **WHEN** pasan 60 s sin que el niño haga nada
- **THEN** al menos el 80% de los animales cambiaron de posición o de comportamiento

#### Scenario: Huir de una amenaza
- **GIVEN** una oveja pastando
- **WHEN** un lobo salvaje o un zombi se acerca a 6 bloques o menos
- **THEN** en 1 s o menos la oveja empieza a alejarse de la amenaza más rápido que su paso normal

#### Scenario: Pollos siguen a gallinas
- **GIVEN** un pollo y una gallina a 8 bloques o menos
- **WHEN** la gallina se desplaza
- **THEN** el pollo tiende a mantenerse a 4 bloques o menos de ella

#### Scenario: Determinismo
- **GIVEN** dos simulaciones sin interfaz con la misma semilla y las mismas acciones del jugador
- **WHEN** avanzan 10 minutos de juego
- **THEN** las posiciones y estados de todos los animales son idénticos

### Requirement: Físicas de los animales
Los animales SHALL tener gravedad y colisionar con los bloques sólidos. SHALL NOT atravesar bloques, caer fuera del mundo ni subir obstáculos de más de 1 bloque. Los patos flotan en el agua, y los cerdo-gallinas pueden volar por encima de los obstáculos.

#### Scenario: Cerca de 1 bloque
- **GIVEN** una vaca encerrada por una cerca
- **WHEN** pasan 10 minutos
- **THEN** la vaca sigue dentro del cercado

#### Scenario: Bloque colocado sobre un animal
- **WHEN** el niño intenta colocar un bloque en la celda que ocupa un animal
- **THEN** el bloque no se coloca y el animal no queda atrapado dentro de un bloque

### Requirement: Granja y escapes
Los animales domésticos SHALL tener la granja como su hogar y permanecer dentro del cercado mientras esté cerrado. Si el niño abre un hueco en la cerca, los animales SHALL poder salir por él y deambular fuera. Si el cercado se vuelve a cerrar, los animales que sigan dentro permanecen dentro.

#### Scenario: Escapar por un hueco
- **GIVEN** la granja con 15 animales
- **WHEN** el niño rompe 2 bloques de cerca contiguos y pasan 5 minutos
- **THEN** al menos 1 animal salió del cercado por el hueco

#### Scenario: Volver al hogar
- **GIVEN** un animal doméstico fuera del cercado y la cerca con un hueco abierto
- **WHEN** pasa 1 día del juego
- **THEN** el animal tiende a volver hacia la granja (su hogar) cuando descansa

### Requirement: Reaparición al amanecer
Los animales que desaparecieron (por un golpe, por un lobo, por un zombi, por el dragón o por haber sido capturados) SHALL reaparecer en su lugar de origen al siguiente amanecer. Los animales vivos SHALL NOT duplicarse. La población de cada especie vuelve como máximo a su número inicial.

#### Scenario: Solo reaparecen los que faltan
- **GIVEN** una granja con 3 ovejas, de las cuales 1 desapareció durante la noche
- **WHEN** amanece
- **THEN** hay exactamente 3 ovejas: las 2 vivas en el lugar donde estaban y 1 nueva en la granja

#### Scenario: La reaparición sobrevive a recargar
- **GIVEN** 2 animales desaparecieron y el niño cerró el juego antes del amanecer
- **WHEN** se vuelve a abrir y llega el amanecer
- **THEN** reaparecen exactamente esos 2 animales

### Requirement: Cerdo-gallina volador
El cerdo-gallina SHALL alternar entre caminar y volar en arcos cortos, hasta 8 bloques por encima del suelo. Un clic sobre él, a 4 bloques o menos y con cualquier herramienta, SHALL capturarlo: hace un "poof" y pasa al inventario. Nunca hay más de 3 cerdo-gallinas libres a la vez.

#### Scenario: Captura con un clic
- **GIVEN** un cerdo-gallina a 3 bloques
- **WHEN** el niño hace clic sobre él
- **THEN** el cerdo-gallina desaparece con un "poof" y el contador de cerdo-gallinas del inventario sube en 1

#### Scenario: Captura en vuelo
- **GIVEN** un cerdo-gallina volando a 3 bloques de distancia
- **WHEN** el niño hace clic sobre él
- **THEN** se captura igual que en el suelo

#### Scenario: Soltar un cerdo-gallina
- **GIVEN** el niño tiene 1 cerdo-gallina en el inventario y lo selecciona
- **WHEN** hace clic en el suelo
- **THEN** aparece un cerdo-gallina en ese lugar y el contador baja en 1, siempre que no haya ya 3 libres

#### Scenario: Límite de libres
- **GIVEN** hay 3 cerdo-gallinas libres
- **WHEN** el niño intenta soltar otro
- **THEN** no se suelta y suena un aviso suave
