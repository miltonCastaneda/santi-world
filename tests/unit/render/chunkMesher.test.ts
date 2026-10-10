import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { Chunk } from "../../../src/domain/world/chunk";
import { ChunkStore } from "../../../src/domain/world/chunkStore";
import { meshChunk } from "../../../src/render/chunkMesher";

const emptyStore = () => new ChunkStore({ sizeInChunks: 2, generate: (cx, cz) => new Chunk(cx, cz) });

/** Normales de las caras emitidas, como texto "x,y,z". */
function faceNormals(data: { normals: Float32Array; faceCount: number }): string[] {
  const out: string[] = [];
  for (let f = 0; f < data.faceCount; f++) {
    const i = f * 12;
    out.push(`${data.normals[i]},${data.normals[i + 1]},${data.normals[i + 2]}`);
  }
  return out.sort();
}

describe("[rendimiento-y-estabilidad-visual] mesher de chunks", () => {
  it("un bloque solo genera 6 caras", () => {
    const store = emptyStore();
    store.set(4, 5, 4, BLOCK_NUM.stone, true);
    expect(meshChunk(store, 0, 0).opaque.faceCount).toBe(6);
  });

  it("dos bloques adyacentes no generan caras internas", () => {
    const store = emptyStore();
    store.set(4, 5, 4, BLOCK_NUM.stone, true);
    store.set(5, 5, 4, BLOCK_NUM.dirt, true);
    const mesh = meshChunk(store, 0, 0).opaque;
    expect(mesh.faceCount).toBe(10);
  });

  it("[rendimiento-y-estabilidad-visual] Borde entre regiones: cada chunk genera las caras correctas", () => {
    const store = emptyStore();
    store.set(15, 5, 4, BLOCK_NUM.stone, true);
    const left = meshChunk(store, 0, 0).opaque;
    const right = meshChunk(store, 1, 0).opaque;
    expect(left.faceCount).toBe(6);
    expect(right.faceCount).toBe(0);

    store.set(16, 5, 4, BLOCK_NUM.stone, true);
    const left2 = meshChunk(store, 0, 0).opaque;
    const right2 = meshChunk(store, 1, 0).opaque;
    expect(left2.faceCount).toBe(5);
    expect(faceNormals(left2)).not.toContain("1,0,0");
    expect(right2.faceCount).toBe(5);
    expect(faceNormals(right2)).not.toContain("-1,0,0");

    store.set(16, 5, 4, 0, false);
    expect(meshChunk(store, 0, 0).opaque.faceCount).toBe(6);
  });

  it("[rendimiento-y-estabilidad-visual] Agua y transparencias: sin caras internas del agua", () => {
    const store = emptyStore();
    store.set(4, 5, 4, BLOCK_NUM.water, true);
    store.set(5, 5, 4, BLOCK_NUM.water, true);
    store.set(6, 5, 4, BLOCK_NUM.stone, true);
    const { opaque, water } = meshChunk(store, 0, 0);
    // 2 bloques de agua: 10 caras exteriores menos la que toca la piedra.
    expect(water.faceCount).toBe(9);
    // La piedra sí muestra su cara hacia el agua.
    expect(opaque.faceCount).toBe(6);
  });

  it("las caras junto a un muro reciben oclusión ambiental", () => {
    const store = emptyStore();
    for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) store.set(x, 1, z, BLOCK_NUM.stone, true);
    store.set(5, 2, 6, BLOCK_NUM.stone, true);
    const mesh = meshChunk(store, 0, 0).opaque;
    // Cara superior del bloque (5, 1, 5): sus vértices con z = 6 tocan el bloque de arriba en (5, 2, 6).
    let found = false;
    for (let f = 0; f < mesh.faceCount; f++) {
      const p = mesh.positions.slice(f * 12, f * 12 + 12);
      const isTop = mesh.normals[f * 12 + 1] === 1 && p[1] === 2 && Math.min(p[0], p[3], p[6], p[9]) === 5 && Math.min(p[2], p[5], p[8], p[11]) === 5;
      if (!isTop) continue;
      found = true;
      const ao = [0, 1, 2, 3].map((v) => mesh.shade[f * 12 + v * 3]);
      const zs = [0, 1, 2, 3].map((v) => p[v * 3 + 2]);
      const nearWall = ao.filter((_, i) => zs[i] === 6);
      const open = ao.filter((_, i) => zs[i] === 5);
      expect(Math.max(...nearWall)).toBeLessThan(Math.min(...open));
    }
    expect(found).toBe(true);
  });

  it("la cerca y la antorcha usan formas propias", () => {
    const store = emptyStore();
    store.set(4, 1, 4, BLOCK_NUM.fence, true);
    store.set(5, 1, 4, BLOCK_NUM.fence, true);
    store.set(8, 1, 8, BLOCK_NUM.torch, true);
    const mesh = meshChunk(store, 0, 0).opaque;
    // 2 postes + 2 travesaños por lado conectado (uno en cada cerca) + 1 antorcha, 6 caras cada caja.
    expect(mesh.faceCount).toBe((2 + 4 + 1) * 6);
  });
});
