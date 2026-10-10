import type { Clock } from "../core/clock";
import { EventBus } from "../core/events";
import { rayAabb, type Ray, type Vec3 } from "../core/math";
import { Rng } from "../core/rng";
import { BLOCK_NUM, BLOCKS_BY_NUM, type BlockId } from "../domain/blocks";
import { EntityStore, type Entity, type EntityKind } from "../domain/entities/entityStore";
import { isItemId, ITEMS, PICKUP_DELAY_MS, type ItemId } from "../domain/entities/items";
import { createSpawnSlots, homesOf, type Home, type SpawnSlot } from "../domain/entities/population";
import { isSpeciesId, type HomeId, type SpeciesId } from "../domain/entities/species";
import { WOLF, type WolfRole } from "../domain/entities/wolf";
import { ZOMBIE } from "../domain/entities/zombie";
import type { EntitySnapshot } from "../domain/repository/model";
import { bodyOverlapsCell, type CollisionQuery } from "../domain/physics/collide";
import { pickCell } from "../domain/picking";
import { resolveHit, type HitOutcome, type TargetKind } from "../domain/rules/damage";
import { emptyInventory, sanitizeInventory, type Inventory, type ResourceId } from "../domain/rules/inventory";
import { mineResult, regrowDue } from "../domain/rules/mining";
import { REACH, TOOLS, type ToolId } from "../domain/rules/tools";
import { CHUNK_HEIGHT } from "../domain/world/chunk";
import { blockLightAt } from "../domain/world/light";
import { TerrainWorld } from "../domain/world/terrainWorld";
import { entityFromSnapshot, entityToSnapshot, itemEntity } from "./entitySnapshots";
import { FixedStepLoop, STEP_MS } from "./loop";
import { Player, PLAYER_SPEED, type HitResult } from "./player";
import { AnimalSystem, type AnimalContext, type AnimalSound } from "./systems/animals";
import { durationsFrom, WorldClock, type Phase } from "./systems/dayNight";
import { itemsInPickupRange } from "./systems/interaction";
import type { PathWorld } from "./systems/pathfinding";
import { regrowDiamonds } from "./systems/regrowth";
import { respawnPending, type RespawnWorld } from "./systems/respawn";
import { NightSpawner, type SpawnWorld } from "./systems/spawn";
import { WolfSystem, type WolfContext } from "./systems/wolves";
import { ZombieSystem, type ZombieContext } from "./systems/zombies";

export type Selection = { tool: ToolId; block: BlockId };

export type Intent =
  | { type: "useTool"; ray: Ray }
  | { type: "move"; x: number; z: number }
  | { type: "jump" }
  | { type: "selectTool"; tool: ToolId }
  | { type: "selectBlock"; block: BlockId }
  | { type: "toggleInventory" }
  | { type: "undo" };

export type GameEvents = {
  blockChanged: { pos: Vec3 };
  blockPlaced: { pos: Vec3; block: BlockId };
  blockBroken: { pos: Vec3; block: BlockId | null };
  /** El Pico minó un mineral: el bloque se volvió piedra y sumó un recurso (con brillo). */
  blockMined: { pos: Vec3; block: BlockId; resource: ResourceId };
  /** Al amanecer volvieron diamantes a la montaña. */
  diamondsRegrown: { positions: Vec3[] };
  /** La herramienta no pudo actuar (capa inferior): suena un "toc" suave. */
  bump: { pos: Vec3 };
  /** El clic cayó fuera del alcance: indicador suave de "muy lejos". */
  tooFar: { pos: Vec3 };
  toolUsed: { tool: ToolId };
  /** El mundo se reemplazó por completo (al abrir o crear otro desde GameSession). */
  worldReplaced: { world: TerrainWorld };
  selectionChanged: Selection;
  footstep: { pos: Vec3 };
  jumped: { pos: Vec3 };
  playerHit: { hearts: number; result: HitResult };
  playerRespawned: { pos: Vec3 };
  heartsChanged: { hearts: number };
  inventoryToggled: { open: boolean };
  animalSound: AnimalSound;
  /** Una entidad desapareció ("poof"); si tenía slot, queda pendiente de reaparecer al amanecer. */
  entityRemoved: { id: string; species: EntityKind; pos: Vec3 };
  /** El niño le pegó a una criatura con una herramienta (rebote o "poof", nunca dolor). */
  entityHit: { id: string; species: EntityKind; pos: Vec3; outcome: HitOutcome; defeated: boolean };
  zombieSpawned: { id: string; pos: Vec3 };
  /** El Collar domesticó a un lobo: corazones, collar visible y se vuelve amigo. */
  wolfTamed: { id: string; pos: Vec3; role: WolfRole };
  /** Quedó un objeto flotando (la carne de un animal). */
  itemDropped: { id: string; item: ItemId; pos: Vec3 };
  /** El niño recogió un objeto (al pasar cerca o con un clic). */
  itemCollected: { id: string; item: ItemId; pos: Vec3 };
  inventoryChanged: { inventory: Inventory };
  phaseChanged: { phase: Phase; dayCount: number };
  /** Falta un minuto para la noche. */
  nightSoon: Record<string, never>;
  midnight: { dayCount: number };
  dawn: { dayCount: number; respawned: string[] };
};

