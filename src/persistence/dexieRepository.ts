import Dexie, { type DexieOptions, type Table } from "dexie";
import { defaultGameState, type ChunkRecord, type EntitySnapshot, type GameState, type NewWorld, type SaveSnapshot, type User, type World } from "../domain/repository/model";
import type { LoadedWorld, WorldRepository } from "../domain/repository/worldRepository";
import { decodeExport, encodeExport } from "./exportFormat";
import { newWorldRecord, type RepositoryDeps } from "./inMemoryRepository";
import { migrateState, migrateWorld } from "./migrations";

export const DB_NAME = "minecraf-de-santi";

type EntityRow = { worldId: string; list: EntitySnapshot[] };
type ThumbnailRow = { worldId: string; type: string; data: ArrayBuffer };
type MetaRow = { key: string; value: unknown };

/**
 * Esquema de IndexedDB (design D4). Cada cambio de estructura agrega un `version(n)` nuevo con su
 * `upgrade()`; nunca se edita una versión ya publicada.
 */
export class SantiDatabase extends Dexie {
  users!: Table<User, string>;
  worlds!: Table<World, string>;
  chunks!: Table<ChunkRecord, [string, number, number]>;
  states!: Table<GameState, string>;
  entities!: Table<EntityRow, string>;
  thumbnails!: Table<ThumbnailRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      users: "id",
      worlds: "id, ownerId, updatedAt, deletedAt",
      chunks: "[worldId+cx+cz], worldId",
      states: "worldId",
      entities: "worldId",
      thumbnails: "worldId",
      meta: "key",
    });
  }
}

const DEFAULT_USER_KEY = "defaultUserId";

/** Implementación de producción del puerto, sobre IndexedDB con Dexie (ADR-0002). */
export class DexieWorldRepository implements WorldRepository {
  constructor(
    private readonly db: SantiDatabase,
    private readonly deps: RepositoryDeps,
  ) {}

  async ensureDefaultUser(): Promise<User> {
    return this.db.transaction("rw", this.db.users, this.db.meta, async () => {
      const id = (await this.db.meta.get(DEFAULT_USER_KEY))?.value as string | undefined;
      const existing = id ? await this.db.users.get(id) : undefined;
      if (existing) return existing;
      const user: User = { id: this.deps.newId(), name: "Santi", createdAt: this.deps.clock.now() };
      await this.db.users.put(user);
      await this.db.meta.put({ key: DEFAULT_USER_KEY, value: user.id });
      return user;
    });
  }

  async listWorlds(ownerId: string, opts: { includeDeleted?: boolean } = {}): Promise<World[]> {
    const all = await this.db.worlds.where("ownerId").equals(ownerId).toArray();
    return all
      .map(migrateWorld)
      .filter((w) => opts.includeDeleted || w.deletedAt === undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createWorld(input: NewWorld): Promise<World> {
    const now = this.deps.clock.now();
    const world = newWorldRecord(this.deps.newId(), input, now);
    await this.db.transaction("rw", this.db.worlds, this.db.states, this.db.entities, async () => {
      await this.db.worlds.put(world);
      await this.db.states.put(defaultGameState(world.id, now));
      await this.db.entities.put({ worldId: world.id, list: [] });
    });
    return world;
  }

  async loadWorld(worldId: string): Promise<LoadedWorld> {
    const [world, state, entities] = await this.db.transaction("r", this.db.worlds, this.db.states, this.db.entities, () =>
      Promise.all([this.db.worlds.get(worldId), this.db.states.get(worldId), this.db.entities.get(worldId)]),
    );
    if (!world || !state) throw new Error(`No existe el mundo ${worldId}`);
    return { world: migrateWorld(world), state: migrateState(state), entities: entities?.list ?? [] };
  }

  async loadChunk(worldId: string, cx: number, cz: number): Promise<ChunkRecord | null> {
    return (await this.db.chunks.get([worldId, cx, cz])) ?? null;
  }

  async listChunks(worldId: string): Promise<ChunkRecord[]> {
    return this.db.chunks.where("worldId").equals(worldId).toArray();
  }

  async saveSnapshot(s: SaveSnapshot): Promise<void> {
    // Fuera de la transacción: IndexedDB la cerraría si se espera algo que no es de la base.
    const thumbnail = s.thumbnail ? { worldId: s.world.id, type: s.thumbnail.type, data: await s.thumbnail.arrayBuffer() } : null;
    await this.db.transaction("rw", [this.db.worlds, this.db.states, this.db.entities, this.db.chunks, this.db.thumbnails], async () => {
      await this.db.worlds.put(s.world);
      await this.db.states.put(s.state);
      await this.db.entities.put({ worldId: s.world.id, list: s.entities });
      if (s.dirtyChunks.length > 0) await this.db.chunks.bulkPut(s.dirtyChunks);
      if (thumbnail) await this.db.thumbnails.put(thumbnail);
    });
  }

  async getThumbnail(worldId: string): Promise<Blob | null> {
    const row = await this.db.thumbnails.get(worldId);
    return row ? new Blob([row.data], { type: row.type }) : null;
  }

  async softDelete(worldId: string): Promise<void> {
    await this.db.worlds.update(worldId, { deletedAt: this.deps.clock.now() });
  }

  async restore(worldId: string): Promise<void> {
    await this.db.transaction("rw", this.db.worlds, async () => {
      const w = await this.db.worlds.get(worldId);
      if (!w) return;
      delete w.deletedAt;
      await this.db.worlds.put(w);
    });
  }

  async purgeExpired(now: number, retentionMs: number): Promise<number> {
    const tables = [this.db.worlds, this.db.states, this.db.entities, this.db.chunks, this.db.thumbnails];
    return this.db.transaction("rw", tables, async () => {
      const expired = await this.db.worlds.where("deletedAt").belowOrEqual(now - retentionMs).toArray();
      for (const w of expired) {
        await this.db.chunks.where("worldId").equals(w.id).delete();
        await Promise.all([this.db.worlds.delete(w.id), this.db.states.delete(w.id), this.db.entities.delete(w.id), this.db.thumbnails.delete(w.id)]);
      }
      return expired.length;
    });
  }

  async exportWorld(worldId: string): Promise<Blob> {
    const { world, state, entities } = await this.loadWorld(worldId);
    return encodeExport({ world, state, entities, chunks: await this.listChunks(worldId), now: this.deps.clock.now() });
  }

  async importWorld(file: Blob, ownerId: string): Promise<World> {
    const { doc, chunks } = await decodeExport(file);
    const id = this.deps.newId();
    const { deletedAt: _deleted, ...rest } = migrateWorld(doc.world);
    const world: World = { ...rest, id, ownerId, updatedAt: this.deps.clock.now() };
    await this.saveSnapshot({
      world,
      state: { ...migrateState(doc.state), worldId: id },
      entities: doc.entities.map((e) => ({ ...e, worldId: id })),
      dirtyChunks: chunks.map((c) => ({ ...c, worldId: id })),
    });
    return world;
  }

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
