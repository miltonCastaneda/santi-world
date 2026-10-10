import { describe, expect, it } from "vitest";
import { hashSeed } from "../../../src/core/rng";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import type { Chunk } from "../../../src/domain/world/chunk";
import { createGenerator, createWorldStore } from "../../../src/domain/worldgen/generator";
import { BASE_Y, GENERATOR_VERSION, riverCenterX, WATER_Y, WORLD_BLOCKS } from "../../../src/domain/worldgen/layout";

const chunkHash = (c: Chunk) => hashSeed(Array.from(c.blocks).join(",")).toString(16);

/**
 * Valores dorados de la versión 1 del generador. Si cambian, el generador cambió: hay que subir
 * GENERATOR_VERSION (los mundos guardados conservan la suya) y regenerar estos valores.
 */
const GOLDEN: Record<string, string> = {
  "0,0": "825e5df6",
  "7,8": "f8ea5e6b",
  "13,7": "2f1a62a6",
  "5,3": "9e09fc37",
};

describe("[mundos-y-persistencia] generador del mundo", () => {
  it("[mundos-y-persistencia] Generación reproducible: la misma semilla da los mismos bloques", () => {
    const a = createGenerator("semilla-1");
    const b = createGenerator("semilla-1");
    for (const [cx, cz] of [[0, 0], [7, 8], [13, 7], [15, 15]]) {
      expect(a.generate(cx, cz).blocks).toEqual(b.generate(cx, cz).blocks);
    }
    expect(createGenerator("otra").generate(3, 12).blocks).not.toEqual(a.generate(3, 12).blocks);
  });

  it("valores dorados por chunk (versión del generador)", () => {
    expect(GENERATOR_VERSION).toBe(1);
    const g = createGenerator("santi-golden");
    const actual = Object.fromEntries(Object.keys(GOLDEN).map((k) => {
      const [cx, cz] = k.split(",").map(Number);
      return [k, chunkHash(g.generate(cx, cz))];
    }));
    expect(actual).toEqual(GOLDEN);
  });

  describe.each(["santi", "perf-001", "abc", "12345"])("[mundos-y-persistencia] Zonas presentes (semilla %s)", (seed) => {
    const { store, generator } = createWorldStore(seed);
    const { layout } = generator;

    it("granja cercada y con establo", () => {
      const { farm } = layout;
      for (let x = farm.x0; x <= farm.x1; x++) {
        expect(store.get(x, BASE_Y + 1, farm.z0)).toBe(BLOCK_NUM.fence);
        expect(store.get(x, BASE_Y + 1, farm.z1)).toBe(BLOCK_NUM.fence);
      }
      for (let z = farm.z0; z <= farm.z1; z++) {
        expect(store.get(farm.x0, BASE_Y + 1, z)).toBe(BLOCK_NUM.fence);
        expect(store.get(farm.x1, BASE_Y + 1, z)).toBe(BLOCK_NUM.fence);
      }
      expect(store.get(layout.barn.x0, BASE_Y + 4, layout.barn.z0)).toBe(BLOCK_NUM.red);
    });

    it("montaña con al menos 20 árboles con ID", () => {
      const forest = layout.trees.filter((t) => t.zone === "forestMountain");
      expect(forest.length).toBeGreaterThanOrEqual(20);
      expect(new Set(layout.trees.map((t) => t.id)).size).toBe(layout.trees.length);
      for (const t of forest) expect(store.get(t.x, t.y + 1, t.z)).toBe(BLOCK_NUM.wood);
    });

    it("[recursos-e-inventario] al menos 10 diamantes accesibles en la montaña de roca", () => {
      const accessible = layout.ores.filter((o) => {
        if (store.get(o.x, o.y, o.z) !== BLOCK_NUM.diamond_ore) return false;
        return store.surfaceY(o.x, o.z) - o.y <= 2;
      });
      expect(accessible.length).toBeGreaterThanOrEqual(10);
    });

    it("río y estanque con agua", () => {
      const z = 40;
      const rx = Math.round(riverCenterX(layout.river, z));
      expect(store.get(rx, WATER_Y, z)).toBe(BLOCK_NUM.water);
      expect(store.get(layout.pond.x, WATER_Y, layout.pond.z)).toBe(BLOCK_NUM.water);
    });

    it("borde natural más alto que la pradera y capa 0 de piedra", () => {
      expect(store.surfaceY(1, WORLD_BLOCKS / 2)).toBeGreaterThan(BASE_Y + 5);
      expect(store.get(30, 0, 30)).toBe(BLOCK_NUM.stone);
    });
  });
});
