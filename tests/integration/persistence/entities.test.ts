import { describe, expect, it } from "vitest";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { GameSession } from "../../../src/sim/session";
import { setupSession } from "./helpers";

const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += STEP_MS) game.step(STEP_MS);
};

describe("[animales-y-granja] Persistencia de las entidades", () => {
  it("un mundo nuevo recibe su población y al recargarlo los animales vuelven con la misma posición y el mismo estado", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "persist-animales" });
    expect(game.entities.size).toBe(15);
    run(game, 20_000);
    const saved = [...game.entities.all()].map((e) => ({ id: e.id, species: e.species, pos: { ...e.body.pos }, state: e.brain!.state }));
    await autosave.saveNow();

    const game2 = new Game({ seed: "otro" });
    const session2 = new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" });
    await session2.openInitial({ worldId: world.id });
    const loaded = [...game2.entities.all()].map((e) => ({ id: e.id, species: e.species, pos: e.body.pos, state: e.brain!.state }));
    expect(loaded).toEqual(saved);
    // Y siguen vivos después de cargar.
    run(game2, 5000);
    expect([...game2.entities.all()].some((e) => e.body.pos.x !== saved.find((s) => s.id === e.id)!.pos.x)).toBe(true);
  });

  it("un mundo guardado antes de los animales (esquema 1) recibe la población una sola vez", async () => {
    const { repo, user, clock, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "viejo" });
    await autosave.saveNow();
    // Simula un guardado del esquema 1: sin animales y sin la marca.
    const loaded = await repo.loadWorld(world.id);
    await repo.saveSnapshot({ world: loaded.world, state: { ...loaded.state, animalsSpawned: false }, entities: [], dirtyChunks: [] });

    const game2 = new Game({ seed: "otro" });
    const session2 = new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" });
    await session2.openInitial({ worldId: world.id });
    expect(game2.entities.size).toBe(15);
    const pending = session2.collect()!;
    expect(pending.snapshot.state.animalsSpawned).toBe(true);
    expect(pending.snapshot.entities).toHaveLength(15);
  });

  it("'Mi primer mundo' (pradera plana, sin granja) no tiene animales", () => {
    const legacy = new Game({ world: TerrainWorld.create("v1", "legacy-flat") });
    legacy.spawnPopulation();
    expect(legacy.spawnSlots).toHaveLength(0);
    expect(legacy.entities.size).toBe(0);
  });
});
