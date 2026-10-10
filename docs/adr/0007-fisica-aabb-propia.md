# ADR 0007: Física propia de AABB contra vóxeles y proyectiles balísticos

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (specs `personaje-y-herramientas`, `animales-y-granja` y `enemigos-nocturnos`)

## Contexto

El personaje, los animales y los enemigos necesitan gravedad, colisión con bloques, subida de escalones y no atravesar nada. El Arco necesita flechas con gravedad e impacto contra bloques y entidades (el dragón). Todo debe ser determinista y ejecutarse sin render.

## Decisión

- Colisión **AABB contra vóxeles con barrido por eje** (Y, luego X y luego Z), gravedad de 25 bloques/s², velocidad terminal de 30 bloques/s y subida de escalones de 1 bloque.
- Separación suave entre entidades mediante el índice espacial (sin cuerpos rígidos).
- **Proyectiles**: integración a 20 Hz con 3 subpasos, travesía DDA contra vóxeles y un rayo contra AABB contra entidades. Gravedad de 10 bloques/s², vida de 3 s y asistencia de puntería en un cono de 12°.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| AABB propia (elegida) | El estándar de los juegos de vóxeles; determinista; unas pocas centenas de líneas; sin dependencias | Hay que escribir y probar los casos límite |
| Rapier (WASM) | Robusta y rápida | Unos 400 KB de WASM; hay que convertir el mundo de vóxeles a colliders y mantenerlos sincronizados al editar; excesiva |
| cannon-es | En JS | Mismo problema de sincronización con los vóxeles; determinismo no garantizado; mantenimiento irregular |
| Three.js `Raycaster` para el picking | Ya se usa | Depende del render (rompe la pureza del dominio) y es lento contra geometría grande |

## Consecuencias

- Positivas: física predecible, pruebas numéricas simples y picking dentro del dominio.
- Negativas: no hay física "realista" (empujes ni apilado), lo cual no hace falta.
- Reversión: las interfaces `collideAabb` y `raycastVoxels` están aisladas.
