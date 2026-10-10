import type { Vec3 } from "../../core/math";
import { BLOCK_NUM } from "../../domain/blocks";
import type { TerrainWorld } from "../../domain/world/terrainWorld";

/**
 * Los diamantes vuelven a sus vetas de la montaña de roca, solo donde hoy hay piedra natural
 * (`placed=0`): un diamante minado. Lo que el niño construyó o rompió no cambia.
 */
export function regrowDiamonds(world: TerrainWorld, now: number): Vec3[] {
  const out: Vec3[] = [];
  for (const ore of world.layout?.ores ?? []) {
    const { x, y, z } = ore;
    if (world.store.get(x, y, z) !== BLOCK_NUM.stone || world.store.isPlaced(x, y, z)) continue;
    const pos = world.replaceNatural(x, y, z, "diamond_ore", now);
    if (pos) out.push(pos);
  }
  return out;
}
