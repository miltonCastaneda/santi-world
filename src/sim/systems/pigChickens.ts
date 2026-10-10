import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import type { Entity, EntityStore } from "../../domain/entities/entityStore";
import { newBrain, think, type Perception } from "../../domain/entities/fsm";
import { PIG_CHICKEN, PIG_CHICKEN_MACHINE } from "../../domain/entities/pigChicken";
import type { Home } from "../../domain/entities/population";
import { THREAT_RADIUS, type HomeId } from "../../domain/entities/species";
import { GRAVITY, isStuck, JUMP_VELOCITY, moveBody, type CollisionQuery } from "../../domain/physics/collide";
import { THINK_EVERY } from "./animals";

export type PigChickenContext = {
  collision: CollisionQuery;
  /** Y del bloque sólido más alto de la columna. */
  surfaceY(x: number, z: number): number;
  isWater(x: number, y: number, z: number): boolean;
  homes: Record<HomeId, Home> | null;
  onSound(s: { id: string; pos: Vec3 }): void;
};

const ARRIVE = 0.5;
/** Mira el suelo un poco adelante para subir antes de chocar con una pared o un árbol. */
const LOOK_AHEAD = 0.9;
const MAX_CLIMB = 5;
const MAX_FALL = 3;
const isPigChicken = (e: Entity) => e.species === "pigChicken" && e.brain !== undefined;
const action = (e: Entity) => PIG_CHICKEN_MACHINE.states[e.brain!.state]?.action ?? "idle";
const dist2d = (a: Vec3, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Altura del suelo debajo de (x, z), buscando hacia abajo desde `fromY` (la cerca cuenta 1,5). */
export function groundBelow(collision: CollisionQuery, x: number, z: number, fromY: number): number {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  for (let y = Math.floor(fromY); y >= 0; y--) {
    const h = collision(fx, y, fz);
    if (h > 0 && Number.isFinite(h)) return y + h;
  }
  return 0;
}

/**
 * Cerdo-gallinas (spec "Cerdo-gallina volador"): caminan cerca de la granja y vuelan en arcos
 * cortos por encima de la cerca y de los obstáculos, sin pasar nunca de 8 bloques sobre el suelo y
 * sin atravesar bloques (misma física AABB que el resto). No usan el A*: vuelan.
 */
export class PigChickenSystem {
  rng: Rng;
  private freed = 0;

  constructor(seed: string) {
    this.rng = new Rng(`${seed}:pig-chickens`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:pig-chickens`);
    this.freed = 0;
  }

  /** Aparece en la celda (x, z), parado en el suelo o en `y` si se indica (donde lo suelta el niño). */
  spawn(store: EntityStore, ctx: PigChickenContext, at: { x: number; y?: number; z: number }, now: number, slotId?: string): Entity {
    const y = at.y ?? ctx.surfaceY(at.x, at.z) + 1;
    return store.add({
      id: `${slotId ?? `pigChicken-free-${this.freed++}`}@${now}`,
      species: "pigChicken",
      body: { pos: { x: at.x + 0.5, y, z: at.z + 0.5 }, vel: { x: 0, y: 0, z: 0 }, halfWidth: PIG_CHICKEN.halfWidth, height: PIG_CHICKEN.height, onGround: false },
      yaw: this.rng.range(0, Math.PI * 2),
      brain: newBrain(PIG_CHICKEN_MACHINE, now, this.rng),
      slotId,
      home: "farm",
      goal: null,
      flight: null,
      nextSoundAt: now + Math.round(this.rng.range(PIG_CHICKEN.soundEveryMs[0], PIG_CHICKEN.soundEveryMs[1])),
      anim: "idle",
      fleeDir: null,
    });
  }

  step(store: EntityStore, ctx: PigChickenContext, tick: number, now: number, dtMs: number): void {
    const pigs: Entity[] = [];
    for (const e of store.all()) if (isPigChicken(e)) pigs.push(e);
    if (pigs.length === 0) return;
    for (const p of pigs) if ((tick + p.seq) % THINK_EVERY === 0) this.think(p, store, ctx, now);
    const dt = dtMs / 1000;
    for (const p of pigs) {
      this.move(p, ctx, dt);
      if (now >= (p.nextSoundAt ?? 0)) {
        ctx.onSound({ id: p.id, pos: { ...p.body.pos } });
        p.nextSoundAt = now + Math.round(this.rng.range(PIG_CHICKEN.soundEveryMs[0], PIG_CHICKEN.soundEveryMs[1]));
      }
    }
  }

  private think(p: Entity, store: EntityStore, ctx: PigChickenContext, now: number): void {
    if (isStuck(p.body, ctx.collision)) p.body.pos.y = Math.floor(p.body.pos.y) + 1;
    const entered = think(PIG_CHICKEN_MACHINE, p.brain!, this.perceive(p, store), now, this.rng);
    if (entered !== null) this.enter(p, ctx);
    // Restaurado de un guardado: vuela o camina pero todavía no tiene destino.
    else if ((action(p) === "wander" && !p.goal) || ((action(p) === "fly" || action(p) === "flee") && !p.flight)) this.enter(p, ctx);
  }

  private perceive(p: Entity, store: EntityStore): Perception {
    const pos = p.body.pos;
    let threatDistance = Infinity;
    for (const t of store.near(pos, THREAT_RADIUS + 2, (o) => o.threat === true)) {
      const d = dist2d(t.body.pos, pos);
      if (d >= threatDistance) continue;
      threatDistance = d;
      const len = d || 1;
      p.fleeDir = { x: (pos.x - t.body.pos.x) / len, z: (pos.z - t.body.pos.z) / len };
    }
    const act = action(p);
    const arrived =
      act === "wander" ? !p.goal || dist2d(pos, p.goal) < ARRIVE : act === "fly" || act === "flee" ? !p.flight || dist2d(pos, p.flight.to) < ARRIVE : act === "land" ? p.body.onGround : true;
    return { threatDistance, outsideHome: false, leaderDistance: Infinity, inWater: false, arrived };
  }

  private enter(p: Entity, ctx: PigChickenContext): void {
    const act = action(p);
    const pos = p.body.pos;
    p.goal = null;
    p.flight = null;
    p.body.vel.x = p.body.vel.z = 0;
    switch (act) {
      case "wander":
        p.goal = this.pickSpot(p, ctx, 3, 7);
        break;
      case "fly":
        p.flight = { from: { ...pos }, to: this.pickSpot(p, ctx, PIG_CHICKEN.flyDistance[0], PIG_CHICKEN.flyDistance[1]), peak: this.rng.range(PIG_CHICKEN.arcHeight[0], PIG_CHICKEN.arcHeight[1]) };
        break;
      case "flee": {
        let dir = p.fleeDir;
        if (!dir) {
          const a = this.rng.range(0, Math.PI * 2);
          dir = { x: Math.sin(a), z: Math.cos(a) };
        }
        p.flight = { from: { ...pos }, to: { x: pos.x + dir.x * 8, y: 0, z: pos.z + dir.z * 8 }, peak: 4 };
        break;
      }
      default:
        break;
    }
  }

  /** Un lugar en tierra a `min` a `max` bloques; lejos de la granja, hacia ella. */
  private pickSpot(p: Entity, ctx: PigChickenContext, min: number, max: number): Vec3 {
    const pos = p.body.pos;
    const home = ctx.homes?.[p.home ?? "farm"];
    let spot: Vec3 = { x: pos.x, y: 0, z: pos.z };
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(min, max);
      let x = pos.x + Math.sin(a) * d;
      let z = pos.z + Math.cos(a) * d;
      if (home && Math.hypot(x - home.center.x, z - home.center.z) > PIG_CHICKEN.homeRadius) {
        const len = Math.hypot(home.center.x - pos.x, home.center.z - pos.z) || 1;
        x = pos.x + ((home.center.x - pos.x) / len) * d;
        z = pos.z + ((home.center.z - pos.z) / len) * d;
      }
      spot = { x: Math.floor(x) + 0.5, y: 0, z: Math.floor(z) + 0.5 };
      const fx = Math.floor(x);
      const fz = Math.floor(z);
      if (!ctx.isWater(fx, ctx.surfaceY(fx, fz), fz)) break;
    }
    return spot;
  }

  private move(p: Entity, ctx: PigChickenContext, dt: number): void {
    const b = p.body;
    const act = action(p);
    let dx = 0;
    let dz = 0;
    let speed = 0;
    const flying = (act === "fly" || act === "flee") && p.flight;
    if (act === "wander" && p.goal && dist2d(b.pos, p.goal) >= ARRIVE) {
      const len = dist2d(b.pos, p.goal) || 1;
      dx = (p.goal.x - b.pos.x) / len;
      dz = (p.goal.z - b.pos.z) / len;
      speed = PIG_CHICKEN.walkSpeed;
    } else if (flying) {
      const f = p.flight!;
      const total = dist2d(f.from, f.to) || 1;
      const left = dist2d(b.pos, f.to);
      const t = Math.max(0, Math.min(1, 1 - left / total));
      if (left >= ARRIVE) {
        dx = (f.to.x - b.pos.x) / (left || 1);
        dz = (f.to.z - b.pos.z) / (left || 1);
        speed = act === "flee" ? PIG_CHICKEN.fleeSpeed : PIG_CHICKEN.flySpeed;
      }
      // Arco: sube hasta la cima a mitad de camino y baja al llegar; el suelo de adelante cuenta.
      const here = groundBelow(ctx.collision, b.pos.x, b.pos.z, b.pos.y + 0.5);
      const ahead = groundBelow(ctx.collision, b.pos.x + dx * LOOK_AHEAD, b.pos.z + dz * LOOK_AHEAD, b.pos.y + 2.5);
      const desired = Math.max(here, ahead) + Math.max(0.7, f.peak * Math.sin(Math.PI * t));
      // `moveBody` resta la gravedad: se compensa para planear.
      b.vel.y = Math.max(-MAX_FALL, Math.min(MAX_CLIMB, (desired - b.pos.y) * 4)) + GRAVITY * dt;
    } else if (act === "land") {
      // Baja aleteando, despacio.
      b.vel.y = Math.max(b.vel.y, -MAX_FALL);
    }
    // En el agua flota (y desde ahí sale volando o caminando).
    if (!flying && ctx.isWater(Math.floor(b.pos.x), Math.floor(b.pos.y + 0.2), Math.floor(b.pos.z))) b.vel.y = 2 + GRAVITY * dt;
    b.vel.x = dx * speed;
    b.vel.z = dz * speed;
    if (speed > 0) p.yaw = Math.atan2(dx, dz);

    const hit = moveBody(b, dt, ctx.collision);
    if ((hit.hitX || hit.hitZ) && b.onGround && act === "wander") b.vel.y = JUMP_VELOCITY;
    // Nunca más de 8 bloques por encima del suelo que tiene debajo.
    const limit = groundBelow(ctx.collision, b.pos.x, b.pos.z, b.pos.y) + PIG_CHICKEN.maxFlyHeight;
    if (b.pos.y > limit) {
      b.pos.y = limit;
      b.vel.y = Math.min(b.vel.y, 0);
    }
    if (b.pos.y < -10) {
      const c = ctx.homes?.farm.center ?? { x: 128, z: 128 };
      b.pos = { x: c.x, y: ctx.surfaceY(Math.floor(c.x), Math.floor(c.z)) + 1, z: c.z };
      b.vel = { x: 0, y: 0, z: 0 };
    }

    const horizontal = Math.hypot(b.vel.x, b.vel.z);
    p.anim = !b.onGround && (flying || act === "land") ? "fly" : horizontal > 0.2 ? "walk" : act === "graze" ? "graze" : "idle";
  }
}
