# Recursos gráficos y de audio

Inventario de los recursos que usa el juego, con su fuente y su licencia. Todo recurso nuevo se agrega aquí en el mismo PR que lo introduce.

## Texturas de bloques

| Recurso | Fuente | Licencia |
|---|---|---|
| 18 tiles de 16x16 px (`TILE_NAMES` en `src/render/tiles.ts`) | Generados por código en `src/render/textures.ts` con una semilla fija (`generateTiles()`); no hay archivos de imagen | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |

- Los tiles se generan al arrancar: un color base por bloque con ruido de píxeles determinista (`Rng` con semilla), vetas en la madera, juntas en los tablones, puntos en el mineral de diamante y huecos transparentes (~12 %) en las hojas. `grass_side` y `snow_side` se dibujan sobre la tierra y la piedra.
- Se suben como un `DataArrayTexture` (una capa por tile) con `NearestFilter` para ampliar y mipmaps propios por capa, así que no hay sangrado entre tiles ([ADR-0013](adr/0013-mesher-en-web-worker-y-arreglo-de-texturas.md)).
- Para cambiar el aspecto de un bloque se edita su función en `textures.ts`; las pruebas visuales (`tests/e2e/visual.spec.ts`) detectan el cambio y hay que regenerar las imágenes de referencia.

Si en el futuro se usan texturas de terceros, solo se aceptan CC0 o equivalentes (por ejemplo, de Kenney.nl u OpenGameArt filtrando por CC0), y se registran en esta tabla con el enlace a la fuente.

## Audio

Todavía no hay sonidos (llegan en el incremento 5 con el `AudioService`).