/** Configuración del tiempo de un mundo (la ponen los padres). */
export type TimeSettings = { dayMinutes: number; nightMinutes: number; quietNight: boolean };

export const PICK_DISTANCE = 200;
const FOOTSTEP_MS = 400;
/** Al amanecer (o con la noche tranquila) los zombis hacen "poof" escalonados en este tiempo (spec: 5 s o menos). */
export const RETREAT_MS = 4000;
/** Margen alrededor de las criaturas para acertarles con el clic (un niño de 4 años no apunta fino). */
const PICK_PAD = 0.2;
const NATURAL_GROUND = new Set<number>([BLOCK_NUM.grass, BLOCK_NUM.dirt, BLOCK_NUM.sand, BLOCK_NUM.snow, BLOCK_NUM.stone]);

/** Estado y reglas del juego. Puro: sin DOM, sin Three.js y sin reloj del navegador. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  rng: Rng;
  world: TerrainWorld;
  readonly player: Player;
  readonly entities = new EntityStore();
  readonly animals: AnimalSystem;
  readonly wolves: WolfSystem;
  readonly zombies: ZombieSystem;
  readonly spawner: NightSpawner;
  readonly clock = new WorldClock();
  /** Sin zombis ni dragón (la noche llega igual). */
  quietNight = false;
  /** Slots cuyos animales desaparecieron y vuelven al próximo amanecer. */
  pendingRespawns: string[] = [];
  selection: Selection = { tool: "hand", block: "grass" };
  /** Recursos del mundo abierto (los bloques de construcción son ilimitados y no cuentan). */
  inventory: Inventory = emptyInventory();
  inventoryOpen = false;
  tick = 0;
  timeMs = 0;
  private intents: Intent[] = [];
  private nextFootstepAt = 0;
  private lastHearts: number;
  private homes: Record<HomeId, Home> | null = null;
  private slots: SpawnSlot[] = [];
  /** Numera los objetos que caen (los guardados se respetan al abrir). */
  private itemCount = 0;

  constructor(options: { seed?: string; world?: TerrainWorld } = {}) {
    this.world = options.world ?? TerrainWorld.create(options.seed ?? "santi");
    this.rng = new Rng(this.world.seed);
    this.player = new Player(this.spawnPoint());
    this.lastHearts = this.player.hearts;
    this.animals = new AnimalSystem(this.world.seed);
    this.wolves = new WolfSystem(this.world.seed, this.animals.paths);
    this.zombies = new ZombieSystem(this.world.seed, this.animals.paths);
    this.spawner = new NightSpawner(this.world.seed);
    this.prepareHomes();
  }

  /** Lo que el aparecedor de zombis consulta del mundo. */
  readonly spawnWorld: SpawnWorld = ((game: Game): SpawnWorld => ({
    collision: (x, y, z) => game.collision(x, y, z),
    isWater: (x, y, z) => game.world.store.get(x, y, z) === BLOCK_NUM.water,
    chunkVersion: (cx, cz) => game.world.store.peek(cx, cz)?.version ?? 0,
    get size() {
      return game.world.store.sizeInBlocks;
    },
    surfaceY: (x, z) => game.world.store.surfaceY(x, z),
    isNaturalGround: (x, y, z) => {
      const store = game.world.store;
      const num = store.get(x, y, z);
      return NATURAL_GROUND.has(num) && !store.isPlaced(x, y, z);
    },
    blockLight: (x, y, z) => blockLightAt(game.world.store, x, y, z),
  }))(this);

  private get zombieContext(): ZombieContext {
    return {
      world: this.pathWorld,
      player: this.player.body,
      playerSpeed: PLAYER_SPEED,
      hitPlayer: (from) => this.hitPlayer(from),
      catchAnimal: (id) => this.removeEntity(id),
      onSound: ({ id, pos }) => this.events.emit("animalSound", { id, species: "zombie", sound: ZOMBIE.sound, pos }),
    };
  }

  /** Lo que el pathfinding y la física de las entidades consultan del mundo. */
  readonly pathWorld: PathWorld = {
    collision: (x, y, z) => this.collision(x, y, z),
    isWater: (x, y, z) => this.world.store.get(x, y, z) === BLOCK_NUM.water,
    chunkVersion: (cx, cz) => this.world.store.peek(cx, cz)?.version ?? 0,
  };

  private get animalContext(): AnimalContext {
    return { world: this.pathWorld, homes: this.homes };
  }

  private get wolfContext(): WolfContext {
    const c = this.clock;
    return {
      world: this.pathWorld,
      surfaceY: (x, z) => this.world.store.surfaceY(x, z),
      homes: this.homes,
      player: this.player.body,
      dayCount: c.dayCount,
      isDay: c.phase === "day",
      dayFraction: c.isNight ? 1 : c.timeOfCycleMs / c.durations.dayMs,
      catchAnimal: (id) => this.removeEntity(id),
      scareZombie: (id) => this.removeEntity(id),
      onSound: ({ id, pos }) => this.events.emit("animalSound", { id, species: "wolf", sound: WOLF.sound, pos }),
    };
  }

  /** Hace aparecer lo que corresponde a un slot: un animal de granja o un lobo. */
  private spawnSlot(slot: SpawnSlot): Entity {
    if (slot.species === "wolf") return this.wolves.spawn(this.entities, this.wolfContext, slot, this.timeMs);
    return this.animals.spawn(this.entities, this.animalContext, slot as SpawnSlot & { species: SpeciesId }, this.timeMs, (x, z) => this.world.store.surfaceY(x, z));
  }

  /** Slots de población del mundo (vacío en los mundos sin granja, como "Mi primer mundo"). */
  get spawnSlots(): readonly SpawnSlot[] {
    return this.slots;
  }

  private prepareHomes(): void {
    const layout = this.world.layout;
    this.homes = layout ? homesOf(layout) : null;
    this.slots = layout ? createSpawnSlots(layout, this.world.seed) : [];
  }

  /** Población inicial de un mundo nuevo: un animal (o un lobo) por slot. */
  spawnPopulation(): void {
    for (const slot of this.slots) this.spawnSlot(slot);
  }

  /** Mundos guardados antes de que hubiera lobos: aparecen los que no están vivos ni pendientes. */
  spawnMissingWolves(): void {
    const alive = new Set<string>();
    for (const e of this.entities.all()) if (e.slotId) alive.add(e.slotId);
    for (const slot of this.slots) {
      if (slot.species === "wolf" && !alive.has(slot.id) && !this.pendingRespawns.includes(slot.id)) this.spawnSlot(slot);
    }
  }

  /** Quita una entidad con un "poof". Un animal de un slot queda pendiente de reaparecer al amanecer. */
  removeEntity(id: string): boolean {
    const e = this.entities.remove(id);
    if (!e) return false;
    this.animals.paths.cancel(id);
    if (e.slotId && !this.pendingRespawns.includes(e.slotId)) this.pendingRespawns.push(e.slotId);
    this.events.emit("entityRemoved", { id, species: e.species, pos: { ...e.body.pos } });
    return true;
  }

  /** Duración del día y de la noche y noche tranquila; se puede cambiar en caliente. */
  configureTime(settings: TimeSettings): void {
    this.clock.setDurations(durationsFrom(settings));
    this.quietNight = settings.quietNight;
  }

  private dawn(): string[] {
    const store = this.world.store;
    const world: RespawnWorld = {
      size: store.sizeInBlocks,
      surfaceY: (x, z) => store.surfaceY(x, z),
      isPlaced: (x, y, z) => store.isPlaced(x, y, z),
      isWater: (x, y, z) => store.get(x, y, z) === BLOCK_NUM.water,
      collision: this.collision,
    };
    const { respawned, stillPending } = respawnPending(this.pendingRespawns, this.slots, this.entities, world, (slot) => this.spawnSlot(slot));
    this.pendingRespawns = stillPending;
    return respawned;
  }

  /** Vuelven los diamantes minados (cada 3 días del juego, al amanecer). */
  regrowDiamonds(): Vec3[] {
    const positions = regrowDiamonds(this.world, this.timeMs);
    for (const pos of positions) this.changed(pos);
    if (positions.length > 0) this.events.emit("diamondsRegrown", { positions });
    return positions;
  }

  get zombieCount(): number {
    let n = 0;
    for (const e of this.entities.all()) if (e.species === "zombie") n++;
    return n;
  }

  /** Zombi nuevo en `pos` (lo usa el aparecedor; las pruebas pueden ponerlo donde quieran). */
  spawnZombie(pos: Vec3): Entity {
    const z = this.zombies.spawn(this.entities, pos, this.timeMs);
    this.events.emit("zombieSpawned", { id: z.id, pos: { ...z.body.pos } });
    return z;
  }

  /**
   * De noche (sin la noche tranquila) aparecen zombis; fuera de la noche o al activar la noche
   * tranquila, los que quedan hacen "poof" escalonados en `RETREAT_MS` o menos.
   */
  private stepNight(): void {
    const active = this.clock.phase === "night" && !this.quietNight;
    const now = this.timeMs;
    for (const e of [...this.entities.all()]) {
      if (e.species !== "zombie") continue;
      if (!active && e.despawnAt == null) e.despawnAt = now + Math.round(this.zombies.rng.range(0, RETREAT_MS));
      if (e.despawnAt != null && now >= e.despawnAt) this.removeEntity(e.id);
    }
    const spot = this.spawner.step(now, active, this.zombieCount, this.player.pos, this.spawnWorld);
    if (spot) this.spawnZombie(spot);
  }

  /** Deja un objeto flotando en `pos` (la carne de un animal). */
  dropItem(item: ItemId, pos: Vec3): Entity {
    const e = this.entities.add({ ...itemEntity(`${item}-${this.itemCount++}`, item, pos), readyAt: this.timeMs + PICKUP_DELAY_MS });
    this.events.emit("itemDropped", { id: e.id, item, pos: { ...e.body.pos } });
    return e;
  }

  /** El niño recoge un objeto: desaparece del mundo y suma 1 a su recurso. */
  collectItem(id: string): boolean {
    const e = this.entities.get(id);
    if (!e || !isItemId(e.species)) return false;
    this.entities.remove(id);
    this.inventory[ITEMS[e.species].resource]++;
    this.events.emit("itemCollected", { id, item: e.species, pos: { ...e.body.pos } });
    this.events.emit("inventoryChanged", { inventory: { ...this.inventory } });
    return true;
  }

  /** Inventario del mundo que se abre (o de una prueba). */
  setInventory(inventory: Partial<Inventory>): void {
    this.inventory = sanitizeInventory(inventory);
    this.events.emit("inventoryChanged", { inventory: { ...this.inventory } });
  }

  restoreEntities(snapshots: readonly EntitySnapshot[]): void {
    for (const s of snapshots) {
      const e = entityFromSnapshot(s, this.timeMs);
      if (!e || this.entities.get(e.id)) continue;
      this.entities.add(e);
      const n = isItemId(e.species) ? Number(e.id.slice(e.species.length + 1)) : NaN;
      if (Number.isInteger(n)) this.itemCount = Math.max(this.itemCount, n + 1);
    }
  }

  entitySnapshots(worldId: string): EntitySnapshot[] {
    const out: EntitySnapshot[] = [];
    for (const e of this.entities.all()) {
      const s = entityToSnapshot(e, worldId, this.timeMs);
      if (s) out.push(s);
    }
    return out;
  }

  get seed(): string {
    return this.world.seed;
  }

  /** Punto de aparición del personaje: sobre el suelo en el centro de la granja. */
  spawnPoint(): Vec3 {
    const { x, z } = this.world.spawn;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    return { x: bx + 0.5, y: this.world.store.surfaceY(bx, bz) + 1, z: bz + 0.5 };
  }

  /** Altura de colisión de cada celda; fuera del mundo en horizontal hay una barrera invisible. */
  readonly collision: CollisionQuery = (x, y, z) => {
    const size = this.world.store.sizeInBlocks;
    if (x < 0 || z < 0 || x >= size || z >= size) return Infinity;
    if (y < 0) return 1;
    if (y >= CHUNK_HEIGHT) return 0;
    const def = BLOCKS_BY_NUM[this.world.store.get(x, y, z)];
    return def?.solid ? def.collisionHeight : 0;
  };

  /**
   * Cambia el mundo entero. Solo debe llamarlo GameSession, que antes guarda el anterior
   * ("guardar antes de limpiar"). Descarta las intenciones pendientes del mundo anterior.
   */
  replaceWorld(world: TerrainWorld, selection?: Selection): void {
    this.world = world;
    this.rng = new Rng(world.seed);
    this.intents = [];
    this.entities.clear();
    this.animals.reset(world.seed);
    this.wolves.reset(world.seed);
    this.zombies.reset(world.seed);
    this.spawner.reset(world.seed);
    this.pendingRespawns = [];
    this.itemCount = 0;
    this.setInventory(emptyInventory());
    this.clock.restore(0, 1);
    this.prepareHomes();
    this.player.setMove(0, 0);
    this.player.teleport(this.spawnPoint());
    this.events.emit("worldReplaced", { world });
    if (selection) {
      this.selection = selection;
      this.player.tool = selection.tool;
      this.events.emit("selectionChanged", selection);
    }
  }

  /** Las intenciones se aplican al inicio del siguiente paso de simulación. */
  enqueue(intent: Intent): void {
    this.intents.push(intent);
  }

  step(dtMs: number): void {
    const pending = this.intents;
    this.intents = [];
    for (const intent of pending) this.apply(intent);
    this.tick++;
    this.timeMs += dtMs;
    this.stepPlayer(dtMs);
    for (const item of itemsInPickupRange(this.entities, this.player.body, this.timeMs)) this.collectItem(item.id);
    this.animals.step(this.entities, this.animalContext, this.tick, this.timeMs, dtMs, (s) => this.events.emit("animalSound", s));
    this.wolves.step(this.entities, this.wolfContext, this.tick, this.timeMs, dtMs);
    this.zombies.step(this.entities, this.zombieContext, this.tick, this.timeMs, dtMs);
    this.stepNight();
    this.stepClock(dtMs);
  }

  private stepClock(dtMs: number): void {
    for (const ev of this.clock.advance(dtMs)) {
      const dayCount = this.clock.dayCount;
      switch (ev.type) {
        case "phase":
          this.events.emit("phaseChanged", { phase: ev.phase, dayCount });
          break;
        case "nightSoon":
          this.events.emit("nightSoon", {});
          break;
        case "midnight":
          this.events.emit("midnight", { dayCount });
          break;
        case "dawn":
          // Si la hora saltó (padres o pruebas) y quedó algún zombi, se va antes de las reapariciones.
          for (const e of [...this.entities.all()]) if (e.species === "zombie") this.removeEntity(e.id);
          this.events.emit("dawn", { dayCount, respawned: this.dawn() });
          if (regrowDue(dayCount)) this.regrowDiamonds();
          break;
      }
    }
  }

  /** Golpe de un enemigo (zombis, más adelante). Con 0 corazones reaparece en la granja sin perder nada. */
  hitPlayer(from: Vec3 | null): HitResult {
    const result = this.player.hit(this.timeMs, from, this.spawnPoint());
    if (result === "ignored") return result;
    this.events.emit("playerHit", { hearts: this.player.hearts, result });
    if (result === "poof") this.events.emit("playerRespawned", { pos: { ...this.player.pos } });
    this.syncHearts();
    return result;
  }

  private stepPlayer(dtMs: number): void {
    const p = this.player;
    const wasOnGround = p.body.onGround;
    const vy = p.body.vel.y;
    p.step(dtMs, this.timeMs, this.collision);
    if (wasOnGround && p.body.vel.y > 0 && vy <= 0) this.events.emit("jumped", { pos: { ...p.pos } });
    const walking = p.body.onGround && (p.moveInput.x !== 0 || p.moveInput.z !== 0);
    if (walking && this.timeMs >= this.nextFootstepAt) {
      this.events.emit("footstep", { pos: { ...p.pos } });
      this.nextFootstepAt = this.timeMs + FOOTSTEP_MS;
    }
    if (p.pos.y < -10) p.respawn(this.spawnPoint(), this.timeMs);
    this.syncHearts();
  }

  private syncHearts(): void {
    if (this.player.hearts === this.lastHearts) return;
    this.lastHearts = this.player.hearts;
    this.events.emit("heartsChanged", { hearts: this.player.hearts });
  }

  private apply(intent: Intent): void {
    switch (intent.type) {
      case "useTool":
        this.useTool(intent.ray);
        break;
      case "move":
        this.player.setMove(intent.x, intent.z);
        break;
      case "jump":
        this.player.jump();
        break;
      case "undo":
        this.changed(this.world.undo(this.timeMs));
        break;
      case "selectTool":
        this.select({ ...this.selection, tool: intent.tool });
        break;
      case "selectBlock":
        // Elegir un bloque de la barra inferior pasa a la Mano con ese bloque.
        this.select({ tool: "hand", block: intent.block });
        break;
      case "toggleInventory":
        this.inventoryOpen = !this.inventoryOpen;
        this.events.emit("inventoryToggled", { open: this.inventoryOpen });
        break;
    }
  }

  private select(selection: Selection): void {
    this.selection = selection;
    this.player.tool = selection.tool;
    this.events.emit("selectionChanged", selection);
  }

  private useTool(ray: Ray): void {
    const tool = TOOLS[this.player.tool];
    this.player.act(tool.swing, this.timeMs);
    this.events.emit("toolUsed", { tool: tool.id });
    const target = pickCell(ray, PICK_DISTANCE, (x, y, z) => this.world.isPickable(x, y, z));
    // Una criatura delante del bloque apuntado recibe el golpe en su lugar.
    const creature = this.pickEntity(ray, target?.distance ?? PICK_DISTANCE);
    if (creature) {
      if (this.gapTo(creature.body) > REACH) this.events.emit("tooFar", { pos: { ...creature.body.pos } });
      // Un clic sobre la carne la recoge, con cualquier herramienta.
      else if (isItemId(creature.species)) this.collectItem(creature.id);
      else this.hitEntity(creature, tool.id);
      return;
    }
    if (!target) return;
    if (distanceToCell(this.player.eye(), target.block) > REACH) {
      this.events.emit("tooFar", { pos: target.block });
      return;
    }
    if (tool.onBlock === "place") {
      const { x, y, z } = target.adjacent;
      // Nunca dentro del propio personaje ni de un animal (quedarían atascados).
      if (bodyOverlapsCell(this.player.body, x, y, z)) return;
      if (this.entities.near({ x: x + 0.5, y, z: z + 0.5 }, 2, (e) => bodyOverlapsCell(e.body, x, y, z)).length > 0) {
        this.events.emit("bump", { pos: { x, y, z } });
        return;
      }
      const pos = this.world.place(x, y, z, this.selection.block, this.timeMs);
      if (pos) this.events.emit("blockPlaced", { pos, block: this.selection.block });
      this.changed(pos);
      return;
    }
    if (tool.onBlock === "break") {
      const { x, y, z } = target.block;
      const before = BLOCKS_BY_NUM[this.world.store.get(x, y, z)]?.id ?? null;
      const mined = mineResult(tool.id, before);
      if (mined && before && this.world.replaceNatural(x, y, z, mined.becomes, this.timeMs)) {
        this.inventory[mined.resource]++;
        this.events.emit("blockMined", { pos: { x, y, z }, block: before, resource: mined.resource });
        this.events.emit("inventoryChanged", { inventory: { ...this.inventory } });
        this.changed({ x, y, z });
        return;
      }
      const pos = this.world.remove(x, y, z, this.timeMs);
      if (!pos) {
        this.events.emit("bump", { pos: target.block });
        return;
      }
      this.events.emit("blockBroken", { pos, block: before });
      this.changed(pos);
    }
  }

  /** La criatura más cercana que cruza el rayo antes de `maxDistance`. */
  private pickEntity(ray: Ray, maxDistance: number): Entity | null {
    let best: Entity | null = null;
    let bestT = maxDistance;
    for (const e of this.entities.all()) {
      if (e.species === "threat") continue;
      const { pos, halfWidth: w, height } = e.body;
      const box = {
        min: { x: pos.x - w - PICK_PAD, y: pos.y - PICK_PAD, z: pos.z - w - PICK_PAD },
        max: { x: pos.x + w + PICK_PAD, y: pos.y + height + PICK_PAD, z: pos.z + w + PICK_PAD },
      };
      const t = rayAabb(ray, box, bestT);
      // Un rayo que sale de dentro de la criatura no la "mira" (el ojo del jugador nunca está dentro).
      if (t !== null && t > 0 && t < bestT) {
        best = e;
        bestT = t;
      }
    }
    return best;
  }

  /** Distancia de los ojos del personaje a la caja de un cuerpo (0 si están dentro). */
  private gapTo(b: Entity["body"]): number {
    const eye = this.player.eye();
    return Math.hypot(
      Math.max(b.pos.x - b.halfWidth - eye.x, 0, eye.x - (b.pos.x + b.halfWidth)),
      Math.max(b.pos.y - eye.y, 0, eye.y - (b.pos.y + b.height)),
      Math.max(b.pos.z - b.halfWidth - eye.z, 0, eye.z - (b.pos.z + b.halfWidth)),
    );
  }

  /** Golpe de cerca con la herramienta elegida, según la tabla de `domain/rules/damage`. */
  private hitEntity(e: Entity, tool: ToolId): void {
    const b = e.body;
    const kind = targetKind(e);
    if (!kind) return;
    const { outcome, defeated, hits, drop } = resolveHit(tool, kind, e.hits ?? 0);
    if (outcome === "none" || outcome === "capture") return;
    if (outcome === "tame") {
      // El Collar solo alcanza de cerca: más lejos, el aviso suave de "muy lejos".
      if (this.gapTo(b) > WOLF.tameRange) {
        this.events.emit("tooFar", { pos: { ...b.pos } });
        return;
      }
      const role = this.wolves.tame(e, this.entities, this.timeMs);
      this.events.emit("entityHit", { id: e.id, species: e.species, pos: { ...b.pos }, outcome, defeated: false });
      this.events.emit("wolfTamed", { id: e.id, pos: { ...b.pos }, role });
      return;
    }
    if (outcome === "happy") {
      this.wolves.happy(e, this.timeMs);
      this.events.emit("entityHit", { id: e.id, species: e.species, pos: { ...b.pos }, outcome, defeated: false });
      return;
    }
    e.hits = hits;
    this.events.emit("entityHit", { id: e.id, species: e.species, pos: { ...b.pos }, outcome, defeated });
    // Rebote cartoon: un saltito, sin daño.
    if (outcome === "boing" && b.onGround) b.vel.y = 4;
    // El lobo salvaje retrocede con cada golpe que no lo hace "poof".
    if (kind === "wolf" && !defeated) this.wolves.flee(e, this.player.pos, this.timeMs);
    if (!defeated) return;
    const at = { ...b.pos };
    this.removeEntity(e.id);
    // La carne queda en el lugar del animal (sin sangre: un ícono cartoon flotando).
    if (drop) this.dropItem(drop, at);
  }

  private changed(pos: Vec3 | null): void {
    if (pos) this.events.emit("blockChanged", { pos });
  }
}

