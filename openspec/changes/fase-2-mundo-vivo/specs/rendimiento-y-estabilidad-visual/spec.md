# Spec Delta: rendimiento-y-estabilidad-visual

## Purpose

Fija el presupuesto de rendimiento medible del juego en un desktop modesto y prohíbe los artefactos visuales (parpadeos, z-fighting, huecos entre chunks, sangrado de texturas) para que el mundo se vea estable y fluido.

## ADDED Requirements

### Requirement: Presupuesto de FPS
En el equipo de referencia (GPU integrada tipo Intel UHD 620, 8 GB de RAM, Chrome estable, 1080p), el juego SHALL mantener un p95 de tiempo de frame de 20 ms o menos y un p50 de 16,7 ms o menos durante la ruta de medición estándar, de día y de noche, con el máximo de entidades.

#### Scenario: Ruta de medición estándar
- **GIVEN** el mundo de semilla fija `perf-001` con 60 entidades activas
- **WHEN** se ejecuta la ruta de cámara estándar de 60 s (30 s de día y 30 s de noche)
- **THEN** el p95 del tiempo de frame es de 20 ms o menos y el p50 de 16,7 ms o menos

### Requirement: Límites de render y entidades
El juego SHALL mantener menos de 300 draw calls por frame y como máximo 60 entidades activas: 8 zombis, 6 lobos y 1 dragón como máximo, y el resto animales.

#### Scenario: Pico de entidades
- **GIVEN** una noche con 8 zombis, 6 lobos, el dragón y todos los animales cerca
- **WHEN** se mide el render
- **THEN** hay menos de 300 draw calls y 60 entidades activas o menos

### Requirement: Edición sin tirones
Colocar o romper un bloque SHALL actualizar su región en 100 ms o menos, sin que ningún frame supere los 50 ms. Cargar regiones nuevas SHALL repartirse entre frames, sin superar 4 ms de trabajo de construcción de geometría por frame.

#### Scenario: Edición rápida
- **WHEN** el niño coloca 10 bloques en 2 s
- **THEN** cada bloque aparece en 100 ms o menos y ningún frame supera 50 ms

### Requirement: Sin artefactos visuales
El render SHALL NOT mostrar z-fighting entre caras, huecos o costuras entre regiones vecinas, sangrado de texturas entre bloques, ni parpadeo de geometría al cargar o descargar regiones, ni al editar bloques en un borde entre regiones.

#### Scenario: Borde entre regiones
- **GIVEN** un bloque colocado justo en el límite entre dos regiones
- **WHEN** se rompe y se vuelve a colocar
- **THEN** ninguna captura de las caras adyacentes muestra huecos ni caras faltantes

#### Scenario: Comparación visual
- **GIVEN** una semilla y una posición de cámara fijas
- **WHEN** se toma una captura y se compara con la imagen de referencia aprobada
- **THEN** la diferencia está por debajo de la tolerancia definida y no aparecen píxeles de huecos (color de fondo dentro del terreno)

#### Scenario: Agua y transparencias
- **GIVEN** agua junto a bloques sólidos
- **WHEN** se mira desde distintos ángulos
- **THEN** no parpadea ni aparecen caras internas del agua

### Requirement: Arranque rápido
El juego SHALL ser interactivo (personaje controlable) en menos de 3 s desde que se abre, con la caché del navegador caliente, en el equipo de referencia.

#### Scenario: Primer momento jugable
- **WHEN** se abre el juego con un mundo existente
- **THEN** el personaje responde al teclado en menos de 3 s

### Requirement: Recuperación ante pérdida de contexto gráfico
Si el navegador pierde el contexto gráfico, el juego SHALL recuperarlo y volver a dibujar el mundo sin perder el estado ni el progreso.

#### Scenario: Contexto perdido
- **WHEN** se fuerza la pérdida y la restauración del contexto gráfico
- **THEN** en 3 s o menos el mundo vuelve a dibujarse con el mismo estado
