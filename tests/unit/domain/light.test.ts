import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { Chunk } from "../../../src/domain/world/chunk";
import { ChunkStore } from "../../../src/domain/world/chunkStore";
import { computeLight, MAX_LIGHT } from "../../../src/domain/world/light";

/** Mundo de 3x3 chunks con un suelo de piedra en y = 0. */
function flatStore(): ChunkStore {
  return new ChunkStore({
    sizeInChunks: 3,
    generate: (cx, cz) => {
      const c = new Chunk(cx, cz);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setGenerated(x, 0, z, BLOCK_NUM.stone);
      return c;
    },
  });
}

describe("[ciclo-dia-noche] luz por bloque", () => {
  it("la luz de una antorcha se propaga perdiendo 1 por bloque", () => {
    const store = flatStore();
    store.set(24, 1, 24, BLOCK_NUM.torch, true);
    const light = computeLight(store, 16, 16, 31, 31);
    expect(light.blockAt(24, 1, 24)).toBe(14);
    expect(light.blockAt(25, 1, 24)).toBe(13);
    expect(light.blockAt(24, 3, 24)).toBe(12);
    expect(light.blockAt(30, 1, 24)).toBe(8);
    expect(light.blockAt(24, 0, 24)).toBe(0);
  });

  it("la luz de la antorcha rodea los muros en lugar de atravesarlos", () => {
    const store = flatStore();
    store.set(24, 1, 24, BLOCK_NUM.torch, true);
    for (let y = 1; y <= 3; y++) for (let z = 22; z <= 26; z++) store.set(25, y, z, BLOCK_NUM.stone, true);
    const light = computeLight(store, 16, 16, 31, 31);
    // Detrás del muro: rodea por arriba o por un lado (3 + 2 + 3 pasos) en vez de 2 pasos directos.
    expect(light.blockAt(26, 1, 24)).toBe(14 - 8);
  });

  it("la luz de una antorcha cruza el borde entre chunks igual desde ambos lados", () => {
    const store = flatStore();
    store.set(15, 1, 20, BLOCK_NUM.torch, true);
    const fromLeft = computeLight(store, 0, 16, 15, 31);
    const fromRight = computeLight(store, 16, 16, 31, 31);
    for (let x = 14; x <= 20; x++) expect(fromLeft.blockAt(x, 1, 20)).toBe(fromRight.blockAt(x, 1, 20));
    expect(fromRight.blockAt(16, 1, 20)).toBe(13);
  });

  it("cielo abierto da luz máxima y bajo un techo disminuye", () => {
    const store = flatStore();
    for (let x = 20; x <= 28; x++) for (let z = 20; z <= 28; z++) store.set(x, 4, z, BLOCK_NUM.planks, true);
    const light = computeLight(store, 16, 16, 31, 31);
    expect(light.skyAt(18, 1, 18)).toBe(MAX_LIGHT);
    expect(light.skyAt(24, 5, 24)).toBe(MAX_LIGHT);
    expect(light.skyAt(20, 1, 24)).toBe(MAX_LIGHT - 1);
    expect(light.skyAt(24, 1, 24)).toBe(MAX_LIGHT - 5);
  });
});
