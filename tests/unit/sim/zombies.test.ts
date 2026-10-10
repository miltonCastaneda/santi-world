import { describe, expect, it } from "vitest";
import { ZOMBIE } from "../../../src/domain/entities/zombie";
import { HITS_TO_DEFEAT, MELEE, resolveHit, TARGET_KINDS } from "../../../src/domain/rules/damage";
import { TOOL_IDS, type ToolId } from "../../../src/domain/rules/tools";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { FLAT_TOP_Y } from "../../../src/domain/worldgen/generator";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { MAX_HEARTS, PLAYER_SPEED } from "../../../src/sim/player";
import { isPathValid } from "../../../src/sim/systems/pathfinding";

const GROUND = FLAT_TOP_Y + 1;
const run = (game: Game, ms: number, each?: () => void) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    each?.();
  }
};
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const action = (game: Game, id: string) => game.entities.get(id)!.brain!.state;

/** Pradera plana de noche, con el personaje en el centro (128, 128). */
function night(seed = "zombis", world = TerrainWorld.create(seed, "legacy-flat")) {
  const game = new Game({ world });
  game.configureTime({ dayMinutes: 15, nightMinutes: 15, quietNight: false });
  game.clock.restore(game.clock.durations.dayMs + 1000, 1);
  game.player.teleport({ x: 128.5, y: GROUND, z: 128.5 });
  run(game, 200);
  return game;
}

