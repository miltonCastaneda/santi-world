import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import type { Entity, EntityStore } from "../../domain/entities/entityStore";
import { enterState, newBrain, think } from "../../domain/entities/fsm";
import { isSpeciesId } from "../../domain/entities/species";
import { ZOMBIE, ZOMBIE_MACHINE } from "../../domain/entities/zombie";
import { GRAVITY, isStuck, JUMP_VELOCITY, moveBody, type Body } from "../../domain/physics/collide";
import { THINK_EVERY } from "./animals";
import { isPathValid, standY, type PathQueue, type PathWorld } from "./pathfinding";
import { ZOMBIE_AGENT } from "./spawn";

/** Un objetivo sin camino no se vuelve a intentar hasta dentro de este tiempo. */
export const UNREACHABLE_MS = 5000;
/** Si el objetivo se alejó más que esto del destino del camino, se pide otro (como mucho cada 0,5 s). */
const RETARGET_DISTANCE = 2;
const RETARGET_MS = 500;
/** De cerca y al mismo nivel va directo, sin camino. */
const DIRECT_DISTANCE = 2;
/** Prioridad en la cola de caminos: antes que los animales (design D8). */
const PRIORITY = { chase: 0, wander: 3 } as const;

export type ZombieContext = {
  world: PathWorld;
  player: Body;
  /** Velocidad del personaje: el zombi va al 60 %. */
  playerSpeed: number;
  hitPlayer(from: Vec3): void;
  /** El zombi tocó a un animal: hace "poof" y queda pendiente de reaparecer. */
  catchAnimal(id: string): void;
  onSound(s: { id: string; pos: Vec3 }): void;
};

const isZombie = (e: Entity) => e.species === "zombie";
const isFarmAnimal = (e: Entity) => isSpeciesId(e.species);
const dist2d = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const action = (e: Entity) => ZOMBIE_MACHINE.states[e.brain!.state].action;

/**
 * Zombis (spec enemigos-nocturnos, design D7 y D8): buscan lo más cercano alcanzable a 24 bloques o
 * menos, lo persiguen por caminos válidos (nunca atraviesan ni rompen bloques ni saltan más de 1) y
 * al tocarlo hacen una pausa. Comparten la cola de caminos con los animales.
 */
export class ZombieSystem {
  rng: Rng;
  private count = 0;

