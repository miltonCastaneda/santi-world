import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import type { Ray } from "../../../src/core/math";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { createHeadlessGame, type GameEvents } from "../../../src/sim/game";
import { HIT_INVULNERABLE_MS, MAX_HEARTS, PLAYER_SPEED, REGEN_MS, RESPAWN_INVULNERABLE_MS } from "../../../src/sim/player";

function setup() {
  const h = createHeadlessGame({ seed: "jugador", clock: new FakeClock() });
  h.advance(500);
  const events: { [K in keyof GameEvents]?: GameEvents[K][] } = {};
  for (const name of ["blockPlaced", "blockBroken", "tooFar", "bump", "footstep", "heartsChanged", "playerRespawned"] as const) {
    events[name] = [];
    h.game.events.on(name, (e) => (events[name] as unknown[]).push(e));
  }
  return { h, game: h.game, events };
}

/** Rayo hacia abajo que cae sobre la celda (x, z) del suelo. */
const downAt = (x: number, z: number, fromY = 40): Ray => ({ origin: { x: x + 0.5, y: fromY, z: z + 0.5 }, direction: { x: 0, y: -1, z: 0 } });

describe("[personaje-y-herramientas] controlador del jugador", () => {
  it("aparece de pie sobre la granja", () => {
    const { game } = setup();
    expect(game.player.body.onGround).toBe(true);
    const { x, z } = game.player.pos;
    expect(game.player.pos.y).toBeCloseTo(game.world.store.surfaceY(Math.floor(x), Math.floor(z)) + 1, 3);
  });

  it("camina a 4,3 bloques/s y se detiene al soltar", () => {
    const { h, game, events } = setup();
    const x0 = game.player.pos.x;
    game.enqueue({ type: "move", x: 1, z: 0 });
    h.advance(1000);
    expect(game.player.pos.x - x0).toBeCloseTo(PLAYER_SPEED, 0);
    expect(game.player.animAt(game.timeMs)).toBe("walk");
    expect(events.footstep!.length).toBeGreaterThanOrEqual(2);
    game.enqueue({ type: "move", x: 0, z: 0 });
    h.advance(100);
    const x1 = game.player.pos.x;
    h.advance(500);
    expect(game.player.pos.x).toBe(x1);
    expect(game.player.animAt(game.timeMs)).toBe("idle");
  });

  it("[personaje-y-herramientas] Poner un bloque con la Mano a 3 bloques", () => {
    const { h, game, events } = setup();
    const { x, z } = game.player.pos;
    const bx = Math.floor(x) + 3;
    const bz = Math.floor(z);
    const top = game.world.store.surfaceY(bx, bz);
    game.enqueue({ type: "selectBlock", block: "stone" });
    game.enqueue({ type: "useTool", ray: downAt(bx, bz, top + 3) });
    h.advance(100);
    expect(game.world.store.get(bx, top + 1, bz)).toBe(BLOCK_NUM.stone);
    expect(events.blockPlaced).toEqual([{ pos: { x: bx, y: top + 1, z: bz }, block: "stone" }]);
    expect(game.player.animAt(game.timeMs)).toBe("action");
  });

  it("[personaje-y-herramientas] Fuera de alcance: a 20 bloques no se coloca nada y avisa 'muy lejos'", () => {
    const { h, game, events } = setup();
    const before = game.world.store.modifiedChunks().length;
    const { x, z } = game.player.pos;
    game.enqueue({ type: "useTool", ray: downAt(Math.floor(x) + 20, Math.floor(z)) });
    h.advance(100);
    expect(events.tooFar!.length).toBe(1);
    expect(events.blockPlaced).toEqual([]);
    expect(game.world.store.modifiedChunks().length).toBe(before);
  });

  it("[personaje-y-herramientas] Atascado dentro de un bloque: no se coloca en la celda del personaje", () => {
    const { h, game, events } = setup();
    const { x, y, z } = game.player.pos;
    const cell = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    // Rayo desde arriba hacia el suelo bajo los pies: la celda adyacente es la del personaje.
    game.enqueue({ type: "useTool", ray: downAt(cell.x, cell.z, cell.y + 0.9) });
    h.advance(100);
    expect(events.blockPlaced).toEqual([]);
    expect(game.world.store.get(cell.x, cell.y, cell.z)).toBe(0);
  });

  it("[personaje-y-herramientas] Capa inferior: el Pico no la rompe y suena un 'toc'", () => {
    const { h, game, events } = setup();
    const { x, z } = game.player.pos;
    const bx = Math.floor(x) + 1;
    const bz = Math.floor(z);
    // Se cava un pozo hasta la capa 1 para poder apuntar a la capa 0 desde cerca.
    for (let y = game.world.store.surfaceY(bx, bz); y >= 1; y--) game.world.remove(bx, y, bz);
    game.player.teleport({ x: bx + 0.5, y: 1, z: bz + 0.5 });
    h.advance(1000);
    game.enqueue({ type: "selectTool", tool: "pickaxe" });
    game.enqueue({ type: "useTool", ray: { origin: { x: bx + 0.5, y: 2.5, z: bz + 0.5 }, direction: { x: 0, y: -1, z: 0 } } });
    h.advance(100);
    expect(events.bump!.length).toBe(1);
    expect(game.world.store.get(bx, 0, bz)).not.toBe(0);
  });

  it("[personaje-y-herramientas] Deshacer: 3 bloques desaparecen en orden inverso", () => {
    const { h, game } = setup();
    const { x, z } = game.player.pos;
    const cells = [2, 3, 4].map((d) => ({ x: Math.floor(x) + d, z: Math.floor(z) }));
    const placed = cells.map((c) => ({ ...c, y: game.world.store.surfaceY(c.x, c.z) + 1 }));
    for (const c of cells) game.enqueue({ type: "useTool", ray: downAt(c.x, c.z, game.world.store.surfaceY(c.x, c.z) + 3) });
    h.advance(100);
    for (const p of placed) expect(game.world.store.get(p.x, p.y, p.z)).not.toBe(0);
    for (let i = 2; i >= 0; i--) {
      game.enqueue({ type: "undo" });
      h.advance(50);
      expect(game.world.store.get(placed[i].x, placed[i].y, placed[i].z)).toBe(0);
      for (let j = 0; j < i; j++) expect(game.world.store.get(placed[j].x, placed[j].y, placed[j].z)).not.toBe(0);
    }
  });

  it("[personaje-y-herramientas] Elegir bloque de la hotbar: la herramienta pasa a ser Mano", () => {
    const { h, game } = setup();
    game.enqueue({ type: "selectTool", tool: "sword" });
    h.advance(50);
    expect(game.selection.tool).toBe("sword");
    game.enqueue({ type: "selectBlock", block: "planks" });
    h.advance(50);
    expect(game.selection).toEqual({ tool: "hand", block: "planks" });
    expect(game.player.tool).toBe("hand");
  });
});

