import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/core/math";
import type { Entity } from "../../../src/domain/entities/entityStore";
import { WOLF } from "../../../src/domain/entities/wolf";
import type { ToolId } from "../../../src/domain/rules/tools";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { FLAT_TOP_Y } from "../../../src/domain/worldgen/generator";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { GameSession } from "../../../src/sim/session";
import type { WolfContext } from "../../../src/sim/systems/wolves";
import { setupSession } from "../../integration/persistence/helpers";

/** El contexto de los lobos del juego (es privado: las pruebas lo leen igual que la simulación). */
const wolfContextOf = (game: Game) => (game as unknown as { wolfContext: WolfContext }).wolfContext;

const run = (game: Game, ms: number, until?: () => boolean) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    game.step(STEP_MS);
    if (until?.()) return t + STEP_MS;
  }
  return Infinity;
};
const wolves = (game: Game) => [...game.entities.all()].filter((e) => e.species === "wolf");

/** Mundo de día sin zombis; ningún lobo sale a cazar durante la prueba. */
function world(seed = "collar"): Game {
  const game = new Game({ seed });
  game.configureTime({ dayMinutes: 10, nightMinutes: 10, quietNight: true });
  game.spawnPopulation();
  for (const w of wolves(game)) w.huntDay = 99;
  return game;
}

/** Un claro plano de la pradera, al oeste de la granja. */
function meadow(game: Game, dx = 0, dz = 0): Vec3 {
  const farm = game.world.layout!.farm;
  const x = farm.x0 - 12 + dx;
  const z = farm.z0 + 10 + dz;
  return { x: x + 0.5, y: game.world.store.surfaceY(x, z) + 1, z: z + 0.5 };
}

/** Lleva al lobo a la pradera y pone al niño a `d` bloques, mirándolo. */
function nearWolf(game: Game, w: Entity, d: number): void {
  w.body.pos = meadow(game);
  w.body.vel = { x: 0, y: 0, z: 0 };
  w.path = null;
  w.pathStatus = "none";
  w.brain!.until = Number.POSITIVE_INFINITY;
  const p = meadow(game, 0, -d);
  game.player.teleport({ ...p, x: w.body.pos.x });
}

function hitWith(game: Game, w: Entity, tool: ToolId): void {
  game.enqueue({ type: "selectTool", tool });
  const eye = game.player.eye();
  const to = { x: w.body.pos.x, y: w.body.pos.y + w.body.height / 2, z: w.body.pos.z };
  const dir = { x: to.x - eye.x, y: to.y - eye.y, z: to.z - eye.z };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  game.enqueue({ type: "useTool", ray: { origin: eye, direction: { x: dir.x / len, y: dir.y / len, z: dir.z / len } } });
  game.step(STEP_MS);
}

function tameOne(game: Game, w: Entity): void {
  nearWolf(game, w, 2);
  hitWith(game, w, "collar");
}