  constructor(
    seed: string,
    private readonly paths: PathQueue,
  ) {
    this.rng = new Rng(`${seed}:zombies`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:zombies`);
    this.count = 0;
  }

  spawn(store: EntityStore, pos: Vec3, now: number): Entity {
    return store.add({
      id: `zombie-${this.count++}`,
      species: "zombie",
      threat: true,
      body: { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, halfWidth: ZOMBIE.halfWidth, height: ZOMBIE.height, onGround: false },
      yaw: this.rng.range(0, Math.PI * 2),
      brain: newBrain(ZOMBIE_MACHINE, now, this.rng),
      path: null,
      pathStatus: "none",
      goal: null,
      targetId: null,
      unreachable: new Map(),
      despawnAt: null,
      nextSoundAt: now + Math.round(this.rng.range(ZOMBIE.soundEveryMs[0], ZOMBIE.soundEveryMs[1])),
      anim: "idle",
    });
  }

  step(store: EntityStore, ctx: ZombieContext, tick: number, now: number, dtMs: number): void {
    const zombies: Entity[] = [];
    for (const e of store.all()) if (isZombie(e)) zombies.push(e);
    if (zombies.length === 0) return;
    const speed = ctx.playerSpeed * ZOMBIE.speedFactor;
    for (const z of zombies) {
      if (z.despawnAt != null) {
        z.body.vel.x = z.body.vel.z = 0;
        continue;
      }
      if ((tick + z.seq) % THINK_EVERY === 0) this.think(z, store, ctx, now);
      this.steer(z, store, ctx, speed);
    }
    this.separate(store, zombies);
    const dt = dtMs / 1000;
    for (const z of zombies) {
      this.physics(z, ctx.world, dt);
      if (z.despawnAt == null) this.touch(z, store, ctx, now);
      if (now >= (z.nextSoundAt ?? 0)) {
        ctx.onSound({ id: z.id, pos: { ...z.body.pos } });
        z.nextSoundAt = now + Math.round(this.rng.range(ZOMBIE.soundEveryMs[0], ZOMBIE.soundEveryMs[1]));
      }
    }
  }

  /** Posición del objetivo actual, o null si ya no existe o se alejó demasiado. */
  private targetPos(z: Entity, store: EntityStore, ctx: ZombieContext): Vec3 | null {
    if (!z.targetId) return null;
    const pos = z.targetId === "player" ? ctx.player.pos : store.get(z.targetId)?.body.pos;
    if (!pos || dist2d(pos, z.body.pos) > ZOMBIE.seekRadius + 4) return null;
    return pos;
  }

  /** Lo más cercano a 24 bloques o menos (el niño o un animal) que no se sepa inalcanzable. */
  private pickTarget(z: Entity, store: EntityStore, ctx: ZombieContext, now: number): void {
    const pos = z.body.pos;
    const blocked = (id: string) => (z.unreachable!.get(id) ?? 0) > now;
    let best: string | null = null;
    let bestD = Infinity;
    const dp = dist2d(ctx.player.pos, pos);
    if (dp <= ZOMBIE.seekRadius && !blocked("player")) {
      best = "player";
      bestD = dp;
    }
    for (const a of store.near(pos, ZOMBIE.seekRadius, isFarmAnimal)) {
      const d = dist2d(a.body.pos, pos);
      if (d < bestD && !blocked(a.id)) {
        best = a.id;
        bestD = d;
      }
    }
    z.targetId = best;
  }

  private think(z: Entity, store: EntityStore, ctx: ZombieContext, now: number): void {
    const brain = z.brain!;
    if (isStuck(z.body, ctx.world.collision)) z.body.pos.y = Math.floor(z.body.pos.y) + 1;
    let target = this.targetPos(z, store, ctx);
    if (!target) z.targetId = null;

    const act = action(z);
    // Sin camino hasta el objetivo (salvo que esté al lado): inalcanzable por un rato.
    if (act === "chase" && z.targetId && z.pathStatus === "failed" && target && dist2d(target, z.body.pos) > DIRECT_DISTANCE) {
      z.unreachable!.set(z.targetId, now + UNREACHABLE_MS);
      z.targetId = null;
      target = null;
    }
    if (act === "seek" || act === "wander" || !z.targetId) {
      this.pickTarget(z, store, ctx, now);
      target = this.targetPos(z, store, ctx);
    }
    // El niño construyó en el camino: se recalcula al momento (spec "Recalcular camino").
    if (z.pathStatus === "following" && z.path && !isPathValid(ctx.world, z.path)) this.request(z, z.goal ?? null, act === "chase" ? PRIORITY.chase : PRIORITY.wander, now);

    const entered = think(ZOMBIE_MACHINE, brain, { threatDistance: Infinity, outsideHome: false, leaderDistance: Infinity, inWater: false, arrived: z.pathStatus === "done" || z.pathStatus === "failed", hasTarget: z.targetId !== null }, now, this.rng);
    if (entered !== null) {
      this.enter(z, ctx, target, now);
      return;
    }
    if (action(z) === "chase" && target && z.goal && dist2d(target, z.goal) > RETARGET_DISTANCE && now - (z.pathAt ?? 0) >= RETARGET_MS) this.chase(z, ctx, target, now);
    if (action(z) === "wander" && z.pathStatus === "none") this.enter(z, ctx, target, now);
  }

  private enter(z: Entity, ctx: ZombieContext, target: Vec3 | null, now: number): void {
    this.paths.cancel(z.id);
    z.path = null;
    z.goal = null;
    z.pathStatus = "none";
    switch (action(z)) {
      case "chase":
        if (target) this.chase(z, ctx, target, now);
        else z.pathStatus = "failed";
        break;
      case "wander":
        this.request(z, this.wanderSpot(z, ctx), PRIORITY.wander, now);
        break;
      default:
        break;
    }
  }

  private chase(z: Entity, ctx: ZombieContext, target: Vec3, now: number): void {
    const x = Math.floor(target.x);
    const zz = Math.floor(target.z);
    const y = standY(ctx.world, x, zz, Math.floor(target.y + 0.01), ZOMBIE_AGENT);
    this.request(z, y === null ? null : { x, y, z: zz }, PRIORITY.chase, now);
  }

  private request(z: Entity, goal: Vec3 | null, priority: number, now: number): void {
    z.pathAt = now;
    if (!goal) {
      z.pathStatus = "failed";
      return;
    }
    z.goal = goal;
    z.pathStatus = "pending";
    this.paths.request(z.id, z.body.pos, goal, ZOMBIE_AGENT, priority);
  }

  private wanderSpot(z: Entity, ctx: ZombieContext): Vec3 | null {
    const pos = z.body.pos;
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(4, 10);
      const x = Math.floor(pos.x + Math.sin(a) * d);
      const zz = Math.floor(pos.z + Math.cos(a) * d);
      const y = standY(ctx.world, x, zz, Math.floor(pos.y + 0.01), ZOMBIE_AGENT);
      if (y !== null) return { x, y, z: zz };
    }
    return null;
  }

  private steer(z: Entity, store: EntityStore, ctx: ZombieContext, speed: number): void {
    const b = z.body;
    const act = action(z);
    let dx = 0;
    let dz = 0;
    let v = 0;
    const target = act === "chase" ? this.targetPos(z, store, ctx) : null;
    if (target && dist2d(target, b.pos) <= DIRECT_DISTANCE && Math.abs(target.y - b.pos.y) < 1) {
      const len = dist2d(target, b.pos) || 1;
      dx = (target.x - b.pos.x) / len;
      dz = (target.z - b.pos.z) / len;
      v = speed;
    } else if ((act === "chase" || act === "wander") && z.pathStatus === "following" && z.path) {
      const pts = z.path.points;
      let i = z.pathIndex ?? 1;
      let next = pts[i];
      while (next && Math.hypot(next.x - b.pos.x, next.z - b.pos.z) < (i === pts.length - 1 ? 0.25 : 0.45) && Math.abs(next.y - b.pos.y) < 0.6) next = pts[++i];
      z.pathIndex = i;
      if (!next) {
        z.pathStatus = "done";
      } else {
        const tx = next.x - b.pos.x;
        const tz = next.z - b.pos.z;
        const len = Math.hypot(tx, tz) || 1;
        dx = tx / len;
        dz = tz / len;
        v = act === "wander" ? speed * 0.6 : speed;
        if (next.y > b.pos.y + 0.5 && len < 1.4 && b.onGround) b.vel.y = JUMP_VELOCITY;
      }
    }
    b.vel.x = dx * v;
    b.vel.z = dz * v;
    if (v > 0) z.yaw = Math.atan2(dx, dz);
  }

  /** Tocar al niño le quita un corazón; tocar a un animal le hace "poof". Después, una pausa. */
  private touch(z: Entity, store: EntityStore, ctx: ZombieContext, now: number): void {
    if (action(z) === "bump") return;
    const b = z.body;
    const p = ctx.player;
    const touching = (o: Body, dyMax: number) => dist2d(o.pos, b.pos) < b.halfWidth + o.halfWidth + ZOMBIE.touchGap && Math.abs(o.pos.y - b.pos.y) < dyMax;
    if (touching(p, 1.5)) {
      ctx.hitPlayer({ ...b.pos });
      this.bump(z, now);
      return;
    }
    for (const a of store.near(b.pos, 1.5, isFarmAnimal)) {
      if (!touching(a.body, 1.2)) continue;
      ctx.catchAnimal(a.id);
      if (z.targetId === a.id) z.targetId = null;
      this.bump(z, now);
      return;
    }
  }

  private bump(z: Entity, now: number): void {
    enterState(ZOMBIE_MACHINE, z.brain!, "bump", now, this.rng);
    this.paths.cancel(z.id);
    z.path = null;
    z.pathStatus = "none";
    z.body.vel.x = z.body.vel.z = 0;
  }

  private separate(store: EntityStore, zombies: Entity[]): void {
    for (const z of zombies) {
      for (const n of store.near(z.body.pos, 1, isZombie)) {
        if (n === z) continue;
        const dx = z.body.pos.x - n.body.pos.x;
        const dz = z.body.pos.z - n.body.pos.z;
        const d = Math.hypot(dx, dz);
        const min = z.body.halfWidth + n.body.halfWidth;
        if (d >= min) continue;
        const push = (min - d) * 3;
        z.body.vel.x += (d > 1e-6 ? dx / d : z.seq < n.seq ? 1 : -1) * push;
        z.body.vel.z += (d > 1e-6 ? dz / d : 0) * push;
      }
    }
  }

  private physics(z: Entity, w: PathWorld, dt: number): void {
    const b = z.body;
    const fx = Math.floor(b.pos.x);
    const fz = Math.floor(b.pos.z);
    let wy = Math.floor(b.pos.y + 0.3);
    if (w.isWater(fx, wy, fz)) {
      while (w.isWater(fx, wy + 1, fz)) wy++;
      b.vel.y = Math.max(-3, Math.min(3, (wy + 0.4 - b.pos.y) * 6)) + GRAVITY * dt;
    }
    const hit = moveBody(b, dt, w.collision);
    if ((hit.hitX || hit.hitZ) && b.onGround && z.pathStatus === "following") b.vel.y = JUMP_VELOCITY;
    if (b.pos.y < -10) z.despawnAt = 0;
    z.anim = Math.hypot(b.vel.x, b.vel.z) > 0.2 ? "walk" : "idle";
  }
}
