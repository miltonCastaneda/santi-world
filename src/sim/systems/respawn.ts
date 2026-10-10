import type { EntityStore } from "../../domain/entities/entityStore";
import type { SpawnSlot } from "../../domain/entities/population";
import { SPECIES } from "../../domain/entities/species";

/** Si el punto original está ocupado, se busca el libre más cercano a esta distancia o menos (design D10). */
export const RESPAWN_RADIUS = 8;

/** Lo que la reaparición consulta del mundo. */
export type RespawnWorld = {
  size: number;
  surfaceY(x: number, z: number): number;
  isPlaced(x: number, y: number, z: number): boolean;
  isWater(x: number, y: number, z: number): boolean;
  /** Altura de colisión de la celda (1 = bloque entero; una cerca mide 1,5). */
  collision(x: number, y: number, z: number): number;
};

/** Desplazamientos dentro del radio, del más cercano al más lejano (orden fijo: determinista). */
const OFFSETS: readonly { dx: number; dz: number }[] = (() => {
  const out: { dx: number; dz: number; d: number }[] = [];
  for (let dx = -RESPAWN_RADIUS; dx <= RESPAWN_RADIUS; dx++) {
    for (let dz = -RESPAWN_RADIUS; dz <= RESPAWN_RADIUS; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= RESPAWN_RADIUS) out.push({ dx, dz, d });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.dx - b.dx || a.dz - b.dz);
})();

/**
 * Celda libre más cercana al slot: suelo natural (nunca encima de lo que construyó el niño), de
 * altura entera, sin agua salvo para los que nadan, y sin otro animal encima.
 */
export function freeSpotNear(slot: SpawnSlot, world: RespawnWorld, store: EntityStore): { x: number; z: number } | null {
  const swims = slot.species !== "wolf" && SPECIES[slot.species].swims;
  for (const { dx, dz } of OFFSETS) {
    const x = slot.x + dx;
    const z = slot.z + dz;
    if (x < 0 || z < 0 || x >= world.size || z >= world.size) continue;
    const y = world.surfaceY(x, z);
    if (world.isPlaced(x, y, z)) continue;
    const water = world.isWater(x, y, z);
    if (water ? !swims : world.collision(x, y, z) !== 1) continue;
    if (store.near({ x: x + 0.5, y: y + 1, z: z + 0.5 }, 0.9).length > 0) continue;
    return { x, z };
  }
  return null;
}

/**
 * Reaparición al amanecer: rellena solo los slots pendientes que no tienen un animal vivo (nunca
 * duplica) en el punto libre más cercano. Devuelve los slots que reaparecieron; los que no
 * encontraron lugar siguen pendientes.
 */
export function respawnPending(
  pending: readonly string[],
  slots: readonly SpawnSlot[],
  store: EntityStore,
  world: RespawnWorld,
  spawn: (slot: SpawnSlot) => void,
): { respawned: string[]; stillPending: string[] } {
  const alive = new Set<string>();
  for (const e of store.all()) if (e.slotId) alive.add(e.slotId);
  const respawned: string[] = [];
  const stillPending: string[] = [];
  for (const id of new Set(pending)) {
    const slot = slots.find((s) => s.id === id);
    if (!slot || alive.has(id)) continue;
    const spot = freeSpotNear(slot, world, store);
    if (!spot) {
      stillPending.push(id);
      continue;
    }
    spawn({ ...slot, ...spot });
    store.reindex();
    alive.add(id);
    respawned.push(id);
  }
  return { respawned, stillPending };
}
