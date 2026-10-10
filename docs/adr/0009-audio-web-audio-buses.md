# ADR 0009: Audio con Web Audio API, buses de volumen y assets CC0

- **Estado**: Aceptado (incremento 5)
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

## Implementación (incremento 5)

- `src/audio/audioService.ts`: `AudioService(createContext)` con los buses `master` (por defecto 0,6 y nunca más de 0,8), `music`, `sfx` y `ambient`; `setVolumes` (lo que configuran los padres), `setMuted`/`toggleMute` (silencio inmediato que recuerda el volumen anterior), `setListener` (posición y rumbo de la cámara) y `play(name, { bus, pos, category, volume })`.
- Atenuación lineal hasta 24 bloques y `StereoPannerNode` según el ángulo respecto de la cámara. Como máximo 3 voces de categoría `animal`: una nueva más cercana reemplaza a la más lejana.
- El contexto se crea al arrancar (suspendido) y los buffers se sintetizan en ese momento: crear un `AudioContext` puede tardar segundos en algunas máquinas, y no debe ocurrir justo en la primera tecla del niño. Se reanuda con el primer `pointerdown` o `keydown`. Mientras está suspendido `play` no hace nada, para que no se acumulen sonidos que sonarían todos juntos.
- Los efectos de este incremento (pasos, poner, romper, golpe contra el fondo, clic de UI, salto, poof, boing, swish y "muy lejos") están **sintetizados por código** (`src/audio/synth.ts`, CC0) en vez de OGG: pesan cero bytes y son cortos y suaves por construcción. Los sonidos de animales y la música, cuando lleguen, seguirán la decisión original (CC0 en `public/audio/`).
- `src/audio/gameAudio.ts` conecta los eventos del juego con los sonidos; el audio nunca modifica el juego.
- Pruebas: `tests/unit/audio/audioService.test.ts` con un contexto falso (tope, silencio, voces de animales, distancia, contexto suspendido y sonidos suaves) y la E2E del botón de silencio.
