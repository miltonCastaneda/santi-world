import { describe, expect, it } from "vitest";
import { GRAVITY, isStuck, JUMP_VELOCITY, moveBody, TERMINAL_VELOCITY, type Body, type CollisionQuery } from "../../../src/domain/physics/collide";

const SIZE = 32;
const GROUND_TOP = 10;
const DT = 0.05;

/** Mundo de prueba: suelo macizo hasta y = 9 (superficie en y = 10) y bloques extra a mano. */
function world() {
  const extra = new Map<string, number>();
  const holes = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const query: CollisionQuery = (x, y, z) => {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return Infinity;
    if (y < 0) return 1;
    const k = key(x, y, z);
    if (extra.has(k)) return extra.get(k)!;
    if (holes.has(k)) return 0;
    return y < GROUND_TOP ? 1 : 0;
  };
  return {
    query,
    set: (x: number, y: number, z: number, h = 1) => extra.set(key(x, y, z), h),
    dig: (x: number, y: number, z: number) => holes.add(key(x, y, z)),
  };
}

const body = (x: number, y: number, z: number): Body => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, halfWidth: 0.3, height: 1.8, onGround: false });

function run(b: Body, q: CollisionQuery, seconds: number, each?: (b: Body, r: ReturnType<typeof moveBody>) => void) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = moveBody(b, DT, q);
    each?.(b, r);
  }
}

describe("[personaje-y-herramientas] Movimiento con físicas y colisiones", () => {
  it("cae por gravedad y se apoya en el suelo", () => {
    const w = world();
    const b = body(5.5, 14, 5.5);
    run(b, w.query, 2);
    expect(b.pos.y).toBeCloseTo(GROUND_TOP, 3);
    expect(b.onGround).toBe(true);
    expect(b.vel.y).toBe(0);
  });

  it("[personaje-y-herramientas] Chocar contra un muro de 2 bloques: se detiene y no lo atraviesa", () => {
    const w = world();
    for (let z = 0; z < SIZE; z++) {
      w.set(10, GROUND_TOP, z);
      w.set(10, GROUND_TOP + 1, z);
    }
    const b = body(5.5, GROUND_TOP, 5.5);
    run(b, w.query, 3, (b) => (b.vel.x = 4.3));
    expect(b.pos.x).toBeLessThanOrEqual(10 - 0.3);
    expect(b.pos.x).toBeGreaterThan(9.6);
    // Saltar tampoco alcanza para pasar 2 bloques.
    run(b, w.query, 3, (b, r) => {
      b.vel.x = 4.3;
      if (b.onGround && r.hitX) b.vel.y = JUMP_VELOCITY;
    });
    expect(b.pos.x).toBeLessThan(10);
  });

  it("[personaje-y-herramientas] Saltar un escalón de 1 bloque: queda encima", () => {
    const w = world();
    for (let x = 8; x < SIZE; x++) for (let z = 0; z < SIZE; z++) w.set(x, GROUND_TOP, z);
    const b = body(5.5, GROUND_TOP, 5.5);
    run(b, w.query, 0.2);
    run(b, w.query, 2, (b, r) => {
      b.vel.x = 4.3;
      if (b.onGround && r.hitX) b.vel.y = JUMP_VELOCITY;
    });
    expect(b.pos.x).toBeGreaterThan(9);
    expect(b.pos.y).toBeCloseTo(GROUND_TOP + 1, 3);
    expect(b.onGround).toBe(true);
  });

  it("una cerca (1,5 bloques) no se puede saltar", () => {
    const w = world();
    for (let z = 0; z < SIZE; z++) w.set(8, GROUND_TOP, z, 1.5);
    const b = body(5.5, GROUND_TOP, 5.5);
    run(b, w.query, 3, (b, r) => {
      b.vel.x = 4.3;
      if (b.onGround && r.hitX) b.vel.y = JUMP_VELOCITY;
    });
    expect(b.pos.x).toBeLessThanOrEqual(8 - 0.3);
  });

  it("[personaje-y-herramientas] Caer en un hueco de 3 bloques: llega al fondo", () => {
    const w = world();
    for (let y = GROUND_TOP - 3; y < GROUND_TOP; y++) for (let x = 9; x <= 11; x++) w.dig(x, y, 5);
    for (let y = GROUND_TOP - 3; y < GROUND_TOP; y++) for (let z = 4; z <= 6; z++) w.dig(10, y, z);
    for (let y = GROUND_TOP - 3; y < GROUND_TOP; y++) for (let x = 9; x <= 11; x++) for (let z = 4; z <= 6; z++) w.dig(x, y, z);
    const b = body(7.5, GROUND_TOP, 5.5);
    run(b, w.query, 0.1);
    run(b, w.query, 0.65, (b) => (b.vel.x = 4.3));
    run(b, w.query, 2, (b) => (b.vel.x = 0));
    expect(b.pos.y).toBeCloseTo(GROUND_TOP - 3, 3);
    expect(b.onGround).toBe(true);
  });

  it("[personaje-y-herramientas] Borde del mundo: una barrera invisible lo detiene", () => {
    const w = world();
    const b = body(2.5, GROUND_TOP, 2.5);
    run(b, w.query, 5, (b) => {
      b.vel.x = -4.3;
      b.vel.z = -4.3;
    });
    expect(b.pos.x).toBeGreaterThanOrEqual(0.3 - 1e-3);
    expect(b.pos.z).toBeGreaterThanOrEqual(0.3 - 1e-3);
    expect(b.pos.y).toBeCloseTo(GROUND_TOP, 3);
    const far = body(SIZE - 2.5, GROUND_TOP, SIZE - 2.5);
    run(far, w.query, 5, (b) => {
      b.vel.x = 4.3;
      b.vel.z = 4.3;
    });
    expect(far.pos.x).toBeLessThanOrEqual(SIZE - 0.3 + 1e-3);
    expect(far.pos.z).toBeLessThanOrEqual(SIZE - 0.3 + 1e-3);
  });

  it("a velocidad terminal no atraviesa un suelo de 1 bloque", () => {
    const w = world();
    w.set(5, 30, 5);
    const b = body(5.5, 60, 5.5);
    run(b, w.query, 3, (b) => expect(b.vel.y).toBeGreaterThanOrEqual(-TERMINAL_VELOCITY));
    expect(b.pos.y).toBeCloseTo(31, 3);
    expect(GRAVITY).toBe(25);
  });

  it("si queda atascado dentro de un bloque, puede salir caminando", () => {
    const w = world();
    const b = body(5.5, GROUND_TOP, 5.5);
    run(b, w.query, 0.1);
    w.set(5, GROUND_TOP, 5);
    expect(isStuck(b, w.query)).toBe(true);
    run(b, w.query, 1, (b) => (b.vel.x = 4.3));
    expect(b.pos.x).toBeGreaterThan(6.3);
    expect(isStuck(b, w.query)).toBe(false);
  });
});
