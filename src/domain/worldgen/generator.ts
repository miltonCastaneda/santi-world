import { hash2 } from "../../core/noise";
import { BLOCK_NUM } from "../blocks";
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkKey } from "../world/chunk";
import { ChunkStore } from "../world/chunkStore";
import { BASE_Y, columnAt, createLayout, riverCenterX, WORLD_CHUNKS, type WorldLayout } from "./layout";

type Voxel = { x: number; y: number; z: number; num: number; onlyIfAir: boolean };

export type WorldGenerator = {
  layout: WorldLayout;
  generate(cx: number, cz: number): Chunk;
};

/** Generador determinista: la misma semilla produce los mismos bloques en cualquier orden de carga. */
export function createGenerator(seed: string | number): WorldGenerator {
  const layout = createLayout(seed);
  const features = bucketByChunk(featureVoxels(layout));

  return {
    layout,
    generate(cx, cz) {
      const chunk = new Chunk(cx, cz);
      const ox = cx * CHUNK_SIZE;
      const oz = cz * CHUNK_SIZE;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const col = columnAt(layout, ox + lx, oz + lz);
          const under = col.surface === BLOCK_NUM.grass ? BLOCK_NUM.dirt : col.surface === BLOCK_NUM.snow ? BLOCK_NUM.stone : col.surface;
          for (let y = 0; y <= col.height; y++) {
            let num = BLOCK_NUM.stone;
            if (y === col.height) num = col.surface;
            else if (y >= col.height - 3 && y > 0) num = under === BLOCK_NUM.stone ? BLOCK_NUM.stone : under;
            chunk.setGenerated(lx, y, lz, num);
          }
          for (let y = col.height + 1; y <= col.waterTop; y++) chunk.setGenerated(lx, y, lz, BLOCK_NUM.water);
        }
      }
      for (const v of features.get(chunkKey(cx, cz)) ?? []) {
        const lx = v.x - ox;
        const lz = v.z - oz;
        if (v.onlyIfAir && chunk.get(lx, v.y, lz) !== 0) continue;
        chunk.setGenerated(lx, v.y, lz, v.num);
      }
      return chunk;
    },
  };
}

export function createWorldStore(seed: string | number): { store: ChunkStore; generator: WorldGenerator } {
  const generator = createGenerator(seed);
  return { store: new ChunkStore({ sizeInChunks: WORLD_CHUNKS, generate: generator.generate }), generator };
}

function bucketByChunk(voxels: Voxel[]): Map<string, Voxel[]> {
  const map = new Map<string, Voxel[]>();
  for (const v of voxels) {
    if (v.y < 0 || v.y >= CHUNK_HEIGHT) continue;
    const key = chunkKey(Math.floor(v.x / CHUNK_SIZE), Math.floor(v.z / CHUNK_SIZE));
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(v);
  }
  return map;
}

function featureVoxels(layout: WorldLayout): Voxel[] {
  const out: Voxel[] = [];
  const put = (x: number, y: number, z: number, num: number, onlyIfAir = false) => out.push({ x, y, z, num, onlyIfAir });

  const { farm, barn } = layout;
  const fy = BASE_Y + 1;
  for (let x = farm.x0; x <= farm.x1; x++) {
    put(x, fy, farm.z0, BLOCK_NUM.fence);
    put(x, fy, farm.z1, BLOCK_NUM.fence);
  }
  for (let z = farm.z0 + 1; z < farm.z1; z++) {
    put(farm.x0, fy, z, BLOCK_NUM.fence);
    put(farm.x1, fy, z, BLOCK_NUM.fence);
  }

  const doorX = Math.round((barn.x0 + barn.x1) / 2);
  for (let x = barn.x0; x <= barn.x1; x++) {
    for (let z = barn.z0; z <= barn.z1; z++) {
      const wall = x === barn.x0 || x === barn.x1 || z === barn.z0 || z === barn.z1;
      const corner = (x === barn.x0 || x === barn.x1) && (z === barn.z0 || z === barn.z1);
      for (let y = fy; y <= fy + 2; y++) {
        const door = z === barn.z1 && Math.abs(x - doorX) <= 1 && y <= fy + 1;
        if (wall && !door) put(x, y, z, corner ? BLOCK_NUM.wood : BLOCK_NUM.planks);
      }
      put(x, fy + 3, z, BLOCK_NUM.red);
    }
  }
  for (let x = barn.x0 + 1; x < barn.x1; x++) put(x, fy + 4, Math.round((barn.z0 + barn.z1) / 2), BLOCK_NUM.red);

  const hw = layout.river.halfWidth;
  for (let z = layout.bridgeZ - 1; z <= layout.bridgeZ + 1; z++) {
    const cx = Math.round(riverCenterX(layout.river, z));
    for (let x = cx - hw - 2; x <= cx + hw + 2; x++) {
      if (columnAt(layout, x, z).height < BASE_Y) put(x, BASE_Y, z, BLOCK_NUM.planks);
    }
  }

  for (const t of layout.trees) {
    for (let i = 1; i <= t.trunk; i++) put(t.x, t.y + i, t.z, BLOCK_NUM.wood);
    const top = t.y + t.trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (corner && hash2(layout.seed, t.x * 31 + dx + dy * 7, t.z * 17 + dz) < 0.6) continue;
          put(t.x + dx, top + dy, t.z + dz, BLOCK_NUM.leaves, true);
        }
      }
    }
  }

  for (const o of layout.ores) put(o.x, o.y, o.z, BLOCK_NUM.diamond_ore);
  return out;
}
