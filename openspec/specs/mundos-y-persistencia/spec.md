# mundos-y-persistencia Specification

## Purpose

Garantiza que el niño pueda tener varios mundos construidos, volver a cualquiera de ellos y que nada de lo construido se pierda por accidente, en un mundo más grande que se carga de forma progresiva.

## Requirements

### Requirement: Múltiples mundos guardados
El juego SHALL permitir tener varios mundos guardados de forma persistente. Cada mundo tiene un identificador único, nombre, fecha de creación, fecha de última modificación y miniatura, y conserva sus bloques, entidades, hora del día, inventario y posición del personaje.

#### Scenario: Volver a un mundo anterior
- **GIVEN** existen los mundos "A" y "B" y el niño está jugando en "B"
- **WHEN** abre "Mis Mundos" y elige la tarjeta de "A"
- **THEN** en 3 s o menos se muestra "A" con todos sus bloques, animales, hora del día, inventario y posición del personaje tal como estaban al salir

#### Scenario: Los mundos sobreviven a recargar el navegador
- **GIVEN** existen 3 mundos guardados
- **WHEN** se cierra y se vuelve a abrir el navegador
- **THEN** "Mis Mundos" muestra los mismos 3 mundos con sus miniaturas y fechas

### Requirement: Crear un mundo nuevo sin perder el actual
El juego SHALL reemplazar la acción destructiva "Empezar de nuevo" por "Crear nuevo mundo". Esta acción guarda el mundo actual de forma persistente y confirmada **antes** de crear y mostrar el nuevo.

#### Scenario: Crear un mundo nuevo guarda primero
- **GIVEN** el niño colocó 20 bloques en el mundo actual hace 5 s (todavía sin autoguardado)
- **WHEN** pulsa "Crear nuevo mundo"
- **THEN** el mundo anterior queda guardado con esos 20 bloques
- **AND** solo después aparece el mundo nuevo, generado desde cero

#### Scenario: Falla el guardado previo
- **GIVEN** el almacenamiento rechaza la escritura (por ejemplo, porque no hay cuota)
- **WHEN** el niño pulsa "Crear nuevo mundo"
- **THEN** el mundo actual **no** se limpia ni se reemplaza
- **AND** se muestra un ícono de aviso y se registra el error para los padres

#### Scenario: Clics repetidos en "Crear nuevo mundo"
- **WHEN** el niño pulsa "Crear nuevo mundo" 5 veces en menos de 2 s
- **THEN** se crea como máximo 1 mundo nuevo y el anterior se guarda una sola vez

### Requirement: Guardar antes de cualquier operación que limpia
Cualquier operación que reemplace, reinicie o descargue de memoria el mundo visible (cambiar de mundo, crear uno nuevo o restaurar desde la papelera) SHALL completar primero un guardado persistente confirmado y solo después limpiar.

#### Scenario: Cambiar de mundo con cambios sin guardar
- **GIVEN** hay cambios sin guardar en el mundo "A"
- **WHEN** el niño elige el mundo "B"
- **THEN** los cambios de "A" quedan persistidos antes de que "A" se descargue

### Requirement: Autoguardado periódico y al salir
El juego SHALL guardar automáticamente cada 30 s o menos mientras haya cambios. También SHALL guardar cuando la pestaña se oculta, pierde el foco o se cierra, sin bloquear la interacción del niño.

#### Scenario: Autoguardado periódico
- **GIVEN** el niño colocó un bloque
- **WHEN** pasan 30 s sin ninguna otra acción
- **THEN** el bloque está persistido y sobrevive a una recarga forzada

#### Scenario: Cerrar la pestaña
- **GIVEN** el niño colocó un bloque hace 2 s
- **WHEN** la pestaña se oculta o se cierra
- **THEN** se inicia un guardado de inmediato
- **AND** al volver a abrir el juego, ese bloque está presente

#### Scenario: El guardado no congela el juego
- **WHEN** se ejecuta un autoguardado con 50 chunks modificados
- **THEN** ningún frame tarda más de 50 ms por culpa del guardado

### Requirement: Esquema versionado y migraciones
Los datos persistidos SHALL llevar una versión de esquema. Al abrir datos de una versión anterior, el juego SHALL migrarlos automáticamente sin perder información. Si una migración falla, el juego SHALL conservar los datos originales intactos.

#### Scenario: Migración del mundo heredado
- **GIVEN** existe un mundo de la versión 1.0.0 guardado en el formato anterior del navegador
- **WHEN** se abre por primera vez la versión de la Fase 2
- **THEN** aparece en "Mis Mundos" un mundo llamado "Mi primer mundo" que contiene exactamente los mismos bloques en las mismas posiciones relativas
- **AND** los datos originales no se borran hasta que la importación se confirme

#### Scenario: Migración fallida
- **GIVEN** los datos de una versión anterior están corruptos
- **WHEN** se ejecuta la migración
- **THEN** los datos originales se conservan sin modificar
- **AND** el juego arranca con un mundo nuevo, sin errores visibles para el niño

### Requirement: Mundo más grande organizado por zonas
Cada mundo nuevo SHALL medir al menos 256x256 bloques de base y 64 de alto (10 veces el área actual o más). SHALL generarse de forma reproducible a partir de una semilla e incluir granja, montaña de lobos con bosque, montaña de rocas con diamantes, río y estanque.

#### Scenario: Generación reproducible
- **GIVEN** dos mundos creados con la misma semilla
- **WHEN** se comparan sus bloques generados
- **THEN** son idénticos bloque a bloque

#### Scenario: Zonas presentes
- **WHEN** se crea un mundo nuevo
- **THEN** existen una granja cercada con animales, una montaña con al menos 20 árboles y lobos, una montaña de roca con al menos 10 bloques de diamante, un río y un estanque

### Requirement: Carga y descarga progresiva del mundo
El juego SHALL cargar y mostrar solo la región cercana al personaje (al menos 6 chunks de radio de vista) y cargar o descargar regiones mientras el personaje se mueve, sin huecos visibles ni pausas perceptibles.

#### Scenario: Caminar hasta el borde de la región cargada
- **GIVEN** el personaje camina en línea recta durante 60 s
- **WHEN** se acerca a regiones no cargadas
- **THEN** las regiones aparecen antes de entrar en el campo visual cercano (24 bloques)
- **AND** el p95 del tiempo de frame se mantiene en 20 ms o menos

#### Scenario: Los cambios en regiones descargadas se conservan
- **GIVEN** el niño construyó una casa y caminó 200 bloques lejos de ella, de modo que su región se descargó
- **WHEN** regresa
- **THEN** la casa está exactamente igual
