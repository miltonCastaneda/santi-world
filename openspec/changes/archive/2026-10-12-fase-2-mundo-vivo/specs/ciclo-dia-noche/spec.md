# Spec Delta: ciclo-dia-noche

## Purpose

Define el paso del tiempo en cada mundo: alternancia configurable entre día y noche, transición visual suave, conteo de "días del juego" y el amanecer como momento de reaparición.

## ADDED Requirements

### Requirement: Alternancia de día y noche
Cada mundo SHALL alternar entre un día y una noche de 15 min cada uno por defecto, con la duración configurable por los padres (de 2 a 30 min cada fase). El tiempo del mundo solo avanza mientras el juego está abierto y visible.

#### Scenario: Duración por defecto
- **GIVEN** un mundo con la configuración por defecto, al inicio del día
- **WHEN** pasan 15 min de juego
- **THEN** empieza la noche (con ± 1 s de tolerancia)
- **AND** a los 15 min siguientes empieza otra vez el día

#### Scenario: Pestaña oculta
- **GIVEN** faltan 2 min para la noche
- **WHEN** la pestaña está oculta durante 10 min y luego vuelve a mostrarse
- **THEN** siguen faltando 2 min para la noche

#### Scenario: Persistir la hora
- **GIVEN** faltan 4 min para la noche
- **WHEN** se cierra el juego y se vuelve a abrir el mismo mundo
- **THEN** siguen faltando 4 min para la noche, con ± 5 s de tolerancia

### Requirement: Transición visual del día a la noche
El cielo, la luz y la niebla SHALL cambiar gradualmente durante al menos 30 s en el atardecer y en el amanecer, sin saltos bruscos. De noche, la escena se oscurece pero el personaje, los animales y los bloques cercanos siguen siendo distinguibles. Las antorchas iluminan su entorno.

#### Scenario: Atardecer gradual
- **WHEN** empieza el atardecer
- **THEN** la luz ambiental baja de forma continua durante 30 s o más, sin cambios de más del 10% entre dos frames consecutivos

#### Scenario: Visibilidad nocturna mínima
- **GIVEN** es medianoche
- **WHEN** el personaje está a 8 bloques o menos de un animal
- **THEN** el animal sigue siendo distinguible: su contraste respecto al fondo no baja de un umbral definido en las pruebas visuales

### Requirement: Indicadores de tiempo sin texto
El HUD del niño SHALL mostrar con íconos si es de día o de noche (sol o luna), el número del día del juego y un indicador visual de cuánto falta para que oscurezca (por ejemplo, un arco que se va llenando). El texto, si aparece, es solo un complemento.

#### Scenario: Aviso de que se acerca la noche
- **GIVEN** falta 1 minuto para la noche
- **WHEN** el niño mira el HUD
- **THEN** el ícono de luna parpadea suavemente y suena un aviso suave una sola vez

### Requirement: Día del juego y amanecer
Un "día del juego" SHALL ser un ciclo completo de día y noche, y el contador de días aumenta en cada amanecer. Al amanecer SHALL dispararse la reaparición de lo que desapareció (animales, lobos y árboles quemados) y la retirada de los enemigos nocturnos.

#### Scenario: Contador de días
- **GIVEN** el mundo está en el día 3
- **WHEN** termina la noche
- **THEN** el HUD muestra el día 4

#### Scenario: Amanecer con el juego cerrado
- **GIVEN** el niño cierra el juego de noche
- **WHEN** vuelve a abrirlo
- **THEN** la noche continúa desde donde quedó y el amanecer ocurre a su tiempo (el tiempo no avanza con el juego cerrado)

### Requirement: Noche tranquila
Los padres SHALL poder activar la "noche tranquila" en un mundo. Con ella activa, la noche sigue llegando (visualmente), pero no aparecen zombis ni el dragón.

#### Scenario: Noche sin enemigos
- **GIVEN** la noche tranquila activa
- **WHEN** transcurre una noche completa
- **THEN** no aparece ningún zombi ni el dragón
