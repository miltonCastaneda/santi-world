import { describe, expect, it } from "vitest";
import { isSpeciesId } from "../../../src/domain/entities/species";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { GameSession } from "../../../src/sim/session";
import { RESPAWN_RADIUS } from "../../../src/sim/systems/respawn";
import { setupSession } from "../persistence/helpers";

const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += STEP_MS) game.step(STEP_MS);
};
/** Lleva el reloj a 1 s antes del amanecer y lo deja pasar. */
const passDawn = (game: Game) => {
  game.clock.restore(game.clock.cycleMs - 1000, game.clock.dayCount);
  run(game, 1500);
};
const ofSpecies = (game: Game, species: string) => [...game.entities.all()].filter((e) => e.species === species);
const farmAnimals = (game: Game) => [...game.entities.all()].filter((e) => isSpeciesId(e.species)).length;

function farmGame(seed = "reaparicion") {
  const game = new Game({ seed });
  game.spawnPopulation();
  return game;
}

describe("[animales-y-granja] Reaparición al amanecer", () => {
  it("[animales-y-granja] Solo reaparecen los que faltan: de 3 ovejas, 1 desaparece; al amanecer hay exactamente 3", () => {
    const game = farmGame();
    run(game, 3000);
    const [gone, ...alive] = ofSpecies(game, "sheep");
    expect(alive).toHaveLength(2);
    expect(game.removeEntity(gone.id)).toBe(true);
    expect(game.pendingRespawns).toEqual([gone.slotId]);
    // De noche no reaparece nadie.
    run(game, 5000);
    expect(ofSpecies(game, "sheep")).toHaveLength(2);

    const respawned: string[][] = [];
    game.events.on("dawn", (e) => respawned.push(e.respawned));
    game.clock.restore(game.clock.cycleMs - 1000, 1);
    const before = new Map(alive.map((e) => [e.id, { ...e.body.pos }]));
    run(game, 1050);
    const sheep = ofSpecies(game, "sheep");
    expect(sheep).toHaveLength(3);
    expect(respawned).toEqual([[gone.slotId]]);
    // Las 2 vivas siguen donde estaban (solo se movieron lo que caminan en un tick o dos).
    for (const e of alive) expect(Math.hypot(e.body.pos.x - before.get(e.id)!.x, e.body.pos.z - before.get(e.id)!.z)).toBeLessThan(1);
    // La nueva aparece en su slot (o a 8 bloques o menos), dentro de la granja.
    const fresh = sheep.find((e) => !alive.includes(e))!;
    const slot = game.spawnSlots.find((s) => s.id === gone.slotId)!;
    expect(Math.hypot(fresh.body.pos.x - (slot.x + 0.5), fresh.body.pos.z - (slot.z + 0.5))).toBeLessThanOrEqual(RESPAWN_RADIUS + 1);
    expect(game.pendingRespawns).toEqual([]);
  });

  it("nunca duplica: un slot pendiente cuyo animal sigue vivo no reaparece", () => {
    const game = farmGame();
    game.pendingRespawns = ["cow-0", "cow-0"];
    passDawn(game);
    expect(ofSpecies(game, "cow")).toHaveLength(2);
    expect(game.pendingRespawns).toEqual([]);
  });

  it("nunca encima de una construcción del niño: si el slot está tapado, usa el punto libre más cercano", () => {
    const game = farmGame();
    const hen = ofSpecies(game, "hen")[0];
    const slot = game.spawnSlots.find((s) => s.id === hen.slotId)!;
    game.removeEntity(hen.id);
    const y = game.world.store.surfaceY(slot.x, slot.z) + 1;
    game.world.place(slot.x, y, slot.z, "red");
    passDawn(game);
    const back = ofSpecies(game, "hen").find((e) => e.slotId === slot.id)!;
    expect(back).toBeDefined();
    const cell = { x: Math.floor(back.body.pos.x), z: Math.floor(back.body.pos.z) };
    expect(cell).not.toEqual({ x: slot.x, z: slot.z });
    expect(game.world.store.isPlaced(cell.x, Math.floor(back.body.pos.y) - 1, cell.z)).toBe(false);
  });

  it("[animales-y-granja] La reaparición sobrevive a recargar: 2 desaparecen, se cierra antes del amanecer y al reabrir reaparecen esos 2", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "recarga-reaparicion" });
    const [a, b] = [ofSpecies(game, "goat")[0], ofSpecies(game, "duck")[0]];
    game.removeEntity(a.id);
    game.removeEntity(b.id);
    game.clock.restore(game.clock.durations.dayMs + 60_000, 1);
    await autosave.saveNow();

    const game2 = new Game({ seed: "otro" });
    const session2 = new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" });
    await session2.openInitial({ worldId: world.id });
    expect(farmAnimals(game2)).toBe(13);
    expect([...game2.pendingRespawns].sort()).toEqual([a.slotId, b.slotId].sort());
    expect(game2.clock.isNight).toBe(true);
    expect(Math.abs(game2.clock.timeOfCycleMs - (game2.clock.durations.dayMs + 60_000))).toBeLessThanOrEqual(5000);

    let respawned: string[] = [];
    game2.events.on("dawn", (e) => (respawned = e.respawned));
    passDawn(game2);
    expect(respawned.sort()).toEqual([a.slotId, b.slotId].sort());
    expect(farmAnimals(game2)).toBe(15);
    expect(game2.clock.dayCount).toBe(2);
  });

  it("[ciclo-dia-noche] Persistir la hora: faltando 4 min para la noche, al reabrir siguen faltando 4 min (± 5 s)", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const world = await session.openInitial({ seed: "hora" });
    game.clock.restore(game.clock.durations.dayMs - 4 * 60_000, 3);
    expect(session.hasChanges()).toBe(true);
    await autosave.saveNow();
    const game2 = new Game({ seed: "otro" });
    await new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" }).openInitial({ worldId: world.id });
    expect(Math.abs(game2.clock.msUntilNight - 4 * 60_000)).toBeLessThanOrEqual(5000);
    expect(game2.clock.dayCount).toBe(3);
    expect((await repo.loadWorld(world.id)).world.dayCount).toBe(3);
  });
});
