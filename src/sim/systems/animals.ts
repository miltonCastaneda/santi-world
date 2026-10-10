import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import type { Entity, EntityKind, EntityStore } from "../../domain/entities/entityStore";
import { newBrain, think, type Perception } from "../../domain/entities/fsm";
import { isItemId } from "../../domain/entities/items";
import type { Home, SpawnSlot } from "../../domain/entities/population";
import { isSpeciesId, SPECIES, THREAT_RADIUS, type HomeId, type SpeciesDef, type SpeciesId } from "../../domain/entities/species";
import { GRAVITY, isStuck, JUMP_VELOCITY, moveBody } from "../../domain/physics/collide";
import { inRect } from "../../domain/worldgen/layout";
import { isPathValid, PathQueue, standY, type PathAgent, type PathWorld } from "./pathfinding";

/** Cada entidad piensa cada 4 ticks (5 veces por segundo), escalonado por su orden de creación. */
export const THINK_EVERY = 4;
/** Prioridades de la cola de caminos: menor primero. */
const PRIORITY = { returnHome: 1, follow: 1, wander: 2, swim: 2 } as const;

export type AnimalContext = {
  world: PathWorld;
  homes: Record<HomeId, Home> | null;
};

export type AnimalSound = { id: string; species: EntityKind; sound: string; pos: Vec3 };

const agentOf = (def: SpeciesDef): PathAgent => ({ height: def.height, swims: def.swims });
const isAnimal = (e: Entity): e is Entity & { species: SpeciesId } => isSpeciesId(e.species) && e.brain !== undefined;

/**
 * IA, movimiento y física de los animales (design D6 a D9). Determinista: un único RNG propio y la
 * iteración en el orden de creación de las entidades.
 */
export class AnimalSystem {
  readonly paths = new PathQueue();
  rng: Rng;

