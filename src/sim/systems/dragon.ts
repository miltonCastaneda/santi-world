import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import { DRAGON } from "../../domain/entities/dragon";
import type { Entity, EntityStore } from "../../domain/entities/entityStore";
import type { TreeFeature } from "../../domain/worldgen/layout";

export type DragonPhase = "enter" | "circle" | "burn" | "seek" | "linger" | "exit";

/** Lo que el dragón consulta y cambia del mundo (el juego decide cómo). */
export type DragonContext = {
  size: number;
  trees: readonly TreeFeature[];
  surfaceY: (x: number, z: number) => number;
  player: Vec3;
  /** El árbol sigue entero y natural: nadie cortó su tronco ni construyó en él. */
  isNaturalTree: (t: TreeFeature) => boolean;
  /** Quita las celdas naturales del árbol; devuelve las que cambiaron. */
  burnTree: (t: TreeFeature) => Vec3[];
  freePigChickens: () => Entity[];
  eatPigChicken: (id: string) => void;
};

export type DragonEvent =
  | { type: "fire"; treeId: string; pos: Vec3 }
  | { type: "treeBurnt"; treeId: string; pos: Vec3; cells: Vec3[] }
  | { type: "ate"; pigId: string; pos: Vec3 }
  | { type: "left"; id: string; pos: Vec3 };

type Plan = {
  phase: DragonPhase;
  phaseAt: number;
  trees: TreeFeature[];
  burningSince: number | null;
  pigId: string | null;
  angle: number;
  exitDir: { x: number; z: number };
};

/**
 * Director del dragón (design D7): una ruta fija por noche. Entra desde lejos, da vueltas alrededor
 * del niño, quema 2 árboles, busca un cerdo-gallina libre y vuelve a dar vueltas hasta el amanecer,
 * cuando se va volando (si no lo derrotaron antes con 5 flechas).
 */
export class DragonDirector {
  rng: Rng;
  /** Impactos de esta noche: vuelven a 0 cuando aparece la noche siguiente. */
  hitsTaken = 0;
  defeatedTonight = false;
  /** Árboles quemados que vuelven al amanecer. */
  burntTrees: string[] = [];
  private plan: Plan | null = null;
  private id: string | null = null;
  private lastNight = -1;

