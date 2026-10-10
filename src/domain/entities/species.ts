import type { MachineDef, Transition } from "./fsm";

export const SPECIES_IDS = ["sheep", "cow", "goat", "hen", "chick", "duck"] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** Hogar de un animal: la granja (dentro del cercado), el estanque o la guarida de los lobos. */
export type HomeId = "farm" | "pond" | "den";

export function isHomeId(value: unknown): value is HomeId {
  return value === "farm" || value === "pond" || value === "den";
}

export type SpeciesDef = {
  id: SpeciesId;
  name: string;
  /** Caja de colisión: mitad del ancho y alto, en bloques. */
  halfWidth: number;
  height: number;
  /** Bloques por segundo al caminar y al huir. */
  walkSpeed: number;
  runSpeed: number;
  home: HomeId;
  /** Los destinos de deambular se eligen a esta distancia del centro del hogar o menos. */
  homeRadius: number;
  /** Puede nadar: el agua es transitable y flota en ella. */
  swims: boolean;
  /** Especie a la que sigue (los pollos, a las gallinas). */
  leader?: SpeciesId;
  /** Nombre del sonido (lo traduce el audio) y cada cuánto lo emite, en ms. */
  sound: string;
  soundEveryMs: readonly [number, number];
  machine: MachineDef;
};

/** Huir de lobos salvajes y zombis a 6 bloques o menos (spec "Huir de una amenaza"). */
export const THREAT_RADIUS = 6;
const flee: Transition = { to: "flee", when: [{ if: "threatNear", within: THREAT_RADIUS }] };
const fleeState = {
  action: "flee",
  ms: [2500, 4000],
  next: [
    { to: "flee", when: [{ if: "timeUp" }, { if: "threatNear", within: THREAT_RADIUS + 2 }] },
    { to: "idle", when: [{ if: "timeUp" }] },
  ],
} as const;

