import { describe, expect, it } from "vitest";
import type { Ray } from "../../../src/core/math";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { regrowDue } from "../../../src/domain/rules/mining";
import type { ToolId } from "../../../src/domain/rules/tools";
import type { OreFeature } from "../../../src/domain/worldgen/layout";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";

const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += STEP_MS) game.step(STEP_MS);
};
const down = (x: number, y: number, z: number): Ray => ({ origin: { x: x + 0.5, y: y + 1.6, z: z + 0.5 }, direction: { x: 0, y: -1, z: 0 } });

function setup(seed = "diamantes") {
  const game = new Game({ seed });
  const mined: GameEvents["blockMined"][] = [];
  game.events.on("blockMined", (e) => mined.push(e));
  return { game, mined, ores: game.world.layout!.ores };
}

/** Un diamante a la vista (aire encima), con el niño parado a 3 bloques. */
function exposedOre(game: Game, ores: OreFeature[]): OreFeature {
  const store = game.world.store;
  for (const o of ores) {
    if (store.get(o.x, o.y + 1, o.z) !== 0) continue;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const y = store.surfaceY(o.x + dx, o.z + dz);
      if (Math.abs(y - o.y) > 2) continue;
      game.player.teleport({ x: o.x + dx + 0.5, y: y + 1, z: o.z + dz + 0.5 });
      run(game, 100);
      return o;
    }
  }
  throw new Error("sin diamante a la vista");
}

function useOn(game: Game, tool: ToolId, ore: OreFeature): void {
  game.enqueue({ type: "selectTool", tool });
  game.enqueue({ type: "useTool", ray: down(ore.x, ore.y, ore.z) });
}

/** Cava hasta el diamante (el Pico rompe lo de arriba) y lo mina parado encima. */
function digAndMine(game: Game, ore: OreFeature): void {
  const store = game.world.store;
  for (let y = store.surfaceY(ore.x, ore.z); y > ore.y; y--) game.world.remove(ore.x, y, ore.z);
  game.player.teleport({ x: ore.x + 0.5, y: ore.y + 1, z: ore.z + 0.5 });
  useOn(game, "pickaxe", ore);
  game.step(STEP_MS);
}

function passDawn(game: Game): void {
  game.clock.restore(game.clock.cycleMs - 1000, game.clock.dayCount);
  run(game, 1500);
}

describe("[recursos-e-inventario] Diamantes en la montaña de rocas", () => {
  it("[recursos-e-inventario] Minar un diamante: con el Pico a 3 bloques, en 300 ms o menos se vuelve piedra, brilla y suma 1", () => {
    const { game, mined, ores } = setup();
    const ore = exposedOre(game, ores);
    const changed: unknown[] = [];
    game.events.on("blockChanged", (e) => changed.push(e));
    useOn(game, "pickaxe", ore);
    run(game, 300);
    expect(game.world.store.get(ore.x, ore.y, ore.z)).toBe(BLOCK_NUM.stone);
    expect(game.world.store.isPlaced(ore.x, ore.y, ore.z)).toBe(false);
    expect(mined).toEqual([{ pos: { x: ore.x, y: ore.y, z: ore.z }, block: "diamond_ore", resource: "diamond" }]);
    expect(changed).toContainEqual({ pos: { x: ore.x, y: ore.y, z: ore.z } });
    expect(game.inventory.diamond).toBe(1);

    // Ya es piedra: el siguiente golpe la rompe como cualquier piedra, sin más diamantes.
    useOn(game, "pickaxe", ore);
    run(game, 100);
    expect(game.world.store.get(ore.x, ore.y, ore.z)).toBe(0);
    expect(game.inventory.diamond).toBe(1);
  });

  it("[recursos-e-inventario] Diamante con otra herramienta: la Espada no cambia el bloque ni suma diamantes", () => {
    const { game, mined, ores } = setup();
    const ore = exposedOre(game, ores);
    for (const tool of ["sword", "collar", "bow"] as const) {
      useOn(game, tool, ore);
      run(game, 300);
    }
    expect(game.world.store.get(ore.x, ore.y, ore.z)).toBe(BLOCK_NUM.diamond_ore);
    expect(mined).toEqual([]);
    expect(game.inventory.diamond).toBe(0);
  });

  it("deshacer no devuelve un diamante ya minado", () => {
    const { game, ores } = setup();
    const ore = exposedOre(game, ores);
    useOn(game, "pickaxe", ore);
    run(game, 100);
    game.enqueue({ type: "undo" });
    run(game, 100);
    expect(game.world.store.get(ore.x, ore.y, ore.z)).toBe(BLOCK_NUM.stone);
    expect(game.inventory.diamond).toBe(1);
  });

  it("vuelven al amanecer de los días 4, 7, 10…", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(regrowDue)).toEqual([false, false, false, true, false, false, true, true]);
  });

  it("[recursos-e-inventario] Diamantes que vuelven: minados todos, a los 3 días reaparecen solo en piedra que no colocó el niño", () => {
    const { game, mined, ores } = setup();
    for (const ore of ores) digAndMine(game, ore);
    expect(mined).toHaveLength(ores.length);
    expect(game.inventory.diamond).toBe(ores.length);
    for (const o of ores) expect(game.world.store.get(o.x, o.y, o.z)).toBe(BLOCK_NUM.stone);

    // En una veta el niño rompió la piedra; en otra puso su propia piedra.
    const [broken, rebuilt] = ores;
    game.world.remove(broken.x, broken.y, broken.z);
    game.world.remove(rebuilt.x, rebuilt.y, rebuilt.z);
    game.world.place(rebuilt.x, rebuilt.y, rebuilt.z, "stone");

    let regrown: GameEvents["diamondsRegrown"] | null = null;
    game.events.on("diamondsRegrown", (e) => (regrown = e));
    passDawn(game);
    passDawn(game);
    expect(game.clock.dayCount).toBe(3);
    expect(regrown).toBeNull();
    passDawn(game);
    expect(game.clock.dayCount).toBe(4);
    expect(regrown!.positions).toHaveLength(ores.length - 2);
    for (const o of ores.slice(2)) {
      expect(game.world.store.get(o.x, o.y, o.z)).toBe(BLOCK_NUM.diamond_ore);
      expect(game.world.store.isPlaced(o.x, o.y, o.z)).toBe(false);
    }
    expect(game.world.store.get(broken.x, broken.y, broken.z)).toBe(0);
    expect(game.world.store.get(rebuilt.x, rebuilt.y, rebuilt.z)).toBe(BLOCK_NUM.stone);
    expect(game.world.store.isPlaced(rebuilt.x, rebuilt.y, rebuilt.z)).toBe(true);
    // El inventario no cambia: los diamantes vuelven a la montaña, no a la mochila.
    expect(game.inventory.diamond).toBe(ores.length);
  });
});
