# Spec Delta: experiencia-infantil

## Purpose

Reúne los requisitos transversales que hacen el juego apto para un niño de 4 años: jugar sin leer, violencia solo cartoon, ninguna pérdida accidental, audio controlado y una UI que tolera clics y teclas al azar.

## ADDED Requirements

### Requirement: Jugar sin leer
Todas las acciones del niño SHALL estar representadas por íconos de 64x64 px o más en una pantalla de 1080p. Ninguna acción del juego del niño requiere leer texto, y cada acción tiene una respuesta visual o sonora en 200 ms o menos.

#### Scenario: Tamaño de los objetivos
- **WHEN** se mide cada elemento interactivo de la UI del niño a 1920x1080
- **THEN** todos miden 64x64 px o más

#### Scenario: Respuesta inmediata
- **WHEN** el niño pulsa cualquier botón de la UI
- **THEN** en 200 ms o menos hay una respuesta visual (resaltado o animación) y, si el audio está activo, un sonido

### Requirement: Violencia solo cartoon
Ningún contenido SHALL mostrar sangre, cadáveres, heridas, armas realistas ni sonidos de dolor. Todo golpe se representa con un rebote, un parpadeo o un sonido "boing", y toda desaparición de una criatura con una nube "poof" con estrellas o destellos.

#### Scenario: Revisión de efectos
- **WHEN** se revisa la lista de efectos visuales y sonoros asociados a golpes y desapariciones
- **THEN** todos pertenecen al catálogo aprobado (rebote, parpadeo, poof, estrellas, destellos y sonidos suaves)

### Requirement: Nunca perder progreso por accidente
Ninguna acción disponible en la UI del niño SHALL borrar un mundo ni hacer perder construcciones o inventario de forma irreversible. Lo que el niño destruye se puede deshacer o vuelve a aparecer, y lo que destruyen los enemigos se limita a contenido natural que reaparece.

#### Scenario: Secuencia aleatoria de acciones
- **GIVEN** un mundo con construcciones e inventario
- **WHEN** se ejecutan 1000 acciones aleatorias de la UI del niño (clics, teclas, botones)
- **THEN** el mundo sigue existiendo, tras recargar se recupera su último estado y no hay errores en la consola

#### Scenario: Cerrar el navegador de golpe
- **GIVEN** el niño construyó durante 10 minutos
- **WHEN** se cierra el navegador sin aviso
- **THEN** al volver a abrirlo, como máximo se pierden los últimos 30 s de cambios

### Requirement: Audio controlado
El audio SHALL empezar solo después de la primera interacción del niño, con un volumen maestro inicial del 60% y un tope que nunca supera el 80% de la ganancia máxima. El niño SHALL tener un botón grande de silencio, y los padres controlan los volúmenes de música y efectos. Se reproducen como máximo 3 sonidos de animales a la vez.

#### Scenario: Silencio
- **WHEN** el niño pulsa el botón de silencio
- **THEN** en 100 ms o menos deja de sonar todo
- **AND** al pulsarlo de nuevo, el audio vuelve al volumen anterior

#### Scenario: Muchos animales
- **GIVEN** 20 animales a 10 bloques o menos del personaje
- **WHEN** todos intentan emitir sonido a la vez
- **THEN** se oyen como máximo 3 sonidos de animales simultáneos

#### Scenario: Música de noche
- **WHEN** empieza la noche
- **THEN** la música cambia gradualmente, en 5 s o más, a una melodía nocturna suave, sin efectos de susto

### Requirement: Navegador a prueba de niños
Durante el juego, el clic derecho SHALL NOT abrir el menú contextual, la rueda y las teclas SHALL NOT hacer zoom ni desplazar la página, y un arrastre accidental SHALL NOT seleccionar texto. La pantalla completa está disponible con un ícono grande.

#### Scenario: Menú contextual
- **WHEN** el niño hace clic derecho sobre el juego
- **THEN** no aparece el menú contextual del navegador

#### Scenario: Zoom accidental
- **WHEN** el niño usa Ctrl y la rueda, o la rueda sola, sobre el juego
- **THEN** la página no hace zoom y la rueda solo cambia el elemento de la barra

### Requirement: Estética según la referencia visual
La apariencia SHALL seguir la imagen de referencia `lookandfeel/minecraft-santi-lookandfeel.png`:
- Bloques con texturas pixel-art.
- Cielo azul con nubes de bloques.
- Granja con establo rojo.
- Personaje con la "S" en la camiseta.
- HUD con el día y la hora arriba a la izquierda, el aviso de noche arriba a la derecha, las herramientas en vertical a la derecha y la hotbar abajo al centro.

#### Scenario: Revisión visual
- **WHEN** se compara una captura del juego con la referencia visual
- **THEN** están presentes todos los elementos de HUD y escena enumerados en el requisito, en las posiciones indicadas
