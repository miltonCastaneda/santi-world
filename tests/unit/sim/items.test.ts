import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/core/math";
import { PICKUP_DELAY_MS, PICKUP_RADIUS } from "../../../src/domain/entities/items";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { FLAT_TOP_Y } from "../../../src/domain/worldgen/generator";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { MAX_HEARTS } from "../../../src/sim/player";

const GROUND = FLAT_TOP_Y + 1;
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += STEP_MS) game.step(STEP_MS);
};

/** Rayo desde los ojos del personaje hacia un punto. */
function rayAt(game: Game, to: Vec3) {
  const eye = game.player.eye();
  const d = { x: to.x - eye.x, y: to.y - eye.y, z: to.z - eye.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { origin: eye, direction: { x: d.x / len, y: d.y / len, z: d.z / len } };
}

/** Granja con sus animales, en pausa (para que no se muevan durante el golpe). */
function farm(seed = "carne") {
  const game = new Game({ seed });
  game.spawnPopulation();
  for (const e of game.entities.all()) if (e.brain) e.brain.until = Number.POSITIVE_INFINITY;
  return game;
}

/** Personaje a `d` bloques de la entidad (en -z) y mirándola. */
function faceAt(game: Game, id: string, d = 2) {
  const b = game.entities.get(id)!.body;
  game.player.teleport({ x: b.pos.x, y: b.pos.y, z: b.pos.z - d });
  return rayAt(game, { x: b.pos.x, y: b.pos.y + b.height / 2, z: b.pos.z });
}

describe("[recursos-e-inventario] Carne de los animales de granja", () => {
  it("[recursos-e-inventario] Golpear una vaca: con la Espada a 2 bloques hace poof y queda 1 carne flotando en su lugar", () => {
    const game = farm();
    const cow = [...game.entities.all()].find((e) => e.species === "cow")!;
    const at = { ...cow.body.pos };
    const removed: GameEvents["entityRemoved"][] = [];
    const dropped: GameEvents["itemDropped"][] = [];
    game.events.on("entityRemoved", (e) => removed.push(e));
    game.events.on("itemDropped", (e) => dropped.push(e));
    game.enqueue({ type: "selectTool", tool: "sword" });
    game.enqueue({ type: "useTool", ray: faceAt(game, cow.id) });
    game.step(STEP_MS);
    expect(removed.map((r) => r.id)).toEqual([cow.id]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].item).toBe("meat");
    expect(Math.hypot(dropped[0].pos.x - at.x, dropped[0].pos.z - at.z)).toBeLessThan(0.5);
    expect(game.entities.get(dropped[0].id)?.species).toBe("meat");
    // La vaca vuelve al amanecer.
    expect(game.pendingRespawns).toContain(cow.slotId);
    expect(game.inventory.meat).toBe(0);
  });

  it("[recursos-e-inventario] Golpear con el Pico o la Mano: el animal solo retrocede con un boing y no se convierte en carne", () => {
    for (const tool of ["pickaxe", "hand"] as const) {
      const game = farm(`boing-${tool}`);
      const sheep = [...game.entities.all()].find((e) => e.species === "sheep")!;
      const hits: GameEvents["entityHit"][] = [];
      game.events.on("entityHit", (e) => hits.push(e));
      game.enqueue({ type: "selectTool", tool });
      game.enqueue({ type: "useTool", ray: faceAt(game, sheep.id) });
      game.step(STEP_MS);
      expect(hits, tool).toMatchObject([{ id: sheep.id, outcome: "boing", defeated: false }]);
      expect(game.entities.get(sheep.id), tool).toBeDefined();
      expect([...game.entities.all()].some((e) => e.species === "meat"), tool).toBe(false);
    }
  });

  it("[recursos-e-inventario] Recoger carne: al pasar a 1,5 bloques o menos desaparece y la carne sube en 1", () => {
    const game = new Game({ world: TerrainWorld.create("recoger", "legacy-flat") });
    game.player.teleport({ x: 128.5, y: GROUND, z: 120.5 });
    const meat = game.dropItem("meat", { x: 128.5, y: GROUND, z: 128.5 });
    const collected: GameEvents["itemCollected"][] = [];
    game.events.on("itemCollected", (e) => collected.push(e));
    run(game, PICKUP_DELAY_MS + 100);
    expect(game.entities.get(meat.id)).toBeDefined();
    // Camina hacia la carne: la recoge apenas entra en el radio.
    game.player.setMove(0, 1);
    let distAtPickup = Infinity;
    for (let t = 0; t < 5000 && collected.length === 0; t += STEP_MS) {
      game.step(STEP_MS);
      if (collected.length) distAtPickup = Math.hypot(game.player.pos.x - 128.5, game.player.pos.z - 128.5);
    }
    expect(collected).toHaveLength(1);
    expect(distAtPickup).toBeLessThanOrEqual(PICKUP_RADIUS);
    expect(distAtPickup).toBeGreaterThan(PICKUP_RADIUS - 0.5);
    expect(game.entities.get(meat.id)).toBeUndefined();
    expect(game.inventory.meat).toBe(1);
  });

  it("[recursos-e-inventario] Recoger carne con un clic: a 4 bloques, con cualquier herramienta, sin poner un bloque", () => {
    for (const tool of ["hand", "sword", "pickaxe"] as const) {
      const game = new Game({ world: TerrainWorld.create(`clic-${tool}`, "legacy-flat") });
      game.player.teleport({ x: 128.5, y: GROUND, z: 124.5 });
      const meat = game.dropItem("meat", { x: 128.5, y: GROUND, z: 128.5 });
      game.enqueue({ type: "selectTool", tool });
      game.enqueue({ type: "useTool", ray: rayAt(game, { x: 128.5, y: GROUND + 0.3, z: 128.5 }) });
      game.step(STEP_MS);
      expect(game.entities.get(meat.id), tool).toBeUndefined();
      expect(game.inventory.meat, tool).toBe(1);
      expect(game.world.store.surfaceY(128, 128), tool).toBe(FLAT_TOP_Y);
    }
  });

  it("la carne recién caída se ve un momento antes de recogerse sola", () => {
    const game = new Game({ world: TerrainWorld.create("espera", "legacy-flat") });
    game.player.teleport({ x: 128.5, y: GROUND, z: 128.5 });
    const meat = game.dropItem("meat", { x: 129, y: GROUND, z: 128.5 });
    run(game, PICKUP_DELAY_MS - 100);
    expect(game.entities.get(meat.id)).toBeDefined();
    run(game, 200);
    expect(game.entities.get(meat.id)).toBeUndefined();
  });

  it("[recursos-e-inventario] Carne no recogida: después de 5 minutos sigue ahí y se guarda con el mundo", () => {
    const game = farm("cinco-minutos");
    const { x, z } = game.world.spawn;
    game.player.teleport({ x: x + 40, y: game.world.store.surfaceY(Math.floor(x + 40), Math.floor(z)) + 1, z });
    const meat = game.dropItem("meat", { x: x + 20.5, y: game.world.store.surfaceY(Math.floor(x + 20), Math.floor(z)) + 1, z });
    run(game, 5 * 60_000);
    expect(game.entities.get(meat.id)?.body.pos).toEqual(meat.body.pos);

    const saved = game.entitySnapshots("w").find((s) => s.id === meat.id)!;
    expect(saved).toMatchObject({ kind: "item", species: "meat", pos: meat.body.pos });
    const reopened = new Game({ seed: "cinco-minutos" });
    reopened.restoreEntities(game.entitySnapshots("w"));
    expect(reopened.entities.get(meat.id)?.species).toBe("meat");
    // Las carnes nuevas no repiten el id de las guardadas.
    expect(reopened.dropItem("meat", { x: 1, y: 1, z: 1 }).id).not.toBe(meat.id);
  });
});

