import type { Vec3 } from "../../core/math";
import type { Path } from "../../domain/entities/entityStore";
import type { CollisionQuery } from "../../domain/physics/collide";
import { CHUNK_SIZE } from "../../domain/world/chunk";

/** Lo que el pathfinding necesita del mundo. */
export type PathWorld = {
  collision: CollisionQuery;
  isWater(x: number, y: number, z: number): boolean;
  /** Versión del chunk (cambia con cada edición). */
  chunkVersion(cx: number, cz: number): number;
};

export type PathAgent = { height: number; swims: boolean };

/** Presupuesto (ADR-0006): nodos por búsqueda y búsquedas por tick. */
export const MAX_NODES = 2000;
export const SEARCHES_PER_TICK = 3;
export const MAX_DROP = 3;
/** Las búsquedas no salen de la caja de origen y destino más este margen. */
const REGION_MARGIN = 20;

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Celda libre para el cuerpo: sin nada sólido (ni la media celda que sobresale de una cerca). */
function clear(w: PathWorld, x: number, y: number, z: number, agent: PathAgent, feet: boolean): boolean {
  const h = Math.ceil(agent.height);
  for (let k = 0; k < h; k++) if (w.collision(x, y + k, z) !== 0) return false;
  if (w.collision(x, y - 1, z) > 1) return false;
  if (feet && !agent.swims && w.isWater(x, y, z)) return false;
  return true;
}

/**
 * Celda donde la entidad puede estar de pie: libre y con un bloque entero debajo (sobre una cerca no
 * se puede pararse). Quien nada también puede estar sobre la superficie del agua.
 */
export function isWalkable(w: PathWorld, x: number, y: number, z: number, agent: PathAgent): boolean {
  if (!clear(w, x, y, z, agent, true)) return false;
  const below = w.collision(x, y - 1, z);
  if (below === 1) return true;
  return agent.swims && below === 0 && w.isWater(x, y - 1, z) && !w.isWater(x, y, z);
}

/** Altura donde se puede estar de pie en la columna (x, z), buscando cerca de `nearY`. */
export function standY(w: PathWorld, x: number, z: number, nearY: number, agent: PathAgent): number | null {
  for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, 6]) {
    if (isWalkable(w, x, nearY + dy, z, agent)) return nearY + dy;
  }
  return null;
}

class MinHeap {
  private items: { f: number; seq: number; node: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: { f: number; seq: number; node: number }): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[p], a[i])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { f: number; seq: number; node: number } {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
const less = (a: { f: number; seq: number }, b: { f: number; seq: number }) => a.f < b.f || (a.f === b.f && a.seq < b.seq);

const key = (x: number, y: number, z: number) => (y * 1024 + z) * 1024 + x;
const unkey = (k: number): Vec3 => ({ x: k % 1024, z: Math.floor(k / 1024) % 1024, y: Math.floor(k / (1024 * 1024)) });

export type SearchResult = { path: Path | null; expanded: number };

/**
 * A* sobre la rejilla de vóxeles (ADR-0006): 8 direcciones (en diagonal solo sin cortar esquinas),
 * subir 1 bloque, caer hasta 3, cercas no saltables. Heurística octil más la diferencia de altura.
 */
export function findPath(w: PathWorld, from: Vec3, to: Vec3, agent: PathAgent, maxNodes = MAX_NODES): SearchResult {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y + 0.01);
  const sz = Math.floor(from.z);
  const gx = Math.floor(to.x);
  const gy = Math.floor(to.y + 0.01);
  const gz = Math.floor(to.z);
  if (sx < 0 || sz < 0 || gx < 0 || gz < 0) return { path: null, expanded: 0 };
  if (!isWalkable(w, gx, gy, gz, agent)) return { path: null, expanded: 0 };

  const minX = Math.min(sx, gx) - REGION_MARGIN;
  const maxX = Math.max(sx, gx) + REGION_MARGIN;
  const minZ = Math.min(sz, gz) - REGION_MARGIN;
  const maxZ = Math.max(sz, gz) + REGION_MARGIN;
  const h = (x: number, y: number, z: number) => {
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(y - gy) * 0.2;
  };

  const start = key(sx, sy, sz);
  const goal = key(gx, gy, gz);
  const g = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  let seq = 0;
  open.push({ f: h(sx, sy, sz), seq: seq++, node: start });
  let expanded = 0;

  while (open.size > 0) {
    const { node } = open.pop();
    if (closed.has(node)) continue;
    if (node === goal) return { path: buildPath(w, parent, node), expanded };
    closed.add(node);
    if (++expanded > maxNodes) return { path: null, expanded };
    const { x, y, z } = unkey(node);
    const gNode = g.get(node)!;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const diagonal = dx !== 0 && dz !== 0;
      let ny: number | null = null;
      if (diagonal) {
        // Sin cortar esquinas: las dos celdas ortogonales deben estar libres al mismo nivel.
        if (isWalkable(w, nx, y, nz, agent) && clear(w, x + dx, y, z, agent, false) && clear(w, x, y, z + dz, agent, false)) ny = y;
      } else if (isWalkable(w, nx, y, nz, agent)) {
        ny = y;
      } else if (isWalkable(w, nx, y + 1, nz, agent) && clear(w, x, y + 1, z, agent, false)) {
        // Subir un escalón: hace falta espacio para saltar sobre la celda actual.
        ny = y + 1;
      } else if (clear(w, nx, y, nz, agent, false)) {
        for (let d = 1; d <= MAX_DROP; d++) {
          if (isWalkable(w, nx, y - d, nz, agent)) {
            ny = y - d;
            break;
          }
          if (!clear(w, nx, y - d, nz, agent, false)) break;
        }
      }
      if (ny === null) continue;
      const nk = key(nx, ny, nz);
      if (closed.has(nk)) continue;
      const cost = (diagonal ? Math.SQRT2 : 1) + (ny > y ? 0.5 : (y - ny) * 0.2);
      const ng = gNode + cost;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, ng);
      parent.set(nk, node);
      open.push({ f: ng + h(nx, ny, nz), seq: seq++, node: nk });
    }
  }
  return { path: null, expanded };
}

