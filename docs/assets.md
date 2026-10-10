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

| Recurso | Fuente | Licencia |
|---|---|---|
| 14 efectos (`SOUND_NAMES` en `src/audio/synth.ts`): `step`, `place`, `break`, `bump`, `click`, `jump`, `poof`, `boing`, `swish`, `far`, `chime` (aviso de que se acerca la noche), `sparkle` (destellos: un arpegio de campanitas cuando se va un zombi), `pickup` ("tin-tin" de dos notas al recoger algo) y `tame` (tres campanitas que suben cuando un lobo se hace amigo) | Sintetizados por código en `src/audio/synth.ts` (`synthesize(name, sampleRate)`): tonos con envolvente y ruido determinista (sin `Math.random`); no hay archivos de audio | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |
| 6 voces de animales (`ANIMAL_SOUNDS`): `baa` (oveja), `moo` (vaca), `meh` (cabra), `cluck` (gallina), `peep` (pollito) y `quack` (pato) | Sintetizados por código en `src/audio/synth.ts`: una voz con armónicos y frecuencia variable (vibrato o caída), con sílabas en la gallina y el pollito; sin archivos de audio | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |
| Voz del zombi: `groan`, un "uuuh" bajito y tonto, como un bostezo (sin gruñidos) | Sintetizado por código en `src/audio/synth.ts`, con la misma técnica que las voces de animales | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |
| Voz del lobo: `woof`, un "guau-guau" amistoso de dos sílabas, agudo y corto (sin aullidos ni gruñidos) | Sintetizado por código en `src/audio/synth.ts`, con la misma técnica que las voces de animales | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |
| 2 pistas de música (`MUSIC` en `src/audio/synth.ts`): `day` (96 bpm, do mayor) y `night` (canción de cuna, 66 bpm, sol mayor) | Compuestas como datos (grados de la escala pentatónica, melodía en corcheas y un bajo por compás) y sintetizadas por código (`synthesizeMusic`) en un bucle de 10 y 14,5 s | CC0 1.0 (creación propia del proyecto, dedicada al dominio público) |

- Los animales, los lobos y los zombis suenan en el bus `ambient`, posicionales: se atenúan con la distancia y no se oyen a 24 bloques o más. Como máximo suenan 3 a la vez, y tienen prioridad los más cercanos. Cada especie emite su voz cada cierto tiempo (`soundEveryMs` en `src/domain/entities/species.ts` y `src/domain/entities/zombie.ts`).
- Cada sonido dura 0,5 s o menos y su pico es de 0,5 o menos (una prueba unitaria lo verifica), así que ninguno sale fuerte aunque el volumen esté al máximo. Encima de eso, el bus maestro tiene un tope de 0,8 ([ADR-0009](adr/0009-audio-web-audio-buses.md)).
- Los buffers se generan una vez, al arrancar, y se reutilizan. Son deterministas: el mismo nombre suena siempre igual.
- Qué evento del juego suena con qué efecto está en `src/audio/gameAudio.ts`.
- La música suena en el bus `music` y se cruza en 6 s (`MUSIC_FADE_S`) cuando empieza el atardecer (pista de noche) o el amanecer (pista de día).
- Los sonidos de terceros que se agreguen deben ser CC0 y registrarse en esta tabla con el enlace a la fuente.

### Checklist "música que no asusta"

Toda pista nueva la cumple antes de entrar (la prueba unitaria `música que no asusta` en `tests/unit/audio/audioService.test.ts` verifica los cuatro primeros puntos):

- [x] Lenta: 100 bpm o menos.
- [x] Suave: pico de 0,3 o menos (las pistas actuales, 0,25: por debajo de los efectos) y RMS de 0,12 o menos.
- [x] Sin sustos: ataques de 40 ms o más, ninguna subida de volumen de más de 0,1 de RMS entre ventanas de 100 ms y el bucle empieza y termina en silencio (sin clic).
- [x] Sin disonancias: solo notas de la escala pentatónica mayor.
- [x] Sin graves fuertes ni percusión; nada de sirenas, gritos ni risas.
- [x] Se puede apagar: botón de silencio y volumen de música en la vista de padres.

## Criaturas y efectos