/** Oveja, vaca y cabra: Idle, Wander, Graze, Rest, Flee y ReturnHome (design D7). */
function grazer(graze: readonly [number, number]): MachineDef {
  return {
    initial: "idle",
    interrupts: [flee],
    states: {
      idle: {
        action: "idle",
        ms: [1500, 4000],
        next: [
          // Fuera del cercado, antes de descansar vuelve hacia la granja (spec "Volver al hogar").
          { to: "returnHome", when: [{ if: "timeUp" }, { if: "outsideHome" }, { if: "chance", p: 0.35 }] },
          { to: "wander", when: [{ if: "timeUp" }, { if: "chance", p: 0.5 }] },
          { to: "graze", when: [{ if: "timeUp" }, { if: "chance", p: 0.6 }] },
          { to: "rest", when: [{ if: "timeUp" }, { if: "chance", p: 0.5 }] },
          { to: "idle", when: [{ if: "timeUp" }] },
        ],
      },
      wander: {
        action: "wander",
        ms: [4000, 12000],
        next: [
          { to: "graze", when: [{ if: "arrived" }, { if: "chance", p: 0.5 }] },
          { to: "idle", when: [{ if: "arrived" }] },
          { to: "idle", when: [{ if: "timeUp" }] },
        ],
      },
      graze: { action: "graze", ms: graze, next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
      rest: {
        action: "rest",
        ms: [6000, 14000],
        next: [
          { to: "returnHome", when: [{ if: "timeUp" }, { if: "outsideHome" }] },
          { to: "idle", when: [{ if: "timeUp" }] },
        ],
      },
      returnHome: {
        action: "returnHome",
        ms: [10000, 20000],
        next: [
          { to: "rest", when: [{ if: "arrived" }] },
          { to: "idle", when: [{ if: "timeUp" }] },
        ],
      },
      flee: fleeState,
    },
  };
}

const hen: MachineDef = {
  initial: "idle",
  interrupts: [flee],
  states: {
    idle: {
      action: "idle",
      ms: [1000, 3000],
      next: [
        { to: "wander", when: [{ if: "timeUp" }, { if: "chance", p: 0.55 }] },
        { to: "peck", when: [{ if: "timeUp" }] },
      ],
    },
    wander: {
      action: "wander",
      ms: [3000, 9000],
      next: [
        { to: "peck", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    peck: { action: "graze", ms: [2000, 5000], next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
    flee: fleeState,
  },
};

/** Los pollos siguen a la gallina más cercana (FollowLeader) y la alcanzan si se aleja más de 3 bloques. */
const chick: MachineDef = {
  initial: "idle",
  interrupts: [flee, { to: "follow", when: [{ if: "leaderAway", beyond: 4 }] }],
  states: {
    idle: {
      action: "idle",
      ms: [800, 2500],
      next: [
        { to: "follow", when: [{ if: "leaderAway", beyond: 2.5 }] },
        { to: "wander", when: [{ if: "timeUp" }, { if: "chance", p: 0.3 }] },
        { to: "peck", when: [{ if: "timeUp" }] },
      ],
    },
    follow: {
      action: "follow",
      ms: [1500, 4000],
      next: [
        { to: "idle", when: [{ if: "leaderNear", within: 1.8 }] },
        { to: "follow", when: [{ if: "timeUp" }, { if: "leaderAway", beyond: 2.5 }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    wander: {
      action: "wander",
      ms: [2000, 5000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    peck: { action: "graze", ms: [1500, 3500], next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
    flee: fleeState,
  },
};

/** El pato camina por la orilla y nada en el estanque (Swim); flota en el agua. */
const duck: MachineDef = {
  initial: "swim",
  interrupts: [flee],
  states: {
    idle: {
      action: "idle",
      ms: [1500, 4000],
      next: [
        { to: "swim", when: [{ if: "timeUp" }, { if: "chance", p: 0.6 }] },
        { to: "wander", when: [{ if: "timeUp" }] },
      ],
    },
    swim: {
      action: "swim",
      ms: [5000, 12000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    wander: {
      action: "wander",
      ms: [3000, 8000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    flee: fleeState,
  },
};

const FARM_RADIUS = 30;

export const SPECIES: Readonly<Record<SpeciesId, SpeciesDef>> = {
  sheep: { id: "sheep", name: "Oveja", halfWidth: 0.4, height: 1.2, walkSpeed: 1.6, runSpeed: 3.6, home: "farm", homeRadius: FARM_RADIUS, swims: false, sound: "baa", soundEveryMs: [9000, 22000], machine: grazer([3000, 7000]) },
  cow: { id: "cow", name: "Vaca", halfWidth: 0.45, height: 1.35, walkSpeed: 1.4, runSpeed: 3.2, home: "farm", homeRadius: FARM_RADIUS, swims: false, sound: "moo", soundEveryMs: [12000, 26000], machine: grazer([4000, 9000]) },
  goat: { id: "goat", name: "Cabra", halfWidth: 0.35, height: 1.1, walkSpeed: 1.9, runSpeed: 4, home: "farm", homeRadius: FARM_RADIUS, swims: false, sound: "meh", soundEveryMs: [10000, 24000], machine: grazer([2000, 5000]) },
  hen: { id: "hen", name: "Gallina", halfWidth: 0.25, height: 0.7, walkSpeed: 1.5, runSpeed: 3.4, home: "farm", homeRadius: FARM_RADIUS, swims: false, sound: "cluck", soundEveryMs: [7000, 18000], machine: hen },
  chick: { id: "chick", name: "Pollito", halfWidth: 0.15, height: 0.4, walkSpeed: 1.9, runSpeed: 3.4, home: "farm", homeRadius: FARM_RADIUS, swims: false, leader: "hen", sound: "peep", soundEveryMs: [5000, 14000], machine: chick },
  duck: { id: "duck", name: "Pato", halfWidth: 0.25, height: 0.7, walkSpeed: 1.4, runSpeed: 3.2, home: "pond", homeRadius: 11, swims: true, sound: "quack", soundEveryMs: [8000, 20000], machine: duck },
};

export function isSpeciesId(value: string): value is SpeciesId {
  return (SPECIES_IDS as readonly string[]).includes(value);
}
