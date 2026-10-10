import { describe, expect, it } from "vitest";
import { BLOCK_IDS, BLOCKS, BLOCK_NUM, BUILDABLE_IDS, blockDef, isOpaque, isSolid } from "../../../src/domain/blocks";

describe("[recursos-e-inventario] catálogo de bloques", () => {
  it("los números guardados en los chunks son estables", () => {
    expect(BLOCK_IDS.slice(0, 16)).toEqual([
      "grass", "dirt", "stone", "wood", "water", "red", "blue", "yellow",
      "planks", "leaves", "fence", "torch", "diamond_ore", "sand", "snow", "wool",
    ]);
    expect(BLOCK_NUM.grass).toBe(1);
    expect(BLOCK_NUM.wool).toBe(16);
    expect(blockDef(0)).toBeUndefined();
    expect(blockDef(BLOCK_NUM.torch)?.id).toBe("torch");
  });

  it("la cerca tiene colisión de 1,5 bloques para que no se pueda saltar", () => {
    expect(BLOCKS.fence.collisionHeight).toBe(1.5);
    expect(BLOCKS.fence.solid).toBe(true);
    expect(BLOCKS.fence.opaque).toBe(false);
  });

  it("la antorcha da luz y no estorba al caminar", () => {
    expect(BLOCKS.torch.light).toBeGreaterThanOrEqual(8);
    expect(isSolid(BLOCK_NUM.torch)).toBe(false);
  });

  it("el agua y las hojas se dibujan transparentes; el agua no es sólida", () => {
    expect(BLOCKS.water.transparent && BLOCKS.leaves.transparent).toBe(true);
    expect(isSolid(BLOCK_NUM.water)).toBe(false);
    expect(isOpaque(BLOCK_NUM.leaves)).toBe(false);
    expect(isOpaque(BLOCK_NUM.stone)).toBe(true);
  });

  it("[recursos-e-inventario] Construir sin límite: los bloques de la barra son de construcción y el diamante no", () => {
    for (const id of ["grass", "dirt", "stone", "wood", "planks", "leaves", "fence", "torch", "water", "red", "blue", "yellow"] as const) {
      expect(BUILDABLE_IDS).toContain(id);
    }
    expect(BUILDABLE_IDS).not.toContain("diamond_ore");
  });
});
