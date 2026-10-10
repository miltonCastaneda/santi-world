import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import type { Entity, EntityStore } from "../../domain/entities/entityStore";
import { enterState, newBrain, think, type MachineDef, type Perception } from "../../domain/entities/fsm";
import type { Home, SpawnSlot } from "../../domain/entities/population";
import { isSpeciesId, type HomeId } from "../../domain/entities/species";
import { FRIEND_WOLF_MACHINE, WILD_WOLF_MACHINE, WOLF, type WolfRole } from "../../domain/entities/wolf";
import { GRAVITY, isStuck, JUMP_VELOCITY, moveBody, type Body } from "../../domain/physics/collide";
import { inRect } from "../../domain/worldgen/layout";
import { THINK_EVERY } from "./animals";
import { isPathValid, standY, type PathAgent, type PathQueue, type PathWorld } from "./pathfinding";

export const WOLF_AGENT: PathAgent = { height: WOLF.height, swims: false };
/** Los viajes largos (de la montaña a la granja, unos 100 bloques) se hacen en tramos que caben en el presupuesto del A*. */
const HOP = 14;
const MAX_HOP_FAILS = 6;
const HOP_ANGLES = [0, 0.5, -0.5, 1, -1];
/** Llegó a su destino lejano. */
const ARRIVE_DISTANCE = 2;
/** De cerca y al mismo nivel va directo, sin camino. */
const DIRECT_DISTANCE = 2;
/** Si el objetivo se alejó más que esto del destino del camino, se pide otro (como mucho cada 0,5 s). */
const RETARGET_DISTANCE = 2;
const RETARGET_MS = 500;
/** El lobo amigo deja de perseguir a un zombi que se alejó más que esto. */
const CHASE_LOST = 10;
/** Prioridades de la cola de caminos (design D8): zombis 0, lobos cazando 1, deambular al final. */
const PRIORITY = { chase: 0, stalk: 1, hunt: 1, follow: 1, returnHome: 2, wander: 3 } as const;

export type WolfContext = {
  world: PathWorld;
  surfaceY(x: number, z: number): number;
  homes: Record<HomeId, Home> | null;
  player: Body;
  /** Día del juego, si ahora es de día (fase `day`) y qué fracción del día ya pasó. */
  dayCount: number;
  isDay: boolean;
  dayFraction: number;
  /** El lobo salvaje atrapó a un animal de granja: hace "poof" y queda pendiente de reaparecer. */
  catchAnimal(id: string): void;
  /** Un lobo amigo tocó a un zombi: hace "poof". */
  scareZombie(id: string): void;
  onSound(s: { id: string; pos: Vec3 }): void;
};

const isWolf = (e: Entity) => e.species === "wolf";
const isZombie = (e: Entity) => e.species === "zombie";
/** Solo cazan a los animales del cercado: si la granja está bien cerrada, ninguno se pierde por un lobo. */
const isPrey = (e: Entity) => isSpeciesId(e.species) && e.home === "farm";
const dist2d = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const machineOf = (w: Entity): MachineDef => (w.tamed ? FRIEND_WOLF_MACHINE : WILD_WOLF_MACHINE);
const action = (w: Entity) => machineOf(w).states[w.brain!.state].action;

/**
 * Lobos (spec lobos, design D7 y D8). Los salvajes viven en su montaña y una vez por día del juego
 * salen a cazar un animal de la granja, siempre por caminos válidos (no atraviesan, no rompen y no
 * saltan más de 1 bloque); los amigos siguen al niño o cuidan la granja y ahuyentan a los zombis.
 * Comparten la cola de caminos con los animales y los zombis.
 */
export class WolfSystem {
  rng: Rng;

