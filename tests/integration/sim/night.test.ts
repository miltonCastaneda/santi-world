import { describe, expect, it } from "vitest";
import type { Entity } from "../../../src/domain/entities/entityStore";
import { isSpeciesId } from "../../../src/domain/entities/species";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { TRANSITION_MS } from "../../../src/sim/systems/dayNight";
import { findPath } from "../../../src/sim/systems/pathfinding";
import { ZOMBIE_AGENT } from "../../../src/sim/systems/spawn";

const run = (game: Game, ms: number, each?: () => void) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    each?.();
  }
};
const animals = (game: Game) => [...game.entities.all()].filter((e) => isSpeciesId(e.species));

function farmAtNight(seed: string, nightMinutes = 5) {
  const game = new Game({ seed });
  game.spawnPopulation();
  game.configureTime({ dayMinutes: 2, nightMinutes, quietNight: false });
  game.clock.restore(game.clock.durations.dayMs + 500, 1);
  return game;
}

/**
 * Corral de piedra cerrado y techado (muros de 2 y techo) en un claro de la pradera, con una oveja
 * dentro. Devuelve el interior.
 */
function closedPen(game: Game, sheep: Entity) {
  const farm = game.world.layout!.farm;
  // Un claro dentro de la granja, lejos del establo.
  const x0 = farm.x0 + 3;
  const z0 = farm.z0 + 3;
  const size = 4;
  const y0 = game.world.store.surfaceY(x0, z0) + 1;
  for (let x = x0 - 1; x <= x0 + size; x++)
    for (let z = z0 - 1; z <= z0 + size; z++) {
      for (let y = y0; y <= y0 + 2; y++) {
        const wall = x === x0 - 1 || x === x0 + size || z === z0 - 1 || z === z0 + size;
        if (game.world.store.get(x, y, z) !== 0 && !wall) game.world.remove(x, y, z);
        if (wall && y < y0 + 2) game.world.place(x, y, z, "stone");
        if (y === y0 + 2) game.world.place(x, y, z, "stone");
      }
    }
  sheep.body.pos = { x: x0 + 2, y: y0, z: z0 + 2 };
  sheep.body.vel = { x: 0, y: 0, z: 0 };
  sheep.path = null;
  sheep.pathStatus = "none";
  return { x0, z0, x1: x0 + size - 1, z1: z0 + size - 1, y0 };
}

describe("[enemigos-nocturnos] Noches completas sin interfaz", () => {
  it("[enemigos-nocturnos] Amanecer: con 5 zombis y 2 animales desaparecidos, en 5 s no queda ninguno y reaparecen exactamente 2", () => {
    const game = farmAtNight("amanecer");
    const [a, b] = animals(game);
    game.removeEntity(a.id);
    game.removeEntity(b.id);
    // Los zombis, lejos de la granja para que no se lleven a nadie más.
    for (let i = 0; i < 5; i++) game.spawnZombie({ x: 20.5 + i * 2, y: game.world.store.surfaceY(20 + i * 2, 20) + 1, z: 20.5 });
    run(game, 1000);
    expect(game.zombieCount).toBeGreaterThanOrEqual(5);
    const alive = new Set(animals(game).map((e) => e.id));
    expect(alive.size).toBe(13);

    // Empieza el amanecer.
    game.clock.restore(game.clock.cycleMs - TRANSITION_MS - 50, 1);
    run(game, 100);
    expect(game.clock.phase).toBe("dawn");
    const gone: number[] = [];
    game.events.on("entityRemoved", (e) => {
      if (e.species === "zombie") gone.push(game.timeMs);
    });
    const start = game.timeMs;
    run(game, 5000);
    expect(game.zombieCount).toBe(0);
    expect(Math.max(...gone) - start).toBeLessThanOrEqual(5000);

    // Al terminar el amanecer (nuevo día) reaparecen solo los 2 que faltaban.
    let respawned: string[] = [];
    game.events.on("dawn", (e) => (respawned = e.respawned));
    run(game, TRANSITION_MS);
    expect(game.clock.dayCount).toBe(2);
    expect(respawned.sort()).toEqual([a.slotId, b.slotId].sort());
    const now = animals(game);
    expect(now).toHaveLength(15);
    for (const id of alive) expect(game.entities.get(id), id).toBeDefined();
  });

  it("[enemigos-nocturnos] Muro protector: en una noche entera, la oveja del corral cerrado y techado no desaparece", () => {
    const game = farmAtNight("muro", 5);
    const sheep = animals(game).find((e) => e.species === "sheep")!;
    const pen = closedPen(game, sheep);
    // El niño, lejos de la granja: los zombis que lleguen solo pueden buscar animales.
    game.player.teleport({ x: 40.5, y: game.world.store.surfaceY(40, 40) + 1, z: 40.5 });
    // Además de los que aparecen solos, 3 zombis junto al corral desde el principio.
    for (const [dx, dz] of [
      [-3, 1],
      [5, 2],
      [1, 6],
    ]) {
      const x = pen.x0 + dx;
      const z = pen.z0 + dz;
      game.spawnZombie({ x: x + 0.5, y: game.world.store.surfaceY(x, z) + 1, z: z + 0.5 });
    }
    // El corral está bien cerrado: no hay ningún camino de fuera hacia dentro.
    const outside = { x: pen.x0 - 3, y: game.world.store.surfaceY(pen.x0 - 3, pen.z0) + 1, z: pen.z0 };
    expect(findPath(game.pathWorld, outside, { x: pen.x0 + 1, y: pen.y0, z: pen.z0 + 1 }, ZOMBIE_AGENT).path).toBeNull();
    let entered = false;
    let maxZombies = 0;
    run(game, game.clock.msUntilDawn - TRANSITION_MS, () => {
      maxZombies = Math.max(maxZombies, game.zombieCount);
      for (const e of game.entities.all()) {
        if (e.species !== "zombie") continue;
        const { x, z } = e.body.pos;
        if (x >= pen.x0 && x < pen.x1 + 1 && z >= pen.z0 && z < pen.z1 + 1) entered = true;
      }
    });
    expect(maxZombies).toBeGreaterThan(3);
    expect(entered).toBe(false);
    expect(game.entities.get(sheep.id)).toBeDefined();
    expect(game.pendingRespawns).not.toContain(sheep.slotId);
  }, 20_000);

  it("[enemigos-nocturnos] Granja abierta: con zombis sueltos en la granja, de noche se pierde al menos 1 animal", () => {
    const game = farmAtNight("abierta", 3);
    const farm = game.world.layout!.farm;
    game.player.teleport({ x: 40.5, y: game.world.store.surfaceY(40, 40) + 1, z: 40.5 });
    const cx = Math.floor((farm.x0 + farm.x1) / 2);
    const cz = Math.floor((farm.z0 + farm.z1) / 2);
    game.spawnZombie({ x: cx + 0.5, y: game.world.store.surfaceY(cx, cz) + 1, z: cz + 0.5 });
    run(game, 60_000);
    expect(game.pendingRespawns.length).toBeGreaterThanOrEqual(1);
  });
});
