# Proposal: Fase 2 "Mundo vivo"

> **Qué es este documento (SDD)**: el *proposal* responde **por qué** hacemos el cambio y **qué** cambia, a nivel de producto. El *cómo* está en `design.md`, el *qué debe cumplir exactamente* en `specs/**/spec.md` y los *pasos* en `tasks.md`. Las dudas que todavía hay que confirmar están en [`preguntas-abiertas.md`](preguntas-abiertas.md).

## Contexto actual (as-is)

1. **Stack**: Vite 6, TypeScript 5.9 estricto y Three.js 0.170. Es una sola página (`index.html`) sin backend.
2. **Código**: 7 módulos en `src/` (`main`, `world`, `mesh`, `input`, `ui`, `blocks`, `style.css`), unas 450 líneas en total.
3. **Mundo**: fijo de 32x32x12, guardado como `Map<"x,y,z", BlockId>`, con colinas de seno y coseno y 6 árboles fijos.
4. **Render**: un `InstancedMesh` por tipo de bloque (8 colores planos, sin texturas). Se reconstruye **todo** en cada clic.
5. **Cámara**: `OrbitControls`. No hay personaje ni entidades, y no hay bucle de simulación (solo el render).
6. **Persistencia**: el mundo entero se serializa a `localStorage` (`minecraf-de-santi-world-v2`) en cada acción. Solo existe un mundo.
7. **UX**: poner, quitar, deshacer (solo en memoria), "Empezar de nuevo" (**destructivo y sin confirmación**) y pantalla completa.
8. **Calidad**: no hay tests, linter, CI, README ni ADRs. OpenSpec está recién inicializado y no tiene specs.

**Riesgos técnicos para escalar**

- `localStorage` es síncrono y tiene un límite de unos 5 MB, así que no aguanta mundos grandes ni varios mundos.
- El rebuild total O(n) por clic se vuelve inviable con un mundo más grande.
- La lógica está acoplada a Three.js y al DOM: no se puede probar ni simular sin interfaz.
- No hay paso de simulación fijo, así que no hay base para IA, físicas ni ciclo día/noche.
- Las sombras se recortan: `DirectionalLight` usa la cámara de sombras por defecto, de unos ±5 unidades.

## Why

Santi ya construye, pero el mundo está "quieto", es pequeño y frágil: un clic en "Empezar de nuevo" borra todo. La Fase 2 convierte el sandbox en un **mundo vivo** (personaje, animales, día y noche, enemigos suaves y recursos) y, sobre todo, asegura que **nada de lo que construye se pierda**. Hacerlo ahora evita construir más funcionalidades sobre una base que no escala (localStorage, rebuild total, lógica acoplada al render).

Principios de la constitution que este change afecta: **todos**. Los más importantes son el 1 (apto para 4 años y sin pérdida de progreso), el 2 (refactor a módulos, chunks y repositorio) y el 5 (presupuesto de rendimiento con muchas entidades).

## What Changes

- **Base escalable**: refactor a los módulos `core`, `domain`, `sim`, `render`, `input`, `audio`, `persistence`, `ui` y `apps`, con un bucle de simulación de paso fijo y lógica determinista.
- **Mundo por chunks**, más grande (256x256x64 propuesto), con texturas pixel-art y zonas: granja, montaña de lobos con bosque, montaña de rocas con diamantes, río y estanque.
- **Persistencia local robusta**: varios mundos, autoguardado, "guardar antes de limpiar", esquema versionado con migraciones e importación del mundo actual de `localStorage` como "Mi primer mundo".
- **BREAKING (UX)**: "Empezar de nuevo" se reemplaza por "Crear nuevo mundo", que guarda el actual primero. La cámara orbital pasa a ser una cámara en tercera persona que sigue al personaje.
- **Vista de padres** en `/padres/`, sin enlaces desde la UI del niño: histórico, miniaturas, visor de solo lectura, borrado con confirmación y papelera, y configuración (día y noche, volumen, noche tranquila).
- **Personaje** con físicas y animaciones, y una **barra de herramientas** grande (Mano, Pico, Espada, Arco y Collar).
- **Animales autónomos** con sonidos y físicas (oveja, gallina, pollo, cabra, pato, vaca, lobo y cerdo-gallina), **granja** cercada y escapes.
- **Lobos**: cazan animales de la granja y se domestican con el Collar.
- **Ciclo día/noche** configurable, **zombis** nocturnos y un **dragón** que se derrota con 5 flechas.
- **Recursos e inventario visual**: diamantes, carne y cerdo-gallinas capturados.
- **Calidad**: Vitest, Playwright y ESLint con la regla de dependencias, documentación (README, ADRs, guías) y CHANGELOG.

