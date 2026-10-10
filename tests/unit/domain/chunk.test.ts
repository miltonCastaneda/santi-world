import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from "../../../src/domain/world/chunk";
import { ChunkStore, worldToChunk } from "../../../src/domain/world/chunkStore";

const emptyStore = (sizeInChunks = 4) => new ChunkStore({ sizeInChunks, generate: (cx, cz) => new Chunk(cx, cz) });

describe("[mundos-y-persistencia] chunks", () => {
  it("convierte coordenadas en los bordes de los chunks", () => {
    expect(worldToChunk(15, 15)).toEqual({ cx: 0, cz: 0, lx: 15, lz: 15 });
    expect(worldToChunk(16, 31)).toEqual({ cx: 1, cz: 1, lx: 0, lz: 15 });
    expect(worldToChunk(-1, 0)).toEqual({ cx: -1, cz: 0, lx: 15, lz: 0 });
  });

  it("lee y escribe a ambos lados de un borde entre chunks", () => {
    const store = emptyStore();
    store.set(15, 5, 3, BLOCK_NUM.stone, true);
    store.set(16, 5, 3, BLOCK_NUM.red, true);
    expect(store.get(15, 5, 3)).toBe(BLOCK_NUM.stone);
    expect(store.get(16, 5, 3)).toBe(BLOCK_NUM.red);
    expect(store.chunk(0, 0)!.get(15, 5, 3)).toBe(BLOCK_NUM.stone);
    expect(store.chunk(1, 0)!.get(0, 5, 3)).toBe(BLOCK_NUM.red);
  });

  it("fuera del mundo es aire y no se puede escribir", () => {
    const store = emptyStore(2);
    expect(store.get(-1, 0, 0)).toBe(0);
    expect(store.get(0, CHUNK_HEIGHT, 0)).toBe(0);
    expect(store.set(2 * CHUNK_SIZE, 1, 0, BLOCK_NUM.stone, true)).toBeNull();
    expect(store.chunk(2, 0)).toBeNull();
  });

  it("procedencia: distingue bloques generados de colocados", () => {
    const store = new ChunkStore({
      sizeInChunks: 1,
      generate: (cx, cz) => {
        const c = new Chunk(cx, cz);
        c.setGenerated(1, 1, 1, BLOCK_NUM.wood);
        return c;
      },
    });
    expect(store.isPlaced(1, 1, 1)).toBe(false);
    store.set(2, 1, 1, BLOCK_NUM.planks, true);
    expect(store.isPlaced(2, 1, 1)).toBe(true);
    store.set(2, 1, 1, 0, false);
    expect(store.isPlaced(2, 1, 1)).toBe(false);
  });

  it("un cambio sube la versión y marca el chunk como sucio", () => {
    const store = emptyStore();
    const c = store.chunk(1, 1)!;
    expect(c.version).toBe(0);
    store.set(20, 2, 20, BLOCK_NUM.dirt, true, 1234);
    expect(c.version).toBe(1);
    expect(c.updatedAt).toBe(1234);
    expect(store.dirtyChunks().map((d) => d.key)).toEqual(["1,1"]);
    expect(store.unload(1, 1)).toBe(false);
    store.markClean(["1,1"]);
    expect(store.unload(1, 1)).toBe(true);
  });

  it("un cambio en el borde afecta también al chunk vecino", () => {
    const store = emptyStore();
    expect(store.affectedChunks(16, 20)).toEqual([
      { cx: 1, cz: 1 },
      { cx: 0, cz: 1 },
    ]);
    expect(store.affectedChunks(0, 0)).toEqual([{ cx: 0, cz: 0 }]);
    expect(store.affectedChunks(20, 20)).toEqual([{ cx: 1, cz: 1 }]);
  });
});
