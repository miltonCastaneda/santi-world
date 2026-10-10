import type { Clock } from "../core/clock";
import {
  DEFAULT_SETTINGS,
  defaultGameState,
  SCHEMA_VERSION,
  type ChunkRecord,
  type EntitySnapshot,
  type GameState,
  type NewWorld,
  type SaveSnapshot,
  type User,
  type World,
  type WorldSettings,
} from "../domain/repository/model";
import type { LoadedWorld, WorldRepository } from "../domain/repository/worldRepository";
import { decodeExport, encodeExport } from "./exportFormat";
import { migrateState, migrateWorld } from "./migrations";

export type RepositoryDeps = { clock: Clock; newId: () => string };

const DEFAULT_USER_KEY = "defaultUserId";

/**
 * Implementación en memoria del puerto, para pruebas y como referencia del contrato. Copia los datos
 * al guardar y al leer, como haría una base de datos real.
 */
export class InMemoryWorldRepository implements WorldRepository {
  /** Para pruebas: hace que los próximos guardados fallen (por ejemplo, "sin cuota"). */
  failSaves: Error | null = null;
  saveCount = 0;

  private users = new Map<string, User>();
  private worlds = new Map<string, World>();
  private states = new Map<string, GameState>();
  private entities = new Map<string, EntitySnapshot[]>();
  private chunks = new Map<string, ChunkRecord>();
  private thumbnails = new Map<string, Blob>();
  private meta = new Map<string, unknown>();

  constructor(private readonly deps: RepositoryDeps) {}

  async ensureDefaultUser(): Promise<User> {
    const id = this.meta.get(DEFAULT_USER_KEY) as string | undefined;
    const existing = id ? this.users.get(id) : undefined;
    if (existing) return clone(existing);
    const user: User = { id: this.deps.newId(), name: "Santi", createdAt: this.deps.clock.now() };
    this.users.set(user.id, user);
    this.meta.set(DEFAULT_USER_KEY, user.id);
    return clone(user);
  }

  async listWorlds(ownerId: string, opts: { includeDeleted?: boolean } = {}): Promise<World[]> {
    return [...this.worlds.values()]
      .filter((w) => w.ownerId === ownerId && (opts.includeDeleted || w.deletedAt === undefined))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(clone);
  }

  async createWorld(input: NewWorld): Promise<World> {
    const now = this.deps.clock.now();
    const world = newWorldRecord(this.deps.newId(), input, now);
    this.worlds.set(world.id, world);
    this.states.set(world.id, defaultGameState(world.id, now));
    this.entities.set(world.id, []);
    return clone(world);
  }

  async loadWorld(worldId: string): Promise<LoadedWorld> {
    const world = this.worlds.get(worldId);
    const state = this.states.get(worldId);
    if (!world || !state) throw new Error(`No existe el mundo ${worldId}`);
    return { world: clone(world), state: clone(state), entities: clone(this.entities.get(worldId) ?? []) };
  }

  async loadChunk(worldId: string, cx: number, cz: number): Promise<ChunkRecord | null> {
    const c = this.chunks.get(chunkId(worldId, cx, cz));
    return c ? cloneChunk(c) : null;
  }

  async listChunks(worldId: string): Promise<ChunkRecord[]> {
    return [...this.chunks.values()].filter((c) => c.worldId === worldId).map(cloneChunk);
  }

  async saveSnapshot(s: SaveSnapshot): Promise<void> {
    if (this.failSaves) throw this.failSaves;
    this.worlds.set(s.world.id, keepParentFields(clone(s.world), this.worlds.get(s.world.id)));
    this.states.set(s.world.id, clone(s.state));
    this.entities.set(s.world.id, clone(s.entities));
    for (const c of s.dirtyChunks) this.chunks.set(chunkId(c.worldId, c.cx, c.cz), cloneChunk(c));
    if (s.thumbnail) this.thumbnails.set(s.world.id, s.thumbnail);
    this.saveCount++;
  }

  async updateSettings(worldId: string, settings: WorldSettings): Promise<World> {
    const w = this.worlds.get(worldId);
    if (!w) throw new Error(`No existe el mundo ${worldId}`);
    w.settings = clone(settings);
    return clone(w);
  }

  async getThumbnail(worldId: string): Promise<Blob | null> {
    return this.thumbnails.get(worldId) ?? null;
  }

  async softDelete(worldId: string): Promise<void> {
    const w = this.worlds.get(worldId);
    if (w) w.deletedAt = this.deps.clock.now();
  }

  async restore(worldId: string): Promise<void> {
    const w = this.worlds.get(worldId);
    if (w) delete w.deletedAt;
  }

  async purgeExpired(now: number, retentionMs: number): Promise<number> {
    let n = 0;
    for (const w of [...this.worlds.values()]) {
      if (w.deletedAt === undefined || now - w.deletedAt < retentionMs) continue;
      this.worlds.delete(w.id);
      this.states.delete(w.id);
      this.entities.delete(w.id);
      this.thumbnails.delete(w.id);
      for (const [k, c] of [...this.chunks]) if (c.worldId === w.id) this.chunks.delete(k);
      n++;
    }
    return n;
  }

  async exportWorld(worldId: string): Promise<Blob> {
    const { world, state, entities } = await this.loadWorld(worldId);
    return encodeExport({ world, state, entities, chunks: await this.listChunks(worldId), now: this.deps.clock.now() });
  }

  async importWorld(file: Blob, ownerId: string): Promise<World> {
    const { doc, chunks } = await decodeExport(file);
    const now = this.deps.clock.now();
    const id = this.deps.newId();
    const { deletedAt: _deleted, ...rest } = migrateWorld(doc.world);
    const world: World = { ...rest, id, ownerId, updatedAt: now };
    await this.saveSnapshot({
      world,
      state: { ...migrateState(doc.state), worldId: id },
      entities: doc.entities.map((e) => ({ ...e, worldId: id })),
      dirtyChunks: chunks.map((c) => ({ ...c, worldId: id })),
    });
    return clone(world);
  }

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return clone(this.meta.get(key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, clone(value));
  }
}

export function newWorldRecord(id: string, input: NewWorld, now: number): World {
  return {
    id,
    ownerId: input.ownerId,
    name: input.name,
    seed: input.seed,
    generator: input.generator,
    generatorVersion: input.generatorVersion,
    schemaVersion: SCHEMA_VERSION,
    version: 0,
    createdAt: now,
    updatedAt: now,
    dayCount: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Los campos que solo cambian los padres se conservan al guardar desde el juego. */
export function keepParentFields(next: World, stored: World | undefined): World {
  if (!stored) return next;
  const out: World = { ...next, settings: stored.settings };
  if (stored.deletedAt !== undefined) out.deletedAt = stored.deletedAt;
  else delete out.deletedAt;
  return out;
}

export function chunkId(worldId: string, cx: number, cz: number): string {
  return `${worldId}:${cx},${cz}`;
}

function clone<T>(v: T): T {
  return v === undefined ? v : structuredClone(v);
}

function cloneChunk(c: ChunkRecord): ChunkRecord {
  return { ...c, blocks: c.blocks.slice(), placed: c.placed.slice() };
}
