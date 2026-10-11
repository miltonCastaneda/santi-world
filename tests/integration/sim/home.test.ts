import { describe, expect, it } from "vitest";
import { insideFarm } from "../../../src/domain/entities/population";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";

describe("[animales-y-granja] Hogar de los animales", () => {
  it("[animales-y-granja] Volver al hogar: una oveja fuera del cercado, con un hueco abierto, vuelve a la granja en menos de 1 día", () => {
    const game = new Game({ seed: "vuelta-a-casa" });
    game.configureTime({ dayMinutes: 2, nightMinutes: 2, quietNight: true });
    game.spawnPopulation();
    for (const w of game.entities.all()) if (w.species === "wolf") w.huntDay = 99;
    const layout = game.world.layout!;
    const { farm } = layout;

    // Hueco de 2 cercas en el lado sur y la oveja a 6 bloques del hueco, por fuera.
    const fy = game.world.store.surfaceY(farm.x0, farm.z1);
    const gx = Math.floor((farm.x0 + farm.x1) / 2);
    for (const x of [gx, gx + 1]) {
      expect(game.world.remove(x, fy, farm.z1), `cerca en ${x}`).not.toBeNull();
      game.events.emit("blockChanged", { pos: { x, y: fy, z: farm.z1 } });
    }
    const sheep = [...game.entities.all()].find((e) => e.species === "sheep")!;
    const out = { x: gx + 0.5, z: farm.z1 + 6.5 };
    sheep.body.pos = { x: out.x, y: game.world.store.surfaceY(Math.floor(out.x), Math.floor(out.z)) + 1, z: out.z };
    sheep.body.vel = { x: 0, y: 0, z: 0 };
    game.entities.reindex();
    expect(insideFarm(layout, Math.floor(sheep.body.pos.x), Math.floor(sheep.body.pos.z))).toBe(false);

    let homeAt: number | null = null;
    const day = game.clock.cycleMs;
    for (let t = 0; t < day && homeAt === null; t += STEP_MS) {
      game.step(STEP_MS);
      if (insideFarm(layout, Math.floor(sheep.body.pos.x), Math.floor(sheep.body.pos.z))) homeAt = t;
    }
    expect(game.entities.get(sheep.id)).toBeDefined();
    expect(homeAt).not.toBeNull();
    expect(homeAt!).toBeLessThan(day);
  }, 60_000);
});
