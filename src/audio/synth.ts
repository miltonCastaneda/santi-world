/**
 * Sonidos generados por código (CC0, docs/assets.md): suaves, cortos y sin nada que asuste. Cada
 * uno es una función pura de la frecuencia de muestreo, así que se pueden probar sin navegador.
 */
export const ANIMAL_SOUNDS = ["baa", "moo", "meh", "cluck", "peep", "quack"] as const;
export const SOUND_NAMES = ["step", "place", "break", "bump", "click", "jump", "poof", "boing", "swish", "far", "chime", ...ANIMAL_SOUNDS, "sparkle", "groan", "pickup", "woof", "tame", "gem", "oink", "capture", "release", "shoot", "thunk", "fire", "rawr", "ding"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export function isSoundName(value: string): value is SoundName {
  return (SOUND_NAMES as readonly string[]).includes(value);
}

/** Ruido determinista (no usa Math.random: el mismo sonido siempre suena igual). */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

type Env = { attack: number; decay: number };

function render(rate: number, seconds: number, sample: (t: number, i: number) => number, env: Env): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.round(rate * seconds));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const a = t < env.attack ? t / env.attack : Math.exp(-(t - env.attack) / env.decay);
    out[i] = sample(t, i) * a;
  }
  return out;
}

const tone = (f0: number, f1: number, seconds: number) => (t: number) => Math.sin(2 * Math.PI * (f0 + ((f1 - f0) * t) / (2 * seconds)) * t);

/** Voz con armónicos (más "animal" que un seno puro); la fase se integra para poder variar la frecuencia. */
function voice(rate: number, freq: (t: number) => number, harmonics: readonly number[]): (t: number) => number {
  let phase = 0;
  return (t) => {
    phase += (2 * Math.PI * freq(t)) / rate;
    let v = 0;
    harmonics.forEach((h, k) => (v += h * Math.sin(phase * (k + 1))));
    return v;
  };
}

/** Ventana suave de 0 a 1 y vuelta a 0 entre `from` y `to` segundos (sílabas de un sonido). */
const syllable = (t: number, from: number, to: number) => (t < from || t > to ? 0 : Math.sin((Math.PI * (t - from)) / (to - from)));

