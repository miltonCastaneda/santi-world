import { describe, expect, it } from "vitest";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { FLAT_TOP_Y } from "../../../src/domain/worldgen/generator";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { canSpawnAt, MAX_ZOMBIES, MIN_SPAWN_DISTANCE, SAFE_BLOCK_LIGHT, SPAWN_EVERY_MS } from "../../../src/sim/systems/spawn";

const GROUND = FLAT_TOP_Y + 1;

/** Pradera plana, con la noche de `nightMinutes` y la hora al empezar la noche. */
function nightGame(nightMinutes: number, quietNight = false) {
  const game = new Game({ world: TerrainWorld.create("zombis", "legacy-flat") });
  game.configureTime({ dayMinutes: 2, nightMinutes, quietNight });
  game.clock.restore(game.clock.durations.dayMs, 1);
  return game;
}

/** Corre la noche entera y devuelve el máximo de zombis a la vez y dónde apareció cada uno. */
function runNight(game: Game, onStep?: () => void) {
  const spawns: { pos: { x: number; y: number; z: number }; player: { x: number; z: number } }[] = [];
  game.events.on("zombieSpawned", ({ pos }) => spawns.push({ pos, player: { x: game.player.pos.x, z: game.player.pos.z } }));
  let max = 0;
  const steps = game.clock.durations.nightMs / STEP_MS;
  for (let i = 0; i < steps; i++) {
    game.step(STEP_MS);
    onStep?.();
    max = Math.max(max, game.zombieCount);
  }
  return { max, spawns };
}

/** Casa de piedra cerrada y techada: interior de [x0, x0 + 4] x [z0, z0 + 4], muros de 3. */
function buildHouse(game: Game, x0: number, z0: number, torch: boolean): void {
  const w = game.world;
  for (let x = x0 - 1; x <= x0 + 5; x++)
    for (let z = z0 - 1; z <= z0 + 5; z++)
      for (let y = GROUND; y <= GROUND + 3; y++) {
        const wall = x === x0 - 1 || x === x0 + 5 || z === z0 - 1 || z === z0 + 5 || y === GROUND + 3;
        if (wall) w.place(x, y, z, "stone");
      }
  if (torch) w.place(x0 + 2, GROUND, z0 + 2, "torch");
}

describe("[enemigos-nocturnos] Aparición de zombis", () => {
  it("[enemigos-nocturnos] Límite de zombis: en una noche entera nunca hay más de 8 a la vez", () => {
    const game = nightGame(5);
    const { max, spawns } = runNight(game);
    expect(max).toBe(MAX_ZOMBIES);
    // Gradual: uno cada 20 s, no todos juntos.
    expect(spawns.length).toBeGreaterThanOrEqual(MAX_ZOMBIES);
    expect(spawns.length).toBeLessThanOrEqual(Math.ceil(game.clock.durations.nightMs / SPAWN_EVERY_MS));
  });

  it("[enemigos-nocturnos] Distancia de aparición: cada zombi aparece a más de 24 bloques del personaje", () => {
    const game = nightGame(3);
    // El niño camina en círculos mientras tanto.
    let t = 0;
    const { spawns } = runNight(game, () => {
      t += 0.01;
      game.player.setMove(Math.cos(t), Math.sin(t));
    });
    expect(spawns.length).toBeGreaterThan(3);
    for (const s of spawns) expect(Math.hypot(s.pos.x - s.player.x, s.pos.z - s.player.z)).toBeGreaterThan(MIN_SPAWN_DISTANCE);
  });

  it("[enemigos-nocturnos] Refugio iluminado: ni dentro de una casa techada con antorcha ni junto a una antorcha", () => {
    const game = nightGame(2);
    const w = game.spawnWorld;
    const cx = 128 + 30;
    const cz = 128;
    buildHouse(game, cx, cz, true);
    // Dentro de la casa: nunca (tiene techo y luz).
    for (let x = cx; x <= cx + 4; x++) for (let z = cz; z <= cz + 4; z++) expect(canSpawnAt(w, x, GROUND, z), `casa ${x},${z}`).toBe(false);
    expect(w.blockLight(cx + 1, GROUND, cz + 1)).toBeGreaterThanOrEqual(SAFE_BLOCK_LIGHT);

    // Antorcha al aire libre: nada a 4 bloques o menos; lejos, sí.
    const tx = 128 - 40;
    const tz = 128;
    game.world.place(tx, GROUND, tz, "torch");
    for (let dx = -4; dx <= 4; dx++)
      for (let dz = -4; dz <= 4; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 4 || (dx === 0 && dz === 0)) continue;
        expect(canSpawnAt(w, tx + dx, GROUND, tz + dz), `antorcha ${dx},${dz}`).toBe(false);
      }
    // A 10 bloques la luz es 14 - 10 = 4 (menos de 8): ahí ya puede aparecer; a 20, ni se calcula.
    expect(w.blockLight(tx + 10, GROUND, tz)).toBe(4);
    expect(canSpawnAt(w, tx + 10, GROUND, tz)).toBe(true);
    expect(w.blockLight(tx + 20, GROUND, tz)).toBe(0);
    // Sobre lo que construyó el niño o sobre agua, tampoco.
    game.world.place(tx + 12, GROUND, tz, "planks");
    expect(canSpawnAt(w, tx + 12, GROUND + 1, tz)).toBe(false);

    // Una noche entera con la casa a 30 bloques: ningún zombi aparece dentro.
    const { spawns } = runNight(game);
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      const inside = s.pos.x >= cx - 1 && s.pos.x <= cx + 6 && s.pos.z >= cz - 1 && s.pos.z <= cz + 6;
      expect(inside && s.pos.y <= GROUND + 3).toBe(false);
    }
  });

  it("[ciclo-dia-noche] Noche sin enemigos: con la noche tranquila no aparece ningún zombi", () => {
    const game = nightGame(3, true);
    const { max, spawns } = runNight(game);
    expect(max).toBe(0);
    expect(spawns).toEqual([]);
    // La noche llegó y pasó igual.
    expect(game.clock.dayCount).toBe(2);
  });

  it("activar la noche tranquila con zombis en el mundo: hacen poof en 5 s o menos", () => {
    const game = nightGame(5);
    for (let i = 0; i < 60 * 20; i++) game.step(STEP_MS);
    expect(game.zombieCount).toBeGreaterThan(0);
    game.configureTime({ dayMinutes: 2, nightMinutes: 5, quietNight: true });
    for (let i = 0; i < 5000 / STEP_MS; i++) game.step(STEP_MS);
    expect(game.zombieCount).toBe(0);
  });

  it("de día y en el atardecer no aparece ninguno", () => {
    const game = new Game({ world: TerrainWorld.create("zombis", "legacy-flat") });
    game.configureTime({ dayMinutes: 2, nightMinutes: 2, quietNight: false });
    let spawned = 0;
    game.events.on("zombieSpawned", () => spawned++);
    for (let i = 0; i < game.clock.durations.dayMs / STEP_MS - 5; i++) game.step(STEP_MS);
    expect(spawned).toBe(0);
  });
});
