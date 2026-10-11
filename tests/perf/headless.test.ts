import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/core/clock";
import { BLOCK_NUM } from "../../src/domain/blocks";
import { isSpeciesId } from "../../src/domain/entities/species";
import { createHeadlessGame } from "../../src/sim/game";

const MIN = 60_000;

describe("[plataforma-escalable] Simulación sin render", () => {
  it("[plataforma-escalable] Una noche completa sin interfaz: 30 minutos simulados en menos de 10 s y el estado final se puede consultar", () => {
    const h = createHeadlessGame({ seed: "noche-completa", clock: new FakeClock() });
    const { game } = h;
    game.configureTime({ dayMinutes: 15, nightMinutes: 15, quietNight: false });
    game.spawnPopulation();
    const animalsBefore = [...game.entities.all()].filter((e) => isSpeciesId(e.species)).length;

    // El niño pone un bloque rojo delante de sus pies antes de que pase el tiempo.
    const p = game.player.pos;
    const target = { x: Math.floor(p.x) + 2, z: Math.floor(p.z) };
    const y = game.world.store.surfaceY(target.x, target.z);
    game.enqueue({ type: "selectBlock", block: "red" });
    game.enqueue({ type: "selectTool", tool: "hand" });
    const eye = game.player.eye();
    const aim = { x: target.x + 0.5 - eye.x, y: y + 1 - eye.y, z: target.z + 0.5 - eye.z };
    const len = Math.hypot(aim.x, aim.y, aim.z);
    game.enqueue({ type: "useTool", ray: { origin: eye, direction: { x: aim.x / len, y: aim.y / len, z: aim.z / len } } });

    const t0 = performance.now();
    // Hasta 10 s después del amanecer: el dragón tarda 8 s en irse volando.
    h.advance(30 * MIN + 10_000, 50);
    const elapsed = performance.now() - t0;

    expect(elapsed, `30 min simulados en ${Math.round(elapsed)} ms`).toBeLessThan(10_000);
    expect(game.timeMs).toBeGreaterThanOrEqual(30 * MIN);
    expect(game.clock.dayCount).toBe(2);
    expect(game.clock.isNight).toBe(false);
    expect(game.world.store.get(target.x, y + 1, target.z)).toBe(BLOCK_NUM.red);
    expect(game.inventory).toEqual({ diamond: 0, meat: 0, pigChicken: 0 });
    // Después del amanecer no quedan zombis ni dragón, y los animales que faltaban reaparecieron.
    const all = [...game.entities.all()];
    expect(all.filter((e) => e.species === "zombie" || e.species === "dragon")).toEqual([]);
    expect(all.filter((e) => isSpeciesId(e.species))).toHaveLength(animalsBefore);
  }, 60_000);
});
