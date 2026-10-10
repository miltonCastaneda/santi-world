import { BLOCKS_BY_NUM, BLOCK_NUM } from "../domain/blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../domain/world/chunk";
import type { ChunkStore } from "../domain/world/chunkStore";
import { computeLight, MAX_LIGHT, type LightVolume } from "../domain/world/light";
import { BLOCK_LAYERS } from "./tiles";

/** Geometría de una pasada (opaca o agua) en coordenadas locales del chunk. */
export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  /** UV dentro del tile (0 a 1). */
  uvs: Float32Array;
  /** Capa del arreglo de texturas. */
  layers: Float32Array;
  /** x = oclusión ambiental por sombreado de cara, y = luz del cielo, z = luz de bloques (0 a 1). */
  shade: Float32Array;
  indices: Uint32Array;
  faceCount: number;
};

export type ChunkMeshData = { opaque: MeshData; water: MeshData };

const S = CHUNK_SIZE;
const P = S + 2;
const PP = P * P;
const H = CHUNK_HEIGHT;

const OPAQUE = new Uint8Array(256);
const SHAPE = new Uint8Array(256); // 0 aire, 1 cubo, 2 cerca, 3 antorcha
const WATER = BLOCK_NUM.water;
BLOCKS_BY_NUM.forEach((def, num) => {
  if (!def) return;
  OPAQUE[num] = def.opaque ? 1 : 0;
  SHAPE[num] = def.shape === "cube" ? 1 : def.shape === "fence" ? 2 : 3;
});

type Face = { n: [number, number, number]; corners: [number, number, number][]; side: 0 | 1 | 2; light: number };

/** Cuatro esquinas en sentido antihorario vistas desde fuera; uv = (0,0) (1,0) (1,1) (0,1). */
const FACES: Face[] = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], side: 1, light: 0.8 },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], side: 1, light: 0.8 },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], side: 0, light: 1 },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], side: 2, light: 0.55 },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], side: 1, light: 0.7 },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], side: 1, light: 0.7 },
];
const UV = [0, 0, 1, 0, 1, 1, 0, 1];

/** Desplazamientos (en el arreglo con borde) de los vecinos que usa cada esquina para AO y luz. */
const pOff = (dx: number, dy: number, dz: number) => dy * PP + dz * P + dx;
const FACE_TABLE = FACES.map((f) => {
  const axis = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
  const ta = axis === 0 ? 1 : 0;
  const tb = axis === 2 ? 1 : 2;
  const corners = f.corners.map((c) => {
    const da = [0, 0, 0];
    const db = [0, 0, 0];
    da[ta] = c[ta] === 1 ? 1 : -1;
    db[tb] = c[tb] === 1 ? 1 : -1;
    const s1 = [f.n[0] + da[0], f.n[1] + da[1], f.n[2] + da[2]];
    const s2 = [f.n[0] + db[0], f.n[1] + db[1], f.n[2] + db[2]];
    const cc = [s1[0] + db[0], s1[1] + db[1], s1[2] + db[2]];
    return { pos: c, s1, s2, cc, o1: pOff(s1[0], s1[1], s1[2]), o2: pOff(s2[0], s2[1], s2[2]), oc: pOff(cc[0], cc[1], cc[2]) };
  });
  return { ...f, nOff: pOff(f.n[0], f.n[1], f.n[2]), corners: corners };
});

/** Curva de brillo por nivel de luz (0 a 15). */
const LIGHT_CURVE = Array.from({ length: MAX_LIGHT + 1 }, (_, l) => Math.pow(0.82, MAX_LIGHT - l));

class Builder {
  private cap = 256;
  positions = new Float32Array(this.cap * 12);
  normals = new Float32Array(this.cap * 12);
  uvs = new Float32Array(this.cap * 8);
  layers = new Float32Array(this.cap * 4);
  shade = new Float32Array(this.cap * 12);
  indices = new Uint32Array(this.cap * 6);
  faceCount = 0;

  private grow(): void {
    this.cap *= 2;
    const g = <T extends Float32Array | Uint32Array>(a: T, per: number): T => {
      const b = new (a.constructor as { new (n: number): T })(this.cap * per);
      b.set(a);
      return b;
    };
    this.positions = g(this.positions, 12);
    this.normals = g(this.normals, 12);
    this.uvs = g(this.uvs, 8);
    this.layers = g(this.layers, 4);
    this.shade = g(this.shade, 12);
    this.indices = g(this.indices, 6);
  }

