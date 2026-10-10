import { describe, expect, it } from "vitest";
import type { Entity } from "../../../src/domain/entities/entityStore";
import { INITIAL_POPULATION, insideFarm } from "../../../src/domain/entities/population";
import { isSpeciesId, SPECIES, SPECIES_IDS, type SpeciesId } from "../../../src/domain/entities/species";
import { WATER_Y } from "../../../src/domain/worldgen/layout";
import { Game } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";

const SEED = "granja-1";

function newFarm(seed = SEED): Game {
  const game = new Game({ seed });
  game.spawnPopulation();
  return game;
}

function run(game: Game, ms: number): void {
  for (let t = 0; t < ms; t += STEP_MS) game.step(STEP_MS);
}

const animals = (game: Game) => [...game.entities.all()].filter((e) => isSpeciesId(e.species));
const ofSpecies = (game: Game, s: SpeciesId) => animals(game).filter((e) => e.species === s);
const cell = (e: Entity) => ({ x: Math.floor(e.body.pos.x), z: Math.floor(e.body.pos.z) });

describe("[animales-y-granja] Especies de animales", () => {
  it("[animales-y-granja] Población inicial: ovejas, vacas, cabras, gallinas, pollos y patos", () => {
    const game = newFarm();
    const layout = game.world.layout!;
    for (const s of SPECIES_IDS) expect(ofSpecies(game, s).length, s).toBeGreaterThanOrEqual(INITIAL_POPULATION[s]);
    expect(ofSpecies(game, "sheep").length).toBeGreaterThanOrEqual(3);
    expect(ofSpecies(game, "cow").length).toBeGreaterThanOrEqual(2);
    expect(ofSpecies(game, "goat").length).toBeGreaterThanOrEqual(2);
    expect(ofSpecies(game, "hen").length).toBeGreaterThanOrEqual(3);
    expect(ofSpecies(game, "chick").length).toBeGreaterThanOrEqual(3);
    expect(ofSpecies(game, "duck").length).toBeGreaterThanOrEqual(2);
    for (const e of animals(game)) {
      const { x, z } = cell(e);
      if (SPECIES[e.species as SpeciesId].home === "farm") expect(insideFarm(layout, x, z), e.id).toBe(true);
      else expect(Math.hypot(x - layout.pond.x, z - layout.pond.z), e.id).toBeLessThanOrEqual(layout.pond.r + 3);
    }
    // Ninguno aparece dentro de un bloque.
    run(game, 2000);
    for (const e of animals(game)) expect(game.collision(cell(e).x, Math.floor(e.body.pos.y + 0.05), cell(e).z), e.id).toBe(0);
  });

  it("los patos flotan en el estanque", () => {
    const game = newFarm();
    run(game, 10_000);
    for (const d of ofSpecies(game, "duck")) {
      const { x, z } = cell(d);
      if (game.pathWorld.isWater(x, WATER_Y, z)) expect(d.body.pos.y).toBeGreaterThan(WATER_Y + 0.4);
      expect(d.body.pos.y).toBeGreaterThan(WATER_Y - 0.5);
    }
  });
});

