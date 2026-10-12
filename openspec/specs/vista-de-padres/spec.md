# vista-de-padres Specification

## Purpose

Da a los padres un espacio separado del juego del niño para revisar el histórico de mundos, verlos sin modificarlos, borrarlos con seguridad y ajustar la configuración del juego.

## Requirements

### Requirement: Ruta independiente y oculta
La vista de padres SHALL estar en una dirección propia (`/padres/`), independiente de la del juego. La UI del niño SHALL NOT contener ningún botón, enlace, atajo de teclado ni gesto que lleve a ella.

#### Scenario: Acceso directo por URL
- **WHEN** un adulto escribe `/padres/` en la barra de direcciones
- **THEN** se muestra la vista de padres en 2 s o menos, sin cargar el juego del niño

#### Scenario: Sin enlaces desde la UI del niño
- **GIVEN** la pantalla del juego en cualquier estado (día, noche, inventario abierto, "Mis Mundos")
- **WHEN** se inspeccionan todos los elementos interactivos y atajos de teclado
- **THEN** ninguno navega a `/padres/`

### Requirement: Histórico de mundos
La vista de padres SHALL listar todos los mundos no borrados, ordenados por la fecha de última modificación (el más reciente primero), mostrando para cada uno su nombre, fecha de creación, fecha de última modificación, día del juego alcanzado y miniatura.

#### Scenario: Lista con miniaturas
- **GIVEN** existen 4 mundos
- **WHEN** se abre `/padres/`
- **THEN** se ven 4 tarjetas con miniatura, nombre y fechas, la más reciente primero

#### Scenario: Mundo sin miniatura
- **GIVEN** un mundo que nunca generó miniatura
- **WHEN** se lista
- **THEN** se muestra una imagen genérica en su lugar, sin errores

### Requirement: Visor de solo lectura
Los padres SHALL poder abrir cualquier mundo en un visor 3D en el que se puede orbitar y hacer zoom, pero no se puede modificar: no se guardan cambios, no corre la simulación de entidades y no avanza el tiempo del mundo.

#### Scenario: Ver sin modificar
- **GIVEN** un mundo con fecha de última modificación T
- **WHEN** un padre lo abre en el visor, lo recorre durante 2 minutos y lo cierra
- **THEN** la fecha de última modificación sigue siendo T y sus bloques no cambiaron

#### Scenario: Visor mientras el niño juega
- **GIVEN** el niño juega en el mundo "A" en otra pestaña
- **WHEN** un padre abre "A" en el visor
- **THEN** el visor muestra el último estado guardado y no interfiere con los guardados del juego

### Requirement: Borrado con confirmación y papelera
Los padres SHALL poder borrar un mundo solo después de una confirmación explícita. El mundo borrado SHALL pasar a una papelera, desde la que se puede restaurar durante 30 días antes de eliminarse definitivamente.

#### Scenario: Borrar con confirmación
- **WHEN** un padre pulsa "Borrar" en un mundo y confirma en el diálogo
- **THEN** el mundo desaparece del histórico y de "Mis Mundos" del niño y aparece en la papelera

#### Scenario: Cancelar el borrado
- **WHEN** un padre pulsa "Borrar" y cancela el diálogo
- **THEN** el mundo sigue sin cambios

#### Scenario: Restaurar desde la papelera
- **GIVEN** un mundo borrado hace 10 días
- **WHEN** un padre pulsa "Restaurar"
- **THEN** el mundo vuelve al histórico con todo su contenido

#### Scenario: Eliminación definitiva tras 30 días
- **GIVEN** un mundo que está en la papelera desde hace 31 días
- **WHEN** se abre el juego o la vista de padres
- **THEN** ese mundo se elimina definitivamente

#### Scenario: Borrar el mundo que el niño está usando
- **GIVEN** el mundo "A" es el último abierto por el niño
- **WHEN** un padre borra "A"
- **THEN** la próxima vez que se abra el juego, el niño entra al mundo más reciente que quede o, si no queda ninguno, a uno nuevo

### Requirement: Configuración del juego por los padres
La vista de padres SHALL permitir configurar, por mundo, la duración del día y de la noche (de 2 a 30 min cada una), la "noche tranquila" (sin zombis ni dragón) y el volumen (maestro, música y efectos). Los cambios se aplican la próxima vez que se carga ese mundo, o en caliente si está abierto en la misma sesión.

#### Scenario: Cambiar la duración de la noche
- **WHEN** un padre cambia la duración de la noche del mundo "A" a 5 min y guarda
- **THEN** la próxima noche de "A" dura 5 min ± 1 s

#### Scenario: Valor fuera de rango
- **WHEN** un padre intenta poner una noche de 0 min o de 45 min
- **THEN** el valor se limita al rango de 2 a 30 min y se indica el límite

### Requirement: Protección opcional con PIN
La vista de padres SHALL ofrecer un PIN opcional de 4 dígitos, **desactivado por defecto**. Si está activo, se pide al entrar a `/padres/`, y tras 5 intentos fallidos se bloquea el acceso durante 60 s. El PIN SHALL NOT almacenarse en texto plano.

#### Scenario: PIN desactivado
- **GIVEN** no se configuró ningún PIN
- **WHEN** se abre `/padres/`
- **THEN** se accede directamente

#### Scenario: PIN activo e incorrecto
- **GIVEN** un PIN configurado
- **WHEN** se introduce un PIN incorrecto 5 veces
- **THEN** el acceso queda bloqueado durante 60 s
