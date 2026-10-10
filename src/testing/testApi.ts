import type { Game } from "../sim/game";
import type { FixedStepLoop } from "../sim/loop";

export type SantiTestApi = {
  ready: true;
  tick(): number;
  blockCount(): number;
  getBlock(x: number, y: number, z: number): string | null;
  selection(): Game["selection"];
  isPaused(): boolean;
};

declare global {
  interface Window {
    __santi?: SantiTestApi;
  }
}

/** API de pruebas (solo en desarrollo con ?test=1). Nunca se incluye en el build de producción. */
export function installTestApi(deps: { game: Game; loop: FixedStepLoop }): void {
  const { game, loop } = deps;
  window.__santi = {
    ready: true,
    tick: () => game.tick,
    blockCount: () => game.world.blocks.size,
    getBlock: (x, y, z) => game.world.get(x, y, z),
    selection: () => game.selection,
    isPaused: () => loop.isPaused,
  };
}
