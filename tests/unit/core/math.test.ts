import { describe, expect, it } from "vitest";
import { rayAabb, raycastVoxels, vec3 } from "../../../src/core/math";
import { EventBus } from "../../../src/core/events";
import { FakeClock } from "../../../src/core/clock";

describe("[plataforma-escalable] raycast DDA de vóxeles", () => {
  it("atraviesa las celdas esperadas y devuelve la cara de entrada", () => {
    const visited: string[] = [];
    const hit = raycastVoxels({ origin: vec3(0.5, 0.5, 0.5), direction: vec3(1, 0, 0) }, 10, (x, y, z) => {
      visited.push(`${x},${y},${z}`);
      return x === 4;
    });
    expect(visited).toEqual(["0,0,0", "1,0,0", "2,0,0", "3,0,0", "4,0,0"]);
    expect(hit?.cell).toEqual(vec3(4, 0, 0));
    expect(hit?.normal).toEqual(vec3(-1, 0, 0));
    expect(hit?.distance).toBeCloseTo(3.5);
  });

  it("detecta golpes desde arriba con la normal hacia arriba", () => {
    const hit = raycastVoxels({ origin: vec3(2.5, 10, 2.5), direction: vec3(0, -1, 0) }, 20, (_x, y) => y <= 3);
    expect(hit?.cell).toEqual(vec3(2, 3, 2));
    expect(hit?.normal).toEqual(vec3(0, 1, 0));
  });

  it("no golpea nada más allá de la distancia máxima", () => {
    const hit = raycastVoxels({ origin: vec3(0.5, 0.5, 0.5), direction: vec3(1, 1, 0) }, 3, (x) => x === 10);
    expect(hit).toBeNull();
  });

  it("rayAabb devuelve la distancia de entrada o null", () => {
    const box = { min: vec3(2, -1, -1), max: vec3(3, 1, 1) };
    expect(rayAabb({ origin: vec3(0, 0, 0), direction: vec3(1, 0, 0) }, box)).toBeCloseTo(2);
    expect(rayAabb({ origin: vec3(0, 0, 0), direction: vec3(-1, 0, 0) }, box)).toBeNull();
  });
});

describe("[plataforma-escalable] utilidades del núcleo", () => {
  it("EventBus entrega los eventos a quien escucha y permite desuscribirse", () => {
    const bus = new EventBus<{ ping: number }>();
    const got: number[] = [];
    const off = bus.on("ping", (n) => got.push(n));
    bus.emit("ping", 1);
    off();
    bus.emit("ping", 2);
    expect(got).toEqual([1]);
  });

  it("FakeClock solo avanza cuando se le pide", () => {
    const clock = new FakeClock();
    expect(clock.now()).toBe(0);
    clock.advance(50);
    expect(clock.now()).toBe(50);
  });
});
