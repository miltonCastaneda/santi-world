import type { Clock } from "../core/clock";
import { EventBus } from "../core/events";
import type { Ray, Vec3 } from "../core/math";
import { Rng } from "../core/rng";
import { BLOCKS_BY_NUM, type BlockId } from "../domain/blocks";
import { bodyOverlapsCell, type CollisionQuery } from "../domain/physics/collide";
import { pickCell } from "../domain/picking";
import { REACH, TOOLS, type ToolId } from "../domain/rules/tools";
import { CHUNK_HEIGHT } from "../domain/world/chunk";
import { TerrainWorld } from "../domain/world/terrainWorld";
import { FixedStepLoop, STEP_MS } from "./loop";
import { Player, type HitResult } from "./player";

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
};

export const PICK_DISTANCE = 200;
const FOOTSTEP_MS = 400;

/** Estado y reglas del juego. Puro: sin DOM, sin Three.js y sin reloj del navegador. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  rng: Rng;
  world: TerrainWorld;
  readonly player: Player;
  selection: Selection = { tool: "hand", block: "grass" };
  inventoryOpen = false;
  tick = 0;
  timeMs = 0;
  private intents: Intent[] = [];
  private nextFootstepAt = 0;
  private lastHearts: number;

  constructor(options: { seed?: string; world?: TerrainWorld } = {}) {
    this.world = options.world ?? TerrainWorld.create(options.seed ?? "santi");
    this.rng = new Rng(this.world.seed);
    this.player = new Player(this.spawnPoint());
    this.lastHearts = this.player.hearts;
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
    if (!target) return;
    if (distanceToCell(this.player.eye(), target.block) > REACH) {
      this.events.emit("tooFar", { pos: target.block });
      return;
    }
    if (tool.onBlock === "place") {
      const { x, y, z } = target.adjacent;
      // Nunca dentro del propio personaje (se quedaría atascado).
      if (bodyOverlapsCell(this.player.body, x, y, z)) return;
      const pos = this.world.place(x, y, z, this.selection.block, this.timeMs);
      if (pos) this.events.emit("blockPlaced", { pos, block: this.selection.block });
      this.changed(pos);
      return;
    }
    if (tool.onBlock === "break") {
      const { x, y, z } = target.block;
      const before = BLOCKS_BY_NUM[this.world.store.get(x, y, z)]?.id ?? null;
      const pos = this.world.remove(x, y, z, this.timeMs);
      if (!pos) {
        this.events.emit("bump", { pos: target.block });
        return;
      }
      this.events.emit("blockBroken", { pos, block: before });
      this.changed(pos);
    }
  }

  private changed(pos: Vec3 | null): void {
    if (pos) this.events.emit("blockChanged", { pos });
  }
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
