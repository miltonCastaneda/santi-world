import { Chunk } from "../domain/world/chunk";
import { ChunkStore } from "../domain/world/chunkStore";
import { createGenerator, type WorldGenerator, type WorldGenSpec } from "../domain/worldgen/generator";
import { meshChunk, type ChunkMeshData } from "./chunkMesher";

export type MeshRequest = {
  id: number;
  cx: number;
  cz: number;
  gen: WorldGenSpec;
  sizeInChunks: number;
  /** Chunks modificados (guardados o no) entre el chunk y sus 8 vecinos; el resto se regenera con la semilla. */
  overrides: { cx: number; cz: number; blocks: Uint8Array<ArrayBuffer> }[];
};

export type MeshResponse = { id: number; cx: number; cz: number; data: ChunkMeshData; ms: number };

const MAX_CACHED = 300;

/** Chunks generados por semilla, reutilizados entre peticiones (solo lectura). */
class GeneratedCache {
  private generator: WorldGenerator;
  private cache = new Map<string, Chunk>();

  readonly key: string;

  constructor(gen: WorldGenSpec) {
    this.key = cacheKey(gen);
    this.generator = createGenerator(gen.seed, gen.generator);
  }

  get(cx: number, cz: number): Chunk {
    const key = `${cx},${cz}`;
    let c = this.cache.get(key);
    if (c) {
      this.cache.delete(key);
    } else {
      c = this.generator.generate(cx, cz);
      if (this.cache.size >= MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, c);
    return c;
  }
}

let cache: GeneratedCache | null = null;

const cacheKey = (gen: WorldGenSpec) => `${gen.generator}:${gen.seed}`;

export function handleMeshRequest(req: MeshRequest): MeshResponse {
  const t0 = performance.now();
  if (!cache || cache.key !== cacheKey(req.gen)) cache = new GeneratedCache(req.gen);
  const base = cache;
  const store = new ChunkStore({ sizeInChunks: req.sizeInChunks, generate: (cx, cz) => base.get(cx, cz) });
  for (const c of req.overrides) store.put(new Chunk(c.cx, c.cz, c.blocks));
  const data = meshChunk(store, req.cx, req.cz);
  return { id: req.id, cx: req.cx, cz: req.cz, data, ms: performance.now() - t0 };
}

export function transferables(data: ChunkMeshData): Transferable[] {
  return [data.opaque, data.water].flatMap((m) => [m.positions.buffer, m.normals.buffer, m.uvs.buffer, m.layers.buffer, m.shade.buffer, m.indices.buffer]);
}

const scope = globalThis as unknown as { onmessage: unknown; postMessage: (msg: unknown, transfer: Transferable[]) => void; document?: unknown };
if (typeof scope.document === "undefined" && typeof scope.postMessage === "function") {
  scope.onmessage = (e: MessageEvent<MeshRequest>) => {
    const res = handleMeshRequest(e.data);
    scope.postMessage(res, transferables(res.data));
  };
}