describe("[animales-y-granja] Comportamiento autónomo", () => {
  it("[animales-y-granja] Animales vivos sin intervención: en 60 s el 80 % o más cambió de posición o de comportamiento", () => {
    const game = newFarm();
    const before = new Map(animals(game).map((e) => [e.id, { pos: { ...e.body.pos }, states: new Set([e.brain!.state]) }]));
    for (let t = 0; t < 60_000; t += STEP_MS) {
      game.step(STEP_MS);
      for (const e of animals(game)) before.get(e.id)!.states.add(e.brain!.state);
    }
    const changed = animals(game).filter((e) => {
      const b = before.get(e.id)!;
      return Math.hypot(e.body.pos.x - b.pos.x, e.body.pos.z - b.pos.z) > 0.5 || b.states.size > 1;
    });
    expect(changed.length / animals(game).length).toBeGreaterThanOrEqual(0.8);
  });

  it("[animales-y-granja] Huir de una amenaza: en 1 s o menos la oveja se aleja más rápido que su paso", () => {
    const game = newFarm();
    run(game, 1000);
    const sheep = ofSpecies(game, "sheep")[0];
    const p = sheep.body.pos;
    game.entities.add({ id: "zombi-de-prueba", species: "threat", threat: true, yaw: 0, body: { pos: { x: p.x + 4, y: p.y, z: p.z }, vel: { x: 0, y: 0, z: 0 }, halfWidth: 0.3, height: 1.8, onGround: true } });
    const threat = game.entities.get("zombi-de-prueba")!.body.pos;
    const d0 = Math.hypot(p.x - threat.x, p.z - threat.z);
    let fleeingAt = -1;
    for (let t = STEP_MS; t <= 1000; t += STEP_MS) {
      game.step(STEP_MS);
      const speed = Math.hypot(sheep.body.vel.x, sheep.body.vel.z);
      if (fleeingAt < 0 && sheep.brain!.state === "flee" && speed > SPECIES.sheep.walkSpeed) fleeingAt = t;
    }
    expect(fleeingAt).toBeGreaterThan(0);
    expect(fleeingAt).toBeLessThanOrEqual(1000);
    run(game, 1000);
    expect(Math.hypot(sheep.body.pos.x - threat.x, sheep.body.pos.z - threat.z)).toBeGreaterThan(d0 + 1);
  });

  it("[animales-y-granja] Pollos siguen a gallinas: tienden a quedarse a 4 bloques o menos", () => {
    const game = newFarm();
    const samples: number[] = [];
    for (let t = 0; t < 180_000; t += STEP_MS) {
      game.step(STEP_MS);
      if (t % 1000 !== 0 || t < 10_000) continue;
      for (const c of ofSpecies(game, "chick")) {
        const nearestHen = Math.min(...ofSpecies(game, "hen").map((h) => Math.hypot(h.body.pos.x - c.body.pos.x, h.body.pos.z - c.body.pos.z)));
        samples.push(nearestHen);
      }
    }
    const within = samples.filter((d) => d <= 4).length / samples.length;
    expect(within).toBeGreaterThanOrEqual(0.75);
  });

  it("[animales-y-granja] Determinismo: dos simulaciones de 10 min con la misma semilla son idénticas", () => {
    const a = newFarm("determinismo");
    const b = newFarm("determinismo");
    run(a, 600_000);
    run(b, 600_000);
    const snap = (g: Game) => animals(g).map((e) => ({ id: e.id, pos: e.body.pos, state: e.brain!.state }));
    expect(snap(a)).toEqual(snap(b));
  }, 120_000);
});

describe("[animales-y-granja] Físicas de los animales y granja", () => {
  it("[animales-y-granja] Cerca de 1 bloque: tras 10 minutos todos siguen dentro del cercado", () => {
    const game = newFarm();
    const layout = game.world.layout!;
    run(game, 600_000);
    for (const e of animals(game).filter((e) => SPECIES[e.species as SpeciesId].home === "farm")) {
      const { x, z } = cell(e);
      expect(insideFarm(layout, x, z), `${e.id} en ${x},${z}`).toBe(true);
    }
  }, 120_000);

  it("[animales-y-granja] Escapar por un hueco: con 2 cercas rotas, en 5 minutos al menos 1 animal sale", () => {
    const game = newFarm();
    const { farm } = game.world.layout!;
    const fy = game.world.store.surfaceY(farm.x0, farm.z1);
    const gx = Math.floor((farm.x0 + farm.x1) / 2);
    for (const x of [gx, gx + 1]) expect(game.world.remove(x, fy, farm.z1), `cerca en ${x}`).not.toBeNull();
    for (const x of [gx, gx + 1]) game.events.emit("blockChanged", { pos: { x, y: fy, z: farm.z1 } });
    let escaped = 0;
    for (let t = 0; t < 300_000 && escaped === 0; t += STEP_MS) {
      game.step(STEP_MS);
      if (t % 1000 === 0) escaped = animals(game).filter((e) => e.home === "farm" && e.body.pos.z > farm.z1 + 1).length;
    }
    expect(escaped).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("[animales-y-granja] Bloque colocado sobre un animal: no se coloca y el animal no queda atrapado", () => {
    const game = newFarm();
    run(game, 500);
    const cow = ofSpecies(game, "cow")[0];
    cow.brain!.until = Number.POSITIVE_INFINITY;
    const c = { x: Math.floor(cow.body.pos.x), y: Math.floor(cow.body.pos.y + 0.05), z: Math.floor(cow.body.pos.z) };
    // Un rayo desde arriba sobre la celda de debajo del animal: el bloque iría en la celda de la vaca.
    game.player.teleport({ x: c.x + 2.5, y: c.y, z: c.z + 0.5 });
    const bumps: unknown[] = [];
    game.events.on("bump", (b) => bumps.push(b));
    game.enqueue({ type: "selectTool", tool: "hand" });
    game.enqueue({ type: "useTool", ray: { origin: { x: c.x + 0.5, y: c.y + 0.9, z: c.z + 0.5 }, direction: { x: 0, y: -1, z: 0 } } });
    game.step(STEP_MS);
    expect(game.collision(c.x, c.y, c.z)).toBe(0);
    expect(bumps.length).toBe(1);
  });
});