function targetKind(e: Entity): TargetKind | null {
  if (e.species === "zombie") return "zombie";
  if (e.species === "wolf") return e.tamed ? "friendWolf" : "wolf";
  return isSpeciesId(e.species) ? "animal" : null;
}

/** Distancia del punto a la celda (0 si está dentro). */
export function distanceToCell(p: Vec3, cell: Vec3): number {
  const dx = Math.max(cell.x - p.x, 0, p.x - (cell.x + 1));
  const dy = Math.max(cell.y - p.y, 0, p.y - (cell.y + 1));
  const dz = Math.max(cell.z - p.z, 0, p.z - (cell.z + 1));
  return Math.hypot(dx, dy, dz);
}

export type HeadlessGame = {
  game: Game;
  loop: FixedStepLoop;
  clock: Clock & { advance(ms: number): void };
  /** Avanza el reloj en frames de frameMs (60 FPS por defecto) y procesa cada frame. */
  advance(ms: number, frameMs?: number): void;
};

/** Juego completo sin render ni DOM, para pruebas y simulaciones. */
export function createHeadlessGame(options: {
  seed?: string;
  world?: TerrainWorld;
  clock: Clock & { advance(ms: number): void };
}): HeadlessGame {
  const game = new Game(options);
  const loop = new FixedStepLoop((dt) => game.step(dt), STEP_MS);
  const clock = options.clock;
  loop.frame(clock.now());
  return {
    game,
    loop,
    clock,
    advance(ms, frameMs = 1000 / 60) {
      const start = clock.now();
      const end = start + ms;
      let k = 1;
      while (clock.now() < end) {
        const target = Math.min(end, start + Math.round(k * frameMs));
        clock.advance(target - clock.now());
        loop.frame(clock.now());
        k++;
      }
    },
  };
}
