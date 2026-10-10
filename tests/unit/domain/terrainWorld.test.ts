import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { pickCell } from "../../../src/domain/picking";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { BASE_Y, riverCenterX, WATER_Y } from "../../../src/domain/worldgen/layout";

describe("[personaje-y-herramientas] reglas de construcción en el mundo por chunks", () => {
  const farmCell = (w: TerrainWorld) => ({ x: w.layout.farm.x0 + 5, z: w.layout.farm.z0 + 5 });

  it("poner, quitar y deshacer en orden inverso, conservando la procedencia", () => {
    const w = TerrainWorld.create("reglas");
    const { x, z } = farmCell(w);
    expect(w.place(x, BASE_Y + 1, z, "red")).toEqual({ x, y: BASE_Y + 1, z });
    expect(w.store.isPlaced(x, BASE_Y + 1, z)).toBe(true);
    expect(w.place(x, BASE_Y + 1, z, "blue")).toBeNull();

    expect(w.remove(x, BASE_Y, z)).not.toBeNull();
    expect(w.store.get(x, BASE_Y, z)).toBe(0);

    w.undo();
    expect(w.store.get(x, BASE_Y, z)).toBe(BLOCK_NUM.grass);
    expect(w.store.isPlaced(x, BASE_Y, z)).toBe(false);
    w.undo();
    expect(w.store.get(x, BASE_Y + 1, z)).toBe(0);
    expect(w.undo()).toBeNull();
  });

  it("la capa 0 es indestructible y no se construye fuera del mundo", () => {
    const w = TerrainWorld.create("reglas");
    expect(w.remove(10, 0, 10)).toBeNull();
    expect(w.place(-1, 20, 5, "stone")).toBeNull();
    expect(w.place(5, 64, 5, "stone")).toBeNull();
  });

  it("el rayo atraviesa el agua natural y se puede construir dentro del agua", () => {
    const w = TerrainWorld.create("reglas");
    const z = 60;
    const x = Math.round(riverCenterX(w.layout.river, z));
    expect(w.store.get(x, WATER_Y, z)).toBe(BLOCK_NUM.water);
    const hit = pickCell({ origin: { x: x + 0.5, y: 30, z: z + 0.5 }, direction: { x: 0, y: -1, z: 0 } }, 100, (a, b, c) => w.isPickable(a, b, c));
    expect(hit).not.toBeNull();
    expect(w.store.get(hit!.block.x, hit!.block.y, hit!.block.z)).toBe(BLOCK_NUM.sand);
    expect(w.place(hit!.adjacent.x, hit!.adjacent.y, hit!.adjacent.z, "stone")).not.toBeNull();
  });
});
