# personaje-y-herramientas Specification

## Purpose

Da al niño un personaje visible que camina, salta y choca con el mundo, y una barra simple de herramientas grandes para construir e interactuar con animales, enemigos y bloques.

## Requirements

### Requirement: Personaje visible con animaciones
El juego SHALL mostrar al personaje del niño en tercera persona, con estilo de bloques y una "S" en la camiseta, y SHALL animarlo según su estado: quieto (idle), caminando, saltando y usando una herramienta (acción).

#### Scenario: Animación de caminar
- **WHEN** el niño mantiene pulsada una tecla de movimiento
- **THEN** en 100 ms o menos el personaje se desplaza y reproduce la animación de caminar

#### Scenario: Volver a idle
- **WHEN** el niño suelta todas las teclas de movimiento
- **THEN** en 300 ms o menos el personaje se detiene y reproduce la animación idle

#### Scenario: Animación de acción
- **WHEN** el niño hace clic con una herramienta activa
- **THEN** el personaje reproduce la animación de acción de esa herramienta (golpe, minado, disparo o lanzar el collar)

### Requirement: Movimiento con físicas y colisiones
El personaje SHALL moverse con gravedad y colisionar con los bloques sólidos. SHALL poder subir escalones de 1 bloque saltando y SHALL NOT atravesar bloques ni caer fuera del mundo. Su velocidad de caminar es de unos 4 bloques/s.

#### Scenario: Chocar contra un muro
- **GIVEN** un muro de 2 bloques de alto frente al personaje
- **WHEN** el niño camina hacia el muro durante 3 s
- **THEN** el personaje se detiene frente al muro y no lo atraviesa

#### Scenario: Saltar un escalón
- **GIVEN** un escalón de 1 bloque frente al personaje
- **WHEN** el niño pulsa saltar mientras camina hacia él
- **THEN** el personaje queda encima del escalón

#### Scenario: Caer en un hueco
- **GIVEN** un hueco de 3 bloques de profundidad
- **WHEN** el personaje camina sobre él
- **THEN** cae por gravedad hasta el fondo sin perder corazones

#### Scenario: Borde del mundo
- **WHEN** el personaje camina hacia el borde del mundo
- **THEN** una barrera natural invisible lo detiene y nunca cae al vacío

#### Scenario: Atascado dentro de un bloque
- **GIVEN** el niño coloca un bloque en la celda que ocupa su propio personaje
- **THEN** el bloque no se coloca

### Requirement: Controles de desktop simplificados
El juego SHALL permitir jugar con mouse y teclado:
- WASD o flechas para caminar y espacio para saltar.
- Arrastrar con el botón derecho para girar la cámara, sin capturar el puntero.
- Clic izquierdo para usar la herramienta o poner un bloque.
- 1 a 9, la rueda o un clic en el ícono para elegir en la barra.
- E para abrir el inventario.

#### Scenario: La cámara sigue al personaje
- **WHEN** el personaje camina en cualquier dirección
- **THEN** la cámara se mantiene detrás y por encima de él, sin quedar dentro de los bloques

#### Scenario: Pérdida de foco
- **GIVEN** el niño mantiene pulsada la tecla de caminar
- **WHEN** la ventana pierde el foco
- **THEN** el personaje se detiene y no queda caminando solo

#### Scenario: Teclas no asignadas
- **WHEN** el niño pulsa teclas al azar (por ejemplo, golpeando el teclado)
- **THEN** no ocurre ninguna acción destructiva, navegación ni salida del juego

### Requirement: Barra de herramientas grande
El juego SHALL mostrar una barra vertical de herramientas con íconos de 64 px o más: Mano (poner bloques), Pico (romper bloques y minar), Espada (golpear), Arco (disparar) y Collar (domesticar). La herramienta activa SHALL resaltarse claramente, y cada una SHALL poder elegirse sin leer texto.

#### Scenario: Elegir herramienta con un clic
- **WHEN** el niño hace clic en el ícono de la Espada
- **THEN** la Espada queda resaltada y el personaje la muestra en la mano en 200 ms o menos

#### Scenario: Elegir bloque de la hotbar
- **WHEN** el niño hace clic en un bloque de la barra inferior
- **THEN** la herramienta activa pasa a ser Mano con ese bloque seleccionado

### Requirement: Construir y romper bloques
Con la Mano, un clic sobre la cara de un bloque al alcance (6 bloques o menos) SHALL colocar el bloque seleccionado junto a esa cara. Con el Pico, un clic SHALL romper el bloque apuntado, excepto la capa inferior indestructible. Ambas acciones SHALL poder deshacerse.

#### Scenario: Poner un bloque
- **GIVEN** la Mano con "piedra" seleccionada
- **WHEN** el niño hace clic en la cara superior de un bloque a 3 bloques de distancia
- **THEN** aparece un bloque de piedra encima, en 100 ms o menos

#### Scenario: Fuera de alcance
- **WHEN** el niño hace clic sobre un bloque a 20 bloques de distancia
- **THEN** no se coloca nada y se muestra un indicador suave de "muy lejos"

#### Scenario: Capa inferior
- **WHEN** el niño intenta romper un bloque de la capa más baja del mundo
- **THEN** el bloque no se rompe y suena un "toc" suave

#### Scenario: Deshacer
- **GIVEN** el niño colocó 3 bloques
- **WHEN** pulsa "Deshacer" 3 veces
- **THEN** los 3 bloques desaparecen en orden inverso

### Requirement: Corazones y reaparición sin pérdida
El personaje SHALL tener 5 corazones visibles. Al recibir un golpe de un enemigo pierde 1 corazón y es empujado suavemente. Si llega a 0, SHALL hacer "poof" y reaparecer en la granja con 5 corazones, sin perder bloques, inventario ni mundo, y con 5 s de invulnerabilidad.

#### Scenario: Recibir un golpe
- **GIVEN** el personaje tiene 5 corazones
- **WHEN** un zombi lo toca
- **THEN** le quedan 4 corazones y no puede recibir otro golpe durante 1 s

#### Scenario: Quedarse sin corazones
- **GIVEN** el personaje tiene 1 corazón y 3 diamantes
- **WHEN** recibe un golpe
- **THEN** hace "poof" y reaparece en la granja con 5 corazones y 3 diamantes

#### Scenario: Recuperar corazones
- **GIVEN** el personaje tiene menos de 5 corazones
- **WHEN** pasan 20 s sin recibir golpes
- **THEN** recupera 1 corazón
