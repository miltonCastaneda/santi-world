import type { MachineDef } from "./fsm";

/** Lobos de la montaña boscosa (spec lobos): cazan animales de granja y se domestican con el Collar. */
export const WOLF = {
  halfWidth: 0.3,
  height: 0.85,
  walkSpeed: 2,
  /** Cazando, siguiendo al niño o persiguiendo un zombi: más rápido que el niño (4,3) y que los animales. */
  runSpeed: 4.8,
  /** Viven y descansan a esta distancia del centro de su montaña o menos (spec "Lobos en su montaña"). */
  denRadius: 20,
  /** Población de cada mundo: entre 4 y 6 lobos (según la semilla). */
  count: [4, 6] as const,
  /** El Collar domestica a esta distancia o menos (desde los ojos del niño hasta el lobo). */
  tameRange: 3,
  /** Como máximo 3 lobos amigos siguen al niño; los demás cuidan la granja. */
  maxFollowers: 3,
  /** El lobo amigo sigue al niño entre 2 y 5 bloques; a más de 30 aparece junto a él. */
  followNear: 3,
  followFar: 5,
  teleportBeyond: 30,
  /** El lobo amigo ahuyenta a los zombis a esta distancia o menos. */
  zombieRadius: 6,
  /** Cazando, a esta distancia del animal deja de viajar y va directo hacia él (Stalk). */
  stalkDistance: 16,
  /** La caza se abandona si no termina en este tiempo. */
  huntGiveUpMs: 120_000,
  /** Momento del día en que sale a cazar: una fracción del día, sorteada para cada lobo. */
  huntWindow: [0.1, 0.75] as const,
  /** Los lobos amigos que cuidan la granja se quedan a esta distancia de su centro o menos. */
  guardRadius: 24,
  /** Contacto: distancia entre los bordes de las cajas en XZ. */
  touchGap: 0.25,
  sound: "woof",
  soundEveryMs: [12000, 28000] as const,
} as const;

/** Qué hace un lobo amigo: seguir al niño o cuidar la granja. */
export type WolfRole = "follow" | "guard";

/**
 * Lobo salvaje (design D7): Idle, Wander y Rest cerca de su guarida; una vez por día del juego sale a
 * cazar (Hunt: viaja hacia el animal más cercano; Stalk: va directo a él). Sin camino, o si atrapa a
 * uno, vuelve a su guarida (ReturnDen). Tras un golpe retrocede (Flee). Nunca daña al niño.
 */
export const WILD_WOLF_MACHINE: MachineDef = {
  initial: "idle",
  interrupts: [],
  states: {
    idle: {
      action: "idle",
      ms: [1500, 4000],
      next: [
        { to: "hunt", when: [{ if: "huntDue" }] },
        { to: "returnDen", when: [{ if: "timeUp" }, { if: "outsideHome" }] },
        { to: "wander", when: [{ if: "timeUp" }, { if: "chance", p: 0.45 }] },
        { to: "rest", when: [{ if: "timeUp" }, { if: "chance", p: 0.5 }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    wander: {
      action: "wander",
      ms: [4000, 10000],
      next: [
        { to: "hunt", when: [{ if: "huntDue" }] },
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    rest: {
      action: "rest",
      ms: [8000, 16000],
      next: [
        { to: "hunt", when: [{ if: "huntDue" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    hunt: {
      action: "hunt",
      ms: [WOLF.huntGiveUpMs, WOLF.huntGiveUpMs],
      next: [
        { to: "returnDen", when: [{ if: "noTarget" }] },
        { to: "stalk", when: [{ if: "targetNear", within: WOLF.stalkDistance }] },
        { to: "returnDen", when: [{ if: "pathFailed" }] },
        { to: "returnDen", when: [{ if: "timeUp" }] },
      ],
    },
    // Cada 2 s (o antes, si el animal se mueve) vuelve a calcular el camino: si el niño cerró el
    // hueco, no lo encuentra y desiste (spec "El niño cierra el hueco a tiempo").
    stalk: {
      action: "stalk",
      ms: [2000, 2000],
      next: [
        { to: "returnDen", when: [{ if: "noTarget" }] },
        { to: "returnDen", when: [{ if: "pathFailed" }] },
        { to: "stalk", when: [{ if: "timeUp" }] },
      ],
    },
    returnDen: {
      action: "returnHome",
      ms: [30000, 90000],
      next: [
        { to: "rest", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    flee: { action: "flee", ms: [1200, 1800], next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
  },
};

/**
 * Lobo amigo: sigue al niño (Follow) o cuida la granja (Wander y ReturnHome cerca de ella),
 * persigue a los zombis cercanos (ChaseZombie) y salta contento (Happy). Nunca caza animales.
 */
export const FRIEND_WOLF_MACHINE: MachineDef = {
  initial: "happy",
  interrupts: [{ to: "chaseZombie", when: [{ if: "threatNear", within: WOLF.zombieRadius }] }],
  states: {
    idle: {
      action: "idle",
      ms: [1000, 3000],
      next: [
        { to: "follow", when: [{ if: "leaderAway", beyond: WOLF.followFar }] },
        { to: "returnHome", when: [{ if: "timeUp" }, { if: "outsideHome" }] },
        { to: "wander", when: [{ if: "timeUp" }, { if: "noLeader" }, { if: "chance", p: 0.5 }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    follow: {
      action: "follow",
      ms: [1500, 3000],
      next: [
        { to: "idle", when: [{ if: "leaderNear", within: WOLF.followNear }] },
        { to: "idle", when: [{ if: "noLeader" }] },
        { to: "follow", when: [{ if: "timeUp" }] },
      ],
    },
    wander: {
      action: "wander",
      ms: [3000, 8000],
      next: [
        { to: "follow", when: [{ if: "leaderAway", beyond: WOLF.followFar }] },
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    returnHome: {
      action: "returnHome",
      ms: [20000, 60000],
      next: [
        { to: "idle", when: [{ if: "arrived" }] },
        { to: "idle", when: [{ if: "timeUp" }] },
      ],
    },
    chaseZombie: {
      action: "chase",
      ms: [2000, 2000],
      next: [
        { to: "idle", when: [{ if: "noTarget" }] },
        { to: "chaseZombie", when: [{ if: "timeUp" }] },
      ],
    },
    happy: { action: "happy", ms: [700, 900], next: [{ to: "idle", when: [{ if: "timeUp" }] }] },
  },
};
