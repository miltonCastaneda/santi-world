import type { Vec3 } from "../../core/math";
import type { Path } from "../../domain/entities/entityStore";
import type { CollisionQuery } from "../../domain/physics/collide";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../../domain/world/chunk";

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

/** Margen vertical de la caché de una búsqueda (escalón, cabeza y caída de hasta MAX_DROP). */
const CACHE_Y_MIN = -MAX_DROP - 2;
const CACHE_Y_MAX = CHUNK_HEIGHT + 4;
/** Más celdas que esto (una búsqueda de punta a punta del mundo) consulta el mundo sin caché. */
const MAX_CACHE_CELLS = 2_000_000;
/**
 * Por celda: colisión (código + 1), agua, "se puede estar de pie" y "el cuerpo cabe" (0 = sin
 * calcular). Solo valen si `stamps` tiene el número de la búsqueda actual: así no hay que borrarlas.
 */
let stamps = new Uint32Array(0);
let collisionCodes = new Uint8Array(0);
let waterCodes = new Uint8Array(0);
let walkCodes = new Uint8Array(0);
let clearCodes = new Uint8Array(0);
let searchStamp = 0;

/** Lo que A* pregunta de cada celda, para un agente concreto. */
type SearchSpace = { world: PathWorld; walkable(x: number, y: number, z: number): boolean; clear(x: number, y: number, z: number): boolean };

/**
 * El mundo visto por una búsqueda: cada pregunta sobre una celda de la región se responde una sola
 * vez (una expansión mira hasta ~100 celdas y casi todas se repiten entre vecinos). Las alturas de
 * colisión distintas son pocas: se guardan como un código de 1 byte.
 */
function searchSpace(w: PathWorld, agent: PathAgent, minX: number, maxX: number, minZ: number, maxZ: number): SearchSpace {
  const width = maxX - minX + 1;
  const depth = maxZ - minZ + 1;
  const cells = width * depth * (CACHE_Y_MAX - CACHE_Y_MIN);
  if (cells > MAX_CACHE_CELLS) {
    return { world: w, walkable: (x, y, z) => isWalkable(w, x, y, z, agent), clear: (x, y, z) => clear(w, x, y, z, agent, false) };
  }
  if (stamps.length < cells || searchStamp === 0xffffffff) {
    stamps = new Uint32Array(Math.max(cells, stamps.length));
    collisionCodes = new Uint8Array(stamps.length);
    waterCodes = new Uint8Array(stamps.length);
    walkCodes = new Uint8Array(stamps.length);
    clearCodes = new Uint8Array(stamps.length);
    searchStamp = 0;
  }
  const stamp = ++searchStamp;
  const marks = stamps;
  const cols = collisionCodes;
  const water = waterCodes;
  const walk = walkCodes;
  const fits = clearCodes;
  const values: number[] = [];
  const index = (x: number, y: number, z: number) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ || y < CACHE_Y_MIN || y >= CACHE_Y_MAX) return -1;
    const i = ((y - CACHE_Y_MIN) * depth + (z - minZ)) * width + (x - minX);
    if (marks[i] !== stamp) {
      marks[i] = stamp;
      cols[i] = water[i] = walk[i] = fits[i] = 0;
    }
    return i;
  };
  const world: PathWorld = {
    collision(x, y, z) {
      const i = index(x, y, z);
      if (i < 0) return w.collision(x, y, z);
      const code = cols[i];
      if (code !== 0) return values[code - 1];
      const v = w.collision(x, y, z);
      let c = values.indexOf(v);
      if (c < 0) c = values.push(v) - 1;
      cols[i] = c + 1;
      return v;
    },
    isWater(x, y, z) {
      const i = index(x, y, z);
      if (i < 0) return w.isWater(x, y, z);
      if (water[i] === 0) water[i] = w.isWater(x, y, z) ? 2 : 1;
      return water[i] === 2;
    },
    chunkVersion: (cx, cz) => w.chunkVersion(cx, cz),
  };
  return {
    world,
    walkable(x, y, z) {
      const i = index(x, y, z);
      if (i < 0) return isWalkable(world, x, y, z, agent);
      if (walk[i] === 0) walk[i] = isWalkable(world, x, y, z, agent) ? 2 : 1;
      return walk[i] === 2;
    },
    clear(x, y, z) {
      const i = index(x, y, z);
      if (i < 0) return clear(world, x, y, z, agent, false);
      if (fits[i] === 0) fits[i] = clear(world, x, y, z, agent, false) ? 2 : 1;
      return fits[i] === 2;
    },
  };
}

