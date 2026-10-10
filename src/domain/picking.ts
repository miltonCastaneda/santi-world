import { raycastVoxels, type Ray, type Vec3 } from "../core/math";

export type BlockTarget = {
  /** Bloque sólido apuntado. */
  block: Vec3;
  /** Celda vacía adyacente a la cara apuntada (donde se colocaría un bloque). */
  adjacent: Vec3;
  distance: number;
};

/**
 * Busca el bloque apuntado en el mundo por chunks, donde el bloque (x, y, z) ocupa
 * [x, x+1) x [y, y+1) x [z, z+1).
 */
export function pickCell(
  ray: Ray,
  maxDistance: number,
  isPickable: (x: number, y: number, z: number) => boolean,
): BlockTarget | null {
  const hit = raycastVoxels(ray, maxDistance, isPickable);
  if (!hit) return null;
  return {
    block: hit.cell,
    adjacent: { x: hit.cell.x + hit.normal.x, y: hit.cell.y + hit.normal.y, z: hit.cell.z + hit.normal.z },
    distance: hit.distance,
  };
}

/**
 * Busca el bloque apuntado por un rayo en coordenadas de bloque del mundo v1, donde el bloque
 * (x, y, z) ocupa el cubo centrado en (x, y, z) de lado 1.
 */
export function pickBlock(
  ray: Ray,
  maxDistance: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): BlockTarget | null {
  const shifted: Ray = {
    origin: { x: ray.origin.x + 0.5, y: ray.origin.y + 0.5, z: ray.origin.z + 0.5 },
    direction: ray.direction,
  };
  const hit = raycastVoxels(shifted, maxDistance, isSolid);
  if (!hit) return null;
  return {
    block: hit.cell,
    adjacent: { x: hit.cell.x + hit.normal.x, y: hit.cell.y + hit.normal.y, z: hit.cell.z + hit.normal.z },
    distance: hit.distance,
  };
}