describe("[recursos-e-inventario] Inventario", () => {
  it("[recursos-e-inventario] El inventario no se pierde: con 3 diamantes pierde todos los corazones, reaparece y sigue teniéndolos", () => {
    const game = new Game({ world: TerrainWorld.create("diamantes", "legacy-flat") });
    game.setInventory({ diamond: 3 });
    for (let i = 0; i < MAX_HEARTS + 2; i++) {
      game.hitPlayer(null);
      run(game, 1100);
    }
    expect(game.inventory).toEqual({ diamond: 3, meat: 0, pigChicken: 0 });
  });

  it("[recursos-e-inventario] Construir sin límite: 500 bloques de piedra y el inventario no cambia", () => {
    const game = new Game({ world: TerrainWorld.create("piedra", "legacy-flat") });
    game.setInventory({ diamond: 2, meat: 1 });
    game.enqueue({ type: "selectBlock", block: "stone" });
    let placed = 0;
    game.events.on("blockPlaced", () => placed++);
    for (let i = 0; i < 500; i++) {
      const x = 60 + (i % 50) * 2;
      const z = 60 + Math.floor(i / 50) * 4;
      game.player.teleport({ x: x + 0.5, y: GROUND, z: z - 1.5 });
      game.enqueue({ type: "useTool", ray: rayAt(game, { x: x + 0.5, y: GROUND, z: z + 0.5 }) });
      game.step(STEP_MS);
    }
    expect(placed).toBe(500);
    expect(game.inventory).toEqual({ diamond: 2, meat: 1, pigChicken: 0 });
  });
});
