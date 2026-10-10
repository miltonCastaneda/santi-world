import { VoxelWorld } from "../domain/world/voxelWorld";

export const LEGACY_STORAGE_KEY = "minecraf-de-santi-world-v2";

/** Lee el mundo v1 guardado en localStorage. Devuelve null si no hay datos válidos. */
export function loadLegacyWorld(storage: Storage): VoxelWorld | null {
  const raw = storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return VoxelWorld.fromEntries(JSON.parse(raw) as [string, string][]);
  } catch {
    return null;
  }
}

export function saveLegacyWorld(storage: Storage, world: VoxelWorld): void {
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(world.entries()));
}