/** Rayo desde los ojos del personaje al centro del cuerpo de una entidad. */
function rayTo(game: Game, id: string) {
  const eye = game.player.eye();
  const b = game.entities.get(id)!.body;
  const d = { x: b.pos.x - eye.x, y: b.pos.y + b.height / 2 - eye.y, z: b.pos.z - eye.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { origin: eye, direction: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

describe("[enemigos-nocturnos] Zombis que persiguen respetando los bloques", () => {
  it("[enemigos-nocturnos] Velocidad: si el niño camina alejándose 10 s en línea recta, la distancia aumenta", () => {
    const game = night();
    const z = game.spawnZombie({ x: 128.5, y: GROUND, z: 136.5 });
    run(game, 1500);
    expect(action(game, z.id)).toBe("chase");
    expect(z.targetId).toBe("player");
    const before = dist(z.body.pos, game.player.pos);
    game.player.setMove(0, -1);
    const samples: number[] = [];
    run(game, 10_000, () => samples.push(dist(z.body.pos, game.player.pos)));
    expect(samples.at(-1)!).toBeGreaterThan(before + 10);
    // Al 60 %: en 10 s el niño hace 43 bloques y el zombi como mucho 26.
    expect(ZOMBIE.speedFactor * PLAYER_SPEED).toBeLessThan(PLAYER_SPEED * 0.61);
    expect(Math.max(...samples.slice(20).map((d, i) => samples[i] - d))).toBeLessThanOrEqual(0.05);
  });

  it("[enemigos-nocturnos] Recalcular camino: un muro en el camino hace que busque otro en 2 s o menos", () => {
    const game = night();
    const z = game.spawnZombie({ x: 140.5, y: GROUND, z: 128.5 });
    run(game, 1500);
    expect(action(game, z.id)).toBe("chase");
    // Muro de 3 de alto y 11 de ancho entre los dos.
    const wallX = Math.floor(z.body.pos.x) - 3;
    for (let dz = -5; dz <= 5; dz++) for (let y = GROUND; y < GROUND + 3; y++) game.world.place(wallX, y, 128 + dz, "stone");
    game.events.emit("blockChanged", { pos: { x: wallX, y: GROUND, z: 128 } });
    const placedAt = game.timeMs;
    let replanned: number | null = null;
    run(game, 2000, () => {
      if (replanned === null && z.pathStatus === "following" && z.path && isPathValid(game.pathWorld, z.path) && (z.pathAt ?? 0) >= placedAt) replanned = game.timeMs - placedAt;
    });
    expect(replanned).not.toBeNull();
    expect(replanned!).toBeLessThanOrEqual(2000);
    // El camino nuevo rodea el muro: no pasa por ninguna de sus celdas.
    for (const p of z.path!.points) expect(Math.floor(p.x) === wallX && Math.abs(Math.floor(p.z) - 128) <= 5).toBe(false);
  });

  it("[enemigos-nocturnos] Recalcular camino: si ya no hay camino, en 2 s o menos se queda deambulando", () => {
    const game = night();
    const z = game.spawnZombie({ x: 138.5, y: GROUND, z: 128.5 });
    run(game, 1500);
    expect(action(game, z.id)).toBe("chase");
    // El niño se encierra en una caja techada.
    for (let x = 126; x <= 130; x++)
      for (let zz = 126; zz <= 130; zz++)
        for (let y = GROUND; y <= GROUND + 3; y++) if (x === 126 || x === 130 || zz === 126 || zz === 130 || y === GROUND + 3) game.world.place(x, y, zz, "stone");
    let gaveUp: number | null = null;
    run(game, 2000, () => {
      if (gaveUp === null && action(game, z.id) !== "chase") gaveUp = game.timeMs;
    });
    expect(gaveUp).not.toBeNull();
    expect(z.targetId).toBeNull();
    // Y no entra: después de un rato sigue fuera de la caja y el niño tiene todos sus corazones.
    run(game, 20_000);
    expect(z.body.pos.x < 126 || z.body.pos.x > 131 || z.body.pos.z < 126 || z.body.pos.z > 131).toBe(true);
    expect(game.player.hearts).toBe(MAX_HEARTS);
  });
});

describe("[enemigos-nocturnos] Ataques y golpes", () => {
  it("[personaje-y-herramientas] Recibir un golpe: un zombi que toca al niño le quita 1 corazón y lo empuja; 1 s sin otro golpe", () => {
    const game = night();
    const hits: GameEvents["playerHit"][] = [];
    game.events.on("playerHit", (e) => hits.push(e));
    const z = game.spawnZombie({ x: 129.2, y: GROUND, z: 128.5 });
    run(game, 100);
    expect(hits).toHaveLength(1);
    expect(game.player.hearts).toBe(MAX_HEARTS - 1);
    expect(action(game, z.id)).toBe("bump");
    run(game, 300);
    // Empujado hacia el lado contrario del zombi.
    expect(game.player.pos.x).toBeLessThan(128.5);
    run(game, 600);
    expect(game.player.hearts).toBe(MAX_HEARTS - 1);
  });

  it("[enemigos-nocturnos] Zombi alcanza a un animal: la gallina hace poof y queda pendiente de reaparecer", () => {
    const game = new Game({ seed: "granja-zombi" });
    game.spawnPopulation();
    game.clock.restore(game.clock.durations.dayMs + 1000, 1);
    const hen = [...game.entities.all()].find((e) => e.species === "hen")!;
    const removed: GameEvents["entityRemoved"][] = [];
    game.events.on("entityRemoved", (e) => removed.push(e));
    game.spawnZombie({ x: hen.body.pos.x + 0.5, y: hen.body.pos.y, z: hen.body.pos.z });
    run(game, 200);
    expect(removed.map((r) => r.id)).toContain(hen.id);
    expect(game.entities.get(hen.id)).toBeUndefined();
    expect(game.pendingRespawns).toContain(hen.slotId);
  });

  it("[enemigos-nocturnos] Un golpe: con la Espada (o la Mano o el Pico) el zombi a 2 bloques hace poof en 300 ms o menos", () => {
    for (const tool of ["sword", "hand", "pickaxe"] as ToolId[]) {
      const game = night(`golpe-${tool}`);
      game.enqueue({ type: "selectTool", tool });
      const z = game.spawnZombie({ x: 128.5, y: GROUND, z: 130.5 });
      const blocksBefore = game.world.store.surfaceY(128, 129);
      const removed: string[] = [];
      game.events.on("entityRemoved", (e) => removed.push(e.id));
      game.enqueue({ type: "useTool", ray: rayTo(game, z.id) });
      run(game, 300);
      expect(removed, tool).toEqual([z.id]);
      expect(game.zombieCount, tool).toBe(0);
      // La Mano no puso ningún bloque: el clic fue para el zombi.
      expect(game.world.store.surfaceY(128, 129), tool).toBe(blocksBefore);
    }
  });

  it("el Collar no le hace nada a un zombi; un golpe a un animal es un rebote (boing), sin poof", () => {
    const game = night("collar");
    game.enqueue({ type: "selectTool", tool: "collar" });
    const z = game.spawnZombie({ x: 128.5, y: GROUND, z: 130.5 });
    game.enqueue({ type: "useTool", ray: rayTo(game, z.id) });
    run(game, 100);
    expect(game.entities.get(z.id)).toBeDefined();

    const farm = new Game({ seed: "boing" });
    farm.spawnPopulation();
    const sheep = [...farm.entities.all()].find((e) => e.species === "sheep")!;
    farm.player.teleport({ x: sheep.body.pos.x, y: sheep.body.pos.y, z: sheep.body.pos.z - 2.5 });
    const hits: GameEvents["entityHit"][] = [];
    farm.events.on("entityHit", (e) => hits.push(e));
    farm.enqueue({ type: "useTool", ray: rayTo(farm, sheep.id) });
    farm.step(STEP_MS);
    expect(hits).toMatchObject([{ id: sheep.id, outcome: "boing", defeated: false }]);
    expect(farm.entities.get(sheep.id)).toBeDefined();
  });

  it("[experiencia-infantil] tabla de reglas de daño: zombi = 1 golpe de cerca; a los animales, rebotes salvo la Espada (carne)", () => {
    expect(HITS_TO_DEFEAT.zombie).toBe(1);
    const table = Object.fromEntries(TOOL_IDS.map((t) => [t, Object.fromEntries(TARGET_KINDS.map((k) => [k, resolveHit(t, k).defeated ? "poof" : MELEE[t][k]]))]));
    expect(table).toEqual({
      hand: { animal: "boing", zombie: "poof", pigChicken: "capture" },
      pickaxe: { animal: "boing", zombie: "poof", pigChicken: "capture" },
      sword: { animal: "poof", zombie: "poof", pigChicken: "capture" },
      bow: { animal: "none", zombie: "none", pigChicken: "capture" },
      collar: { animal: "boing", zombie: "none", pigChicken: "capture" },
    });
    // Nunca hace falta más de un golpe para un zombi, aunque haya recibido otros antes.
    expect(resolveHit("sword", "zombie", 3).defeated).toBe(true);
  });
});