/** Muestras del sonido, con picos de 0,5 o menos (el bus maestro tiene además su tope). */
export function synthesize(name: SoundName, rate: number): Float32Array<ArrayBuffer> {
  const rnd = noise(SOUND_NAMES.indexOf(name) + 7);
  switch (name) {
    case "step":
      return render(rate, 0.09, () => rnd() * 0.25, { attack: 0.004, decay: 0.025 });
    case "place":
      return render(rate, 0.12, (t) => 0.4 * tone(520, 380, 0.12)(t) + 0.08 * rnd(), { attack: 0.003, decay: 0.035 });
    case "break":
      return render(rate, 0.18, () => rnd() * 0.35, { attack: 0.002, decay: 0.05 });
    case "bump":
      return render(rate, 0.1, (t) => 0.35 * tone(180, 140, 0.1)(t), { attack: 0.002, decay: 0.03 });
    case "click":
      return render(rate, 0.05, (t) => 0.3 * tone(900, 900, 0.05)(t), { attack: 0.001, decay: 0.012 });
    case "jump":
      return render(rate, 0.16, (t) => 0.25 * tone(300, 620, 0.16)(t), { attack: 0.005, decay: 0.06 });
    case "poof":
      return render(rate, 0.35, (t) => 0.25 * rnd() + 0.2 * tone(700, 1200, 0.35)(t), { attack: 0.01, decay: 0.1 });
    case "boing":
      return render(rate, 0.3, (t) => 0.4 * Math.sin(2 * Math.PI * 220 * t * (1 + 0.25 * Math.sin(2 * Math.PI * 12 * t))), { attack: 0.005, decay: 0.12 });
    case "swish":
      return render(rate, 0.15, (t) => rnd() * 0.2 * Math.sin(Math.PI * (t / 0.15)), { attack: 0.02, decay: 0.08 });
    case "far":
      return render(rate, 0.12, (t) => 0.2 * tone(440, 330, 0.12)(t), { attack: 0.01, decay: 0.04 });
    // Aviso de que se acerca la noche: dos notas de campanita, suaves (sol y mi).
    case "chime": {
      const bell = (f: number, t: number) => Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * t);
      return render(rate, 0.5, (t) => 0.22 * (t < 0.2 ? bell(784, t) : bell(659, t - 0.2) * Math.min(1, (t - 0.2) / 0.01)), { attack: 0.01, decay: 0.25 });
    }
    // Animales: voces suaves y cortas, sin nada que asuste (ni graves fuertes ni chillidos).
    case "baa": {
      const v = voice(rate, (t) => 300 - 40 * t + 12 * Math.sin(2 * Math.PI * 16 * t), [0.22, 0.1, 0.06]);
      return render(rate, 0.45, (t) => v(t) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 16 * t)), { attack: 0.04, decay: 0.2 });
    }
    case "moo": {
      const v = voice(rate, (t) => 150 - 30 * t, [0.2, 0.12, 0.08, 0.04]);
      return render(rate, 0.5, (t) => v(t) * Math.min(1, t / 0.15), { attack: 0.02, decay: 0.3 });
    }
    case "meh": {
      const v = voice(rate, (t) => 380 - 30 * t + 20 * Math.sin(2 * Math.PI * 24 * t), [0.22, 0.1, 0.05]);
      return render(rate, 0.35, v, { attack: 0.02, decay: 0.15 });
    }
    case "cluck": {
      const v = voice(rate, () => 520, [0.25, 0.12, 0.05]);
      return render(rate, 0.3, (t) => (v(t) + 0.06 * rnd()) * Math.max(syllable(t, 0, 0.08), syllable(t, 0.12, 0.2) * 0.8), { attack: 0.003, decay: 0.2 });
    }
    case "peep": {
      const v = voice(rate, (t) => (t < 0.1 ? 2600 + 4000 * t : 2700 + 4000 * (t - 0.14)), [0.25]);
      return render(rate, 0.25, (t) => v(t) * Math.max(syllable(t, 0, 0.09), syllable(t, 0.14, 0.23)), { attack: 0.003, decay: 0.2 });
    }
    case "quack": {
      const v = voice(rate, (t) => 480 - 120 * t, [0.16, 0.12, 0.09, 0.05]);
      return render(rate, 0.25, (t) => v(t) + 0.03 * rnd(), { attack: 0.01, decay: 0.09 });
    }
    // Zombi derrotado: destellos, un arpegio de campanitas que sube (do, mi, sol, do).
    case "sparkle": {
      const notes = [1047, 1319, 1568, 2093];
      return render(
        rate,
        0.45,
        (t) => {
          let v = 0;
          notes.forEach((f, k) => {
            const s = t - k * 0.06;
            if (s > 0) v += Math.sin(2 * Math.PI * f * s) * Math.exp(-s / 0.12) * Math.min(1, s / 0.004);
          });
          return 0.12 * v;
        },
        { attack: 0.003, decay: 0.3 },
      );
    }
    // Recoger un objeto: dos notas rápidas que suben (sol y do), como un "¡pop!" contento.
    case "pickup":
      return render(rate, 0.22, (t) => 0.3 * (t < 0.08 ? tone(784, 784, 0.08)(t) : tone(1047, 1047, 0.14)(t - 0.08) * Math.min(1, (t - 0.08) / 0.005)), { attack: 0.004, decay: 0.08 });
    // Zombi: un "uuuh" bajito y tonto, como un bostezo (nada de gruñidos).
    case "groan": {
      const v = voice(rate, (t) => 210 - 50 * t + 8 * Math.sin(2 * Math.PI * 5 * t), [0.16, 0.08, 0.04]);
      return render(rate, 0.5, (t) => v(t) * Math.min(1, t / 0.12) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * t)), { attack: 0.05, decay: 0.3 });
    }
    // Lobo: un "guau-guau" corto y amistoso, de perrito (nada de aullidos ni gruñidos).
    case "woof": {
      const v = voice(rate, (t) => (t < 0.12 ? 420 - 600 * t : 400 - 600 * (t - 0.17)), [0.2, 0.12, 0.05]);
      return render(rate, 0.32, (t) => (v(t) + 0.03 * rnd()) * Math.max(syllable(t, 0, 0.11), syllable(t, 0.17, 0.29) * 0.85), { attack: 0.005, decay: 0.25 });
    }
    // Domesticar: tres notas contentas que suben (do, mi, sol), con brillo de campanita.
    case "tame": {
      const notes = [784, 988, 1175];
      return render(
        rate,
        0.45,
        (t) => {
          let v = 0;
          notes.forEach((f, k) => {
            const s = t - k * 0.09;
            if (s > 0) v += (Math.sin(2 * Math.PI * f * s) + 0.25 * Math.sin(4 * Math.PI * f * s)) * Math.exp(-s / 0.15) * Math.min(1, s / 0.005);
          });
          return 0.13 * v;
        },
        { attack: 0.004, decay: 0.3 },
      );
    }
    // Minar un diamante: un "tiling" de cristal, tres notas muy agudas y rápidas que titilan.
    case "gem": {
      const notes = [1568, 2349, 3136];
      return render(
        rate,
        0.4,
        (t) => {
          let v = 0;
          notes.forEach((f, k) => {
            const s = t - k * 0.045;
            if (s > 0) v += Math.sin(2 * Math.PI * f * s) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 18 * s)) * Math.exp(-s / 0.1) * Math.min(1, s / 0.003);
          });
          return 0.12 * v;
        },
        { attack: 0.003, decay: 0.25 },
      );
    }
    // Cerdo-gallina: un "oink" chiquito seguido de un "cloc" (mitad cerdito, mitad gallina).
    case "oink": {
      const pig = voice(rate, (t) => 260 + 120 * Math.sin(Math.PI * Math.min(1, t / 0.14)), [0.2, 0.14, 0.08, 0.04]);
      const hen = voice(rate, () => 560, [0.22, 0.1, 0.04]);
      return render(rate, 0.38, (t) => (pig(t) + 0.04 * rnd()) * syllable(t, 0, 0.15) + hen(t) * syllable(t, 0.22, 0.3) * 0.8, { attack: 0.005, decay: 0.3 });
    }
    // Capturar: un "pop" que sube, como algo que entra en la mochila.
    case "capture":
      return render(rate, 0.25, (t) => 0.3 * tone(500, 1300, 0.25)(t) + 0.04 * rnd() * Math.exp(-t / 0.02), { attack: 0.003, decay: 0.09 });
    // Soltar: un aleteo corto (ruido suave a golpecitos) y una nota que baja.
    case "release":
      return render(rate, 0.35, (t) => 0.18 * rnd() * Math.max(0, Math.sin(2 * Math.PI * 22 * t)) + 0.2 * tone(900, 600, 0.35)(t), { attack: 0.01, decay: 0.14 });
    // Arco: la cuerda que vibra ("tuing") y el aire.
    case "shoot":
      return render(rate, 0.22, (t) => 0.28 * Math.sin(2 * Math.PI * 330 * t) * (1 + 0.3 * Math.sin(2 * Math.PI * 40 * t)) + 0.08 * rnd() * Math.exp(-t / 0.03), { attack: 0.002, decay: 0.07 });
    // Flecha que se clava: un "toc" de madera, corto.
    case "thunk":
      return render(rate, 0.12, (t) => 0.3 * tone(240, 160, 0.12)(t) + 0.1 * rnd() * Math.exp(-t / 0.01), { attack: 0.001, decay: 0.03 });
    // Fuego del dragón: un "fffuu" suave de aire tibio, sin crepitar fuerte.
    case "fire": {
      let low = 0;
      return render(
        rate,
        0.5,
        (t) => {
          low += (rnd() - low) * 0.08;
          return 0.45 * low * Math.sin(Math.PI * Math.min(1, t / 0.5));
        },
        { attack: 0.06, decay: 0.25 },
      );
    }
    // Dragón: un "ruar" de dragoncito de dibujo animado (agudo y corto, nunca un rugido grave).
    case "rawr": {
      const v = voice(rate, (t) => 340 + 160 * Math.sin(Math.PI * Math.min(1, t / 0.3)), [0.18, 0.12, 0.07, 0.04]);
      return render(rate, 0.42, (t) => v(t) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 28 * t)), { attack: 0.03, decay: 0.22 });
    }
    // Flecha que le da al dragón: una campanita (cuenta hacia los 5).
    case "ding":
      return render(rate, 0.35, (t) => 0.22 * (Math.sin(2 * Math.PI * 1319 * t) + 0.3 * Math.sin(2 * Math.PI * 2638 * t)), { attack: 0.002, decay: 0.12 });
  }
}

