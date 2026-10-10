# ADR 0010: Modelos de entidades hechos de cajas, con InstancedMesh por especie y parte y animación procedural

- **Estado**: Aceptado (incremento 5: personaje; el instancing llega con los animales)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `personaje-y-herramientas`, `animales-y-granja` y `rendimiento-y-estabilidad-visual`)

## Contexto

Hay que mostrar el personaje, 8 especies de animales, zombis y un dragón con animaciones de idle, caminar y acción, siguiendo el estilo de bloques de la referencia visual y con un presupuesto de menos de 300 draw calls y unas 60 entidades.

## Decisión

- Los modelos se definen en código como **cajas por partes** (cuerpo, cabeza, patas, alas y cola) con UVs sobre un atlas de pieles pixel-art.
- Hay un **`InstancedMesh` por cada combinación de especie y parte**. La animación es **procedural**: rotación sinusoidal de las patas al caminar, cabeceo al pastar, aleteo al volar y balanceo del brazo en la acción. Se aplica escribiendo las matrices por instancia.
- Los efectos de golpe (parpadeo blanco) y "poof" (partículas) usan atributos por instancia y un sistema de partículas instanciado.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Cajas procedurales e instancing (elegida) | Coincide con la estética de bloques; unas 5 draw calls por especie; sin pipeline de assets; animación ajustable en código | Menos expresividad que un modelo animado por un artista |
| GLTF con esqueleto y animaciones | Animaciones ricas | Pipeline (Blockbench/Blender), `SkinnedMesh` sin instancing sencillo, una draw call por entidad y más peso |
| Un `Mesh` por parte y por entidad | El más simple | Unas 6 draw calls por entidad, unas 360 en total: supera el presupuesto |

## Consecuencias

- Positivas: rendimiento constante sin importar cuántas entidades haya; cero assets binarios de modelos.
- Negativas: el dragón (más complejo) necesita más partes; las animaciones son más simples.
- Reversión: un modelo concreto (por ejemplo, el dragón) se puede cambiar por GLTF sin afectar al resto (con otro ADR).

## Implementación (incremento 5)

- `src/render/playerModel.ts`: el personaje es un único `Group` de cajas (cabeza con pelo y ojos, torso, brazos y piernas). Como hay un solo personaje, usa un `Mesh` por parte (unas 10 draw calls) en vez de `InstancedMesh`; el instancing por especie y parte se aplica con los animales.
- La camiseta lleva la "S" dibujada en un `CanvasTexture` generado por código (sin archivos).
- Animación procedural según `PlayerView.anim`: `idle` (respiración), `walk` (piernas y brazos en seno, con un leve rebote), `jump` (brazos arriba) y `action` (balanceo del brazo derecho según la herramienta: poner, minar, golpear, disparar o lanzar). Las vueltas a la pose de reposo y de salto se suavizan con una constante de unos 50 ms. La posición se interpola entre los pasos de 20 Hz de la simulación para que se vea fluida a 60 FPS.
- La herramienta elegida se muestra en la mano derecha (cajas de colores) en el frame siguiente a elegirla. Durante la invulnerabilidad el modelo parpadea.
- E2E (`tests/e2e/character.spec.ts`): pasa a caminar en 100 ms o menos y a idle en 300 ms o menos, y la Espada aparece en la mano en 200 ms o menos desde el clic.
