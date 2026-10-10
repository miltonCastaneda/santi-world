import type { Clock } from "../core/clock";
import { EventBus } from "../core/events";
import type { Ray, Vec3 } from "../core/math";
import { Rng } from "../core/rng";
import type { BlockId } from "../domain/blocks";
import { pickBlock } from "../domain/picking";
import { VoxelWorld } from "../domain/world/voxelWorld";
import { FixedStepLoop, STEP_MS } from "./loop";

export type InteractionMode = "place" | "remove";

export type Selection = { mode: InteractionMode; block: BlockId };

export type Intent =
  | { type: "use"; ray: Ray; forceRemove?: boolean }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "setMode"; mode: InteractionMode }
  | { type: "selectBlock"; block: BlockId };

export type GameEvents = {
  /** pos = null significa que cambió todo el mundo. */
  blockChanged: { pos: Vec3 | null };
  selectionChanged: Selection;
};

export const PICK_DISTANCE = 200;

/** Estado y reglas del juego. Puro: sin DOM, sin Three.js y sin reloj del navegador. */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly rng: Rng;
  world: VoxelWorld;
  selection: Selection = { mode: "place", block: "grass" };
  tick = 0;
  timeMs = 0;
  private intents: Intent[] = [];

  constructor(options: { seed?: string | number; world?: VoxelWorld } = {}) {
    this.rng = new Rng(options.seed ?? "santi");
    this.world = options.world ?? new VoxelWorld();
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
  }

  private apply(intent: Intent): void {
    switch (intent.type) {
      case "use":
        this.use(intent.ray, intent.forceRemove ?? false);
        break;
      case "undo": {
        const pos = this.world.undo();
        if (pos) this.events.emit("blockChanged", { pos });
        break;
      }
      case "reset":
        this.world.reset();
        this.events.emit("blockChanged", { pos: null });
        break;
      case "setMode":
        this.selection = { ...this.selection, mode: intent.mode };
        this.events.emit("selectionChanged", this.selection);
        break;
      case "selectBlock":
        this.selection = { mode: "place", block: intent.block };
        this.events.emit("selectionChanged", this.selection);
        break;
    }
  }

  private use(ray: Ray, forceRemove: boolean): void {
    const target = pickBlock(ray, PICK_DISTANCE, (x, y, z) => this.world.has(x, y, z));
    if (!target) return;
    if (forceRemove || this.selection.mode === "remove") {
      const { x, y, z } = target.block;
      if (this.world.remove(x, y, z)) this.events.emit("blockChanged", { pos: target.block });
      return;
    }
    const { x, y, z } = target.adjacent;
    if (this.world.place(x, y, z, this.selection.block)) this.events.emit("blockChanged", { pos: target.adjacent });
  }
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
  seed?: string | number;
  world?: VoxelWorld;
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