export const MUSIC_TRACKS = ["day", "night"] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];

/** Pentatónica mayor: sin semitonos, ninguna combinación de notas suena disonante. */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

export type MusicDef = {
  bpm: number;
  /** Frecuencia de la nota 0 de la escala. */
  root: number;
  /** Grados de la escala en corcheas (-1 = silencio). */
  melody: readonly number[];
  /** Un grado por compás (8 corcheas), una octava abajo. */
  bass: readonly number[];
  /** Cuánto dura cada nota antes de apagarse (s). */
  decay: number;
};

/** Música que no asusta (docs/assets.md): lenta, suave, en mayor y sin ataques bruscos. */
export const MUSIC: Record<MusicTrack, MusicDef> = {
  day: {
    bpm: 96,
    root: 261.63,
    melody: [0, 2, 4, 2, 3, 4, 5, -1, 4, 3, 2, 0, 1, 2, 0, -1, 0, 2, 4, 5, 7, 5, 4, -1, 3, 4, 2, 1, 0, -1, -1, -1],
    bass: [0, 3, 1, 0],
    decay: 0.35,
  },
  // Canción de cuna para la noche: más lenta, más grave y más suave.
  night: {
    bpm: 66,
    root: 196,
    melody: [4, -1, 2, -1, 3, 2, 0, -1, 1, -1, 2, -1, 0, -1, -1, -1, 4, -1, 5, -1, 4, 2, 3, -1, 2, 1, 0, -1, 0, -1, -1, -1],
    bass: [0, 1, 3, 0],
    decay: 0.6,
  },
};