  constructor(seed: string) {
    this.rng = new Rng(`${seed}:animals`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:animals`);
    this.paths.clear();
  }

  /** Hace aparecer un animal en su slot (en el suelo o flotando si es un pato sobre el agua). */
  spawn(store: EntityStore, ctx: AnimalContext, slot: SpawnSlot, now: number, surfaceY: (x: number, z: number) => number): Entity {
    const def = SPECIES[slot.species];
    const y0 = surfaceY(slot.x, slot.z) + 1;
    const y = standY(ctx.world, slot.x, slot.z, y0, agentOf(def)) ?? y0;
    return store.add({
      id: `${slot.id}@${now}`,
      species: slot.species,
      body: { pos: { x: slot.x + 0.5, y, z: slot.z + 0.5 }, vel: { x: 0, y: 0, z: 0 }, halfWidth: def.halfWidth, height: def.height, onGround: false },
      yaw: this.rng.range(0, Math.PI * 2),
      brain: newBrain(def.machine, now, this.rng),
      slotId: slot.id,
      home: slot.home,
      path: null,
      pathStatus: "none",
      goal: null,
      leaderId: null,
      nextSoundAt: now + Math.round(this.rng.range(def.soundEveryMs[0], def.soundEveryMs[1])),
      anim: "idle",
      fleeDir: null,
    });
  }

  step(store: EntityStore, ctx: AnimalContext, tick: number, now: number, dtMs: number, onSound: (s: AnimalSound) => void): void {
    store.reindex();
    this.paths.process(ctx.world, (id, path) => {
      const e = store.get(id);
      if (!e || e.pathStatus !== "pending") return;
      e.path = path;
      e.pathIndex = 1;
      e.pathStatus = path ? (path.points.length > 1 ? "following" : "done") : "failed";
    });

    const animals: (Entity & { species: SpeciesId })[] = [];
    for (const e of store.all()) if (isAnimal(e)) animals.push(e);

    for (const e of animals) {
      const def = SPECIES[e.species];
      if ((tick + e.seq) % THINK_EVERY === 0) this.think(e, def, store, ctx, now);
      this.steer(e, def);
    }
    this.separate(store, animals);
    const dt = dtMs / 1000;
    for (const e of animals) {
      const def = SPECIES[e.species];
      this.physics(e, def, ctx, dt);
      if (now >= (e.nextSoundAt ?? 0)) {
        onSound({ id: e.id, species: e.species, sound: def.sound, pos: { ...e.body.pos } });
        e.nextSoundAt = now + Math.round(this.rng.range(def.soundEveryMs[0], def.soundEveryMs[1]));
      }
    }
  }

  private perceive(e: Entity, def: SpeciesDef, store: EntityStore, ctx: AnimalContext): Perception {
    const pos = e.body.pos;
    let threatDistance = Infinity;
    let threat: Entity | null = null;
    for (const t of store.near(pos, THREAT_RADIUS + 2, (o) => o.threat === true)) {
      const d = Math.hypot(t.body.pos.x - pos.x, t.body.pos.z - pos.z);
      if (d < threatDistance) {
        threatDistance = d;
        threat = t;
      }
    }
    if (threat) {
      const dx = pos.x - threat.body.pos.x;
      const dz = pos.z - threat.body.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      e.fleeDir = { x: dx / len, z: dz / len };
    }

    let leaderDistance = Infinity;
    if (def.leader) {
      let leader = e.leaderId ? store.get(e.leaderId) : undefined;
      if (!leader || dist2d(leader.body.pos, pos) > 12) {
        leader = store.near(pos, 8, (o) => o.species === def.leader)[0];
        e.leaderId = leader?.id ?? null;
      }
      if (leader) leaderDistance = dist2d(leader.body.pos, pos);
    }

    return {
      threatDistance,
      outsideHome: this.outsideHome(e, def, ctx),
      leaderDistance,
      inWater: ctx.world.isWater(Math.floor(pos.x), Math.floor(pos.y + 0.3), Math.floor(pos.z)) || ctx.world.isWater(Math.floor(pos.x), Math.floor(pos.y - 0.2), Math.floor(pos.z)),
      arrived: e.pathStatus === "done" || e.pathStatus === "failed",
    };
  }

  private outsideHome(e: Entity, def: SpeciesDef, ctx: AnimalContext): boolean {
    const home = e.home ? ctx.homes?.[e.home] : undefined;
    if (!home) return false;
    const { x, z } = e.body.pos;
    if (home.rect) return !inRect({ x0: home.rect.x0 + 1, z0: home.rect.z0 + 1, x1: home.rect.x1 - 1, z1: home.rect.z1 - 1 }, Math.floor(x), Math.floor(z));
    return dist2d(home.center, e.body.pos) > def.homeRadius;
  }

  private think(e: Entity, def: SpeciesDef, store: EntityStore, ctx: AnimalContext, now: number): void {
    const brain = e.brain!;
    if (isStuck(e.body, ctx.world.collision)) e.body.pos.y = Math.floor(e.body.pos.y) + 1;
    if (e.pathStatus === "following" && e.path && !isPathValid(ctx.world, e.path)) this.replan(e, def);

    const p = this.perceive(e, def, store, ctx);
    const entered = think(def.machine, brain, p, now, this.rng);
    const action = def.machine.states[brain.state].action;
    if (entered !== null) {
      this.enter(e, def, store, ctx);
      return;
    }
    // Siguiendo al líder: si se movió lejos del destino, se recalcula el camino.
    if (action === "follow" && e.leaderId && e.goal) {
      const leader = store.get(e.leaderId);
      if (leader && dist2d(leader.body.pos, e.goal) > 2) this.enter(e, def, store, ctx);
    }
    // Restaurado de un guardado: el estado tiene acción pero todavía no tiene camino.
    if ((action === "wander" || action === "swim" || action === "returnHome") && e.pathStatus === "none") this.enter(e, def, store, ctx);
  }

  private enter(e: Entity, def: SpeciesDef, store: EntityStore, ctx: AnimalContext): void {
    const action = def.machine.states[e.brain!.state].action;
    this.paths.cancel(e.id);
    e.path = null;
    e.goal = null;
    e.pathStatus = "none";
    if (action !== "flee") e.fleeDir = null;
    switch (action) {
      case "wander":
      case "swim":
        this.request(e, def, this.pickDestination(e, def, ctx, action === "swim"), PRIORITY[action]);
        break;
      case "returnHome":
        this.request(e, def, this.pickHomeSpot(e, def, ctx), PRIORITY.returnHome);
        break;
      case "follow": {
        const leader = e.leaderId ? store.get(e.leaderId) : undefined;
        if (!leader) {
          e.pathStatus = "failed";
          break;
        }
        const l = leader.body.pos;
        const y = standY(ctx.world, Math.floor(l.x), Math.floor(l.z), Math.floor(l.y + 0.01), agentOf(def));
        this.request(e, def, y === null ? null : { x: Math.floor(l.x), y, z: Math.floor(l.z) }, PRIORITY.follow);
        break;
      }
      case "flee":
        if (!e.fleeDir) {
          const a = this.rng.range(0, Math.PI * 2);
          e.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
        }
        break;
      default:
        break;
    }
  }

  private request(e: Entity, def: SpeciesDef, goal: Vec3 | null, priority: number): void {
    if (!goal) {
      e.pathStatus = "failed";
      return;
    }
    e.goal = goal;
    e.pathStatus = "pending";
    this.paths.request(e.id, e.body.pos, goal, agentOf(def), priority);
  }

  private replan(e: Entity, def: SpeciesDef): void {
    if (!e.goal) return;
    e.pathStatus = "pending";
    e.path = null;
    this.paths.request(e.id, e.body.pos, e.goal, agentOf(def), 1);
  }

  /** Destino al azar a 3 a 10 bloques, dentro del radio del hogar. Si el cercado está cerrado, los de fuera no tienen camino. */
  private pickDestination(e: Entity, def: SpeciesDef, ctx: AnimalContext, water: boolean): Vec3 | null {
    const home = e.home ? ctx.homes?.[e.home] : undefined;
    const pos = e.body.pos;
    const agent = agentOf(def);
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(3, 10);
      let x = Math.floor(pos.x + Math.sin(a) * d);
      let z = Math.floor(pos.z + Math.cos(a) * d);
      if (home && Math.hypot(x + 0.5 - home.center.x, z + 0.5 - home.center.z) > def.homeRadius) {
        // Fuera del radio del hogar: se apunta hacia el centro.
        x = Math.floor(pos.x + (home.center.x - pos.x) * 0.3);
        z = Math.floor(pos.z + (home.center.z - pos.z) * 0.3);
      }
      const y = standY(ctx.world, x, z, Math.floor(pos.y + 0.01), agent);
      if (y === null) continue;
      if (water && !ctx.world.isWater(x, y - 1, z)) continue;
      return { x, y, z };
    }
    return null;
  }

  private pickHomeSpot(e: Entity, def: SpeciesDef, ctx: AnimalContext): Vec3 | null {
    const home = e.home ? ctx.homes?.[e.home] : undefined;
    if (!home) return null;
    const agent = agentOf(def);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(home.center.x + this.rng.range(-5, 5));
      const z = Math.floor(home.center.z + this.rng.range(-5, 5));
      const y = standY(ctx.world, x, z, Math.floor(e.body.pos.y + 0.01), agent);
      if (y !== null) return { x, y, z };
    }
    return null;
  }

  /** Velocidad pedida según la acción: seguir el camino o huir en línea recta. */
  private steer(e: Entity, def: SpeciesDef): void {
    const b = e.body;
    const action = def.machine.states[e.brain!.state].action;
    let dx = 0;
    let dz = 0;
    let speed = 0;
    if (action === "flee" && e.fleeDir) {
      dx = e.fleeDir.x;
      dz = e.fleeDir.z;
      speed = def.runSpeed;
    } else if (e.pathStatus === "following" && e.path) {
      const pts = e.path.points;
      let i = e.pathIndex ?? 1;
      let target = pts[i];
      while (target && Math.hypot(target.x - b.pos.x, target.z - b.pos.z) < (i === pts.length - 1 ? 0.25 : 0.45) && Math.abs(target.y - b.pos.y) < 0.6) {
        i++;
        target = pts[i];
      }
      e.pathIndex = i;
      if (!target) {
        e.pathStatus = "done";
      } else {
        const tx = target.x - b.pos.x;
        const tz = target.z - b.pos.z;
        const len = Math.hypot(tx, tz) || 1;
        dx = tx / len;
        dz = tz / len;
        speed = action === "follow" ? def.walkSpeed * 1.3 : def.walkSpeed;
        // Escalón: salta al acercarse a una celda más alta.
        if (target.y > b.pos.y + 0.5 && len < 1.4 && b.onGround) b.vel.y = JUMP_VELOCITY;
      }
    }
    b.vel.x = dx * speed;
    b.vel.z = dz * speed;
    if (speed > 0) e.yaw = Math.atan2(dx, dz);
  }

  /** Separación suave: los animales que se superponen se empujan un poco (sin respuesta rígida). */
  private separate(store: EntityStore, animals: Entity[]): void {
    for (const e of animals) {
      for (const n of store.near(e.body.pos, 1.2)) {
        if (n === e || isItemId(n.species)) continue;
        const dx = e.body.pos.x - n.body.pos.x;
        const dz = e.body.pos.z - n.body.pos.z;
        const d = Math.hypot(dx, dz);
        const min = e.body.halfWidth + n.body.halfWidth;
        if (d >= min) continue;
        const push = (min - d) * 3;
        // Exactamente en el mismo punto: se separan según su orden de creación.
        const nx = d > 1e-6 ? dx / d : e.seq < n.seq ? 1 : -1;
        const nz = d > 1e-6 ? dz / d : 0;
        e.body.vel.x += nx * push;
        e.body.vel.z += nz * push;
      }
    }
  }

  private physics(e: Entity, def: SpeciesDef, ctx: AnimalContext, dt: number): void {
    const b = e.body;
    const w = ctx.world;
    const fx = Math.floor(b.pos.x);
    const fz = Math.floor(b.pos.z);
    // Flotar: todos los animales salen a la superficie; el pato se queda flotando.
    let wy = Math.floor(b.pos.y + 0.3);
    const inWater = w.isWater(fx, wy, fz);
    if (inWater) {
      while (w.isWater(fx, wy + 1, fz)) wy++;
      const target = wy + 1 - (def.swims ? 0.3 : 0.6);
      b.vel.y = Math.max(-3, Math.min(3, (target - b.pos.y) * 6)) + GRAVITY * dt;
    }
    const hit = moveBody(b, dt, w.collision);
    if ((hit.hitX || hit.hitZ) && b.onGround) {
      if (e.fleeDir) {
        // Contra una pared al huir: sigue de costado.
        e.fleeDir = hit.hitX ? { x: 0, z: Math.sign(e.fleeDir.z) || 1 } : { x: Math.sign(e.fleeDir.x) || 1, z: 0 };
      } else if (e.pathStatus === "following") {
        b.vel.y = JUMP_VELOCITY;
      }
    }
    if (b.pos.y < -10 && e.home && ctx.homes) {
      const c = ctx.homes[e.home].center;
      b.pos = { x: c.x, y: 40, z: c.z };
      b.vel = { x: 0, y: 0, z: 0 };
    }

    const horizontal = Math.hypot(b.vel.x, b.vel.z);
    const action = def.machine.states[e.brain!.state].action;
    e.anim =
      inWater || (def.swims && action === "swim" && w.isWater(fx, Math.floor(b.pos.y - 0.2), fz))
        ? "swim"
        : horizontal > def.walkSpeed * 1.4
          ? "run"
          : horizontal > 0.2
            ? "walk"
            : action === "graze"
              ? "graze"
              : action === "rest"
                ? "rest"
                : "idle";
  }
}

function dist2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
