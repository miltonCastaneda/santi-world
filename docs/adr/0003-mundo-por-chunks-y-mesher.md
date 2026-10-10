# ADR 0003: Mundo por chunks de 16x16x64 con mesher de caras visibles, luz por vértice y atlas

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `mundos-y-persistencia` y `rendimiento-y-estabilidad-visual`)

## Contexto

El render actual usa un `InstancedMesh` por tipo de bloque y lo reconstruye **completo** en cada clic. Con 256x256x64 bloques y texturas, eso no escala. Además, hay que evitar huecos entre regiones, z-fighting y sangrado de texturas, cumplir menos de 300 draw calls y tener noche con antorchas en una GPU integrada.

## Decisión

- **Chunks de 16x16x64**, un mundo de 16x16 chunks, radio de vista de 6 chunks y descarga a 8 (con histéresis).
- **Mesher de caras visibles** por chunk que consulta los bloques de los chunks vecinos. Genera una geometría opaca y otra transparente por chunk, con AO por vértice. La cola de trabajo tiene un presupuesto de 4 ms por frame.
- **Luz por vértice**: atributos `skyLight` y `blockLight` (propagación BFS desde las antorchas). Un uniforme `uDaylight` en `MeshLambertMaterial.onBeforeCompile` hace que el ciclo día/noche no obligue a regenerar la geometría.
- **Atlas** de tiles de 16 px con margen replicado de 2 px, `NearestFilter` y mipmaps por tile.
- **Sin sombras dinámicas** del terreno; las entidades usan sombras planas ("blob").
- **Solo se persisten los chunks modificados**; el resto se regenera con la semilla y `generatorVersion`.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Mesher de caras visibles (elegida) | Simple, correcto y fácil de probar; menos de 1 draw call por chunk visible | Más triángulos que el greedy |
| Greedy meshing | Muchos menos triángulos | Complica la AO y la luz por vértice, y el atlas necesita repetir texturas; se deja como plan B |
| InstancedMesh por bloque (como hoy) | Ya existe | Millones de instancias, caras ocultas dibujadas y rebuild total: no escala |
| Sombras dinámicas (shadow maps) | Realismo como en la referencia | Coste alto en GPU integrada y recortes (el bug actual); doblan las draw calls |
| Luces dinámicas `PointLight` por antorcha | Fácil | El coste por fragmento crece con cada luz; inviable con muchas antorchas |
| Chunks de 32x32 | Menos objetos | El remallado por edición es 4 veces más caro; peor granularidad de carga |

## Consecuencias

- Positivas: unas 113 draw calls para el terreno, edición local barata, noche sin coste de geometría y persistencia compacta.
- Negativas: el mesher y la luz son código propio que hay que probar bien (pruebas visuales), y se pierde algo de realismo sin sombras.
- Reversión: el mesher está aislado en `render/ChunkMesher`. Se puede cambiar por greedy o moverlo a un Web Worker (con otro ADR).