const key = (x: number, y: number, z: number) => (y * 1024 + z) * 1024 + x;
const unkey = (k: number): Vec3 => ({ x: k % 1024, z: Math.floor(k / 1024) % 1024, y: Math.floor(k / (1024 * 1024)) });

export type SearchResult = { path: Path | null; expanded: number };

/**
 * A* sobre la rejilla de vóxeles (ADR-0006): 8 direcciones (en diagonal solo sin cortar esquinas),
 * subir 1 bloque, caer hasta 3, cercas no saltables. Heurística octil más la diferencia de altura.
 * Con `enclosures`, un destino dentro de un recinto cerrado conocido falla sin buscar.
 */
export function findPath(world: PathWorld, from: Vec3, to: Vec3, agent: PathAgent, maxNodes = MAX_NODES, enclosures?: Enclosures): SearchResult {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y + 0.01);
  const sz = Math.floor(from.z);
  const gx = Math.floor(to.x);
  const gy = Math.floor(to.y + 0.01);
  const gz = Math.floor(to.z);
  if (sx < 0 || sz < 0 || gx < 0 || gz < 0) return { path: null, expanded: 0 };
  if (!isWalkable(world, gx, gy, gz, agent)) return { path: null, expanded: 0 };

  const minX = Math.min(sx, gx) - REGION_MARGIN;
  const maxX = Math.max(sx, gx) + REGION_MARGIN;
  const minZ = Math.min(sz, gz) - REGION_MARGIN;
  const maxZ = Math.max(sz, gz) + REGION_MARGIN;
  // Las celdas vecinas de los bordes también se consultan: un bloque más de margen.
  const space = searchSpace(world, agent, minX - 1, maxX + 1, minZ - 1, maxZ + 1);
  const h = (x: number, y: number, z: number) => {
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(y - gy) * 0.2;
  };

  const start = key(sx, sy, sz);
  const goal = key(gx, gy, gz);
  if (enclosures?.blocks(world, agent, goal, start)) return { path: null, expanded: 0 };
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
    if (node === goal) return { path: buildPath(world, parent, node), expanded };
    closed.add(node);
    if (++expanded > maxNodes) break;
    const { x, y, z } = unkey(node);
    const gNode = g.get(node)!;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
      const diagonal = dx !== 0 && dz !== 0;
      const ny = move(space, x, y, z, dx, dz);
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
  // Sin nodos abiertos, el encerrado es el origen: buscar el recinto del destino no sirve.
  if (expanded > maxNodes) enclosures?.learn(world, space, agent, goal, start);
  return { path: null, expanded };
}

/**
 * Altura de llegada al dar un paso en (dx, dz) desde la celda (x, y, z), o null si no se puede: al
 * mismo nivel, subir 1 (con espacio para saltar) o caer hasta MAX_DROP. En diagonal solo al mismo
 * nivel y sin cortar esquinas.
 */
function move(space: SearchSpace, x: number, y: number, z: number, dx: number, dz: number): number | null {
  const nx = x + dx;
  const nz = z + dz;
  if (dx !== 0 && dz !== 0) return space.walkable(nx, y, nz) && space.clear(x + dx, y, z) && space.clear(x, y, z + dz) ? y : null;
  if (space.walkable(nx, y, nz)) return y;
  if (space.walkable(nx, y + 1, nz) && space.clear(x, y + 1, z)) return y + 1;
  if (!space.clear(nx, y, nz)) return null;
  for (let d = 1; d <= MAX_DROP; d++) {
    if (space.walkable(nx, y - d, nz)) return y - d;
    if (!space.clear(nx, y - d, nz)) return null;
  }
  return null;
}

