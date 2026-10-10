import { describe, expect, it } from "vitest";
import { Rng } from "../../../src/core/rng";

describe("[plataforma-escalable] Rng con semilla", () => {
  it("la misma semilla produce la misma secuencia", () => {
    const a = new Rng("santi");
    const b = new Rng("santi");
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("semillas distintas producen secuencias distintas", () => {
    const a = new Rng("santi");
    const b = new Rng("otro");
    expect(a.next()).not.toBe(b.next());
  });

  it("next está en [0, 1) e int respeta sus límites", () => {
    const rng = new Rng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("guardar y restaurar el estado reproduce la continuación exacta", () => {
    const rng = new Rng(7);
    rng.next();
    const state = rng.getState();
    const expected = [rng.next(), rng.next()];
    rng.setState(state);
    expect([rng.next(), rng.next()]).toEqual(expected);
  });
});
