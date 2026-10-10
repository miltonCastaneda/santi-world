# Spec Delta: plataforma-escalable

## Purpose

Recoge los requisitos del desarrollador actual y futuro: separar la simulación del resto, poder cambiar la persistencia local por un backend, identificar usuarios y mundos de forma única, y poder probar y reproducir la lógica sin interfaz.

## ADDED Requirements

### Requirement: Simulación ejecutable sin interfaz
La lógica del juego (mundo, entidades, IA, físicas, día/noche, reglas de daño, inventario) SHALL poder ejecutarse sin navegador gráfico ni motor de render, avanzando el tiempo de forma controlada desde una prueba.

#### Scenario: Una noche completa sin interfaz
- **GIVEN** un mundo con semilla fija, cargado en un entorno de pruebas sin render
- **WHEN** se avanzan 30 minutos simulados en menos de 10 s reales
- **THEN** se puede consultar el estado final: entidades, bloques, inventario y día del juego

### Requirement: Determinismo
Con la misma semilla, la misma configuración y la misma secuencia de acciones del jugador, la simulación SHALL producir exactamente el mismo estado, independientemente de los FPS del render.

#### Scenario: Independencia de los FPS
- **GIVEN** dos ejecuciones idénticas, una con el render a 30 FPS y otra a 144 FPS
- **WHEN** se simulan 5 minutos con las mismas acciones
- **THEN** el estado de la simulación es idéntico

### Requirement: Persistencia intercambiable
Todo acceso a los datos persistidos SHALL pasar por un contrato de repositorio único. Se SHALL poder sustituir el almacenamiento local por uno en memoria o remoto sin modificar la lógica del juego, y la misma batería de pruebas de contrato SHALL pasar contra cada implementación.

#### Scenario: Pruebas de contrato
- **GIVEN** la implementación local y la implementación en memoria del repositorio
- **WHEN** se ejecuta la batería de pruebas de contrato
- **THEN** ambas la pasan sin cambios en las pruebas

### Requirement: Identificadores de usuario y mundo
Todo mundo SHALL pertenecer a un usuario identificado por un ID único universal, aunque hoy exista un solo usuario por defecto. Todo mundo, chunk y entidad persistida SHALL tener un ID estable y marcas de versión o de modificación que permitan sincronizar en el futuro.

#### Scenario: Usuario por defecto
- **WHEN** se abre el juego por primera vez
- **THEN** se crea un usuario por defecto con un ID único y todos los mundos quedan asociados a él

#### Scenario: Exportación preparada para sincronizar
- **WHEN** se exporta un mundo a un archivo
- **THEN** el archivo contiene el ID del usuario, el ID del mundo, la versión de esquema y las marcas de modificación de cada parte

### Requirement: Límites entre módulos verificados
La verificación automática del proyecto SHALL fallar si la lógica del dominio o de la simulación depende del render, la UI, el audio, la persistencia o el navegador.

#### Scenario: Dependencia prohibida
- **GIVEN** un archivo del dominio que importa algo del render
- **WHEN** se ejecuta la verificación del proyecto
- **THEN** la verificación falla indicando la regla violada

### Requirement: Modo de pruebas
El juego SHALL ofrecer un modo de pruebas, solo en desarrollo y pruebas automatizadas, que permite adelantar el reloj, crear entidades, leer el estado y fijar la semilla. Este modo SHALL NOT estar disponible en el build de producción.

#### Scenario: Adelantar a la noche
- **GIVEN** el modo de pruebas activo
- **WHEN** una prueba E2E pide adelantar el reloj hasta la noche
- **THEN** el juego entra en la noche en 1 s o menos

#### Scenario: Producción
- **WHEN** se inspecciona el build de producción
- **THEN** el modo de pruebas no existe ni se puede activar

### Requirement: Calidad verificable con un comando
El proyecto SHALL ofrecer comandos únicos para verificar tipos y lint, ejecutar las pruebas unitarias y de integración, ejecutar las E2E y medir el rendimiento. Una tarea solo se considera hecha si los tres primeros pasan.

#### Scenario: Verificación completa
- **WHEN** un desarrollador ejecuta la verificación, las pruebas y las E2E en un clon limpio después de instalar las dependencias
- **THEN** los tres comandos terminan con éxito
