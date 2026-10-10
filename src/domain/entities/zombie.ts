import type { MachineDef } from "./fsm";

/** Zombis cartoon (spec enemigos-nocturnos): más lentos que el niño y de un solo golpe. */
export const ZOMBIE = {
  halfWidth: 0.3,
  height: 1.8,
  /** Fracción de la velocidad del personaje (spec "Velocidad": el niño siempre se aleja). */
  speedFactor: 0.6,
  /** Persiguen lo alcanzable a esta distancia o menos. */
  seekRadius: 24,
  /** Contacto: distancia entre los bordes de las cajas en XZ. */
  touchGap: 0.3,
  sound: "groan",
  soundEveryMs: [9000, 18000] as const,
} as const;

/**
 * Seek (busca lo más cercano alcanzable), Chase (sigue el camino; al vencer el estado se vuelve a
 * calcular, así un camino nunca tiene más de 2 s), Bump (pausa tras tocar algo) y Wander (sin nada
 * alcanzable). Design D7.
 */
export const ZOMBIE_MACHINE: MachineDef = {
  initial: "seek",
  interrupts: [],
  states: {
    seek: {
      action: "seek",
      ms: [300, 600],
      next: [
        { to: "chase", when: [{ if: "hasTarget" }] },
        { to: "wander", when: [{ if: "timeUp" }] },
      ],
    },
    chase: {
      action: "chase",
      ms: [2000, 2000],
      next: [
        { to: "wander", when: [{ if: "noTarget" }] },
        { to: "chase", when: [{ if: "timeUp" }] },
      ],
    },
    bump: { action: "bump", ms: [900, 1200], next: [{ to: "seek", when: [{ if: "timeUp" }] }] },
    wander: {
      action: "wander",
      ms: [3000, 6000],
      next: [
        { to: "chase", when: [{ if: "hasTarget" }] },
        { to: "seek", when: [{ if: "timeUp" }] },
      ],
    },
  },
};