  constructor(
    seed: string,
    private readonly paths: PathQueue,
  ) {
    this.rng = new Rng(`${seed}:wolves`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:wolves`);
  }

  spawn(store: EntityStore, ctx: WolfContext, slot: SpawnSlot, now: number): Entity {
    const y0 = ctx.surfaceY(slot.x, slot.z) + 1;
    const y = standY(ctx.world, slot.x, slot.z, y0, WOLF_AGENT) ?? y0;
    return store.add({
      id: `${slot.id}@${now}`,
      species: "wolf",
      threat: true,
      tamed: false,
      body: { pos: { x: slot.x + 0.5, y, z: slot.z + 0.5 }, vel: { x: 0, y: 0, z: 0 }, halfWidth: WOLF.halfWidth, height: WOLF.height, onGround: false },
      yaw: this.rng.range(0, Math.PI * 2),
      brain: newBrain(WILD_WOLF_MACHINE, now, this.rng),
      slotId: slot.id,
      home: "den",
      path: null,
      pathStatus: "none",
      goal: null,
      dest: null,
      hopFails: 0,
      targetId: null,
      huntDay: 0,
      huntFrac: this.huntFrac(),
      hits: 0,
      nextSoundAt: now + Math.round(this.rng.range(WOLF.soundEveryMs[0], WOLF.soundEveryMs[1])),
      anim: "idle",
      fleeDir: null,
    });
  }

  /** Domestica a un lobo salvaje: se vuelve amigo para siempre y deja de cazar. */
  tame(w: Entity, store: EntityStore, now: number): WolfRole {
    let followers = 0;
    for (const o of store.all()) if (isWolf(o) && o.tamed && o.role === "follow") followers++;
    w.tamed = true;
    w.threat = false;
    w.role = followers < WOLF.maxFollowers ? "follow" : "guard";
    w.home = "farm";
    w.hits = 0;
    w.targetId = null;
    w.brain = newBrain(FRIEND_WOLF_MACHINE, now, this.rng);
    this.stop(w);
    if (w.body.onGround) w.body.vel.y = 5;
    return w.role;
  }

  /** Golpe a un lobo salvaje: retrocede, alejándose de `from`. */
  flee(w: Entity, from: Vec3, now: number): void {
    const dx = w.body.pos.x - from.x;
    const dz = w.body.pos.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    enterState(WILD_WOLF_MACHINE, w.brain!, "flee", now, this.rng);
    this.stop(w);
    w.fleeDir = { x: dx / len, z: dz / len };
  }

  /** Golpe a un lobo amigo: no le pasa nada, salta contento. */
  happy(w: Entity, now: number): void {
    enterState(FRIEND_WOLF_MACHINE, w.brain!, "happy", now, this.rng);
    this.stop(w);
    if (w.body.onGround) w.body.vel.y = 5;
  }

  step(store: EntityStore, ctx: WolfContext, tick: number, now: number, dtMs: number): void {
    const wolves: Entity[] = [];
    for (const e of store.all()) if (isWolf(e) && e.brain) wolves.push(e);
    if (wolves.length === 0) return;
    let prey = 0;
    for (const e of store.all()) if (isPrey(e)) prey++;
    for (const w of wolves) {
      if ((tick + w.seq) % THINK_EVERY === 0) this.think(w, store, ctx, now, prey > 0);
      this.steer(w, store, ctx);
    }
    this.separate(store, wolves);
    const dt = dtMs / 1000;
    for (const w of wolves) {
      this.physics(w, ctx, dt);
      this.touch(w, store, ctx, now);
      if (now >= (w.nextSoundAt ?? 0)) {
        ctx.onSound({ id: w.id, pos: { ...w.body.pos } });
        w.nextSoundAt = now + Math.round(this.rng.range(WOLF.soundEveryMs[0], WOLF.soundEveryMs[1]));
      }
    }
  }

  private huntFrac(): number {
    return this.rng.range(WOLF.huntWindow[0], WOLF.huntWindow[1]);
  }

  private stop(w: Entity): void {
    this.paths.cancel(w.id);
    w.path = null;
    w.goal = null;
    w.dest = null;
    w.hopFails = 0;
    w.pathStatus = "none";
    w.fleeDir = null;
    w.body.vel.x = w.body.vel.z = 0;
  }

  /** Posición del objetivo actual (un animal, un zombi o el niño), o null si ya no está. */
  private targetPos(w: Entity, store: EntityStore, ctx: WolfContext): Vec3 | null {
    if (!w.targetId) return null;
    if (w.targetId === "player") return ctx.player.pos;
    return store.get(w.targetId)?.body.pos ?? null;
  }

  private nearest(w: Entity, store: EntityStore, radius: number, filter: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    const candidates = Number.isFinite(radius) ? store.near(w.body.pos, radius, filter) : [...store.all()].filter(filter);
    for (const o of candidates) {
      const d = dist2d(o.body.pos, w.body.pos);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  private perceive(w: Entity, store: EntityStore, ctx: WolfContext, now: number, hasPrey: boolean): Perception {
    const pos = w.body.pos;
    const act = action(w);
    const homes = ctx.homes;
    const arrivedTravel = w.dest ? dist2d(w.dest, pos) <= ARRIVE_DISTANCE || (w.hopFails ?? 0) >= MAX_HOP_FAILS : w.pathStatus === "done" || w.pathStatus === "failed";
    const base: Perception = { threatDistance: Infinity, outsideHome: false, leaderDistance: Infinity, inWater: false, arrived: arrivedTravel };

    if (!w.tamed) {
      if (act === "hunt" || act === "stalk") {
        const valid = w.targetId ? store.get(w.targetId) : undefined;
        if (now >= (w.huntUntil ?? 0)) w.targetId = null;
        else if (!valid || !isPrey(valid)) w.targetId = this.nearest(w, store, Infinity, isPrey)?.id ?? null;
      }
      const target = this.targetPos(w, store, ctx);
      const den = homes?.den.center;
      return {
        ...base,
        outsideHome: den ? dist2d(den, pos) > WOLF.denRadius : false,
        hasTarget: target !== null,
        targetDistance: target ? dist2d(target, pos) : Infinity,
        pathFailed: act === "stalk" ? w.pathStatus === "failed" && (!target || dist2d(target, pos) > DIRECT_DISTANCE) : act === "hunt" && (w.hopFails ?? 0) >= MAX_HOP_FAILS,
        huntDue: hasPrey && ctx.isDay && (w.huntDay ?? 0) < ctx.dayCount && ctx.dayFraction >= (w.huntFrac ?? 0.5),
      };
    }

    // Lobo amigo: el zombi más cercano (para el interruptor) y el que persigue.
    const zombie = this.nearest(w, store, WOLF.zombieRadius, isZombie);
    if (act === "chase") {
      const current = w.targetId ? store.get(w.targetId) : undefined;
      if (!current || !isZombie(current) || dist2d(current.body.pos, pos) > CHASE_LOST) w.targetId = zombie?.id ?? null;
    }
    const farm = homes?.farm.center;
    return {
      ...base,
      threatDistance: zombie ? dist2d(zombie.body.pos, pos) : Infinity,
      leaderDistance: w.role === "follow" ? dist2d(ctx.player.pos, pos) : Infinity,
      outsideHome: w.role === "guard" && farm ? dist2d(farm, pos) > WOLF.guardRadius : false,
      hasTarget: act === "chase" ? w.targetId !== null : false,
    };
  }

  private think(w: Entity, store: EntityStore, ctx: WolfContext, now: number, hasPrey: boolean): void {
    const brain = w.brain!;
    if (isStuck(w.body, ctx.world.collision)) w.body.pos.y = Math.floor(w.body.pos.y) + 1;
    if (w.tamed && w.role === "follow" && dist2d(ctx.player.pos, w.body.pos) > WOLF.teleportBeyond) this.teleportToPlayer(w, ctx, now);
    // El niño construyó en el camino: se recalcula (en la caza, si ya no hay camino, desiste).
    if (w.pathStatus === "following" && w.path && !isPathValid(ctx.world, w.path)) {
      if (w.dest) this.travel(w, ctx, w.dest, this.priority(w), now, false);
      else if (w.goal) this.request(w, w.goal, this.priority(w), now);
    }
    // Un tramo del viaje terminó o no tuvo camino.
    if (w.dest && w.pathStatus === "failed") {
      w.hopFails = (w.hopFails ?? 0) + 1;
      w.pathStatus = "none";
    }

    const p = this.perceive(w, store, ctx, now, hasPrey);
    const entered = think(machineOf(w), brain, p, now, this.rng);
    if (entered !== null) {
      this.enter(w, store, ctx, now);
      return;
    }
    const act = action(w);
    const target = this.targetPos(w, store, ctx);
    if (w.dest && (w.pathStatus === "done" || w.pathStatus === "none") && dist2d(w.dest, w.body.pos) > ARRIVE_DISTANCE && (w.hopFails ?? 0) < MAX_HOP_FAILS) {
      if (w.pathStatus === "done") w.hopFails = 0;
      // La caza sigue al animal, que se mueve.
      this.travel(w, ctx, act === "hunt" && target ? target : w.dest, this.priority(w), now, true);
    }
    if ((act === "stalk" || act === "chase" || act === "follow") && target && w.goal && dist2d(target, w.goal) > RETARGET_DISTANCE && now - (w.pathAt ?? 0) >= RETARGET_MS) this.goTo(w, ctx, target, now);
    // Restaurado de un guardado: el estado tiene acción pero todavía no tiene camino.
    if ((act === "wander" || act === "returnHome" || act === "hunt") && w.pathStatus === "none" && !w.dest) this.enter(w, store, ctx, now);
  }

  private priority(w: Entity): number {
    const act = action(w);
    return act in PRIORITY ? PRIORITY[act as keyof typeof PRIORITY] : PRIORITY.wander;
  }

  private enter(w: Entity, store: EntityStore, ctx: WolfContext, now: number): void {
    const act = action(w);
    const keepFlee = act === "flee" ? w.fleeDir : null;
    this.stop(w);
    w.fleeDir = keepFlee;
    switch (act) {
      case "wander":
        this.request(w, this.wanderSpot(w, ctx), PRIORITY.wander, now);
        break;
      case "returnHome": {
        const spot = this.homeSpot(w, ctx);
        if (spot) this.travel(w, ctx, spot, PRIORITY.returnHome, now, true);
        else w.pathStatus = "failed";
        break;
      }
      case "hunt": {
        // Sale a cazar: cuenta como la caza del día aunque no atrape nada.
        w.huntDay = ctx.dayCount;
        w.huntFrac = this.huntFrac();
        w.huntUntil = now + WOLF.huntGiveUpMs;
        w.targetId = this.nearest(w, store, Infinity, isPrey)?.id ?? null;
        const target = this.targetPos(w, store, ctx);
        if (target) this.travel(w, ctx, { ...target }, PRIORITY.hunt, now, true);
        break;
      }
      case "stalk":
      case "chase": {
        if (act === "chase") w.targetId = this.nearest(w, store, CHASE_LOST, isZombie)?.id ?? null;
        const target = this.targetPos(w, store, ctx);
        if (target) this.goTo(w, ctx, target, now);
        else w.pathStatus = "failed";
        break;
      }
      case "follow":
        w.targetId = "player";
        this.goTo(w, ctx, ctx.player.pos, now);
        break;
      default:
        break;
    }
    if (act === "returnHome" && !w.tamed) w.targetId = null;
  }

  /** Pide un camino directo hasta `target` (de pie en su columna). */
  private goTo(w: Entity, ctx: WolfContext, target: Vec3, now: number): void {
    const x = Math.floor(target.x);
    const z = Math.floor(target.z);
    const y = standY(ctx.world, x, z, Math.floor(target.y + 0.01), WOLF_AGENT);
    this.request(w, y === null ? null : { x, y, z }, this.priority(w), now);
  }

  /**
   * Viaja hacia un destino lejano: si está a más de un tramo, pide un camino hasta un punto
   * intermedio en esa dirección (probando otros ángulos si el anterior no tuvo camino).
   */
  private travel(w: Entity, ctx: WolfContext, dest: Vec3, priority: number, now: number, resetDest: boolean): void {
    if (resetDest || !w.dest) w.dest = { ...dest };
    const pos = w.body.pos;
    const d = dist2d(dest, pos);
    if (d <= HOP) {
      this.goTo(w, ctx, dest, now);
      return;
    }
    const base = Math.atan2(dest.x - pos.x, dest.z - pos.z);
    const start = (w.hopFails ?? 0) % HOP_ANGLES.length;
    for (let i = 0; i < HOP_ANGLES.length; i++) {
      const a = base + HOP_ANGLES[(start + i) % HOP_ANGLES.length];
      const x = Math.floor(pos.x + Math.sin(a) * HOP);
      const z = Math.floor(pos.z + Math.cos(a) * HOP);
      const y = standY(ctx.world, x, z, ctx.surfaceY(x, z) + 1, WOLF_AGENT);
      if (y === null) continue;
      this.request(w, { x, y, z }, priority, now);
      return;
    }
    w.hopFails = (w.hopFails ?? 0) + 1;
    w.pathStatus = "none";
  }

  private request(w: Entity, goal: Vec3 | null, priority: number, now: number): void {
    w.pathAt = now;
    if (!goal) {
      w.pathStatus = "failed";
      return;
    }
    w.goal = goal;
    w.pathStatus = "pending";
    this.paths.request(w.id, w.body.pos, goal, WOLF_AGENT, priority);
  }

  /** Paseo corto: el salvaje cerca de su guarida; el amigo que cuida, cerca de la granja. */
  private wanderSpot(w: Entity, ctx: WolfContext): Vec3 | null {
    const pos = w.body.pos;
    const home = w.tamed ? ctx.homes?.farm : ctx.homes?.den;
    const radius = w.tamed ? WOLF.guardRadius : WOLF.denRadius;
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(3, 9);
      let x = Math.floor(pos.x + Math.sin(a) * d);
      let z = Math.floor(pos.z + Math.cos(a) * d);
      if (home && Math.hypot(x + 0.5 - home.center.x, z + 0.5 - home.center.z) > radius) {
        x = Math.floor(pos.x + (home.center.x - pos.x) * 0.3);
        z = Math.floor(pos.z + (home.center.z - pos.z) * 0.3);
      }
      const y = standY(ctx.world, x, z, Math.floor(pos.y + 0.01), WOLF_AGENT);
      if (y !== null) return { x, y, z };
    }
    return null;
  }

  /** Lugar en la guarida (salvaje) o alrededor de la granja, del lado de afuera de la cerca (amigo que cuida). */
  private homeSpot(w: Entity, ctx: WolfContext): Vec3 | null {
    const homes = ctx.homes;
    if (!homes) return null;
    for (let i = 0; i < 8; i++) {
      let x: number;
      let z: number;
      if (w.tamed) {
        const farm = homes.farm;
        const a = this.rng.range(0, Math.PI * 2);
        const d = this.rng.range(16, WOLF.guardRadius - 2);
        x = Math.floor(farm.center.x + Math.sin(a) * d);
        z = Math.floor(farm.center.z + Math.cos(a) * d);
        if (farm.rect && inRect({ x0: farm.rect.x0 - 1, z0: farm.rect.z0 - 1, x1: farm.rect.x1 + 1, z1: farm.rect.z1 + 1 }, x, z)) continue;
      } else {
        x = Math.floor(homes.den.center.x + this.rng.range(-8, 8));
        z = Math.floor(homes.den.center.z + this.rng.range(-8, 8));
      }
      const y = standY(ctx.world, x, z, ctx.surfaceY(x, z) + 1, WOLF_AGENT);
      if (y !== null) return { x, y, z };
    }
    return null;
  }

  /** El lobo amigo quedó a más de 30 bloques: aparece detrás del niño. */
  private teleportToPlayer(w: Entity, ctx: WolfContext, now: number): void {
    const p = ctx.player.pos;
    for (const [dx, dz] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
      [0, -3],
      [-3, 0],
      [3, 0],
      [0, 3],
    ]) {
      const x = Math.floor(p.x) + dx;
      const z = Math.floor(p.z) + dz;
      const y = standY(ctx.world, x, z, Math.floor(p.y + 0.01), WOLF_AGENT);
      if (y === null) continue;
      w.body.pos = { x: x + 0.5, y, z: z + 0.5 };
      w.body.vel = { x: 0, y: 0, z: 0 };
      enterState(FRIEND_WOLF_MACHINE, w.brain!, "idle", now, this.rng);
      this.stop(w);
      return;
    }
  }

  private steer(w: Entity, store: EntityStore, ctx: WolfContext): void {
    const b = w.body;
    const act = action(w);
    let dx = 0;
    let dz = 0;
    let v = 0;
    const fast = act === "hunt" || act === "stalk" || act === "chase" || act === "follow";
    const target = act === "stalk" || act === "chase" || act === "follow" ? this.targetPos(w, store, ctx) : null;
    const stopAt = act === "follow" ? WOLF.followNear - 0.5 : 0;
    if (act === "flee" && w.fleeDir) {
      dx = w.fleeDir.x;
      dz = w.fleeDir.z;
      v = WOLF.runSpeed;
    } else if (target && dist2d(target, b.pos) <= DIRECT_DISTANCE + stopAt && Math.abs(target.y - b.pos.y) < 1) {
      const len = dist2d(target, b.pos) || 1;
      if (len > stopAt) {
        dx = (target.x - b.pos.x) / len;
        dz = (target.z - b.pos.z) / len;
        v = WOLF.runSpeed;
      }
    } else if (w.pathStatus === "following" && w.path && act !== "happy" && act !== "rest" && act !== "idle") {
      const pts = w.path.points;
      let i = w.pathIndex ?? 1;
      let next = pts[i];
      while (next && Math.hypot(next.x - b.pos.x, next.z - b.pos.z) < (i === pts.length - 1 ? 0.25 : 0.45) && Math.abs(next.y - b.pos.y) < 0.6) next = pts[++i];
      w.pathIndex = i;
      if (!next) {
        w.pathStatus = "done";
      } else {
        const tx = next.x - b.pos.x;
        const tz = next.z - b.pos.z;
        const len = Math.hypot(tx, tz) || 1;
        dx = tx / len;
        dz = tz / len;
        v = fast ? WOLF.runSpeed : WOLF.walkSpeed;
        if (next.y > b.pos.y + 0.5 && len < 1.4 && b.onGround) b.vel.y = JUMP_VELOCITY;
      }
    }
    b.vel.x = dx * v;
    b.vel.z = dz * v;
    if (v > 0) w.yaw = Math.atan2(dx, dz);
    else if (act === "follow" || (act === "idle" && w.tamed && w.role === "follow")) w.yaw = Math.atan2(ctx.player.pos.x - b.pos.x, ctx.player.pos.z - b.pos.z);
  }

  /** El salvaje que caza atrapa al animal que toca; cualquier lobo amigo ahuyenta al zombi que toca. */
  private touch(w: Entity, store: EntityStore, ctx: WolfContext, now: number): void {
    const b = w.body;
    const touching = (o: Body) => dist2d(o.pos, b.pos) < b.halfWidth + o.halfWidth + WOLF.touchGap && Math.abs(o.pos.y - b.pos.y) < 1.2;
    if (w.tamed) {
      for (const z of store.near(b.pos, 1.5, isZombie)) {
        if (!touching(z.body)) continue;
        ctx.scareZombie(z.id);
        if (w.targetId === z.id) w.targetId = null;
      }
      return;
    }
    const act = action(w);
    if (act !== "hunt" && act !== "stalk") return;
    for (const a of store.near(b.pos, 1.5, isPrey)) {
      if (!touching(a.body)) continue;
      ctx.catchAnimal(a.id);
      // La caza del día terminó: vuelve a su guarida.
      w.targetId = null;
      enterState(WILD_WOLF_MACHINE, w.brain!, "returnDen", now, this.rng);
      this.enter(w, store, ctx, now);
      return;
    }
  }

  private separate(store: EntityStore, wolves: Entity[]): void {
    for (const w of wolves) {
      for (const n of store.near(w.body.pos, 1, isWolf)) {
        if (n === w) continue;
        const dx = w.body.pos.x - n.body.pos.x;
        const dz = w.body.pos.z - n.body.pos.z;
        const d = Math.hypot(dx, dz);
        const min = w.body.halfWidth + n.body.halfWidth;
        if (d >= min) continue;
        const push = (min - d) * 3;
        w.body.vel.x += (d > 1e-6 ? dx / d : w.seq < n.seq ? 1 : -1) * push;
        w.body.vel.z += (d > 1e-6 ? dz / d : 0) * push;
      }
    }
  }

  private physics(w: Entity, ctx: WolfContext, dt: number): void {
    const b = w.body;
    const world = ctx.world;
    const fx = Math.floor(b.pos.x);
    const fz = Math.floor(b.pos.z);
    let wy = Math.floor(b.pos.y + 0.3);
    if (world.isWater(fx, wy, fz)) {
      while (world.isWater(fx, wy + 1, fz)) wy++;
      b.vel.y = Math.max(-3, Math.min(3, (wy + 0.5 - b.pos.y) * 6)) + GRAVITY * dt;
    }
    const hit = moveBody(b, dt, world.collision);
    if ((hit.hitX || hit.hitZ) && b.onGround) {
      if (w.fleeDir) w.fleeDir = hit.hitX ? { x: 0, z: Math.sign(w.fleeDir.z) || 1 } : { x: Math.sign(w.fleeDir.x) || 1, z: 0 };
      else if (w.pathStatus === "following") b.vel.y = JUMP_VELOCITY;
    }
    if (b.pos.y < -10 && ctx.homes) {
      const c = w.tamed ? ctx.homes.farm.center : ctx.homes.den.center;
      b.pos = { x: c.x, y: ctx.surfaceY(Math.floor(c.x), Math.floor(c.z)) + 2, z: c.z };
      b.vel = { x: 0, y: 0, z: 0 };
    }
    const horizontal = Math.hypot(b.vel.x, b.vel.z);
    const act = action(w);
    w.anim = horizontal > WOLF.walkSpeed * 1.4 ? "run" : horizontal > 0.2 ? "walk" : act === "rest" ? "rest" : "idle";
  }
}