  /** Reserva una cara y devuelve su índice; el que llama escribe los vértices. */
  begin(n: readonly number[], layer: number, flip: boolean): number {
    if (this.faceCount === this.cap) this.grow();
    const f = this.faceCount++;
    const base = f * 4;
    for (let v = 0; v < 4; v++) {
      this.normals.set(n, (base + v) * 3);
      this.layers[base + v] = layer;
    }
    this.uvs.set(UV, base * 2);
    const ii = f * 6;
    if (flip) {
      this.indices[ii] = base + 1; this.indices[ii + 1] = base + 2; this.indices[ii + 2] = base + 3;
      this.indices[ii + 3] = base + 1; this.indices[ii + 4] = base + 3; this.indices[ii + 5] = base;
    } else {
      this.indices[ii] = base; this.indices[ii + 1] = base + 1; this.indices[ii + 2] = base + 2;
      this.indices[ii + 3] = base; this.indices[ii + 4] = base + 2; this.indices[ii + 5] = base + 3;
    }
    return base;
  }

  vertex(index: number, x: number, y: number, z: number, ao: number, sky: number, blk: number): void {
    const p = index * 3;
    this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
    this.shade[p] = ao; this.shade[p + 1] = sky; this.shade[p + 2] = blk;
  }

  build(): MeshData {
    const n = this.faceCount;
    return {
      positions: this.positions.slice(0, n * 12),
      normals: this.normals.slice(0, n * 12),
      uvs: this.uvs.slice(0, n * 8),
      layers: this.layers.slice(0, n * 4),
      shade: this.shade.slice(0, n * 12),
      indices: this.indices.slice(0, n * 6),
      faceCount: n,
    };
  }
}

/** Copia el chunk con un borde de 1 bloque de los vecinos (fuera del mundo = aire). Índice: (y+1, z+1, x+1). */
function paddedBlocks(store: ChunkStore, cx: number, cz: number): Uint8Array {
  const out = new Uint8Array(PP * (H + 2));
  const ox = cx * S - 1;
  const oz = cz * S - 1;
  for (let pz = 0; pz < P; pz++) {
    for (let px = 0; px < P; px++) {
      const wx = ox + px;
      const wz = oz + pz;
      if (!store.inBounds(wx, 0, wz)) continue;
      const ccx = Math.floor(wx / S);
      const ccz = Math.floor(wz / S);
      const chunk = store.chunk(ccx, ccz);
      if (!chunk) continue;
      const src = chunk.blocks;
      const col = (wz - ccz * S) * S + (wx - ccx * S);
      for (let y = 0; y < H; y++) out[(y + 1) * PP + pz * P + px] = src[y * S * S + col];
    }
  }
  return out;
}

/** Luz del volumen en el mismo orden que el arreglo con borde, para leerla con los mismos índices. */
function paddedLight(lv: LightVolume, cx: number, cz: number): { sky: Uint8Array; block: Uint8Array } {
  const sky = new Uint8Array(PP * (H + 2));
  const block = new Uint8Array(PP * (H + 2));
  const ox = cx * S - 1;
  const oz = cz * S - 1;
  for (let y = -1; y <= H; y++) {
    for (let pz = 0; pz < P; pz++) {
      for (let px = 0; px < P; px++) {
        const i = (y + 1) * PP + pz * P + px;
        sky[i] = lv.skyAt(ox + px, y, oz + pz);
        block[i] = lv.blockAt(ox + px, y, oz + pz);
      }
    }
  }
  return { sky, block };
}

/**
 * Genera la geometría de un chunk: solo caras visibles (consultando los chunks vecinos), oclusión
 * ambiental y luz por vértice, en dos pasadas (opaca y agua).
 */
