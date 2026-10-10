import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { DRAGON } from "../../../src/domain/entities/dragon";
import type { TreeFeature } from "../../../src/domain/worldgen/layout";
import { createHeadlessGame, type Game, type GameEvents } from "../../../src/sim/game";

const dragonOf = (game: Game) => [...game.entities.all()].find((e) => e.species === "dragon");
const trunkIntact = (game: Game, t: TreeFeature) => {
  for (let i = 1; i <= t.trunk; i++) if (game.world.store.get(t.x, t.y + i, t.z) !== BLOCK_NUM.wood) return false;
  return true;
};

describe("[enemigos-nocturnos] Noche completa con el dragón, sin interfaz", () => {
  it("[enemigos-nocturnos] Derrotar al dragón con 5 disparos: quema 2 árboles, se come un cerdo-gallina, cae con 5 flechas del Arco y al amanecer todo vuelve", () => {
    const h = createHeadlessGame({ seed: "noche-dragon", clock: new FakeClock() });
    const { game } = h;
    game.configureTime({ dayMinutes: 2, nightMinutes: 4, quietNight: false });
    game.spawnPopulation();
    for (const w of game.entities.all()) if (w.species === "wolf") w.huntDay = 99;
    const { dayMs } = game.clock.durations;
    // Empieza al caer la noche.
    game.clock.restore(dayMs + 500, 1);

    const log: string[] = [];
    const burnt: GameEvents["treeBurnt"][] = [];
    const hits: GameEvents["dragonHit"][] = [];
    let ate: GameEvents["dragonAte"] | null = null;
    let defeated = 0;
    let shots = 0;
    game.events.on("dragonArrived", () => log.push("llega"));
    game.events.on("treeBurnt", (e) => (burnt.push(e), log.push("quema")));
    game.events.on("dragonAte", (e) => ((ate = e), log.push("come")));
    game.events.on("dragonHit", (e) => hits.push(e));
    game.events.on("dragonDefeated", () => (defeated++, log.push("poof")));
    game.events.on("dragonLeft", () => log.push("se va"));
    game.events.on("arrowShot", () => shots++);
    game.events.on("treesRegrown", () => log.push("rebrotan"));
    const intactBefore = game.world.layout!.trees.filter((t) => trunkIntact(game, t)).length;

    // Hasta que se come al cerdo-gallina (la mitad de la noche llega a los 2 minutos).
    for (let s = 0; s < 4 * 60 && !ate; s++) h.advance(1000);
    expect(log).toEqual(["llega", "quema", "quema", "come"]);
    expect(game.freePigChickens).toBe(2);
    expect(game.world.layout!.trees.filter((t) => trunkIntact(game, t)).length).toBe(intactBefore - 2);

    // Vuelve a dar vueltas alrededor del niño, que le dispara con el Arco hacia el centro de la vista.
    for (let s = 0; s < 20 && game.dragon.phase !== "linger"; s++) h.advance(500);
    expect(game.dragon.phase).toBe("linger");
    h.advance(3000);
    game.enqueue({ type: "selectTool", tool: "bow" });
    for (let i = 0; i < 200 && defeated === 0 && dragonOf(game); i++) {
      const dragon = dragonOf(game)!;
      const eye = game.player.eye();
      const c = { x: dragon.body.pos.x, y: dragon.body.pos.y + dragon.body.height / 2, z: dragon.body.pos.z };
      const len = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
      game.enqueue({ type: "useTool", ray: { origin: eye, direction: { x: (c.x - eye.x) / len, y: (c.y - eye.y) / len, z: (c.z - eye.z) / len } } });
      h.advance(100);
    }
    expect(hits.map((x) => x.hits)).toEqual([1, 2, 3, 4, 5]);
    expect(defeated).toBe(1);
    expect(shots).toBeGreaterThanOrEqual(DRAGON.hitsToDefeat);
    expect(dragonOf(game)).toBeUndefined();
    expect(game.player.hearts).toBe(5);

    // Al amanecer: vuelven los árboles y el cerdo-gallina, y el dragón no volvió esa noche.
    let dawn: GameEvents["dawn"] | null = null;
    game.events.on("dawn", (e) => (dawn = e));
    h.advance(game.clock.msUntilDawn + 1000);
    expect(dawn).not.toBeNull();
    expect(log.filter((x) => x === "llega")).toHaveLength(1);
    expect(log.at(-1)).toBe("rebrotan");
    for (const b of burnt) expect(trunkIntact(game, game.world.layout!.trees.find((t) => t.id === b.treeId)!)).toBe(true);
    expect(game.freePigChickens).toBe(3);
    expect(game.dragon.burntTrees).toEqual([]);
    expect(game.dragon.defeatedTonight).toBe(false);
  }, 60_000);
});