## Capabilities

### New Capabilities

- `mundos-y-persistencia`: varios mundos, autoguardado, guardar antes de limpiar, esquema versionado y migración, y mundo grande por chunks.
- `vista-de-padres`: ruta independiente, histórico con miniaturas, visor de solo lectura, borrado seguro, configuración y PIN opcional.
- `personaje-y-herramientas`: personaje visible con físicas y animaciones, controles de desktop, barra de herramientas y corazones.
- `animales-y-granja`: especies domésticas y el cerdo-gallina, comportamiento autónomo, sonidos, físicas, granja, escapes y reaparición.
- `lobos`: montaña de lobos, caza de animales de granja, domesticación con el Collar y comportamiento del lobo amigo.
- `ciclo-dia-noche`: duración configurable, transición visual, "día del juego" y reaparición al amanecer.
- `enemigos-nocturnos`: zombis (aparición, persecución respetando los bloques, 1 golpe) y dragón (árboles, cerdo-gallina, 5 disparos con el arco).
- `recursos-e-inventario`: diamantes, carne, cerdo-gallinas capturados e inventario visual.
- `experiencia-infantil`: requisitos transversales para 4 años (íconos, violencia cartoon, nunca perder progreso, audio y volumen).
- `rendimiento-y-estabilidad-visual`: presupuesto de FPS y draw calls, y ausencia de artefactos visuales.
- `plataforma-escalable`: requisitos del desarrollador (límites entre módulos, repositorio intercambiable, IDs, determinismo y testabilidad).

### Modified Capabilities

Ninguna: todavía no existen specs en `openspec/specs/`.

## Historias de usuario (resumen por actor)

| Actor | Historia | Spec |
|---|---|---|
| Niño | Quiero caminar con mi personaje y construir lo que quiera. | personaje-y-herramientas |
| Niño | Quiero ver animales que se mueven y hacen ruido, y cuidarlos en mi granja. | animales-y-granja |
| Niño | Quiero hacerme amigo de un lobo con el collar. | lobos |
| Niño | Quiero que llegue la noche y proteger a mis animales de los zombis construyendo muros. | ciclo-dia-noche, enemigos-nocturnos |
| Niño | Quiero derrotar al dragón con mi arco. | enemigos-nocturnos |
| Niño | Quiero juntar diamantes y ver cuántos tengo. | recursos-e-inventario |
| Niño | Quiero volver a mis mundos anteriores y empezar uno nuevo sin perder nada. | mundos-y-persistencia |
| Padre | Quiero ver el histórico de lo que Santi construyó y abrirlo sin modificarlo. | vista-de-padres |
| Padre | Quiero borrar mundos con seguridad y ajustar la duración de la noche y el volumen. | vista-de-padres, ciclo-dia-noche |
| Desarrollador | Quiero cambiar la persistencia local por un backend sin tocar el dominio. | plataforma-escalable |
| Desarrollador | Quiero probar la IA y las reglas de forma determinista y sin interfaz. | plataforma-escalable |

## Impact

- **Código**: casi todo `src/` se reorganiza. `index.html` se divide en dos entradas (`/` y `/padres/`) y se agregan `public/` (texturas y sonidos CC0) y `tests/`.
- **Dependencias nuevas propuestas** (cada una con ADR): `dexie` (persistencia); como dependencias de desarrollo, `vitest`, `fake-indexeddb`, `@playwright/test`, `eslint` y `typescript-eslint`.
- **Datos**: migración única de `localStorage` (v2) a IndexedDB. El dato original no se borra hasta confirmar la importación.
- **Documentación**: `docs/constitution.md`, `docs/architecture.md`, `docs/adr/0001` a `0012`, guías, `docs/testing.md`, `docs/performance.md` y `CHANGELOG.md`.

## Fuera de alcance

- Modo online, multiusuario, cuentas reales, backend y publicación (se deja el diseño preparado, pero no se implementa).
- Soporte táctil o móvil optimizado (el objetivo de esta fase es desktop con mouse y teclado).
- Crafteo, hambre, supervivencia con pérdida de objetos, cuevas o biomas procedurales complejos y redstone.
- Mundo infinito (el diseño lo permite, pero el tamaño queda fijo en esta fase).
- Modelos 3D externos (GLTF): se usan modelos hechos de cajas.