describe("[lobos] Collar", () => {
  it("[lobos] Domesticar: con el Collar a 2 bloques, en 500 ms o menos hay corazones, collar y deja de ser salvaje", () => {
    const game = world();
    const w = wolves(game)[0];
    nearWolf(game, w, 2);
    const tamed: GameEvents["wolfTamed"][] = [];
    const hits: GameEvents["entityHit"][] = [];
    game.events.on("wolfTamed", (e) => tamed.push(e));
    game.events.on("entityHit", (e) => hits.push(e));
    const t0 = game.timeMs;
    hitWith(game, w, "collar");
    expect(game.timeMs - t0).toBeLessThanOrEqual(500);
    expect(tamed.map((e) => e.id)).toEqual([w.id]);
    expect(hits.map((e) => e.outcome)).toEqual(["tame"]);
    expect(w.tamed).toBe(true);
    expect(w.threat).toBe(false);
    expect(w.role).toBe("follow");
  });

  it("[lobos] Domesticar: a más de 3 bloques el Collar no alcanza (aviso de muy lejos)", () => {
    const game = world();
    const w = wolves(game)[0];
    nearWolf(game, w, 5);
    const far: unknown[] = [];
    game.events.on("tooFar", (e) => far.push(e));
    hitWith(game, w, "collar");
    expect(w.tamed).toBe(false);
    expect(far).toHaveLength(1);
  });

  it("[lobos] Collar sobre un animal que no es lobo: la oveja solo hace un boing suave", () => {
    const game = world();
    const sheep = [...game.entities.all()].find((e) => e.species === "sheep")!;
    nearWolf(game, sheep, 2);
    const hits: GameEvents["entityHit"][] = [];
    game.events.on("entityHit", (e) => hits.push(e));
    hitWith(game, sheep, "collar");
    expect(hits.map((e) => e.outcome)).toEqual(["boing"]);
    expect(game.entities.get(sheep.id)).toBeDefined();
    expect(game.pendingRespawns).toEqual([]);
  });

  it("[lobos] Lobo amigo persistente: al guardar y volver a abrir el mundo sigue siendo amigo y conserva su collar", async () => {
    const { repo, user, clock, game, session, autosave } = await setupSession();
    const opened = await session.openInitial({ seed: "lobo-amigo" });
    const w = wolves(game)[0];
    tameOne(game, w);
    expect(w.tamed).toBe(true);
    expect(session.hasChanges()).toBe(true);
    await autosave.saveNow();

    const game2 = new Game({ seed: "otro" });
    await new GameSession(game2, user.id, { repo, clock, newSeed: () => "x" }).openInitial({ worldId: opened.id });
    const again = game2.entities.get(w.id)!;
    expect(again.tamed).toBe(true);
    expect(again.threat).toBe(false);
    expect(again.role).toBe("follow");
    // Los otros siguen salvajes y no se duplican.
    expect(wolves(game2)).toHaveLength(wolves(game).length);
    expect(wolves(game2).filter((o) => o.tamed)).toHaveLength(1);
  });
});

describe("[lobos] Lobo amigo", () => {
  it("[lobos] Seguir al niño: el niño camina 40 bloques y el lobo termina a 5 bloques o menos de él", () => {
    // Pradera plana, sin nada en el camino.
    const game = new Game({ world: TerrainWorld.create("seguir", "legacy-flat") });
    const w = game.wolves.spawn(game.entities, wolfContextOf(game), { id: "wolf-0", species: "wolf", home: "den", x: 128, z: 132 }, 0);
    w.huntDay = 99;
    game.player.teleport({ x: 128.5, y: FLAT_TOP_Y + 1, z: 130.5 });
    hitWith(game, w, "collar");
    expect(w.tamed).toBe(true);
    const start = { ...game.player.pos };
    // Camina (4,3 bloques/s) unos 40 bloques.
    game.enqueue({ type: "move", x: 0, z: -1 });
    run(game, 9300);
    game.enqueue({ type: "move", x: 0, z: 0 });
    expect(Math.hypot(game.player.pos.x - start.x, game.player.pos.z - start.z)).toBeGreaterThan(35);
    run(game, 4000);
    expect(Math.hypot(w.body.pos.x - game.player.pos.x, w.body.pos.z - game.player.pos.z)).toBeLessThanOrEqual(WOLF.followFar);
  });

  it("[lobos] Seguir al niño: si queda a más de 30 bloques aparece junto a él", () => {
    const game = world("teletransporte");
    const w = wolves(game)[0];
    tameOne(game, w);
    game.player.teleport(meadow(game, 0, 45));
    run(game, 1000);
    expect(Math.hypot(w.body.pos.x - game.player.pos.x, w.body.pos.z - game.player.pos.z)).toBeLessThanOrEqual(WOLF.followFar);
  });

  it("[lobos] Cuarto lobo amigo: con 3 lobos que ya siguen al niño, el cuarto va a la granja y la cuida", () => {
    const game = world("cuarto");
    const list = wolves(game);
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (const w of list.slice(0, 3)) game.wolves.tame(w, game.entities, game.timeMs);
    const fourth = list[3];
    nearWolf(game, fourth, 2);
    // Los que ya lo siguen, detrás del niño (fuera del rayo del Collar).
    list.slice(0, 3).forEach((w, i) => (w.body.pos = { ...game.player.pos, x: game.player.pos.x - 1 + i, z: game.player.pos.z - 3 }));
    hitWith(game, fourth, "collar");
    expect(list.slice(0, 3).map((w) => w.role)).toEqual(["follow", "follow", "follow"]);
    expect(fourth.role).toBe("guard");
    // Lejos de la granja: va hacia ella y se queda cerca.
    const farm = game.world.layout!.farm;
    const center = { x: (farm.x0 + farm.x1 + 1) / 2, z: (farm.z0 + farm.z1 + 1) / 2 };
    game.player.teleport(meadow(game, -60, -40));
    fourth.body.pos = meadow(game, -50, -40);
    run(game, 60_000);
    expect(Math.hypot(fourth.body.pos.x - center.x, fourth.body.pos.z - center.z)).toBeLessThanOrEqual(WOLF.guardRadius + 2);
    expect(Math.hypot(fourth.body.pos.x - game.player.pos.x, fourth.body.pos.z - game.player.pos.z)).toBeGreaterThan(30);
  }, 20_000);

  it("[lobos] Proteger de zombis: un lobo amigo cerca de la granja alcanza a un zombi a 6 bloques o menos y el zombi hace poof", () => {
    const game = world("proteger");
    const w = wolves(game)[0];
    tameOne(game, w);
    w.role = "guard";
    game.player.teleport(meadow(game, -40, 0));
    w.body.pos = meadow(game);
    const zp = meadow(game, 5, 0);
    const z = game.spawnZombie(zp);
    const removed: string[] = [];
    game.events.on("entityRemoved", (e) => removed.push(e.id));
    const t = run(game, 10_000, () => removed.includes(z.id));
    expect(t).toBeLessThan(10_000);
    expect(w.tamed).toBe(true);
  });
});

