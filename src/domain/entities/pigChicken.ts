import type { MachineDef } from "./fsm";
import { THREAT_RADIUS } from "./species";

/** El cerdo-gallina (spec "Cerdo-gallina volador"): camina, vuela en arcos cortos y se captura con un clic. */
export const PIG_CHICKEN = {
  halfWidth: 0.3,
  height: 0.75,
  walkSpeed: 1.5,
  flySpeed: 3.2,
  fleeSpeed: 4.4,
  /** Nunca vuela a más de 8 bloques por encima del suelo que tiene debajo. */
  maxFlyHeight: 8,
  /** Altura de la cima del arco y largo del vuelo, en bloques. */
  arcHeight: [3, 7.5] as const,
  flyDistance: [4, 10] as const,
  /** Los destinos se eligen a esta distancia del centro de la granja o menos (vuela por encima de la cerca). */
  homeRadius: 22,
  /** Se captura con un clic a 4 bloques o menos, con cualquier herramienta. */
  captureRange: 4,
  /** Nunca hay más de 3 libres a la vez (los que faltan reaparecen al amanecer). */
  maxFree: 3,
  sound: "oink",
  soundEveryMs: [9000, 20000] as const,
};

/** Walk, Fly (arcos de hasta 8 bloques), Land y Flee (design D7). Huye volando. */
export const PIG_CHICKEN_MACHINE: MachineDef = {
  initial: "idle",
  interrupts: [{ to: "flee", when: [{ if: "threatNear", within: THREAT_RADIUS }] }],
  states: {
    idle: {
      action: "idle",
      ms: [1200, 3500],
      next: [
        { to: "fly", when: [{ if: "timeUp" }, { if: "chance", p: 0.4 }] },
        { to: "walk", when: [{ if: "timeUp" }, { if: "chance", p: 0.55 }] },
        { to: "peck", when: [{ if: "timeUp" }, { if: "chance", p: 0.5 }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    walk: {
      action: "wander",
      ms: [2000, 5000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    peck: { action: "graze", ms: [1500, 3500], next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
    fly: {
      action: "fly",
      ms: [5000, 7000],
      next: [
        { to: "land", when: [{ if: "arrived" }] },
        { to: "land", when: [{ if: "timeUp" }] },
      ],
    },
    land: {
      action: "land",
      ms: [4000, 4000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    flee: {
      action: "flee",
      ms: [2000, 3000],
      next: [
        { to: "land", when: [{ if: "arrived" }] },
        { to: "land", when: [{ if: "timeUp" }] },
      ],
    },
  },
};
