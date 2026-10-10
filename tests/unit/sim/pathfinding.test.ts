import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/core/math";
import { findPath, isPathValid, isWalkable, MAX_NODES, PathQueue, type PathWorld } from "../../../src/sim/systems/pathfinding";

/** Mundo de prueba: suelo sólido en y = 0 de 64x64, con bloques y cercas a mano y versión por chunk. */
function testWorld() {
  const cells = new Map<string, number>();
  const water = new Set<string>();
  const versions = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world: PathWorld & { set(x: number, y: number, z: number, h: number): void; water(x: number, y: number, z: number): void } = {
    collision: (x, y, z) => {
      if (x < 0 || z < 0 || x >= 64 || z >= 64) return Infinity;
      if (y <= 0) return 1;
      return cells.get(k(x, y, z)) ?? 0;
    },
    isWater: (x, y, z) => water.has(k(x, y, z)),
    chunkVersion: (cx, cz) => versions.get(`${cx},${cz}`) ?? 0,
    set(x, y, z, h) {
      cells.set(k(x, y, z), h);
      const ck = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
      versions.set(ck, (versions.get(ck) ?? 0) + 1);
    },
    water(x, y, z) {
      water.add(k(x, y, z));
    },
  };
  return world;
}

const sheep = { height: 1.2, swims: false };
const at = (x: number, y: number, z: number): Vec3 => ({ x: x + 0.5, y, z: z + 0.5 });
const wall = (w: ReturnType<typeof testWorld>, z: number, height: number, from = 0, to = 63, h = 1) => {
  for (let x = from; x <= to; x++) for (let y = 1; y <= height; y++) w.set(x, y, z, h);
};