  constructor(seed: string) {
    this.rng = new Rng(`${seed}:dragon`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:dragon`);
    this.hitsTaken = 0;
    this.defeatedTonight = false;
    this.burntTrees = [];
    this.plan = null;
    this.id = null;
    this.lastNight = -1;
  }

  get phase(): DragonPhase | null {
    return this.plan?.phase ?? null;
  }

  get dragonId(): string | null {
    return this.id;
  }

  /** A mitad de la noche: aparece una sola vez por noche (no si ya lo derrotaron esta noche). */
  arrive(store: EntityStore, ctx: DragonContext, night: number, now: number): Entity | null {
    if (this.id || this.defeatedTonight || this.lastNight === night) return null;
    this.lastNight = night;
    this.hitsTaken = 0;
    const a = this.rng.range(0, Math.PI * 2);
    const p = ctx.player;
    const clampXZ = (v: number) => Math.max(4, Math.min(ctx.size - 4, v));
    const x = clampXZ(p.x + Math.cos(a) * DRAGON.enterDistance);
    const z = clampXZ(p.z + Math.sin(a) * DRAGON.enterDistance);
    const y = ctx.surfaceY(Math.floor(x), Math.floor(z)) + 1 + DRAGON.cruiseHeight + 4;
    this.id = `dragon-${night}`;
    this.plan = {
      phase: "enter",
      phaseAt: now,
      trees: this.pickTrees(ctx),
      burningSince: null,
      pigId: null,
      angle: Math.atan2(z - p.z, x - p.x),
      exitDir: { x: Math.cos(a), z: Math.sin(a) },
    };
    return store.add({
      id: this.id,
      species: "dragon",
      body: { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, halfWidth: DRAGON.halfWidth, height: DRAGON.height, onGround: false },
      yaw: 0,
      anim: "fly",
      hits: 0,
    });
  }

  /** Los 2 árboles: al azar entre los naturales más cercanos al niño. */
  private pickTrees(ctx: DragonContext): TreeFeature[] {
    const p = ctx.player;
    const near = ctx.trees
      .filter((t) => !this.burntTrees.includes(t.id) && ctx.isNaturalTree(t))
      .map((t) => ({ t, d: Math.hypot(t.x + 0.5 - p.x, t.z + 0.5 - p.z) }))
      .sort((a, b) => a.d - b.d || (a.t.id < b.t.id ? -1 : 1))
      .slice(0, DRAGON.treeChoices)
      .map(({ t }) => t);
    const out: TreeFeature[] = [];
    while (out.length < DRAGON.treesPerNight && near.length > 0) out.push(near.splice(this.rng.int(0, near.length - 1), 1)[0]);
    return out;
  }

  /** Una flecha le pegó. Con 5 hace "poof" y no vuelve esta noche. */
  hit(store: EntityStore): { hits: number; defeated: boolean; pos: Vec3 } | null {
    const e = this.id ? store.get(this.id) : undefined;
    if (!e) return null;
    this.hitsTaken++;
    e.hits = this.hitsTaken;
    const defeated = this.hitsTaken >= DRAGON.hitsToDefeat;
    const pos = { ...e.body.pos };
    if (defeated) {
      store.remove(e.id);
      this.defeatedTonight = true;
      this.plan = null;
      this.id = null;
    }
    return { hits: this.hitsTaken, defeated, pos };
  }

  /** Al amanecer (o con la noche tranquila) se va volando si sigue ahí. */
  leave(now: number): void {
    if (this.plan && this.plan.phase !== "exit") this.setPhase("exit", now);
  }

  /** Al amanecer: la noche siguiente puede volver. */
  dawn(): void {
    this.defeatedTonight = false;
  }

  /** Vuelve a la noche siguiente sin un dragón en vuelo (al abrir un mundo guardado). */
  restore(hitsTaken: number, defeatedTonight: boolean, burntTrees: readonly string[]): void {
    this.hitsTaken = hitsTaken;
    this.defeatedTonight = defeatedTonight;
    this.burntTrees = [...burntTrees];
  }

  step(store: EntityStore, ctx: DragonContext, now: number, dtMs: number): DragonEvent[] {
    const plan = this.plan;
    const e = this.id ? store.get(this.id) : undefined;
    if (!plan || !e) {
      this.plan = null;
      this.id = null;
      return [];
    }
    const events: DragonEvent[] = [];
    const pos = e.body.pos;
    const ground = (x: number, z: number) => ctx.surfaceY(Math.floor(x), Math.floor(z)) + 1;
    const cruise = (x: number, z: number) => Math.max(ground(x, z), ground(pos.x, pos.z)) + DRAGON.cruiseHeight;
    /** Vuela hacia su lugar en el círculo alrededor del niño (avanzando por él si `turn`); devuelve la distancia que falta. */
    const orbit = (turn: boolean) => {
      const p = ctx.player;
      if (turn) plan.angle += ((DRAGON.speed * 0.7) / DRAGON.circleRadius) * (dtMs / 1000);
      const tx = p.x + Math.cos(plan.angle) * DRAGON.circleRadius;
      const tz = p.z + Math.sin(plan.angle) * DRAGON.circleRadius;
      return this.flyTo(e, tx, Math.max(cruise(tx, tz), p.y + DRAGON.cruiseHeight), tz, dtMs);
    };
    switch (plan.phase) {
      case "enter": {
        if (orbit(false) < 1.5) this.setPhase("circle", now);
        break;
      }
      case "circle": {
        orbit(true);
        if (now - plan.phaseAt >= DRAGON.circleMs) this.setPhase(plan.trees.length > 0 ? "burn" : "seek", now);
        break;
      }
      case "burn": {
        const tree = plan.trees[0];
        if (!tree) {
          this.setPhase("seek", now);
          break;
        }
        const top = tree.y + tree.trunk + 2 + DRAGON.burnHeight;
        const gap = this.flyTo(e, tree.x + 0.5, top, tree.z + 0.5, dtMs);
        if (plan.burningSince === null && gap < 1.5) {
          plan.burningSince = now;
          events.push({ type: "fire", treeId: tree.id, pos: { x: tree.x + 0.5, y: tree.y + tree.trunk, z: tree.z + 0.5 } });
        }
        if (plan.burningSince !== null && now - plan.burningSince >= DRAGON.burnMs) {
          const cells = ctx.burnTree(tree);
          if (!this.burntTrees.includes(tree.id)) this.burntTrees.push(tree.id);
          events.push({ type: "treeBurnt", treeId: tree.id, pos: { x: tree.x + 0.5, y: tree.y + 1, z: tree.z + 0.5 }, cells });
          plan.trees.shift();
          plan.burningSince = null;
          if (plan.trees.length === 0) this.setPhase("seek", now);
        }
        break;
      }
      case "seek": {
        // Solo los que están a cielo abierto: bajo un techo (el granero) no los alcanza.
        const pigs = ctx.freePigChickens().filter((p) => ground(p.body.pos.x, p.body.pos.z) <= p.body.pos.y + 0.5);
        let pig = pigs.find((p) => p.id === plan.pigId);
        if (!pig) {
          pig = nearest(pigs, pos);
          plan.pigId = pig?.id ?? null;
        }
        if (now - plan.phaseAt >= DRAGON.seekMs || ctx.freePigChickens().length === 0) {
          this.setPhase("linger", now);
          break;
        }
        if (!pig) {
          // Todos bajo techo por ahora: sigue dando vueltas alrededor del niño mientras espera.
          orbit(true);
          break;
        }
        const pp = pig.body.pos;
        const gapXZ = Math.hypot(pp.x - pos.x, pp.z - pos.z);
        // Vuela alto hasta estar cerca y recién ahí baja (no atraviesa montañas ni la granja).
        const y = gapXZ > 6 ? cruise(pp.x, pp.z) : Math.max(pp.y + 1.5, ground(pp.x, pp.z) + 1);
        this.flyTo(e, pp.x, y, pp.z, dtMs);
        if (gapXZ <= DRAGON.eatRange && Math.abs(pos.y - pp.y) <= DRAGON.eatRange + 1.5) {
          ctx.eatPigChicken(pig.id);
          events.push({ type: "ate", pigId: pig.id, pos: { ...pp } });
          this.setPhase("linger", now);
        }
        break;
      }
      case "linger":
        // Terminó su ruta: vuelve a dar vueltas alrededor del niño hasta el amanecer (más tiempo para las flechas).
        orbit(true);
        break;
      case "exit": {
        // Se aleja del niño, subiendo.
        const ax = pos.x - ctx.player.x;
        const az = pos.z - ctx.player.z;
        const len = Math.hypot(ax, az);
        const dir = len > 1 ? { x: ax / len, z: az / len } : plan.exitDir;
        const tx = pos.x + dir.x * 20;
        const tz = pos.z + dir.z * 20;
        this.flyTo(e, tx, pos.y + 6, tz, dtMs);
        const out = pos.x < -8 || pos.z < -8 || pos.x > ctx.size + 8 || pos.z > ctx.size + 8;
        if (out || now - plan.phaseAt >= DRAGON.exitMs) {
          store.remove(e.id);
          events.push({ type: "left", id: e.id, pos: { ...pos } });
          this.plan = null;
          this.id = null;
        }
        break;
      }
    }
    return events;
  }

  private setPhase(phase: DragonPhase, now: number): void {
    if (!this.plan) return;
    this.plan.phase = phase;
    this.plan.phaseAt = now;
    this.plan.burningSince = null;
  }

  /** Avanza hacia el punto (sin chocar: vuela por encima de todo) y devuelve la distancia que falta. */
  private flyTo(e: Entity, x: number, y: number, z: number, dtMs: number): number {
    const dt = dtMs / 1000;
    const p = e.body.pos;
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(dist, DRAGON.speed * dt);
    const vx = dist > 1e-6 ? (dx / dist) * (step / dt) : 0;
    const vz = dist > 1e-6 ? (dz / dist) * (step / dt) : 0;
    const vy = Math.max(-DRAGON.climbSpeed, Math.min(DRAGON.climbSpeed, (y - p.y) * 2));
    e.body.vel = { x: vx, y: vy, z: vz };
    p.x += vx * dt;
    p.y += vy * dt;
    p.z += vz * dt;
    if (dist > 0.2) e.yaw = Math.atan2(dx, dz);
    return Math.hypot(x - p.x, y - p.y, z - p.z);
  }
}

function nearest(list: readonly Entity[], pos: Vec3): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.body.pos.x - pos.x, e.body.pos.z - pos.z);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}