export function meshChunk(store: ChunkStore, cx: number, cz: number, light?: LightVolume): ChunkMeshData {
  const x0 = cx * S;
  const z0 = cz * S;
  const lv = light ?? computeLight(store, x0 - 1, z0 - 1, x0 + S, z0 + S);
  const blocks = paddedBlocks(store, cx, cz);
  const { sky, block } = paddedLight(lv, cx, cz);
  const opaque = new Builder();
  const water = new Builder();

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const i = (y + 1) * PP + (z + 1) * P + (x + 1);
        const num = blocks[i];
        if (num === 0) continue;
        const shape = SHAPE[num];
        const layers = BLOCK_LAYERS[num]!;
        if (shape !== 1) {
          emitShape(opaque, num, shape, x, y, z, i, blocks, sky, block, layers);
          continue;
        }
        const isWater = num === WATER;
        const target = isWater ? water : opaque;
        for (const f of FACE_TABLE) {
          const ni = i + f.nOff;
          const other = y === 0 && f.n[1] === -1 ? BLOCK_NUM.stone : blocks[ni];
          if (OPAQUE[other] || (isWater && other === WATER)) continue;

          let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
          const shadeTmp = SHADE_TMP;
          for (let c = 0; c < 4; c++) {
            const k = f.corners[c];
            const o1 = OPAQUE[blocks[i + k.o1]];
            const o2 = OPAQUE[blocks[i + k.o2]];
            const oc = OPAQUE[blocks[i + k.oc]];
            const ao = isWater ? 3 : o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
            let s = sky[ni];
            let b = block[ni];
            let count = 1;
            if (!o1) { s += sky[i + k.o1]; b += block[i + k.o1]; count++; }
            if (!o2) { s += sky[i + k.o2]; b += block[i + k.o2]; count++; }
            if (!oc && !(o1 && o2)) { s += sky[i + k.oc]; b += block[i + k.oc]; count++; }
            const bl = Math.round(b / count);
            shadeTmp[c * 3] = (0.55 + 0.15 * ao) * f.light;
            shadeTmp[c * 3 + 1] = LIGHT_CURVE[Math.round(s / count)];
            shadeTmp[c * 3 + 2] = bl > 0 ? LIGHT_CURVE[bl] : 0;
            if (c === 0) a0 = ao; else if (c === 1) a1 = ao; else if (c === 2) a2 = ao; else a3 = ao;
          }
          const base = target.begin(f.n, layers[f.side], a0 + a2 < a1 + a3);
          for (let c = 0; c < 4; c++) {
            const p = f.corners[c].pos;
            target.vertex(base + c, x + p[0], y + p[1], z + p[2], shadeTmp[c * 3], shadeTmp[c * 3 + 1], shadeTmp[c * 3 + 2]);
          }
        }
      }
    }
  }
  return { opaque: opaque.build(), water: water.build() };
}

const SHADE_TMP = new Float32Array(12);

type Box = [number, number, number, number, number, number];
const RAILS: [number, number][] = [[0.35, 0.5], [0.7, 0.85]];
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function emitShape(
  b: Builder,
  num: number,
  shape: number,
  x: number,
  y: number,
  z: number,
  i: number,
  blocks: Uint8Array,
  sky: Uint8Array,
  block: Uint8Array,
  layers: readonly [number, number, number],
): void {
  const boxes: Box[] = [];
  if (shape === 3) {
    boxes.push([0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]);
  } else {
    boxes.push([0.375, 0, 0.375, 0.625, 1, 0.625]);
    for (const [dx, dz] of DIRS) {
      const n = blocks[i + dz * P + dx];
      if (n !== num && !OPAQUE[n]) continue;
      for (const [r0, r1] of RAILS) {
        const a0 = dx > 0 ? 0.625 : dx < 0 ? 0 : 0.4375;
        const a1 = dx > 0 ? 1 : dx < 0 ? 0.375 : 0.5625;
        const c0 = dz > 0 ? 0.625 : dz < 0 ? 0 : 0.4375;
        const c1 = dz > 0 ? 1 : dz < 0 ? 0.375 : 0.5625;
        boxes.push([a0, r0, c0, a1, r1, c1]);
      }
    }
  }
  const s = LIGHT_CURVE[sky[i]];
  const blkLevel = shape === 3 ? MAX_LIGHT : block[i];
  const bl = blkLevel > 0 ? LIGHT_CURVE[blkLevel] : 0;
  for (const box of boxes) {
    for (const f of FACES) {
      const base = b.begin(f.n, layers[f.side], false);
      for (let c = 0; c < 4; c++) {
        const k = f.corners[c];
        b.vertex(base + c, x + (k[0] ? box[3] : box[0]), y + (k[1] ? box[4] : box[1]), z + (k[2] ? box[5] : box[2]), f.light, s, bl);
      }
    }
  }
}
