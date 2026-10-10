import type { Vec3 } from "../core/math";
import type { World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import type { AutosaveService } from "../persistence/autosave";
import type { LegacyImportResult } from "../persistence/legacyImport";
import type { Game } from "../sim/game";
import type { FixedStepLoop } from "../sim/loop";
import type { GameSession } from "../sim/session";

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
  /** Bloques colocados por el jugador en los chunks modificados del mundo abierto. */
  placedCount(): number;
  getBlock(x: number, y: number, z: number): number;
  surfaceY(x: number, z: number): number;
  layout(): Game["world"]["layout"];
  spawn(): Vec3;
  selection(): Game["selection"];
  isPaused(): boolean;
  setView: ViewControl["setView"];
  isWorldReady: ViewControl["isWorldReady"];
  stats: ViewControl["stats"];
  /** Coloca un bloque directamente (para preparar escenarios). */
  setBlock(x: number, y: number, z: number, block: Parameters<Game["world"]["place"]>[3] | null): void;
  /** Mundo abierto. */
  currentWorld(): World | null;
  /** Mundos del usuario (sin la papelera), del más reciente al más antiguo. */
  worlds(): Promise<World[]>;
  saveNow(): Promise<void>;
  saveCount(): number;
  hasChanges(): boolean;
  createWorld(): Promise<boolean>;
  switchWorld(id: string): Promise<boolean>;
  legacyImport(): LegacyImportResult["status"];
};

declare global {
  interface Window {
    __santi?: SantiTestApi;
  }
}

/** API de pruebas (solo en desarrollo con ?test=1). Nunca se incluye en el build de producción. */
export function installTestApi(deps: {
  game: Game;
  loop: FixedStepLoop;
  view: ViewControl;
  session: GameSession;
  autosave: AutosaveService;
  repo: WorldRepository;
  legacy: LegacyImportResult;
}): void {
  const { game, loop, view, session, autosave, repo, legacy } = deps;
  window.__santi = {
    ready: true,
    get seed() {
      return game.seed;
    },
    tick: () => game.tick,
    placedCount: () => {
      let n = 0;
      for (const c of game.world.store.modifiedChunks()) for (const byte of c.placed) for (let b = byte; b; b &= b - 1) n++;
      return n;
    },
    getBlock: (x, y, z) => game.world.store.get(x, y, z),
    surfaceY: (x, z) => game.world.store.surfaceY(x, z),
    layout: () => game.world.layout,
    spawn: () => game.world.spawn,
    selection: () => game.selection,
    isPaused: () => loop.isPaused,
    setView: view.setView,
    isWorldReady: view.isWorldReady,
    stats: view.stats,
    setBlock: (x, y, z, block) => {
      const pos = block ? game.world.place(x, y, z, block) : game.world.remove(x, y, z);
      if (pos) game.events.emit("blockChanged", { pos });
    },
    currentWorld: () => session.world,
    worlds: () => repo.listWorlds(session.ownerId),
    saveNow: () => autosave.saveNow(),
    saveCount: () => autosave.saveCount,
    hasChanges: () => session.hasChanges(),
    createWorld: () => session.createWorld(),
    switchWorld: (id) => session.switchWorld(id),
    legacyImport: () => legacy.status,
  };
}
