import type { Clock } from "../core/clock";
import { BLOCK_NUM } from "../domain/blocks";
import type { ChunkRecord, World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import { parseBlockKey, VoxelWorld } from "../domain/world/voxelWorld";
import { createWorldStore, LEGACY_OFFSET } from "../domain/worldgen/generator";
import { GENERATOR_VERSION } from "../domain/worldgen/layout";
import { errorMessage, recordError } from "./errorLog";
import { LEGACY_STORAGE_KEY } from "./legacyLocalStorage";

export const LEGACY_IMPORTED_KEY = "legacyImported";
export const LEGACY_BACKUP_KEY = `${LEGACY_STORAGE_KEY}-backup`;
export const LEGACY_WORLD_NAME = "Mi primer mundo";

export type LegacyImportResult =
  | { status: "imported"; world: World; blocks: number }
  | { status: "none" }
  | { status: "already" }
  | { status: "failed"; error: unknown };

/**
 * Importa el mundo v1 de localStorage como "Mi primer mundo" (design D4, Migration Plan): una pradera
 * plana con los bloques antiguos en el centro, marcados como colocados por el niño. La clave original
 * solo se renombra a "-backup" cuando el mundo nuevo ya está guardado; si algo falla, queda intacta.
 */
export async function importLegacyWorld(deps: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  repo: WorldRepository;
  ownerId: string;
  clock: Clock;
}): Promise<LegacyImportResult> {
  const { storage, repo, ownerId, clock } = deps;
  if (await repo.getMeta(LEGACY_IMPORTED_KEY)) return { status: "already" };
  const raw = storage.getItem(LEGACY_STORAGE_KEY);
  if (raw === null) return { status: "none" };

  let created: World | null = null;
  try {
    const legacy = parseLegacy(raw);
    const now = clock.now();
    const chunks = legacyChunks(legacy, now);
    created = await repo.createWorld({ ownerId, name: LEGACY_WORLD_NAME, seed: "legacy", generator: "legacy-flat", generatorVersion: GENERATOR_VERSION });
    const { state } = await repo.loadWorld(created.id);
    const world: World = { ...created, version: 1, updatedAt: now };
    await repo.saveSnapshot({
      world,
      state: { ...state, version: 1, updatedAt: now },
      entities: [],
      dirtyChunks: chunks.map((c) => ({ ...c, worldId: world.id })),
    });
    await repo.setMeta(LEGACY_IMPORTED_KEY, { worldId: world.id, at: now, blocks: legacy.blocks.size });
    storage.setItem(LEGACY_BACKUP_KEY, raw);
    storage.removeItem(LEGACY_STORAGE_KEY);
    return { status: "imported", world, blocks: legacy.blocks.size };
  } catch (error) {
    if (created) await repo.softDelete(created.id).catch(() => {});
    await recordError(repo, { at: clock.now(), context: "importación del mundo v1", message: errorMessage(error) });
    return { status: "failed", error };
  }
}

function parseLegacy(raw: string): VoxelWorld {
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error("El mundo v1 no es una lista de bloques.");
  const world = VoxelWorld.fromEntries(entries.filter((e): e is [string, string] => Array.isArray(e) && e.length === 2));
  if (!world) throw new Error("El mundo v1 no tiene bloques válidos.");
  return world;
}

/** Bloques v1 sobre la pradera plana, desplazados con LEGACY_OFFSET y marcados como colocados. */
export function legacyChunks(legacy: VoxelWorld, now: number): Omit<ChunkRecord, "worldId">[] {
  const { store } = createWorldStore("legacy", "legacy-flat");
  for (const [key, id] of legacy.entries()) {
    const { x, y, z } = parseBlockKey(key);
    store.set(LEGACY_OFFSET.x + x, LEGACY_OFFSET.y + y, LEGACY_OFFSET.z + z, BLOCK_NUM[id], true, now);
  }
  return store.dirtyChunks().map((c) => ({ cx: c.cx, cz: c.cz, version: c.version, updatedAt: now, blocks: c.blocks, placed: c.placed }));
}
