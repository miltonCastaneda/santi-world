import { describe, expect, it } from "vitest";
import type { Ray, Vec3 } from "../../../src/core/math";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import type { Entity } from "../../../src/domain/entities/entityStore";
import { enterState } from "../../../src/domain/entities/fsm";
import { PIG_CHICKEN, PIG_CHICKEN_MACHINE } from "../../../src/domain/entities/pigChicken";
import { isStuck } from "../../../src/domain/physics/collide";
import type { ToolId } from "../../../src/domain/rules/tools";
import { entityFromSnapshot, entityToSnapshot } from "../../../src/sim/entitySnapshots";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { groundBelow } from "../../../src/sim/systems/pigChickens";

const run = (game: Game, ms: number, each?: () => void) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    each?.();
  }
};
const pigs = (game: Game) => [...game.entities.all()].filter((e) => e.species === "pigChicken");

function farmGame(seed = "cerdo-gallina"): Game {
  const game = new Game({ seed });
  game.configureTime({ dayMinutes: 10, nightMinutes: 10, quietNight: true });
  game.spawnPopulation();
  for (const w of game.entities.all()) if (w.species === "wolf") w.huntDay = 99;
  return game;
}

/** Un claro plano de pasto en la pradera, al oeste de la granja (sin árboles ni lomas en el medio). */
function flatSpot(game: Game): { x: number; z: number } {
  const farm = game.world.layout!.farm;
  const s = game.world.store;
  for (let x = farm.x0 - 8; x > farm.x0 - 60; x--) {
    for (let z = farm.z0; z <= farm.z1; z++) {
      const y = s.surfaceY(x, z);
      let ok = true;
      for (let dx = -2; dx <= 5 && ok; dx++) {
        for (let dz = -8; dz <= 2 && ok; dz++) ok = s.surfaceY(x + dx, z + dz) === y && s.get(x + dx, y, z + dz) === BLOCK_NUM.grass;
      }
      if (ok) return { x, z };
    }
  }
  throw new Error("no hay un claro plano");
}

function meadow(game: Game, dx = 0, dz = 0): Vec3 {
  const base = flatSpot(game);
  const x = base.x + dx;
  const z = base.z + dz;
  return { x: x + 0.5, y: game.world.store.surfaceY(base.x, base.z) + 1, z: z + 0.5 };
}

/** Deja al cerdo-gallina quieto en la pradera y al niño a `d` bloques. */
function nearPig(game: Game, p: Entity, d: number): void {
  p.body.pos = meadow(game);
  p.body.vel = { x: 0, y: 0, z: 0 };
  enterState(PIG_CHICKEN_MACHINE, p.brain!, "idle", game.timeMs, game.rng);
  p.brain!.until = Number.POSITIVE_INFINITY;
  game.player.teleport({ ...meadow(game, 0, -d), x: p.body.pos.x });
  game.step(STEP_MS);
}

function rayTo(game: Game, to: Vec3): Ray {
  const eye = game.player.eye();
  const dir = { x: to.x - eye.x, y: to.y - eye.y, z: to.z - eye.z };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  return { origin: eye, direction: { x: dir.x / len, y: dir.y / len, z: dir.z / len } };
}

function clickOn(game: Game, p: Entity, tool: ToolId): void {
  game.enqueue({ type: "selectTool", tool });
  game.enqueue({ type: "useTool", ray: rayTo(game, { x: p.body.pos.x, y: p.body.pos.y + p.body.height / 2, z: p.body.pos.z }) });
  game.step(STEP_MS);
}

/** Clic en el suelo a 3 bloques delante del niño, con el cerdo-gallina elegido en la mochila. */
function releaseOnGround(game: Game): Vec3 {
  const at = meadow(game, 3, -3);
  game.enqueue({ type: "toggleRelease" });
  game.enqueue({ type: "useTool", ray: rayTo(game, { x: at.x, y: at.y - 0.01, z: at.z }) });
  game.step(STEP_MS);
  return at;
}

