/** Colores del cielo (hex sRGB). De día coincide con el cielo de siempre. */
export const DAY_SKY = 0x87ceeb;
export const NIGHT_SKY = 0x0b1030;
const DUSK_SKY = 0xf0a070;

/** Luz mínima de las entidades de noche: se siguen distinguiendo (spec "Visibilidad nocturna mínima"). */
export const NIGHT_HEMI = 0.55;
const DAY_HEMI = 1.2;
const DAY_SUN = 1.8;
const MOON = 0.6;

export type SkyLighting = {
  /** Color del cielo y de la niebla. */
  sky: number;
  /** Intensidad de la luz hemisférica y su color de cielo (más azul de noche). */
  hemi: number;
  hemiColor: number;
  sun: number;
  moon: number;
  /** Opacidad de las estrellas. */
  stars: number;
};

const channel = (hex: number, shift: number) => (hex >> shift) & 0xff;
function mix(a: number, b: number, t: number): number {
  const c = (shift: number) => Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Luz de la escena según la luz del día (1 = día, 0 = noche). Es continua en `daylight`, así que si
 * el reloj cambia de forma gradual (30 s), el cielo y la luz también.
 */
export function skyLighting(daylight: number): SkyLighting {
  const d = clamp01(daylight);
  // Un toque naranja en el atardecer y el amanecer, nada en el día ni en la noche plenos.
  const sky = mix(mix(NIGHT_SKY, DAY_SKY, d), DUSK_SKY, Math.sin(Math.PI * d) * 0.45);
  return {
    sky,
    hemi: NIGHT_HEMI + (DAY_HEMI - NIGHT_HEMI) * d,
    hemiColor: mix(0x8a9ad0, 0xfff4d6, d),
    sun: DAY_SUN * d,
    moon: MOON * (1 - d),
    stars: clamp01(1 - d * 2.5),
  };
}

/** Diferencia relativa (0 a 1) entre dos colores, por canal: para probar que no hay saltos. */
export function colorDistance(a: number, b: number): number {
  return Math.max(...[16, 8, 0].map((s) => Math.abs(channel(a, s) - channel(b, s)) / 255));
}
