import type { Clock } from "../core/clock";
import { EventBus } from "../core/events";
import type { CameraView, ChunkRecord, GameState, SaveSnapshot, World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import { isToolId } from "../domain/rules/tools";
import { TerrainWorld } from "../domain/world/terrainWorld";
import type { GeneratorKind } from "../domain/worldgen/generator";
import { GENERATOR_VERSION } from "../domain/worldgen/layout";
import type { Game } from "./game";

/** Quien guarda de verdad (AutosaveService). Debe rechazar la promesa si el guardado falla. */
export type Saver = { saveNow(): Promise<void> };

export type SessionEvents = {
  worldOpened: { world: World; state: GameState };
  saveFailed: { error: unknown; during: "switch" | "create" };
  busyChanged: { busy: boolean };
  settingsChanged: { world: World };
};

export type SessionDeps = {
  repo: WorldRepository;
  clock: Clock;
  newSeed: () => string;
  /** Cámara actual, para guardarla (la pone la app; no existe en pruebas sin render). */
  camera?: () => CameraView | null;
};

/** Lo que hay que guardar, copiado en un instante, y qué hacer cuando el guardado se confirme. */
export type PendingSave = { snapshot: SaveSnapshot; onSaved(): void };

/** Entre dos "Crear nuevo mundo" tiene que pasar al menos este tiempo (spec: clics repetidos). */
export const CREATE_COOLDOWN_MS = 2000;
export const LAST_WORLD_KEY = "lastWorldId";

/**
 * Mundo abierto y cambios de mundo (design D4). `switchWorld` y `createWorld` son los únicos caminos
 * para reemplazar el mundo y los dos guardan antes de limpiar: si el guardado falla, no cambian nada.
 */
export class GameSession {
  readonly events = new EventBus<SessionEvents>();
  world: World | null = null;
  private state: GameState | null = null;
  private saver: Saver | null = null;
  private busy: Promise<boolean> | null = null;
  private lastCreateAt = Number.NEGATIVE_INFINITY;
  private savedStateKey = "";

  constructor(
    readonly game: Game,
    readonly ownerId: string,
    private readonly deps: SessionDeps,
  ) {}

  attachSaver(saver: Saver): void {
    this.saver = saver;
  }

  get isBusy(): boolean {
    return this.busy !== null;
  }

  /**
   * Abre el mundo inicial: el pedido por id, el de la semilla pedida (o uno nuevo con ella), el
   * último abierto, el más reciente o uno nuevo si no hay ninguno.
   */
  async openInitial(opts: { seed?: string; worldId?: string } = {}): Promise<World> {
    const target = await this.pickInitial(opts);
    await this.open(target.id);
    return this.world!;
  }

  private async pickInitial(opts: { seed?: string; worldId?: string }): Promise<World> {
    const worlds = await this.deps.repo.listWorlds(this.ownerId);
    const requested = worlds.find((w) => w.id === opts.worldId);
    if (requested) return requested;
    if (opts.seed !== undefined) {
      return worlds.find((w) => w.seed === opts.seed && w.generator === "zones") ?? this.newWorldRecord(opts.seed);
    }
    const lastId = await this.deps.repo.getMeta<string>(LAST_WORLD_KEY);
    return worlds.find((w) => w.id === lastId) ?? worlds[0] ?? this.newWorldRecord(this.deps.newSeed());
  }

  /** Cambia de mundo guardando primero. Devuelve false si no se pudo guardar (el mundo actual queda intacto). */
  switchWorld(worldId: string): Promise<boolean> {
    if (worldId === this.world?.id) return Promise.resolve(true);
    return this.exclusive("switch", () => this.open(worldId));
  }

  /** "Crear nuevo mundo": guarda el actual y solo después crea y muestra el nuevo. */
  createWorld(): Promise<boolean> {
    if (this.busy) return this.busy;
    if (this.deps.clock.now() - this.lastCreateAt < CREATE_COOLDOWN_MS) return Promise.resolve(false);
    this.lastCreateAt = this.deps.clock.now();
    return this.exclusive("create", async () => {
      const w = await this.newWorldRecord(this.deps.newSeed());
      await this.open(w.id);
    });
  }

  /** Los padres cambiaron la configuración: si es el mundo abierto, se aplica en caliente. */
  async reloadSettings(worldId: string): Promise<boolean> {
    if (this.world?.id !== worldId) return false;
    const { world } = await this.deps.repo.loadWorld(worldId);
    if (this.world?.id !== worldId) return false;
    this.world = { ...this.world, settings: world.settings };
    this.game.configureTime(world.settings);
    this.events.emit("settingsChanged", { world: this.world });
    return true;
  }

  /** Hay algo que guardar: chunks sucios o un cambio de estado (cámara, bloque elegido). */
  hasChanges(): boolean {
    if (!this.world) return false;
    return this.game.world.store.dirtyChunks().length > 0 || this.stateKey() !== this.savedStateKey;
  }

  /**
   * Copia síncrona de todo lo que hay que guardar. Se puede seguir jugando mientras se escribe: al
   * confirmar, solo se limpian los chunks que no cambiaron desde la copia.
   */
  collect(): PendingSave | null {
    const world = this.world;
    const state = this.state;
    if (!world || !state) return null;
    const now = this.deps.clock.now();
    const store = this.game.world.store;
    const dirty = store.dirtyChunks();
    const dirtyChunks: ChunkRecord[] = dirty.map((c) => ({
      worldId: world.id,
      cx: c.cx,
      cz: c.cz,
      version: c.version,
      updatedAt: now,
      blocks: c.blocks.slice(),
      placed: c.placed.slice(),
    }));
    const key = this.stateKey();
    const clock = this.game.clock;
    const snapshot: SaveSnapshot = {
      world: { ...world, version: world.version + 1, updatedAt: now, dayCount: clock.dayCount },
      state: {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        camera: this.deps.camera?.() ?? state.camera,
        timeOfCycleMs: Math.round(clock.timeOfCycleMs),
        dayCount: clock.dayCount,
        pendingRespawns: [...this.game.pendingRespawns],
        animalsSpawned: true,
        player: {
          pos: { ...this.game.player.pos },
          yaw: this.game.player.yaw,
          hearts: this.game.player.hearts,
          selectedTool: this.game.selection.tool,
          selectedBlock: this.game.selection.block,
        },
      },
      entities: this.game.entitySnapshots(world.id),
      dirtyChunks,
    };
    return {
      snapshot,
      onSaved: () => {
        store.markSaved(dirtyChunks);
        if (this.world?.id !== world.id) return;
        this.world = snapshot.world;
        this.state = snapshot.state;
        this.savedStateKey = key;
      },
    };
  }

  private async open(worldId: string): Promise<void> {
    const { repo } = this.deps;
    const [{ world, state, entities }, records] = await Promise.all([repo.loadWorld(worldId), repo.listChunks(worldId)]);
    const terrain = TerrainWorld.fromRecords(world.seed, world.generator, records);
    this.world = world;
    this.state = state;
    const tool = isToolId(state.player.selectedTool) ? state.player.selectedTool : "hand";
    this.game.replaceWorld(terrain, { tool, block: state.player.selectedBlock });
    const player = this.game.player;
    if (state.player.pos) player.teleport(state.player.pos);
    player.yaw = state.player.yaw;
    player.restoreHearts(state.player.hearts, this.game.timeMs);
    // La hora sigue donde quedó: con el juego cerrado el tiempo no pasa.
    this.game.configureTime(world.settings);
    this.game.clock.restore(state.timeOfCycleMs, state.dayCount);
    this.game.pendingRespawns = [...state.pendingRespawns];
    // Un mundo nuevo (o guardado antes de que hubiera animales) recibe su población inicial.
    if (state.animalsSpawned) this.game.restoreEntities(entities);
    else this.game.spawnPopulation();
    this.events.emit("worldOpened", { world, state });
    this.savedStateKey = this.stateKey();
    await repo.setMeta(LAST_WORLD_KEY, worldId);
  }

  private exclusive(during: "switch" | "create", action: () => Promise<void>): Promise<boolean> {
    if (this.busy) return this.busy;
    this.events.emit("busyChanged", { busy: true });
    this.busy = (async () => {
      try {
        try {
          await this.saveFirst();
        } catch (error) {
          this.events.emit("saveFailed", { error, during });
          return false;
        }
        await action();
        return true;
      } finally {
        this.busy = null;
        this.events.emit("busyChanged", { busy: false });
      }
    })();
    return this.busy;
  }

  private async saveFirst(): Promise<void> {
    if (this.saver) return this.saver.saveNow();
    const pending = this.hasChanges() ? this.collect() : null;
    if (!pending) return;
    await this.deps.repo.saveSnapshot(pending.snapshot);
    pending.onSaved();
  }

  private async newWorldRecord(seed: string, generator: GeneratorKind = "zones"): Promise<World> {
    const all = await this.deps.repo.listWorlds(this.ownerId, { includeDeleted: true });
    return this.deps.repo.createWorld({ ownerId: this.ownerId, name: `Mundo ${all.length + 1}`, seed, generator, generatorVersion: GENERATOR_VERSION });
  }

  private stateKey(): string {
    const cam = this.deps.camera?.();
    const r = (v: { x: number; y: number; z: number }) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
    const p = this.game.player;
    // Los animales cuentan al bloque: moverse dentro de la misma celda no obliga a guardar.
    let animals = 0;
    for (const e of this.game.entities.all()) animals = (animals * 31 + Math.floor(e.body.pos.x) * 7 + Math.floor(e.body.pos.z) * 13 + e.seq) | 0;
    // La hora cuenta cada 5 s (spec "Persistir la hora": ± 5 s).
    const clock = `${this.game.clock.dayCount}:${Math.floor(this.game.clock.timeOfCycleMs / 5000)}:${this.game.pendingRespawns.join(",")}`;
    return `${this.game.selection.tool}|${this.game.selection.block}|${r(p.pos)}|${p.hearts}|${animals}|${clock}|${cam ? `${r(cam.position)}|${r(cam.target)}` : ""}`;
  }
}
