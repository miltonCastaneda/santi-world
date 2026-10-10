import { describe, expect, it } from "vitest";
import type { Entity } from "../../../src/domain/entities/entityStore";
import { isSpeciesId } from "../../../src/domain/entities/species";
import { WOLF } from "../../../src/domain/entities/wolf";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";

const run = (game: Game, ms: number, until?: () => boolean) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    if (until?.()) return t + STEP_MS;
  }
  return Infinity;
};
const wolves = (game: Game) => [...game.entities.all()].filter((e) => e.species === "wolf");
const farmAnimalsLost = (game: Game) => game.pendingRespawns.filter((id) => !id.startsWith("wolf") && !id.startsWith("duck"));

/** Un mundo de día (2 o 3 min de día), sin zombis, con la población inicial. */
function dayWorld(seed: string, dayMinutes = 3): Game {
  const game = new Game({ seed });
  game.configureTime({ dayMinutes, nightMinutes: 2, quietNight: true });
  game.spawnPopulation();
  return game;
}

/** Abre un hueco de 1 bloque en el medio del lado norte de la cerca (el que mira a la montaña). */
function openGap(game: Game) {
  const farm = game.world.layout!.farm;
  const x = Math.floor((farm.x0 + farm.x1) / 2);
  const z = farm.z0;
  let y = 0;
  for (let yy = 40; yy > 0; yy--) {
    if (game.world.store.get(x, yy, z) !== 0) {
      y = yy;
      break;
    }
  }
  game.world.remove(x, y, z);
  return { x, y, z };
}

/** Un lobo que sale a cazar ahora mismo desde `at`; los demás ya cazaron hoy. */
function hunter(game: Game, at: { x: number; z: number }): Entity {
  const [w, ...rest] = wolves(game);
  for (const o of rest) o.huntDay = game.clock.dayCount;
  w.body.pos = { x: at.x + 0.5, y: game.world.store.surfaceY(at.x, at.z) + 1, z: at.z + 0.5 };
  w.body.vel = { x: 0, y: 0, z: 0 };
  w.huntDay = 0;
  w.huntFrac = 0;
  return w;
}

describe("[lobos] Lobos sin interfaz", () => {
  it("[lobos] Lobos en su montaña: en un mundo nuevo hay entre 4 y 6 lobos salvajes a 20 bloques o menos del centro", () => {
    for (const seed of ["santi", "lobos", "perf-001", "abc", "granja-7"]) {
      const game = new Game({ seed });
      game.spawnPopulation();
      const m = game.world.layout!.forestMountain;
      const list = wolves(game);
      expect(list.length, seed).toBeGreaterThanOrEqual(4);
      expect(list.length, seed).toBeLessThanOrEqual(6);
      for (const w of list) {
        expect(w.tamed).toBe(false);
        expect(Math.hypot(w.body.pos.x - m.x, w.body.pos.z - m.z), seed).toBeLessThanOrEqual(WOLF.denRadius);
      }
    }
  });

  it("[lobos] Lobos en su montaña: cuando no cazan, se quedan cerca de su guarida", () => {
    const game = dayWorld("lobos");
    for (const w of wolves(game)) w.huntDay = 99;
    run(game, 60_000);
    const m = game.world.layout!.forestMountain;
    for (const w of wolves(game)) expect(Math.hypot(w.body.pos.x - m.x, w.body.pos.z - m.z)).toBeLessThanOrEqual(WOLF.denRadius + 6);
  });

  it("[lobos] Granja abierta: un lobo que sale a cazar entra por el hueco de la cerca y un animal hace poof", () => {
    const game = dayWorld("abierta");
    const gap = openGap(game);
    hunter(game, { x: gap.x - 4, z: gap.z - 12 });
    const t = run(game, 90_000, () => farmAnimalsLost(game).length > 0);
    expect(t).toBeLessThan(90_000);
  }, 30_000);

  it("[lobos] Granja bien cerrada: en un día entero con todos los lobos buscando caza, no se pierde ningún animal de la granja", () => {
    const game = dayWorld("cerrada", 3);
    const list = wolves(game);
    list.forEach((w, i) => (w.huntFrac = 0.02 + i * 0.03));
    const farm = game.world.layout!.farm;
    const center = { x: (farm.x0 + farm.x1) / 2, z: (farm.z0 + farm.z1) / 2 };
    let closest = Infinity;
    run(game, game.clock.durations.dayMs, () => {
      for (const w of wolves(game)) closest = Math.min(closest, Math.hypot(w.body.pos.x - center.x, w.body.pos.z - center.z));
      return false;
    });
    // Todos salieron a cazar y alguno llegó hasta la cerca: la granja cerrada los detuvo.
    for (const w of wolves(game)) expect(w.huntDay).toBe(1);
    expect(closest).toBeLessThan(30);
    expect(farmAnimalsLost(game)).toEqual([]);
    expect(animalsInside(game)).toBe(13);
  }, 60_000);

  it("[lobos] El niño cierra el hueco a tiempo: el lobo recalcula en 2 s o menos, desiste y vuelve a su montaña", () => {
    const game = dayWorld("hueco");
    const gap = openGap(game);
    const w = hunter(game, { x: gap.x - 4, z: gap.z - 14 });
    // Espera a que vaya hacia el hueco por el camino (a 4 bloques o menos de él, todavía afuera).
    const near = run(game, 60_000, () => w.brain!.state === "stalk" && w.pathStatus === "following" && Math.hypot(w.body.pos.x - gap.x - 0.5, w.body.pos.z - gap.z - 0.5) <= 4 && w.body.pos.z < gap.z);
    expect(near).toBeLessThan(60_000);
    game.world.place(gap.x, gap.y, gap.z, "fence");
    const gaveUp = run(game, 5000, () => w.brain!.state === "returnDen");
    expect(gaveUp).toBeLessThanOrEqual(2000);
    run(game, 30_000);
    expect(farmAnimalsLost(game)).toEqual([]);
    const m = game.world.layout!.forestMountain;
    const before = Math.hypot(gap.x - m.x, gap.z - m.z);
    expect(Math.hypot(w.body.pos.x - m.x, w.body.pos.z - m.z)).toBeLessThan(before - 20);
  }, 30_000);

  it("[lobos] Lobos y el niño: un lobo salvaje a 2 bloques o menos nunca le quita corazones", () => {
    const game = dayWorld("nino");
    const w = wolves(game)[0];
    const hits: unknown[] = [];
    game.events.on("playerHit", (e) => hits.push(e));
    for (let i = 0; i < 40; i++) {
      game.player.teleport({ x: w.body.pos.x + 1.5, y: w.body.pos.y, z: w.body.pos.z });
      run(game, 250);
    }
    // También cazando: pasa junto al niño sin tocarlo.
    const h = hunter(game, { x: Math.floor(game.player.pos.x) + 1, z: Math.floor(game.player.pos.z) });
    expect(h.tamed).toBe(false);
    run(game, 5000);
    expect(hits).toEqual([]);
    expect(game.player.hearts).toBe(5);
  });
});

function animalsInside(game: Game): number {
  const farm = game.world.layout!.farm;
  return [...game.entities.all()].filter((e) => isSpeciesId(e.species) && e.home === "farm" && e.body.pos.x > farm.x0 && e.body.pos.x < farm.x1 + 1 && e.body.pos.z > farm.z0 && e.body.pos.z < farm.z1 + 1).length;
}
