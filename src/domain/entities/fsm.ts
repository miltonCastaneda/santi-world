import type { Rng } from "../../core/rng";

/** Lo que hace la entidad mientras está en un estado. Lo ejecuta el sistema de IA. */
export type ActionKind = "idle" | "wander" | "graze" | "rest" | "flee" | "returnHome" | "follow" | "swim" | "seek" | "chase" | "bump";

/** Condiciones de una transición, como datos (ADR-0005). Todas las de una transición deben cumplirse. */
export type Condition =
  | { if: "threatNear"; within: number }
  | { if: "timeUp" }
  | { if: "arrived" }
  | { if: "chance"; p: number }
  | { if: "outsideHome" }
  | { if: "leaderAway"; beyond: number }
  | { if: "leaderNear"; within: number }
  | { if: "inWater" }
  | { if: "onLand" }
  | { if: "hasTarget" }
  | { if: "noTarget" };

export type Transition = { to: string; when: readonly Condition[] };

export type StateDef = {
  action: ActionKind;
  /** Duración del estado en ms: se sortea entre [min, max] al entrar. */
  ms: readonly [number, number];
  next: readonly Transition[];
};

export type MachineDef = {
  initial: string;
  /** Se evalúan antes que las del estado, salvo si ya se está en el destino (por ejemplo, huir). */
  interrupts: readonly Transition[];
  states: Readonly<Record<string, StateDef>>;
};

/** Lo que la entidad percibe en el momento de pensar. */
export type Perception = {
  /** Distancia a la amenaza más cercana (Infinity si no hay). */
  threatDistance: number;
  outsideHome: boolean;
  /** Distancia al líder (Infinity si no tiene). */
  leaderDistance: number;
  inWater: boolean;
  /** Llegó a su destino o no hay camino. */
  arrived: boolean;
  /** Tiene a quién perseguir (zombis). */
  hasTarget?: boolean;
};

export type Brain = { state: string; enteredAt: number; until: number };

function holds(c: Condition, brain: Brain, p: Perception, now: number, rng: Rng): boolean {
  switch (c.if) {
    case "threatNear":
      return p.threatDistance <= c.within;
    case "timeUp":
      return now >= brain.until;
    case "arrived":
      return p.arrived;
    case "chance":
      return rng.chance(c.p);
    case "outsideHome":
      return p.outsideHome;
    case "leaderAway":
      return p.leaderDistance > c.beyond && Number.isFinite(p.leaderDistance);
    case "leaderNear":
      return p.leaderDistance <= c.within;
    case "inWater":
      return p.inWater;
    case "onLand":
      return !p.inWater;
    case "hasTarget":
      return p.hasTarget === true;
    case "noTarget":
      return p.hasTarget !== true;
  }
}

function matches(t: Transition, brain: Brain, p: Perception, now: number, rng: Rng): boolean {
  // En orden y con cortocircuito: el RNG solo se consume si las condiciones anteriores se cumplen.
  for (const c of t.when) if (!holds(c, brain, p, now, rng)) return false;
  return true;
}

/** Entra en un estado y sortea su duración. */
export function enterState(def: MachineDef, brain: Brain, state: string, now: number, rng: Rng): void {
  const s = def.states[state];
  if (!s) throw new Error(`Estado desconocido: ${state}`);
  brain.state = state;
  brain.enteredAt = now;
  brain.until = now + Math.round(rng.range(s.ms[0], s.ms[1]));
}

export function newBrain(def: MachineDef, now: number, rng: Rng): Brain {
  const brain: Brain = { state: def.initial, enteredAt: now, until: now };
  enterState(def, brain, def.initial, now, rng);
  return brain;
}

/**
 * Un "pensamiento": evalúa las interrupciones y luego las transiciones del estado actual, en orden.
 * Devuelve el estado nuevo, o null si se queda donde está. Determinista con el mismo RNG.
 */
export function think(def: MachineDef, brain: Brain, p: Perception, now: number, rng: Rng): string | null {
  for (const t of def.interrupts) {
    if (t.to === brain.state) continue;
    if (matches(t, brain, p, now, rng)) {
      enterState(def, brain, t.to, now, rng);
      return t.to;
    }
  }
  for (const t of def.states[brain.state].next) {
    if (matches(t, brain, p, now, rng)) {
      enterState(def, brain, t.to, now, rng);
      return t.to;
    }
  }
  return null;
}