describe("[animales-y-granja] Pathfinding A* con presupuesto", () => {
  it("camino recto en terreno llano", () => {
    const w = testWorld();
    const { path } = findPath(w, at(2, 1, 2), at(10, 1, 2), sheep);
    expect(path!.points.at(-1)).toEqual(at(10, 1, 2));
    expect(path!.points).toHaveLength(9);
  });

  it("sube un escalón de 1 bloque", () => {
    const w = testWorld();
    // Todo z = 5 en adelante está un bloque más alto.
    for (let z = 5; z < 64; z++) for (let x = 0; x < 64; x++) w.set(x, 1, z, 1);
    const { path } = findPath(w, at(4, 1, 2), at(4, 2, 8), sheep);
    expect(path).not.toBeNull();
    expect(path!.points.some((p) => p.y === 2)).toBe(true);
  });

  it("no sube 2 bloques: un muro de 2 sin hueco no tiene camino", () => {
    const w = testWorld();
    wall(w, 10, 2);
    expect(findPath(w, at(5, 1, 5), at(5, 1, 15), sheep).path).toBeNull();
  });

  it("baja hasta 3 bloques pero no 4", () => {
    const w = testWorld();
    // Meseta de altura 3 (pararse en y = 4) en x < 10, y otra de altura 4 en x >= 40.
    for (let x = 0; x < 10; x++) for (let z = 0; z < 64; z++) for (let y = 1; y <= 3; y++) w.set(x, y, z, 1);
    expect(findPath(w, at(5, 4, 5), at(20, 1, 5), sheep).path).not.toBeNull();
    const w2 = testWorld();
    for (let x = 0; x < 10; x++) for (let z = 0; z < 64; z++) for (let y = 1; y <= 4; y++) w2.set(x, y, z, 1);
    // De y = 5 a y = 1 son 4 bloques: no hay forma de bajar.
    expect(findPath(w2, at(5, 5, 5), at(20, 1, 5), sheep).path).toBeNull();
  });

  it("[animales-y-granja] Cerca de 1 bloque: una cerca (1,5) no se salta aunque mida un bloque", () => {
    const w = testWorld();
    wall(w, 10, 1, 0, 63, 1.5);
    expect(isWalkable(w, 5, 2, 10, sheep)).toBe(false);
    expect(findPath(w, at(5, 1, 5), at(5, 1, 15), sheep).path).toBeNull();
    // Con un hueco de 2 cercas, el camino pasa por el hueco.
    w.set(18, 1, 10, 0);
    w.set(19, 1, 10, 0);
    const { path } = findPath(w, at(5, 1, 5), at(5, 1, 15), sheep);
    expect(path!.points.some((p) => Math.floor(p.z) === 10 && (Math.floor(p.x) === 18 || Math.floor(p.x) === 19))).toBe(true);
    // Un hueco fuera de la región de búsqueda (margen de 20) no se considera.
    const w2 = testWorld();
    wall(w2, 10, 1, 0, 63, 1.5);
    w2.set(40, 1, 10, 0);
    expect(findPath(w2, at(5, 1, 5), at(5, 1, 15), sheep).path).toBeNull();
  });

  it("no corta esquinas en diagonal", () => {
    const w = testWorld();
    w.set(6, 1, 5, 1);
    w.set(5, 1, 6, 1);
    const { path } = findPath(w, at(5, 1, 5), at(6, 1, 6), sheep);
    expect(path!.points.length).toBeGreaterThan(2);
  });

  it("invalidación: colocar un bloque en un chunk que cruza el camino lo invalida", () => {
    const w = testWorld();
    const { path } = findPath(w, at(2, 1, 2), at(30, 1, 2), sheep);
    expect(isPathValid(w, path!)).toBe(true);
    w.set(50, 1, 50, 1);
    expect(isPathValid(w, path!)).toBe(true);
    w.set(20, 1, 2, 1);
    expect(isPathValid(w, path!)).toBe(false);
  });

  it("límite de nodos: un destino encerrado falla sin pasar de 2000 nodos", () => {
    const w = testWorld();
    // Corral cerrado alrededor del destino.
    for (let x = 40; x <= 44; x++) for (const z of [40, 44]) w.set(x, 1, z, 1.5);
    for (let z = 40; z <= 44; z++) for (const x of [40, 44]) w.set(x, 1, z, 1.5);
    const { path, expanded } = findPath(w, at(2, 1, 2), at(42, 1, 42), sheep);
    expect(path).toBeNull();
    expect(expanded).toBeLessThanOrEqual(MAX_NODES + 1);
  });

  it("el agua solo es transitable para quien nada", () => {
    const w = testWorld();
    for (let x = 0; x < 64; x++) for (let z = 8; z <= 12; z++) {
      w.set(x, 1, z, 0);
      w.water(x, 0, z);
    }
    // El fondo del "río" es agua (y = 0 no es sólido en esas celdas para esta prueba).
    const world: PathWorld = { ...w, collision: (x, y, z) => (y === 0 && z >= 8 && z <= 12 ? 0 : w.collision(x, y, z)) };
    expect(isWalkable(world, 5, 1, 10, { height: 0.7, swims: true })).toBe(true);
    expect(isWalkable(world, 5, 1, 10, sheep)).toBe(false);
  });

  it("la cola procesa 3 búsquedas por tick, por prioridad y en orden de llegada", () => {
    const w = testWorld();
    const q = new PathQueue();
    q.request("lobo", at(1, 1, 1), at(5, 1, 1), sheep, 2);
    q.request("zombi", at(1, 1, 1), at(5, 1, 1), sheep, 0);
    q.request("oveja", at(1, 1, 1), at(5, 1, 1), sheep, 3);
    q.request("vaca", at(1, 1, 1), at(5, 1, 1), sheep, 2);
    q.request("lobo", at(1, 1, 1), at(6, 1, 1), sheep, 2);
    const done: string[] = [];
    expect(q.process(w, (id) => done.push(id))).toBe(3);
    expect(done).toEqual(["zombi", "vaca", "lobo"]);
    q.process(w, (id) => done.push(id));
    expect(done.at(-1)).toBe("oveja");
    expect(q.size).toBe(0);
  });
});