function buildPath(w: PathWorld, parent: Map<number, number>, end: number): Path {
  const cells: Vec3[] = [];
  for (let n: number | undefined = end; n !== undefined; n = parent.get(n)) cells.push(unkey(n));
  cells.reverse();
  const chunks = new Map<string, number>();
  for (const c of cells) {
    const cx = Math.floor(c.x / CHUNK_SIZE);
    const cz = Math.floor(c.z / CHUNK_SIZE);
    const k = `${cx},${cz}`;
    if (!chunks.has(k)) chunks.set(k, w.chunkVersion(cx, cz));
  }
  return { points: cells.map((c) => ({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 })), chunks };
}

/** El camino sigue siendo válido si ningún chunk que cruza cambió desde que se calculó. */
export function isPathValid(w: PathWorld, path: Path): boolean {
  for (const [k, v] of path.chunks) {
    const [cx, cz] = k.split(",").map(Number);
    if (w.chunkVersion(cx, cz) !== v) return false;
  }
  return true;
}

type Request = { id: string; from: Vec3; to: Vec3; agent: PathAgent; priority: number; seq: number };

/**
 * Cola de búsquedas con prioridad (menor primero; a igual prioridad, la más antigua). Como máximo
 * `SEARCHES_PER_TICK` búsquedas por tick; un pedido nuevo de la misma entidad reemplaza al anterior.
 */
export class PathQueue {
  private pending = new Map<string, Request>();
  private seq = 0;
  /** Nodos expandidos en el último tick (para el overlay y las pruebas). */
  lastExpanded = 0;

  get size(): number {
    return this.pending.size;
  }

  request(id: string, from: Vec3, to: Vec3, agent: PathAgent, priority: number): void {
    this.pending.set(id, { id, from: { ...from }, to: { ...to }, agent, priority, seq: this.seq++ });
  }

  cancel(id: string): void {
    this.pending.delete(id);
  }

  clear(): void {
    this.pending.clear();
  }

  process(w: PathWorld, deliver: (id: string, path: Path | null) => void, maxSearches = SEARCHES_PER_TICK): number {
    const order = [...this.pending.values()].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    let done = 0;
    this.lastExpanded = 0;
    for (const r of order) {
      if (done >= maxSearches) break;
      this.pending.delete(r.id);
      const { path, expanded } = findPath(w, r.from, r.to, r.agent);
      this.lastExpanded += expanded;
      deliver(r.id, path);
      done++;
    }
    return done;
  }
}