Los modelos de los animales y del zombi se arman con cajas de colores planos en `src/render/entityRenderer.ts` (`MODELS`); no hay archivos de modelos ni texturas. El zombi es cartoon: piel verde clara, camisa celeste, ojos grandes con brillo, sonrisa y mejillas rosadas, y camina con los brazos estirados hacia adelante.

El lobo es un perrito gris de caricatura: panza y hocico claros, nariz negra, orejas paradas con el interior rosado y una cola que sube en diagonal. El lobo amigo usa el mismo modelo con un collar rojo y una medallita dorada (`wolfTame`), así que de un vistazo se distingue del salvaje.

Los objetos sueltos también son cajas (`ITEM_MODELS`): la carne es un muslito marrón con un hueso claro, más chico que un bloque, que flota a media altura, sube y baja suavemente y gira, con una sombra pequeña. En la mochila se muestran con emojis (💎, 🍖 y 🐷, en `RESOURCES` de `src/domain/rules/inventory.ts`) y la antorcha de la barra de bloques usa 🔥.

### Checklist "Revisión de efectos"

Spec `experiencia-infantil`, escenario "Revisión de efectos": todo efecto de golpes y desapariciones pertenece al catálogo aprobado (rebote, parpadeo, poof, estrellas, destellos y sonidos suaves). Se revisa en cada PR que agregue una criatura, una herramienta o un efecto.

| Momento | Efecto visual | Sonido | En el catálogo |
|---|---|---|---|
| Golpe a un animal con la mano, el pico o el collar | Rebote: salta hacia arriba (`entityHit` con `boing`) y parpadea (aparece y desaparece) 0,4 s | `boing` | [x] |
| Espada sobre un animal de granja | Nube blanca con estrellas (`poof(pos, "cloud")`) y queda una carne flotando; el animal reaparece al amanecer | `poof` | [x] |
| Recoger la carne (caminando cerca o con un clic) | Destellos donde estaba (`poof(pos, "sparkle")`) y la mochila da un saltito | `pickup` | [x] |
| Zombi derrotado (1 golpe con mano, pico o espada) | Destellos de colores que suben, 0,9 s (`poof(pos, "sparkle")`) | `sparkle` | [x] |
| Zombi que se va al amanecer o con la noche tranquila | Destellos, escalonados en 4 s | `sparkle` | [x] |
| Animal que desaparece (atrapado por un zombi) | Nube blanca con estrellas (`poof(pos, "cloud")`); reaparece al amanecer | `poof` | [x] |
| Golpe a un lobo salvaje con la mano, el pico o un primer espadazo | Retrocede corriendo, alejándose del niño, y parpadea 0,4 s | `boing` | [x] |
| Segundo espadazo a un lobo salvaje | Nube blanca con estrellas (`poof(pos, "cloud")`), sin carne; reaparece al amanecer en su montaña | `poof` | [x] |
| Collar sobre un lobo salvaje (a 3 bloques o menos) | 5 corazones rosados que suben y se balancean, 1 s (`poof(pos, "hearts")`); aparece el collar rojo | `tame` | [x] |
| Cualquier herramienta sobre un lobo amigo | Corazones (`poof(pos, "hearts")`) y un saltito de contento; nunca le hace daño | `woof` | [x] |
| Lobo amigo que toca un zombi | El zombi se va con destellos (`poof(pos, "sparkle")`) | `sparkle` | [x] |
| Lobo salvaje que atrapa un animal de granja | Nube blanca con estrellas (`poof(pos, "cloud")`); el animal reaparece al amanecer | `poof` | [x] |
| El jugador recibe un golpe | Empuje suave, parpadeo de invulnerabilidad y corazón gris en el HUD | `boing` (o `poof` si se queda sin corazones y reaparece) | [x] |
| Zombi que choca con el jugador o un animal | Se queda quieto un momento (estado `bump`) | Ninguno | [x] |

- [x] Sin sangre, heridas, cuerpos ni caídas: nada queda en el suelo (la carne es un ícono de comida que flota, no un cuerpo).
- [x] Sin gritos, gruñidos ni sonidos de dolor: el zombi solo hace "uuuh" y el lobo, "guau-guau".
- [x] Los lobos salvajes nunca lastiman al niño: solo cazan animales de granja (no a los patos), y el lobo amigo no recibe daño.
- [x] Ningún efecto dura más de 1 s ni cubre la pantalla.
- [x] Los colores de los destellos son pasteles (`SPARKLE_COLORS`), sin rojo intenso.
