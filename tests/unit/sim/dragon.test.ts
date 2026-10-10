import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/core/math";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { DRAGON } from "../../../src/domain/entities/dragon";
import type { TreeFeature } from "../../../src/domain/worldgen/layout";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";

const run = (game: Game, ms: number, until?: () => boolean) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    if (until?.()) return;
  }
};
const dragons = (game: Game) => [...game.entities.all()].filter((e) => e.species === "dragon");
const pigs = (game: Game) => [...game.entities.all()].filter((e) => e.species === "pigChicken");
const trunkIntact = (game: Game, t: TreeFeature) => {
  for (let i = 1; i <= t.trunk; i++) if (game.world.store.get(t.x, t.y + i, t.z) !== BLOCK_NUM.wood) return false;
  return true;
};

/** Mundo con granja a 1 s de la mitad de la noche, sin lobos que cacen. */
function nightGame(seed = "dragon", quietNight = false): Game {
  const game = new Game({ seed });
  game.configureTime({ dayMinutes: 2, nightMinutes: 10, quietNight });
  game.spawnPopulation();
  for (const w of game.entities.all()) if (w.species === "wolf") w.huntDay = 99;
  const { dayMs, nightMs } = game.clock.durations;
  game.clock.restore(dayMs + nightMs / 2 - 1000, 1);
  return game;
}

type Pass = { fire: GameEvents["dragonFire"][]; burnt: GameEvents["treeBurnt"][]; ate: GameEvents["dragonAte"][]; left: number; changed: Vec3[] };

/** Deja pasar la noche hasta que el dragón termina su ruta y queda dando vueltas (o se va, o 4 minutos). */
function watchPass(game: Game): Pass {
  const pass: Pass = { fire: [], burnt: [], ate: [], left: 0, changed: [] };
  game.events.on("dragonFire", (e) => pass.fire.push(e));
  game.events.on("treeBurnt", (e) => pass.burnt.push(e));
  game.events.on("dragonAte", (e) => pass.ate.push(e));
  game.events.on("dragonLeft", () => pass.left++);
  game.events.on("blockChanged", (e) => pass.changed.push(e.pos));
  let seen = false;
  run(game, 4 * 60_000, () => {
    if (dragons(game).length > 0) seen = true;
    return seen && (dragons(game).length === 0 || game.dragon.phase === "linger");
  });
  return pass;
}

