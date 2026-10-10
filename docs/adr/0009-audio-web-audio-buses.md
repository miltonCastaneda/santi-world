# ADR 0009: Audio con Web Audio API, buses de volumen y assets CC0

- **Estado**: Propuesto
- **Fecha**: 2026-10-10
- **Change relacionado**: `openspec/changes/fase-2-mundo-vivo/` (spec `experiencia-infantil`)

## Contexto

Cada animal necesita su sonido, posicional y limitado (como máximo 3 voces de animales a la vez), con música de día y de noche, botón de silencio, volúmenes configurables por los padres y un tope de seguridad para los oídos de un niño. Los navegadores exigen una interacción del usuario antes de reproducir audio.

## Decisión

- Un **`AudioService` propio sobre Web Audio API**, con buses `master` (con tope de ganancia de 0,8), `music`, `sfx` y `ambient`.
- Sonido posicional simple: atenuación lineal hasta 24 bloques y `StereoPannerNode`.
- Un gestor de voces con prioridad por distancia.
- Reanudación del `AudioContext` con el primer `pointerdown` o `keydown`.
- El módulo `audio` escucha los eventos del dominio y no depende de Three.js.
- Los assets son **CC0** (OGG) en `public/audio/`, con su fuente y licencia en `docs/assets.md`.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Web Audio propio (elegido) | Sin dependencias; control total del tope y las voces; se puede probar con un contexto falso | Hay que escribir el gestor de voces |
| `THREE.PositionalAudio` | Integrado con la escena | Acopla el audio al render; PannerNode HRTF más caro; difícil limitar voces |
| Howler.js | API cómoda y sprites | Una dependencia que no resuelve el límite por categoría ni los buses tal como los necesitamos |
| Sonidos sintetizados (sfxr o generados) | Sin assets | Calidad y carácter limitados para los animales; se puede usar para efectos de UI |

## Consecuencias

- Positivas: volumen seguro por diseño, el silencio es inmediato y no hay acoplamiento con el render.
- Negativas: se necesita curar assets CC0 adecuados y que no asusten.