/** Pico de la música: por debajo de los efectos, para que acompañe sin tapar. */
export const MUSIC_PEAK = 0.25;

export function degreeToHz(root: number, degree: number): number {
  const octave = Math.floor(degree / PENTATONIC.length);
  const semis = PENTATONIC[((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length] + 12 * octave;
  return root * 2 ** (semis / 12);
}

/** Un bucle completo de la pista (se repite sin cortes). */
export function synthesizeMusic(track: MusicTrack, rate: number): Float32Array<ArrayBuffer> {
  const def = MUSIC[track];
  const eighth = 30 / def.bpm;
  const n = Math.round(rate * eighth * def.melody.length);
  const out = new Float32Array(n);
  const note = (start: number, freq: number, amp: number, decay: number, len: number) => {
    const i0 = Math.round(start * rate);
    const i1 = Math.min(n, i0 + Math.round(len * rate));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / rate;
      // Ataque de 40 ms (ninguna nota "golpea") y 50 ms de salida (sin clics al cortar ni en el bucle).
      const env = Math.min(1, t / 0.04, (len - t) / 0.05) * Math.exp(-t / decay);
      out[i] += amp * env * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t));
    }
  };
  def.melody.forEach((deg, k) => {
    if (deg >= 0) note(k * eighth, degreeToHz(def.root, deg), 1, def.decay, Math.min(def.decay * 5, eighth * 4));
  });
  def.bass.forEach((deg, bar) => note(bar * 8 * eighth, degreeToHz(def.root / 2, deg), 0.5, eighth * 4, eighth * 8));
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= MUSIC_PEAK / peak;
  return out;
}
