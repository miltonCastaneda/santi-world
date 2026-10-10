import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/core/math";
import { aimArrow, angleDeg, ARROW, canShoot, leadVelocity, SHOT_INTERVAL_MS } from "../../../src/domain/rules/archery";
import { Game, type GameEvents } from "../../../src/sim/game";
import { STEP_MS } from "../../../src/sim/loop";
import { ProjectileSystem, type ArrowEnd } from "../../../src/sim/systems/projectiles";

const air = () => false;
const box = (c: Vec3, r = 1) => ({ min: { x: c.x - r, y: c.y - r, z: c.z - r }, max: { x: c.x + r, y: c.y + r, z: c.z + r } });

function fly(sys: ProjectileSystem, ms: number, isSolid: (x: number, y: number, z: number) => boolean = air, targets: (now: number) => { id: string; box: ReturnType<typeof box> }[] = () => [], start = 0): ArrowEnd[] {
  const ends: ArrowEnd[] = [];
  for (let t = start + STEP_MS; t <= start + ms; t += STEP_MS) ends.push(...sys.step(STEP_MS, t, isSolid, targets(t)));
  return ends;
}

describe("[enemigos-nocturnos] El Arco", () => {
  it("[enemigos-nocturnos] Física de la flecha: sale a unos 30 bloques/s y cae poco a poco por la gravedad", () => {
    const sys = new ProjectileSystem();
    const a = sys.shoot({ x: 0, y: 50, z: 0 }, { x: ARROW.speed, y: 0, z: 0 }, 0)!;
    fly(sys, 1000);
    expect(a.pos.x).toBeCloseTo(30, 0);
    // y(t) = y0 - g t² / 2 = 50 - 5 (con subpasos, casi exacto).
    expect(a.pos.y).toBeGreaterThan(44.5);
    expect(a.pos.y).toBeLessThan(45.5);
    expect(a.vel.y).toBeCloseTo(-ARROW.gravity, 5);
  });

  it("[enemigos-nocturnos] Física de la flecha: desaparece al chocar con un bloque", () => {
    const sys = new ProjectileSystem();
    sys.shoot({ x: 0.5, y: 10.5, z: 0.5 }, { x: ARROW.speed, y: 0, z: 0 }, 0);
    const wall = (x: number) => x === 12;
    const ends = fly(sys, 1000, (x) => wall(x));
    expect(ends).toHaveLength(1);
    expect(ends[0].type).toBe("block");
    expect(ends[0].pos.x).toBeCloseTo(12, 5);
    expect(sys.arrows).toHaveLength(0);
  });

  it("[enemigos-nocturnos] Física de la flecha: a los 3 s de vuelo desaparece", () => {
    const sys = new ProjectileSystem();
    sys.shoot({ x: 0, y: 500, z: 0 }, { x: 0, y: 30, z: 0 }, 0);
    expect(fly(sys, ARROW.lifeMs - STEP_MS)).toEqual([]);
    const ends = fly(sys, STEP_MS, air, () => [], ARROW.lifeMs - STEP_MS);
    expect(ends.map((e) => e.type)).toEqual(["expired"]);
    expect(sys.arrows).toHaveLength(0);
  });

  it("no atraviesa una caja fina aunque vaya rápido (3 subpasos y rayo contra la caja)", () => {
    const sys = new ProjectileSystem();
    sys.shoot({ x: 0, y: 10, z: 0 }, { x: ARROW.speed, y: 0, z: 0 }, 0);
    const thin = { id: "t", box: { min: { x: 7, y: 8, z: -1 }, max: { x: 7.05, y: 12, z: 1 } } };
    const ends = fly(sys, 1000, air, () => [thin]);
    expect(ends.map((e) => e.type === "entity" && e.targetId)).toEqual(["t"]);
  });

  it("[enemigos-nocturnos] Disparos muy rápidos: con 20 clics por segundo salen como máximo 3 flechas por segundo", () => {
    expect(canShoot(null, 0)).toBe(true);
    expect(canShoot(0, SHOT_INTERVAL_MS - 1)).toBe(false);
    const game = new Game({ seed: "arco" });
    game.configureTime({ dayMinutes: 10, nightMinutes: 10, quietNight: true });
    const shots: number[] = [];
    game.events.on("arrowShot", () => shots.push(game.timeMs));
    game.enqueue({ type: "selectTool", tool: "bow" });
    for (let t = 0; t < 3000; t += STEP_MS) {
      game.enqueue({ type: "useTool", ray: { origin: game.player.eye(), direction: { x: 0.6, y: 0.3, z: 0.74 } } });
      game.step(STEP_MS);
    }
    expect(shots.length).toBeGreaterThanOrEqual(8);
    for (let i = 3; i < shots.length; i++) expect(shots[i] - shots[i - 3]).toBeGreaterThanOrEqual(1000);
  });

  it("[enemigos-nocturnos] Asistencia de puntería: con el dragón a 12° o menos del centro, la flecha va hacia él y lo alcanza", () => {
    const from = { x: 0, y: 12, z: 0 };
    const start = { x: 25, y: 22, z: 0 };
    const vel = { x: 0, y: 0, z: 7 };
    const center = (t: number) => ({ x: start.x + (vel.x * t) / 1000, y: start.y, z: start.z + (vel.z * t) / 1000 });
    // El niño apunta 10° al costado del dragón.
    const toDragon = { x: start.x - from.x, y: start.y - from.y, z: start.z - from.z };
    // Girada 10° hacia un costado (en horizontal, perpendicular a la línea hacia el dragón).
    const len = Math.hypot(toDragon.x, toDragon.y, toDragon.z);
    const side = { x: -toDragon.z / Math.hypot(toDragon.x, toDragon.z), y: 0, z: toDragon.x / Math.hypot(toDragon.x, toDragon.z) };
    const a = (10 * Math.PI) / 180;
    const dir = {
      x: (toDragon.x / len) * Math.cos(a) - side.x * Math.sin(a),
      y: (toDragon.y / len) * Math.cos(a),
      z: (toDragon.z / len) * Math.cos(a) - side.z * Math.sin(a),
    };
    expect(angleDeg(dir, toDragon)).toBeCloseTo(10, 0);
    const v = aimArrow(from, dir, { center: start, vel });
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(ARROW.speed, 5);
    const sys = new ProjectileSystem();
    sys.shoot(from, v, 0);
    const ends = fly(sys, 3000, air, (t) => [{ id: "dragon", box: box(center(t), 1.2) }]);
    expect(ends.map((e) => e.type === "entity" && e.targetId)).toEqual(["dragon"]);

    // Sin asistencia, la misma flecha pasa de largo.
    const plain = new ProjectileSystem();
    plain.shoot(from, { x: dir.x * ARROW.speed, y: dir.y * ARROW.speed, z: dir.z * ARROW.speed }, 0);
    expect(fly(plain, 3000, air, (t) => [{ id: "dragon", box: box(center(t), 1.2) }]).some((e) => e.type === "entity")).toBe(false);
  });

  it("más allá de 12° no corrige el disparo; quieto, apunta directo a la posición compensando la caída", () => {
    const from = { x: 0, y: 0, z: 0 };
    const v = aimArrow(from, { x: 1, y: 0, z: 0 }, { center: { x: 10, y: 0, z: 4 }, vel: { x: 0, y: 0, z: 0 } });
    expect(v).toEqual({ x: ARROW.speed, y: 0, z: 0 });
    const lead = leadVelocity(from, { x: 30, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    // Sube un poco para caer justo en el blanco a 1 s de vuelo.
    expect(lead.y).toBeGreaterThan(4);
    expect(lead.y).toBeLessThan(6);
  });

  it("[enemigos-nocturnos] Zombi derrotado de un golpe: una flecha también le hace poof", () => {
    const game = new Game({ seed: "arco-zombi" });
    game.configureTime({ dayMinutes: 10, nightMinutes: 10, quietNight: false });
    game.clock.restore(game.clock.durations.dayMs + 1000, 1);
    const eye = game.player.eye();
    const z = game.spawnZombie({ x: eye.x + 8, y: game.player.pos.y, z: eye.z });
    const hits: GameEvents["entityHit"][] = [];
    game.events.on("entityHit", (e) => hits.push(e));
    game.enqueue({ type: "selectTool", tool: "bow" });
    const target = { x: z.body.pos.x, y: z.body.pos.y + 1, z: z.body.pos.z };
    const d = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
    const len = Math.hypot(d.x, d.y, d.z);
    game.enqueue({ type: "useTool", ray: { origin: eye, direction: { x: d.x / len, y: d.y / len, z: d.z / len } } });
    for (let t = 0; t < 1000; t += STEP_MS) game.step(STEP_MS);
    expect(game.entities.get(z.id)).toBeUndefined();
    expect(hits.find((h) => h.id === z.id)?.defeated).toBe(true);
  });
});
