import type { ChunkRecord, EntitySnapshot, GameState, NewWorld, SaveSnapshot, User, World } from "./model";

export type LoadedWorld = { world: World; state: GameState; entities: EntitySnapshot[] };

/**
 * Puerto de persistencia (design D4, ADR-0002). Todo acceso a los datos guardados pasa por aquí;
 * las implementaciones (memoria, Dexie y, en el futuro, HTTP) pasan la misma suite de contrato.
 */
export interface WorldRepository {
  /** Devuelve el usuario por defecto, creándolo con un UUID la primera vez. */
  ensureDefaultUser(): Promise<User>;
  /** Mundos del usuario, del más reciente al más antiguo (sin los de la papelera salvo que se pidan). */
  listWorlds(ownerId: string, opts?: { includeDeleted?: boolean }): Promise<World[]>;
  /** Crea el mundo y su estado inicial. */
  createWorld(input: NewWorld): Promise<World>;
  /** Lanza un error si el mundo no existe. */
  loadWorld(worldId: string): Promise<LoadedWorld>;
  loadChunk(worldId: string, cx: number, cz: number): Promise<ChunkRecord | null>;
  /** Todos los chunks modificados del mundo. */
  listChunks(worldId: string): Promise<ChunkRecord[]>;
  /** Guarda el mundo, el estado, las entidades y los chunks sucios en una sola transacción. */
  saveSnapshot(snapshot: SaveSnapshot): Promise<void>;
  getThumbnail(worldId: string): Promise<Blob | null>;
  /** Manda el mundo a la papelera (se puede restaurar). */
  softDelete(worldId: string): Promise<void>;
  restore(worldId: string): Promise<void>;
  /** Borra definitivamente los mundos que llevan en la papelera más de retentionMs. Devuelve cuántos. */
  purgeExpired(now: number, retentionMs: number): Promise<number>;
  /** Archivo JSON con el usuario, el mundo, la versión de esquema y las marcas de cada parte. */
  exportWorld(worldId: string): Promise<Blob>;
  /** Importa un archivo de exportWorld como un mundo nuevo (con otro id) del usuario indicado. */
  importWorld(file: Blob, ownerId: string): Promise<World>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}
