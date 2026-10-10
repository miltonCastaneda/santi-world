import type { Vec3 } from "../core/math";
import type { Game } from "../sim/game";
import type { FixedStepLoop } from "../sim/loop";

export type ViewControl = {
  setView(position: Vec3, target: Vec3): void;
  /** Todo lo visible está dibujado y no queda trabajo del mesher. */
  isWorldReady(): boolean;
  stats(): Record<string, number>;
};

export type SantiTestApi = {
  ready: true;
  seed: string;
  tick(): number;
  /** Bloques cambiados por el jugador (en los chunks modificados). */
  placedCount(): number;
  getBlock(x: number, y: number, z: number): number;
  surfaceY(x: number, z: number): number;
  layout(): Game["world"]["layout"];
  selection(): Game["selection"];
  isPaused(): boolean;
  setView: ViewControl["setView"];
  isWorldReady: ViewControl["isWorldReady"];
  stats: ViewControl["stats"];
  /** Coloca un bloque directamente (para preparar escenarios). */
  setBlock(x: number, y: number, z: number, block: Parameters<Game["world"]["place"]>[3] | null): void;
};

declare global {
  interface Window {
    __santi?: SantiTestApi;
  }
}

/** API de pruebas (solo en desarrollo con ?test=1). Nunca se incluye en el build de producción. */
export function installTestApi(deps: { game: Game; loop: FixedStepLoop; view: ViewControl }): void {
  const { game, loop, view } = deps;
  window.__santi = {
    ready: true,
    seed: game.seed,
    tick: () => game.tick,
    placedCount: () => {
      let n = 0;
      for (const c of game.world.store.dirtyChunks()) for (const byte of c.placed) for (let b = byte; b; b &= b - 1) n++;
      return n;
    },
    getBlock: (x, y, z) => game.world.store.get(x, y, z),
    surfaceY: (x, z) => game.world.store.surfaceY(x, z),
    layout: () => game.world.layout,
    selection: () => game.selection,
    isPaused: () => loop.isPaused,
    setView: view.setView,
    isWorldReady: view.isWorldReady,
    stats: view.stats,
    setBlock: (x, y, z, block) => {
      const pos = block ? game.world.place(x, y, z, block) : game.world.remove(x, y, z);
      if (pos) game.events.emit("blockChanged", { pos });
    },
  };
}
