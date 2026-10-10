# ADR 0013: Mesher y luz en Web Workers, y texturas como arreglo de capas

- **Estado**: Aceptado (incremento 2)
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `rendimiento-y-estabilidad-visual`, requisito "Edición sin tirones")
- **Complementa**: [ADR-0003](0003-mundo-por-chunks-y-mesher.md), que dejaba prevista esta salida.

## Contexto

El spec exige no superar 4 ms de construcción de geometría por frame. Con el mesher de caras visibles y la luz por inundación, un chunk real (semilla `perf-001`, Node 22, después de calentar el JIT) cuesta:

| Chunk | Luz | Mesh | Caras |
|---|---|---|---|
| (7, 8) granja | 5,0 ms | 1,6 ms | 256 |
| (13, 7) montaña de roca | 5,1 ms | 2,4 ms | 584 |
| (5, 3) montaña con bosque | 4,9 ms | 2,8 ms | 1252 |

Unos 7 ms por chunk: ningún presupuesto por frame en el hilo principal permite procesar ni siquiera uno. La luz necesita un margen de 14 bloques alrededor del chunk para que no haya costuras, y ese margen domina el coste.

Además, el atlas 2D con margen de 2 px (ADR-0003) sangra en los niveles de mipmap pequeños (con 4 px por tile el margen queda en medio píxel).

## Decisión

- **La luz y el mesher corren en un Web Worker** (`render/meshWorker.ts`; `ChunkRenderer` admite un pool, con 1 por defecto). El worker regenera con la semilla los chunks que el jugador no modificó (con una caché LRU de 300 chunks) y el hilo principal solo le envía los chunks modificados entre los 3x3 alrededor del que se dibuja. Recibe arreglos tipados (transferibles). En el hilo principal solo se crean las `BufferGeometry`: cada una se aplica solo si su costo estimado cabe en lo que queda de los 4 ms del frame.
- **Por qué 1 worker y no 2**: con `npm run perf` (Iris Xe, 60 s), 2 workers dieron una carga de 4,1 s, 22–35 ms por chunk en el worker y un p99 de 4,5 ms en el hilo principal; con 1 worker, 3,3 s, 10 ms y 0,8 ms. Cada worker regenera su propia copia de los chunks vecinos y compiten por la CPU con el hilo principal. Se puede volver a probar con `?workers=N`.
- Las funciones `computeLight` y `meshChunk` siguen siendo puras y se prueban en Node sin worker. Si `Worker` no existe, la cola usa la ruta síncrona.
- **Texturas como `DataArrayTexture` (una capa por tile)** en lugar de un atlas 2D: cada capa tiene sus mipmaps propios, así que no hay sangrado en ningún nivel. Se mantienen `NearestFilter` para ampliar y los tiles de 16 px.
- El material es `MeshBasicMaterial` con `onBeforeCompile`: la luz ya viene por vértice (cielo × `uDaylight`, antorchas y AO), así que no hacen falta las luces de la escena para el terreno.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Worker (elegida) | El hilo principal queda libre | Regenerar los vecinos en el worker; código de mensajes |
| Reducir el margen de la luz | Más barato | Costuras de luz entre chunks bajo techos grandes |
| Luz incremental persistente por chunk | Lo más eficiente al editar | Mucho más complejo; se deja para cuando haga falta |
| Atlas 2D con márgenes más grandes | Sin shader propio | Sigue sangrando en los mipmaps más pequeños o pierde mipmaps |

## Consecuencias

- Positivas: se cumple el presupuesto por frame (p99 de 0,9 ms en el hilo principal durante la ruta de `npm run perf`; ver `docs/performance.md`).
- A vigilar: la carga inicial con radio 6 tarda unos 3,3–4,4 s; el presupuesto de menos de 3 s con caché caliente se ataca en el incremento 3 (guardar los chunks ya generados) y se mide en el 14.
- Negativas: una edición se ve tras un viaje al worker (unos 10 ms, dentro de los 100 ms del spec).
- Reversión: `ChunkRenderer` admite la ruta síncrona; basta con no crear workers.