describe("[enemigos-nocturnos] Dragón nocturno", () => {
  it("[enemigos-nocturnos] Paso del dragón: a mitad de la noche aparece 1 dragón, quema exactamente 2 árboles naturales y se come 1 cerdo-gallina", () => {
    const game = nightGame();
    const arrived: GameEvents["dragonArrived"][] = [];
    game.events.on("dragonArrived", (e) => arrived.push(e));
    expect(game.freePigChickens).toBe(3);
    const before = game.world.layout!.trees.filter((t) => trunkIntact(game, t)).length;
    let most = 0;
    game.events.on("midnight", () => (most = Math.max(most, dragons(game).length)));
    const pass = watchPass(game);
    expect(arrived).toHaveLength(1);
    expect(most).toBe(1);
    expect(pass.burnt).toHaveLength(2);
    expect(new Set(pass.burnt.map((b) => b.treeId)).size).toBe(2);
    expect(game.world.layout!.trees.filter((t) => trunkIntact(game, t)).length).toBe(before - 2);
    expect(pass.ate).toHaveLength(1);
    expect(game.freePigChickens).toBe(2);
    expect(game.inventory.pigChicken).toBe(0);
    // Sigue dando vueltas hasta el amanecer y ahí se va volando.
    expect(pass.left).toBe(0);
    expect(dragons(game)).toHaveLength(1);
    game.clock.restore(game.clock.cycleMs - 500, game.clock.dayCount);
    run(game, DRAGON.exitMs + 2000);
    expect(pass.left).toBe(1);
    expect(dragons(game)).toHaveLength(0);
    // Nunca le hace daño al personaje.
    expect(game.player.hearts).toBe(5);
  }, 30_000);

  it("[enemigos-nocturnos] Respeta las construcciones: ningún bloque colocado por el niño cambia", () => {
    const game = nightGame("dragon-casa");
    const placed: Vec3[] = [];
    // Bloques pegados al tronco de cada árbol (los que el dragón podría elegir) y una casita cerca del niño.
    for (const t of game.world.layout!.trees) {
      const at = game.world.place(t.x + 1, t.y + 1, t.z, "planks");
      if (at) placed.push(at);
    }
    const p = game.player.pos;
    for (let dx = 3; dx <= 5; dx++) for (let y = 0; y < 3; y++) {
      const x = Math.floor(p.x) + dx;
      const z = Math.floor(p.z) + 3;
      const at = game.world.place(x, game.world.store.surfaceY(x, z) + 1, z, "planks");
      if (at) placed.push(at);
    }
    expect(placed.length).toBeGreaterThan(10);
    const pass = watchPass(game);
    expect(pass.burnt).toHaveLength(2);
    for (const c of placed) {
      expect(game.world.store.get(c.x, c.y, c.z)).toBe(BLOCK_NUM.planks);
      expect(game.world.store.isPlaced(c.x, c.y, c.z)).toBe(true);
    }
    const key = (v: Vec3) => `${v.x},${v.y},${v.z}`;
    const placedKeys = new Set(placed.map(key));
    expect(pass.changed.filter((c) => placedKeys.has(key(c)))).toEqual([]);
  }, 30_000);

  it("[enemigos-nocturnos] Sin cerdo-gallinas libres: no se come ninguno y el inventario no cambia", () => {
    const game = nightGame("dragon-sin-cerdos");
    for (const p of pigs(game)) expect(game.capturePigChicken(p.id)).toBe(true);
    expect(game.freePigChickens).toBe(0);
    expect(game.inventory.pigChicken).toBe(3);
    const pass = watchPass(game);
    expect(pass.burnt).toHaveLength(2);
    expect(pass.ate).toEqual([]);
    expect(game.inventory.pigChicken).toBe(3);
  }, 30_000);

  it("[enemigos-nocturnos] Los árboles rebrotan: al amanecer los 2 árboles quemados vuelven a su lugar (solo en las celdas libres)", () => {
    const game = nightGame("dragon-rebrote");
    const pass = watchPass(game);
    expect(pass.burnt).toHaveLength(2);
    const trees = pass.burnt.map((b) => game.world.layout!.trees.find((t) => t.id === b.treeId)!);
    for (const t of trees) expect(trunkIntact(game, t)).toBe(false);
    // El niño construyó en el lugar del tronco del segundo árbol: esa celda no se pisa.
    const blocked = trees[1];
    expect(game.world.place(blocked.x, blocked.y + 2, blocked.z, "stone")).not.toBeNull();
    const regrown: GameEvents["treesRegrown"][] = [];
    game.events.on("treesRegrown", (e) => regrown.push(e));
    game.clock.restore(game.clock.cycleMs - 1000, game.clock.dayCount);
    run(game, 2000);
    expect(regrown.flatMap((r) => r.treeIds).sort()).toEqual(trees.map((t) => t.id).sort());
    expect(trunkIntact(game, trees[0])).toBe(true);
    const s = game.world.store;
    expect(s.get(blocked.x, blocked.y + 1, blocked.z)).toBe(BLOCK_NUM.wood);
    expect(s.get(blocked.x, blocked.y + 2, blocked.z)).toBe(BLOCK_NUM.stone);
    expect(s.isPlaced(blocked.x, blocked.y + 2, blocked.z)).toBe(true);
    expect(game.dragon.burntTrees).toEqual([]);
  }, 30_000);

  it("[enemigos-nocturnos] Cinco impactos: el dragón hace poof después del quinto impacto, no antes", () => {
    const game = nightGame("dragon-cinco");
    run(game, 1500);
    expect(dragons(game)).toHaveLength(1);
    const defeated: GameEvents["dragonDefeated"][] = [];
    game.events.on("dragonDefeated", (e) => defeated.push(e));
    for (let i = 1; i < DRAGON.hitsToDefeat; i++) {
      game.hitDragon();
      expect(dragons(game)).toHaveLength(1);
      expect(defeated).toEqual([]);
    }
    expect(dragons(game)[0].hits).toBe(4);
    game.hitDragon();
    expect(dragons(game)).toHaveLength(0);
    expect(defeated).toHaveLength(1);
    expect(game.dragon.defeatedTonight).toBe(true);
    // Esa noche no vuelve.
    run(game, 60_000);
    expect(dragons(game)).toHaveLength(0);
  }, 30_000);

  it("[enemigos-nocturnos] Cuatro impactos: al terminar la noche se va volando y la noche siguiente vuelve con 0 impactos", () => {
    const game = nightGame("dragon-cuatro");
    run(game, 1500);
    for (let i = 0; i < 4; i++) game.hitDragon();
    expect(game.dragon.hitsTaken).toBe(4);
    // Amanece antes de que termine su ruta: se va.
    const left: unknown[] = [];
    game.events.on("dragonLeft", (e) => left.push(e));
    game.clock.restore(game.clock.cycleMs - 500, game.clock.dayCount);
    run(game, DRAGON.exitMs + 2000);
    expect(left).toHaveLength(1);
    expect(dragons(game)).toHaveLength(0);
    // La noche siguiente vuelve sin impactos.
    const { dayMs, nightMs } = game.clock.durations;
    game.clock.restore(dayMs + nightMs / 2 - 500, game.clock.dayCount);
    run(game, 1500);
    expect(dragons(game)).toHaveLength(1);
    expect(dragons(game)[0].hits).toBe(0);
    expect(game.dragon.hitsTaken).toBe(0);
  }, 30_000);

  it("con la noche tranquila no aparece el dragón", () => {
    const game = nightGame("dragon-tranquilo", true);
    run(game, 10_000);
    expect(dragons(game)).toHaveLength(0);
  }, 30_000);

  it("es reproducible con la misma semilla", () => {
    const a = nightGame("dragon-igual");
    const b = nightGame("dragon-igual");
    const pa = watchPass(a);
    const pb = watchPass(b);
    expect(pa.burnt.map((x) => x.treeId)).toEqual(pb.burnt.map((x) => x.treeId));
    expect(pa.ate.map((x) => x.pigId)).toEqual(pb.ate.map((x) => x.pigId));
  }, 30_000);
});