/**
 * Recintos cerrados conocidos: todas las celdas desde las que se llega a un destino (por ejemplo, la
 * granja con la cerca cerrada). Si el destino de una búsqueda está en uno y el origen no, no hay
 * camino: se responde sin buscar. Así, con el niño y los animales dentro de la granja, cada zombi no
 * gasta 2000 nodos por intento. Valen mientras no cambie ningún chunk de alrededor.
 */
type Enclosure = { agent: string; cells: Set<number>; chunks: Map<string, number> };
/** Un recinto más grande que esto no se recuerda (la búsqueda inversa se detiene). */
export const ENCLOSURE_MAX_CELLS = 1500;
const MAX_ENCLOSURES = 8;
const agentKey = (a: PathAgent) => `${a.height}:${a.swims}`;

/** Los recintos de un mundo (los guarda la cola de caminos y se olvidan al cambiar de mundo). */
export class Enclosures {
  private list: Enclosure[] = [];

  get size(): number {
    return this.list.length;
  }

  clear(): void {
    this.list = [];
  }

  /** El destino está en un recinto conocido y el origen fuera: no hay camino. */
  blocks(w: PathWorld, agent: PathAgent, goal: number, start: number): boolean {
    const a = agentKey(agent);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.agent !== a || !e.cells.has(goal)) continue;
      if (!isPathValid(w, e)) {
        this.list.splice(i, 1);
        continue;
      }
      return !e.cells.has(start);
    }
    return false;
  }

  /**
   * Después de una búsqueda fallida: búsqueda inversa desde el destino (todas las celdas desde las
   * que se llega a él). Si termina antes del límite y no incluye el origen, es un recinto cerrado.
   */
  learn(w: PathWorld, space: SearchSpace, agent: PathAgent, goal: number, start: number): void {
    const cells = new Set<number>([goal]);
    const queue = [goal];
    for (let qi = 0; qi < queue.length; qi++) {
      const { x: bx, y: by, z: bz } = unkey(queue[qi]);
      for (const [dx, dz] of DIRS) {
        const ax = bx - dx;
        const az = bz - dz;
        if (ax < 0 || az < 0) continue;
        // Desde dónde se llega a (bx, by, bz) con este paso: mismo nivel, subiendo 1 o cayendo.
        for (const ay of dx !== 0 && dz !== 0 ? [by] : [by, by - 1, by + 1, by + 2, by + 3]) {
          const k = key(ax, ay, az);
          if (cells.has(k) || !space.walkable(ax, ay, az) || move(space, ax, ay, az, dx, dz) !== by) continue;
          if (k === start || cells.size >= ENCLOSURE_MAX_CELLS) return;
          cells.add(k);
          queue.push(k);
        }
      }
    }
    // Los chunks del recinto y de sus bordes: cualquier cambio en ellos puede abrirlo.
    const chunks = new Map<string, number>();
    for (const c of cells) {
      const { x, z } = unkey(c);
      for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const cx = Math.floor((x + ox) / CHUNK_SIZE);
        const cz = Math.floor((z + oz) / CHUNK_SIZE);
        const k = `${cx},${cz}`;
        if (!chunks.has(k)) chunks.set(k, w.chunkVersion(cx, cz));
      }
    }
    this.list.push({ agent: agentKey(agent), cells, chunks });
    if (this.list.length > MAX_ENCLOSURES) this.list.shift();
  }
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
export function isPathValid(w: PathWorld, path: Pick<Path, "chunks">): boolean {
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
  readonly enclosures = new Enclosures();

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
    this.enclosures.clear();
  }

  process(w: PathWorld, deliver: (id: string, path: Path | null) => void, maxSearches = SEARCHES_PER_TICK): number {
    this.lastExpanded = 0;
    if (this.pending.size === 0) return 0;
    const order = [...this.pending.values()].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    let done = 0;
    for (const r of order) {
      if (done >= maxSearches) break;
      this.pending.delete(r.id);
      const { path, expanded } = findPath(w, r.from, r.to, r.agent, MAX_NODES, this.enclosures);
      this.lastExpanded += expanded;
      deliver(r.id, path);
      done++;
    }
    return done;
  }
}
