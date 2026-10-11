import type { AudioService } from "../audio/audioService";
import type { Vec3 } from "../core/math";
import type { ItemId } from "../domain/entities/items";
import type { World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import type { Inventory } from "../domain/rules/inventory";
import type { ToolId, ToolSwing } from "../domain/rules/tools";
import type { AutosaveService } from "../persistence/autosave";
import type { LegacyImportResult } from "../persistence/legacyImport";
import type { Game } from "../sim/game";
import type { FixedStepLoop } from "../sim/loop";
import type { PlayerAnim } from "../sim/player";
import type { GameSession } from "../sim/session";
import { canSpawnAt } from "../sim/systems/spawn";

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
  /** El chunk (cx, cz) ya se dibuja. */
  chunkMeshed(cx: number, cz: number): boolean;
  /** Lo que se ve del chunk (cx, cz) ya incluye su último cambio de bloques. */
  chunkUpToDate(cx: number, cz: number): boolean;
  stats(): Record<string, number>;
  /** Pone a cero los máximos de `stats()` (por ejemplo, el del mesher en el hilo principal). */
  resetStats(): void;
};

export type PlayerSnapshot = {
  pos: Vec3;
  yaw: number;
  vel: Vec3;
  onGround: boolean;
  hearts: number;
  tool: ToolId;
  anim: PlayerAnim;
  /** Gesto de la última acción (golpe, minado, disparo, lanzar...). */
  swing: ToolSwing;
  invulnerable: boolean;
};

export type DayNightSnapshot = {
  phase: string;
  dayCount: number;
  timeOfCycleMs: number;
  dayMs: number;
  nightMs: number;
  daylight: number;
  msUntilNight: number;
  quietNight: boolean;
};

export type EntitySnapshot = { id: string; species: string; pos: Vec3; state: string | null; anim: string | null; home: string | null; tamed: boolean; role: string | null };

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
  chunkMeshed: ViewControl["chunkMeshed"];
  chunkUpToDate: ViewControl["chunkUpToDate"];
  stats: ViewControl["stats"];
  resetStats: ViewControl["resetStats"];
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
  /** "Poof" de una entidad: si es de un slot, queda pendiente de reaparecer al amanecer. */
  poofEntity(id: string): boolean;
  /** Lleva una entidad a `pos` (pies), quieta (para preparar escenas). */
  moveEntity(id: string, pos: Vec3): boolean;
  /** Pone un zombi en `pos` (pies); devuelve su id. */
  spawnZombie(pos: Vec3): string;
  /** El dragón de esta noche, si está en el mundo. */
  dragon(): { id: string; phase: string | null; hits: number; pos: Vec3 } | null;
  /** Un impacto en el dragón (como una flecha que lo alcanza). */
  hitDragon(): boolean;
  /** Flechas en vuelo. */
  arrows(): number;
  /** Detiene (o reanuda) la simulación; el render sigue (para fotos de escenas quietas). */
  setPaused(paused: boolean): void;
  /** Usa la herramienta elegida con un rayo desde los ojos del personaje hacia `target` (como un clic). */
  useToolToward(target: Vec3): void;
  /** Deja un objeto flotando en `pos`; devuelve su id. */
  dropItem(item: ItemId, pos: Vec3): string;
  inventory(): Inventory;
  setInventory(inventory: Partial<Inventory>): void;
  /** Ahí podría aparecer un zombi de noche (terreno natural, sin techo y lejos de las antorchas). */
  canSpawnZombieAt(x: number, y: number, z: number): boolean;
  blockLight(x: number, y: number, z: number): number;
  pendingRespawns(): string[];
  dayNight(): DayNightSnapshot;
  /** Adelanta (o atrasa) el reloj del mundo a ese punto del ciclo. */
  setTimeOfCycle(ms: number): void;
  audio(): { ready: boolean; muted: boolean; masterGain: number; music: string | null; requests: Record<string, number> };
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
    chunkMeshed: view.chunkMeshed,
    chunkUpToDate: view.chunkUpToDate,
    stats: view.stats,
    resetStats: view.resetStats,
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
        swing: p.swing,
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
        tamed: e.tamed === true,
        role: e.role ?? null,
      })),
    clearEntities: () => game.entities.clear(),
    poofEntity: (id) => game.removeEntity(id),
    moveEntity: (id, pos) => {
      const e = game.entities.get(id);
      if (!e) return false;
      e.body.pos = { ...pos };
      e.body.vel = { x: 0, y: 0, z: 0 };
      game.entities.reindex();
      return true;
    },
    spawnZombie: (pos) => game.spawnZombie(pos).id,
    dragon: () => {
      const id = game.dragon.dragonId;
      const e = id ? game.entities.get(id) : undefined;
      return e ? { id: e.id, phase: game.dragon.phase, hits: game.dragon.hitsTaken, pos: { ...e.body.pos } } : null;
    },
    hitDragon: () => game.hitDragon(),
    arrows: () => game.projectiles.arrows.length,
    setPaused: (paused) => loop.setPaused(paused),
    useToolToward: (target) => {
      const origin = game.player.eye();
      const d = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      game.enqueue({ type: "useTool", ray: { origin, direction: { x: d.x / len, y: d.y / len, z: d.z / len } } });
    },
    dropItem: (item, pos) => game.dropItem(item, pos).id,
    inventory: () => ({ ...game.inventory }),
    setInventory: (inventory) => game.setInventory(inventory),
    canSpawnZombieAt: (x, y, z) => canSpawnAt(game.spawnWorld, x, y, z),
    blockLight: (x, y, z) => game.spawnWorld.blockLight(x, y, z),
    pendingRespawns: () => [...game.pendingRespawns],
    dayNight: () => {
      const c = game.clock;
      return {
        phase: c.phase,
        dayCount: c.dayCount,
        timeOfCycleMs: c.timeOfCycleMs,
        ...c.durations,
        daylight: c.daylight,
        msUntilNight: c.msUntilNight,
        quietNight: game.quietNight,
      };
    },
    setTimeOfCycle: (ms) => game.clock.restore(ms, game.clock.dayCount),
    audio: () => ({
      ready: audio.isReady,
      muted: audio.isMuted,
      masterGain: audio.masterGain,
      music: audio.musicTrack,
      requests: Object.fromEntries(audio.requests),
    }),
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
