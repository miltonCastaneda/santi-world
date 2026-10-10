/**
 * Sonidos generados por código (CC0, docs/assets.md): suaves, cortos y sin nada que asuste. Cada
 * uno es una función pura de la frecuencia de muestreo, así que se pueden probar sin navegador.
 */
export const SOUND_NAMES = ["step", "place", "break", "bump", "click", "jump", "poof", "boing", "swish", "far"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

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
  }
}
