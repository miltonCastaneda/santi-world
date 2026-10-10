import { hash2 } from "../../core/noise";
import type { Vec3 } from "../../core/math";
import type { BlockId } from "../blocks";
import type { TreeFeature } from "./layout";

export type TreeCell = Vec3 & { block: BlockId };

/**
 * Celdas de un árbol del generador: el tronco de madera y la copa de hojas (sin algunas esquinas,
 * siempre las mismas para la misma semilla). Las hojas solo ocupan celdas de aire.
 */
export function treeCells(seed: number, t: TreeFeature): TreeCell[] {
  const out: TreeCell[] = [];
  for (let i = 1; i <= t.trunk; i++) out.push({ x: t.x, y: t.y + i, z: t.z, block: "wood" });
  const top = t.y + t.trunk;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy >= 0 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && hash2(seed, t.x * 31 + dx + dy * 7, t.z * 17 + dz) < 0.6) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        out.push({ x: t.x + dx, y: top + dy, z: t.z + dz, block: "leaves" });
      }
    }
  }
  return out;
}
