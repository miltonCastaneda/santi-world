import type { AudioService } from "../audio/audioService";
import type { Vec3 } from "../core/math";
import type { World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import type { ToolId } from "../domain/rules/tools";
import type { AutosaveService } from "../persistence/autosave";
import type { LegacyImportResult } from "../persistence/legacyImport";
import type { Game } from "../sim/game";
import type { FixedStepLoop } from "../sim/loop";
import type { PlayerAnim } from "../sim/player";
import type { GameSession } from "../sim/session";

export type ViewControl = {
  /** Vista fija (la cámara deja de seguir al personaje hasta `followPlayer`). */
  setView(position: Vec3, target: Vec3): void;
  followPlayer(): void;
  cameraPos(): Vec3;
  playerModel(): { anim: PlayerAnim; shownTool: ToolId } | null;
  setPlayerVisible(visible: boolean): void;
  setEntitiesVisible(visible: boolean): void;
  /** Todo lo visible está dibujado y no queda trabajo del mesher. */
  isWorldReady(): boolean;
  stats(): Record<string, number>;
};

export type PlayerSnapshot = {
  pos: Vec3;
  yaw: number;
  vel: Vec3;
  onGround: boolean;
  hearts: number;
  tool: ToolId;
  anim: PlayerAnim;
  invulnerable: boolean;
};

export type EntitySnapshot = { id: string; species: string; pos: Vec3; state: string | null; anim: string | null; home: string | null };

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
  followPlayer: ViewControl["followPlayer"];
  cameraPos: ViewControl["cameraPos"];
  playerModel: ViewControl["playerModel"];
  setPlayerVisible: ViewControl["setPlayerVisible"];
  setEntitiesVisible: ViewControl["setEntitiesVisible"];
  isWorldReady: ViewControl["isWorldReady"];
  stats: ViewControl["stats"];
  /** Coloca un bloque directamente (para preparar escenarios). */
  setBlock(x: number, y: number, z: number, block: Parameters<Game["world"]["place"]>[3] | null): void;
  /** La celda (x, y, z) es sólida para la física. */
  isSolid(x: number, y: number, z: number): boolean;
  player(): PlayerSnapshot;
  teleport(pos: Vec3): void;
  hitPlayer(from: Vec3 | null): string;
  /** Animales vivos (estado de la simulación). */
  entities(): EntitySnapshot[];
  /** Quita todos los animales (escenarios donde uno que pasa estorbaría). */
  clearEntities(): void;
  audio(): { ready: boolean; muted: boolean; masterGain: number };
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
  audio: AudioService;
}): void {
  const { game, loop, view, session, autosave, repo, legacy, audio } = deps;
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
    followPlayer: view.followPlayer,
    cameraPos: view.cameraPos,
    playerModel: view.playerModel,
    setPlayerVisible: view.setPlayerVisible,
    setEntitiesVisible: view.setEntitiesVisible,
    isWorldReady: view.isWorldReady,
    stats: view.stats,
    setBlock: (x, y, z, block) => {
      const pos = block ? game.world.place(x, y, z, block) : game.world.remove(x, y, z);
      if (pos) game.events.emit("blockChanged", { pos });
    },
    isSolid: (x, y, z) => game.collision(x, y, z) > 0,
    player: () => {
      const p = game.player;
      return {
        pos: { ...p.pos },
        yaw: p.yaw,
        vel: { ...p.body.vel },
        onGround: p.body.onGround,
        hearts: p.hearts,
        tool: p.tool,
        anim: p.animAt(game.timeMs),
        invulnerable: p.isInvulnerable(game.timeMs),
      };
    },
    teleport: (pos) => game.player.teleport(pos),
    hitPlayer: (from) => game.hitPlayer(from),
    entities: () =>
      [...game.entities.all()].map((e) => ({
        id: e.id,
        species: e.species,
        pos: { ...e.body.pos },
        state: e.brain?.state ?? null,
        anim: e.anim ?? null,
        home: e.home ?? null,
      })),
    clearEntities: () => game.entities.clear(),
    audio: () => ({ ready: audio.isReady, muted: audio.isMuted, masterGain: audio.masterGain }),
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
