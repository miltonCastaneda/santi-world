import { BLOCKS_BY_NUM } from "../blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "./chunk";
import type { ChunkStore } from "./chunkStore";

export const MAX_LIGHT = 15;
/**
 * Distancia máxima que recorre la luz. Se calcula sobre la región pedida más este margen para que
 * una celda tenga el mismo valor sin importar desde qué chunk se calcula (sin costuras).
 */
export const LIGHT_REACH = MAX_LIGHT - 1;

const OPAQUE = new Uint8Array(256);
const EMIT = new Uint8Array(256);
BLOCKS_BY_NUM.forEach((def, num) => {
  if (!def) return;
  OPAQUE[num] = def.opaque ? 1 : 0;
  EMIT[num] = def.light;
});

/** Luz del cielo y de bloques (antorchas) de una región, en coordenadas de mundo. */
export class LightVolume {
  readonly sky: Uint8Array;
  readonly block: Uint8Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly sx: number,
    readonly sz: number,
  ) {
    this.sky = new Uint8Array(sx * sz * CHUNK_HEIGHT);
    this.block = new Uint8Array(sx * sz * CHUNK_HEIGHT);
  }

  index(x: number, y: number, z: number): number {
    return (y * this.sz + (z - this.z0)) * this.sx + (x - this.x0);
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= this.x0 && z >= this.z0 && x < this.x0 + this.sx && z < this.z0 + this.sz && y >= 0 && y < CHUNK_HEIGHT;
  }

  /** Por encima del mundo se considera cielo abierto; fuera de la región, oscuridad. */
  skyAt(x: number, y: number, z: number): number {
    if (y >= CHUNK_HEIGHT) return MAX_LIGHT;
    return this.contains(x, y, z) ? this.sky[this.index(x, y, z)] : 0;
  }

  blockAt(x: number, y: number, z: number): number {
    return this.contains(x, y, z) ? this.block[this.index(x, y, z)] : 0;
  }
}

/** Buffers reutilizados entre llamadas (computeLight no es reentrante). */
const scratch = (() => {
  let b = new Uint8Array(0);
  let t = new Int16Array(0);
  let q = new Int32Array(0);
  return {
    blocks(n: number): Uint8Array {
      if (b.length < n) b = new Uint8Array(n);
      else b.fill(0, 0, n);
      return b;
    },
    top(n: number): Int16Array {
      if (t.length < n) t = new Int16Array(n);
      t.fill(-1, 0, n);
      return t;
    },
    queue(n: number): Int32Array {
      if (q.length < n) q = new Int32Array(n);
      return q;
    },
  };
})();

/** Difusión por inundación: cada paso pierde 1 nivel y no atraviesa bloques opacos. */
function spread(light: Uint8Array, blocks: Uint8Array, queue: Int32Array, tail: number, sx: number, sz: number, H: number): void {
  const plane = sx * sz;
  let head = 0;
  while (head < tail) {
    const i = queue[head++];
    const v = light[i] - 1;
    if (v <= 0) continue;
    const y = (i / plane) | 0;
    const rem = i - y * plane;
    const lz = (rem / sx) | 0;
    const lx = rem - lz * sx;
    let j: number;
    if (lx > 0 && !OPAQUE[blocks[(j = i - 1)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
    if (lx < sx - 1 && !OPAQUE[blocks[(j = i + 1)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
    if (lz > 0 && !OPAQUE[blocks[(j = i - sx)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
    if (lz < sz - 1 && !OPAQUE[blocks[(j = i + sx)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
    if (y > 0 && !OPAQUE[blocks[(j = i - plane)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
    if (y < H - 1 && !OPAQUE[blocks[(j = i + plane)]] && light[j] < v) { light[j] = v; queue[tail++] = j; }
  }
}

/**
 * Calcula la luz de la región [x0, x1] x [z0, z1] (incluidos). Cielo: 15 en las celdas expuestas y
 * se difunde perdiendo 1 por bloque bajo techos. Bloques: cada fuente se difunde por inundación (BFS).
 */
export function computeLight(store: ChunkStore, x0: number, z0: number, x1: number, z1: number): LightVolume {
  const ex0 = x0 - LIGHT_REACH;
  const ez0 = z0 - LIGHT_REACH;
  const sx = x1 - x0 + 1 + 2 * LIGHT_REACH;
  const sz = z1 - z0 + 1 + 2 * LIGHT_REACH;
  const vol = new LightVolume(ex0, ez0, sx, sz);
  const H = CHUNK_HEIGHT;
  const plane = sx * sz;
  const total = plane * H;

  const blocks = scratch.blocks(total);
  const top = scratch.top(plane);
  for (let lz = 0; lz < sz; lz++) {
    const wz = ez0 + lz;
    for (let lx = 0; lx < sx; lx++) {
      const wx = ex0 + lx;
      if (!store.inBounds(wx, 0, wz)) continue;
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const chunk = store.chunk(cx, cz);
      if (!chunk) continue;
      const src = chunk.blocks;
      const col = (wz - cz * CHUNK_SIZE) * CHUNK_SIZE + (wx - cx * CHUNK_SIZE);
      const c = lz * sx + lx;
      for (let y = 0; y < H; y++) {
        const b = src[y * CHUNK_SIZE * CHUNK_SIZE + col];
        if (b === 0) continue;
        blocks[y * plane + c] = b;
        if (OPAQUE[b]) top[c] = y;
      }
    }
  }

  const sky = vol.sky;
  for (let c = 0; c < plane; c++) {
    for (let y = top[c] + 1; y < H; y++) sky[y * plane + c] = MAX_LIGHT;
  }

  // Semillas: celdas expuestas junto a celdas no opacas a la sombra (bajo techos o aleros).
  const queue = scratch.queue(total);
  let tail = 0;
  for (let lz = 0; lz < sz; lz++) {
    for (let lx = 0; lx < sx; lx++) {
      const c = lz * sx + lx;
      const t = top[c];
      const tW = lx > 0 ? top[c - 1] : -1;
      const tE = lx < sx - 1 ? top[c + 1] : -1;
      const tN = lz > 0 ? top[c - sx] : -1;
      const tS = lz < sz - 1 ? top[c + sx] : -1;
      // Una celda expuesta (y > t) tiene un vecino lateral a la sombra si y < top del vecino.
      const maxNeighbor = Math.max(tW, tE, tN, tS);
      for (let y = t + 1; y < maxNeighbor; y++) {
        const i = y * plane + c;
        if (
          (y < tW && !OPAQUE[blocks[i - 1]]) ||
          (y < tE && !OPAQUE[blocks[i + 1]]) ||
          (y < tN && !OPAQUE[blocks[i - sx]]) ||
          (y < tS && !OPAQUE[blocks[i + sx]])
        ) {
          queue[tail++] = i;
        }
      }
    }
  }
  spread(sky, blocks, queue, tail, sx, sz, H);

  const blockLight = vol.block;
  tail = 0;
  for (let i = 0; i < total; i++) {
    const b = blocks[i];
    if (b !== 0 && EMIT[b] > 0) {
      blockLight[i] = EMIT[b];
      queue[tail++] = i;
    }
  }
  spread(blockLight, blocks, queue, tail, sx, sz, H);
  return vol;
}
