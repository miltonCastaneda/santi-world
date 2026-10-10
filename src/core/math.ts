export type Vec3 = { x: number; y: number; z: number };

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  return len === 0 ? vec3() : vec3(v.x / len, v.y / len, v.z / len);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export type Ray = { origin: Vec3; direction: Vec3 };

/** Caja alineada a los ejes. */
export type Aabb = { min: Vec3; max: Vec3 };

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/** Distancia a la que un rayo entra en una caja, o null si no la toca (método de slabs). */
export function rayAabb(ray: Ray, box: Aabb, maxDistance = Infinity): number | null {
  let tMin = 0;
  let tMax = maxDistance;
  for (const axis of ["x", "y", "z"] as const) {
    const o = ray.origin[axis];
    const d = ray.direction[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t1 = (box.min[axis] - o) / d;
    let t2 = (box.max[axis] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

export type VoxelHit = {
  /** Celda sólida alcanzada. */
  cell: Vec3;
  /** Normal de la cara por la que entró el rayo (apunta hacia afuera de la celda). */
  normal: Vec3;
  distance: number;
};

/**
 * Recorre las celdas de una rejilla unitaria (la celda i cubre [i, i+1)) a lo largo de un rayo
 * con el algoritmo DDA de Amanatides y Woo, y devuelve la primera celda sólida.
 */
export function raycastVoxels(
  ray: Ray,
  maxDistance: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): VoxelHit | null {
  const dir = normalize(ray.direction);
  if (dir.x === 0 && dir.y === 0 && dir.z === 0) return null;

  let x = Math.floor(ray.origin.x);
  let y = Math.floor(ray.origin.y);
  let z = Math.floor(ray.origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const frac = (v: number, step: number) => (step > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tMaxX = stepX !== 0 ? frac(ray.origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = stepY !== 0 ? frac(ray.origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = stepZ !== 0 ? frac(ray.origin.z, stepZ) * tDeltaZ : Infinity;

  let normal = vec3();
  let t = 0;

  if (isSolid(x, y, z)) return { cell: vec3(x, y, z), normal, distance: 0 };

  while (t <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = vec3(-stepX, 0, 0);
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = vec3(0, -stepY, 0);
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = vec3(0, 0, -stepZ);
    }
    if (t > maxDistance) break;
    if (isSolid(x, y, z)) return { cell: vec3(x, y, z), normal, distance: t };
  }
  return null;
}