describe("[animales-y-granja] Cerdo-gallina volador", () => {
  it("[animales-y-granja] Población inicial: hay 3 cerdo-gallinas libres en el mundo", () => {
    const game = farmGame();
    expect(pigs(game)).toHaveLength(PIG_CHICKEN.maxFree);
    expect(game.freePigChickens).toBe(3);
  });

  it("vuela en arcos: nunca pasa de 8 bloques sobre el suelo ni atraviesa bloques", () => {
    const game = farmGame();
    // Un muro alto en el medio de la granja: lo tienen que pasar por encima.
    const farm = game.world.layout!.farm;
    const wx = Math.floor((farm.x0 + farm.x1) / 2) + 4;
    for (let z = farm.z0 + 1; z < farm.z1; z++) for (let y = 1; y <= 4; y++) game.world.place(wx, game.world.store.surfaceY(wx, z) + 1, z, "stone");
    let maxHeight = 0;
    let flights = 0;
    const flying = new Set<string>();
    run(game, 6 * 60_000, () => {
      for (const p of pigs(game)) {
        const b = p.body;
        const h = b.pos.y - groundBelow(game.collision, b.pos.x, b.pos.z, b.pos.y);
        expect(h).toBeLessThanOrEqual(PIG_CHICKEN.maxFlyHeight + 1e-6);
        expect(isStuck(b, game.collision)).toBe(false);
        maxHeight = Math.max(maxHeight, h);
        if (p.anim === "fly" && !flying.has(p.id)) flights++;
        if (p.anim === "fly") flying.add(p.id);
        else flying.delete(p.id);
      }
    });
    expect(flights).toBeGreaterThanOrEqual(6);
    expect(maxHeight).toBeGreaterThan(2.5);
  }, 30_000);

  it("es reproducible con la misma semilla", () => {
    const a = farmGame("mismo");
    const b = farmGame("mismo");
    run(a, 60_000);
    run(b, 60_000);
    expect(pigs(a).map((p) => [p.body.pos, p.brain!.state])).toEqual(pigs(b).map((p) => [p.body.pos, p.brain!.state]));
  }, 20_000);

  it("[animales-y-granja] Captura con un clic: a 3 bloques desaparece con un poof y el contador sube en 1", () => {
    const game = farmGame();
    const p = pigs(game)[0];
    nearPig(game, p, 3);
    const removed: GameEvents["entityRemoved"][] = [];
    const captured: GameEvents["pigChickenCaptured"][] = [];
    game.events.on("entityRemoved", (e) => removed.push(e));
    game.events.on("pigChickenCaptured", (e) => captured.push(e));
    clickOn(game, p, "hand");
    expect(game.entities.get(p.id)).toBeUndefined();
    expect(removed.map((e) => e.id)).toEqual([p.id]);
    expect(captured.map((e) => e.id)).toEqual([p.id]);
    expect(game.inventory.pigChicken).toBe(1);
    // Nunca da carne.
    expect([...game.entities.all()].some((e) => e.species === "meat")).toBe(false);
  });

  it("a más de 4 bloques no se captura (aviso de muy lejos)", () => {
    const game = farmGame();
    const p = pigs(game)[0];
    nearPig(game, p, 5.5);
    const far: unknown[] = [];
    game.events.on("tooFar", (e) => far.push(e));
    clickOn(game, p, "pickaxe");
    expect(game.entities.get(p.id)).toBeDefined();
    expect(far).toHaveLength(1);
    expect(game.inventory.pigChicken).toBe(0);
  });

  it("[animales-y-granja] Captura en vuelo: volando a 3 bloques se captura igual que en el suelo (también con la Espada)", () => {
    const game = farmGame();
    const p = pigs(game)[0];
    nearPig(game, p, 3);
    enterState(PIG_CHICKEN_MACHINE, p.brain!, "fly", game.timeMs, game.rng);
    p.flight = { from: { ...p.body.pos }, to: { x: p.body.pos.x + 5, y: 0, z: p.body.pos.z }, peak: 2 };
    run(game, 500);
    expect(p.anim).toBe("fly");
    expect(p.body.onGround).toBe(false);
    expect(p.body.pos.y - groundBelow(game.collision, p.body.pos.x, p.body.pos.z, p.body.pos.y)).toBeGreaterThan(0.5);
    clickOn(game, p, "sword");
    expect(game.entities.get(p.id)).toBeUndefined();
    expect(game.inventory.pigChicken).toBe(1);
  });

  it("[animales-y-granja] Soltar un cerdo-gallina: con 1 en la mochila, un clic en el suelo lo suelta ahí y el contador baja en 1", () => {
    const game = farmGame();
    const p = pigs(game)[0];
    nearPig(game, p, 3);
    clickOn(game, p, "hand");
    expect(game.freePigChickens).toBe(2);
    const released: GameEvents["pigChickenReleased"][] = [];
    game.events.on("pigChickenReleased", (e) => released.push(e));
    const at = releaseOnGround(game);
    expect(released).toHaveLength(1);
    expect(game.inventory.pigChicken).toBe(0);
    expect(game.freePigChickens).toBe(3);
    const freed = game.entities.get(released[0].id)!;
    expect(Math.floor(freed.body.pos.x)).toBe(Math.floor(at.x));
    expect(Math.floor(freed.body.pos.z)).toBe(Math.floor(at.z));
    // Ocupa el lugar del que se había capturado: al amanecer no aparece otro.
    expect(game.pendingRespawns).toEqual([]);
    expect(game.releaseArmed).toBe(false);
  });

  it("[animales-y-granja] Límite de libres: con 3 libres no se suelta otro y suena un aviso suave", () => {
    const game = farmGame();
    game.setInventory({ pigChicken: 2 });
    game.player.teleport(meadow(game, 0, -3));
    game.step(STEP_MS);
    const blocked: unknown[] = [];
    game.events.on("releaseBlocked", (e) => blocked.push(e));
    releaseOnGround(game);
    expect(blocked).toHaveLength(1);
    expect(game.freePigChickens).toBe(3);
    expect(game.inventory.pigChicken).toBe(2);
  });

  it("sin cerdo-gallinas en la mochila no se puede elegir para soltar", () => {
    const game = farmGame();
    game.enqueue({ type: "toggleRelease" });
    game.step(STEP_MS);
    expect(game.releaseArmed).toBe(false);
  });

  it("al amanecer reaparecen los que faltan: nunca más de 3 libres", () => {
    const game = farmGame();
    for (const p of pigs(game).slice(0, 2)) {
      nearPig(game, p, 2);
      clickOn(game, p, "hand");
    }
    expect(game.freePigChickens).toBe(1);
    expect(game.inventory.pigChicken).toBe(2);
    game.clock.restore(game.clock.cycleMs - 1000, game.clock.dayCount);
    run(game, 1500);
    expect(game.freePigChickens).toBe(3);
    expect(game.inventory.pigChicken).toBe(2);
    // Y con 3 libres no se puede soltar ninguno de la mochila.
    game.player.teleport(meadow(game, 0, -3));
    game.step(STEP_MS);
    releaseOnGround(game);
    expect(game.freePigChickens).toBe(3);
  });

  it("se guarda con el mundo; uno que estaba volando vuelve aterrizando", () => {
    const game = farmGame();
    const p = pigs(game)[0];
    enterState(PIG_CHICKEN_MACHINE, p.brain!, "fly", game.timeMs, game.rng);
    const back = entityFromSnapshot(entityToSnapshot(p, "w", game.timeMs)!, 0)!;
    expect(back.species).toBe("pigChicken");
    expect(back.slotId).toBe(p.slotId);
    expect(back.body.pos).toEqual(p.body.pos);
    expect(back.brain!.state).toBe("land");
  });

  it("la cerca no lo encierra: vuela por encima", () => {
    const game = farmGame();
    const farm = game.world.layout!.farm;
    expect(game.world.store.get(farm.x0, game.world.store.surfaceY(farm.x0, farm.z0 + 5), farm.z0 + 5)).toBe(BLOCK_NUM.fence);
    const seen = new Set<string>();
    run(game, 10 * 60_000, () => {
      for (const p of pigs(game)) {
        const x = Math.floor(p.body.pos.x);
        const z = Math.floor(p.body.pos.z);
        if (x <= farm.x0 || x >= farm.x1 || z <= farm.z0 || z >= farm.z1) seen.add(p.id);
      }
    });
    expect(seen.size).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
