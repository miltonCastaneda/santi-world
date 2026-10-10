import { describe, expect, it } from "vitest";
import { pickBlock } from "../../src/domain/picking";
import { createDefaultBlocks, inBounds, MAX_HEIGHT, VoxelWorld, WORLD_SIZE } from "../../src/domain/world/voxelWorld";

describe("[plataforma-escalable] mundo v1 en el dominio", () => {
  it("inBounds acepta solo celdas dentro del mundo", () => {
    expect(inBounds(0, 0, 0)).toBe(true);
    expect(inBounds(WORLD_SIZE - 1, MAX_HEIGHT - 1, WORLD_SIZE - 1)).toBe(true);
    expect(inBounds(-1, 0, 0)).toBe(false);
    expect(inBounds(0, MAX_HEIGHT, 0)).toBe(false);
  });

  it("el mundo por defecto es determinista", () => {
    const a = [...createDefaultBlocks().entries()].sort();
    const b = [...createDefaultBlocks().entries()].sort();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(WORLD_SIZE * WORLD_SIZE);
  });
});

describe("[personaje-y-herramientas] reglas de bloques v1", () => {
  const flat = () => {
    const blocks = new Map<string, "stone">();
    for (let x = 0; x < WORLD_SIZE; x++) for (let z = 0; z < WORLD_SIZE; z++) blocks.set(`${x},0,${z}`, "stone");
    return new VoxelWorld(blocks);
  };

  it("colocar exige un vecino y una celda libre dentro del mundo", () => {
    const world = flat();
    expect(world.place(5, 1, 5, "red")).toBe(true);
    expect(world.place(5, 1, 5, "blue")).toBe(false);
    expect(world.place(5, 5, 5, "red")).toBe(false);
    expect(world.place(-1, 1, 0, "red")).toBe(false);
  });

  it("la capa inferior es indestructible", () => {
    const world = flat();
    expect(world.remove(3, 0, 3)).toBe(false);
    expect(world.get(3, 0, 3)).toBe("stone");
  });

  it("Deshacer revierte en orden inverso", () => {
    const world = flat();
    world.place(1, 1, 1, "red");
    world.place(1, 2, 1, "blue");
    world.place(1, 3, 1, "yellow");
    world.undo();
    world.undo();
    world.undo();
    expect(world.has(1, 1, 1) || world.has(1, 2, 1) || world.has(1, 3, 1)).toBe(false);
    expect(world.undo()).toBeNull();
  });

  it("deshacer un quitar restaura el bloque anterior", () => {
    const world = flat();
    world.place(2, 1, 2, "wood");
    world.remove(2, 1, 2);
    world.undo();
    expect(world.get(2, 1, 2)).toBe("wood");
  });

  it("fromEntries descarta ids desconocidos y celdas fuera del mundo", () => {
    const world = VoxelWorld.fromEntries([
      ["1,0,1", "stone"],
      ["2,0,2", "lava"],
      ["99,0,0", "stone"],
    ]);
    expect(world?.entries()).toEqual([["1,0,1", "stone"]]);
    expect(VoxelWorld.fromEntries([])).toBeNull();
  });

  it("pickBlock encuentra el bloque y la celda adyacente de la cara apuntada", () => {
    const world = flat();
    const target = pickBlock(
      { origin: { x: 4, y: 5, z: 4 }, direction: { x: 0, y: -1, z: 0 } },
      50,
      (x, y, z) => world.has(x, y, z),
    );
    expect(target?.block).toEqual({ x: 4, y: 0, z: 4 });
    expect(target?.adjacent).toEqual({ x: 4, y: 1, z: 4 });
  });
});