describe("[lobos] Golpes a los lobos", () => {
  it("[lobos] Golpe con la espada: el lobo salvaje retrocede y sigue siendo salvaje", () => {
    const game = world();
    const w = wolves(game)[0];
    nearWolf(game, w, 2);
    const before = { ...w.body.pos };
    hitWith(game, w, "sword");
    expect(w.brain!.state).toBe("flee");
    run(game, 600);
    expect(game.entities.get(w.id)).toBeDefined();
    expect(w.tamed).toBe(false);
    // Se alejó del niño (que está en -z).
    expect(w.body.pos.z).toBeGreaterThan(before.z + 0.5);
  });

  it("[lobos] Golpe con la Mano o el Pico: retrocede con un boing, sin poof", () => {
    const game = world();
    const w = wolves(game)[0];
    for (const tool of ["hand", "pickaxe"] as const) {
      nearWolf(game, w, 2);
      hitWith(game, w, tool);
      expect(w.brain!.state).toBe("flee");
    }
    expect(game.entities.get(w.id)).toBeDefined();
    expect(w.hits ?? 0).toBe(0);
  });

  it("[lobos] Dos golpes: el segundo espadazo hace poof y el lobo reaparece en su montaña al siguiente amanecer", () => {
    const game = world();
    const w = wolves(game)[0];
    nearWolf(game, w, 2);
    hitWith(game, w, "sword");
    nearWolf(game, w, 2);
    const removed: string[] = [];
    game.events.on("entityRemoved", (e) => removed.push(e.id));
    hitWith(game, w, "sword");
    expect(removed).toEqual([w.id]);
    expect(game.pendingRespawns).toEqual([w.slotId]);
    // Al amanecer vuelve a su guarida.
    game.clock.restore(game.clock.cycleMs - 100, 1);
    run(game, 500);
    const back = wolves(game).find((o) => o.slotId === w.slotId)!;
    expect(back).toBeDefined();
    const m = game.world.layout!.forestMountain;
    expect(Math.hypot(back.body.pos.x - m.x, back.body.pos.z - m.z)).toBeLessThanOrEqual(WOLF.denRadius);
    expect(back.tamed).toBe(false);
  });

  it("[lobos] Golpe accidental a un lobo amigo: no sufre daño, salta contento y sigue siendo amigo", () => {
    const game = world();
    const w = wolves(game)[0];
    tameOne(game, w);
    run(game, 1000);
    const hits: GameEvents["entityHit"][] = [];
    game.events.on("entityHit", (e) => hits.push(e));
    for (let i = 0; i < 3; i++) {
      nearWolf(game, w, 2);
      hitWith(game, w, "sword");
    }
    expect(hits.map((e) => e.outcome)).toEqual(["happy", "happy", "happy"]);
    expect(game.entities.get(w.id)).toBeDefined();
    expect(w.tamed).toBe(true);
    expect(w.hits ?? 0).toBe(0);
    expect(w.brain!.state).toBe("happy");
  });
});