describe("[personaje-y-herramientas] Corazones y reaparición sin pérdida", () => {
  it("[personaje-y-herramientas] Recibir un golpe: queda con 4 y 1 s sin recibir otro", () => {
    const { h, game } = setup();
    const from = { x: game.player.pos.x - 1, y: game.player.pos.y, z: game.player.pos.z };
    expect(game.hitPlayer(from)).toBe("hurt");
    expect(game.player.hearts).toBe(4);
    h.advance(HIT_INVULNERABLE_MS - 100);
    expect(game.hitPlayer(from)).toBe("ignored");
    expect(game.player.hearts).toBe(4);
    h.advance(150);
    expect(game.hitPlayer(from)).toBe("hurt");
    expect(game.player.hearts).toBe(3);
  });

  it("el golpe empuja suavemente al personaje lejos del enemigo", () => {
    const { h, game } = setup();
    const x0 = game.player.pos.x;
    game.hitPlayer({ x: x0 - 1, y: game.player.pos.y, z: game.player.pos.z });
    h.advance(500);
    expect(game.player.pos.x).toBeGreaterThan(x0 + 0.5);
    expect(game.player.pos.x).toBeLessThan(x0 + 2.5);
  });

  it("[personaje-y-herramientas] Quedarse sin corazones: 'poof' y reaparece en la granja con 5, sin perder bloques", () => {
    const { h, game, events } = setup();
    const { x, z } = game.player.pos;
    const bx = Math.floor(x) + 2;
    const bz = Math.floor(z);
    game.enqueue({ type: "useTool", ray: downAt(bx, bz, game.world.store.surfaceY(bx, bz) + 3) });
    h.advance(100);
    const placedAt = events.blockPlaced![0].pos;
    game.enqueue({ type: "move", x: 1, z: 1 });
    h.advance(2000);
    game.enqueue({ type: "move", x: 0, z: 0 });
    for (let i = 0; i < MAX_HEARTS; i++) {
      h.advance(HIT_INVULNERABLE_MS + 50);
      game.hitPlayer(null);
    }
    expect(events.playerRespawned!.length).toBe(1);
    expect(game.player.hearts).toBe(MAX_HEARTS);
    expect(game.player.pos.x).toBeCloseTo(game.spawnPoint().x, 3);
    expect(game.player.pos.z).toBeCloseTo(game.spawnPoint().z, 3);
    expect(game.world.store.get(placedAt.x, placedAt.y, placedAt.z)).toBe(BLOCK_NUM.grass);
    // 5 s de invulnerabilidad tras reaparecer.
    h.advance(RESPAWN_INVULNERABLE_MS - 200);
    expect(game.hitPlayer(null)).toBe("ignored");
    h.advance(300);
    expect(game.hitPlayer(null)).toBe("hurt");
  });

  it("[personaje-y-herramientas] Recuperar corazones: +1 cada 20 s sin golpes", () => {
    const { h, game, events } = setup();
    game.hitPlayer(null);
    h.advance(HIT_INVULNERABLE_MS + 50);
    game.hitPlayer(null);
    expect(game.player.hearts).toBe(3);
    h.advance(REGEN_MS - 200);
    expect(game.player.hearts).toBe(3);
    h.advance(300);
    expect(game.player.hearts).toBe(4);
    h.advance(REGEN_MS + 100);
    expect(game.player.hearts).toBe(5);
    h.advance(REGEN_MS * 2);
    expect(game.player.hearts).toBe(5);
    expect(events.heartsChanged!.map((e) => e.hearts)).toEqual([4, 3, 4, 5]);
  });

  it("[personaje-y-herramientas] Caer en un hueco no quita corazones", () => {
    const { h, game } = setup();
    const { x, z } = game.player.pos;
    const bx = Math.floor(x) + 2;
    const bz = Math.floor(z);
    const top = game.world.store.surfaceY(bx, bz);
    for (let y = top; y > top - 3; y--) game.world.remove(bx, y, bz);
    game.player.teleport({ x: bx + 0.5, y: top + 1, z: bz + 0.5 });
    h.advance(1500);
    expect(game.player.pos.y).toBeCloseTo(top - 2, 3);
    expect(game.player.hearts).toBe(MAX_HEARTS);
  });
});
