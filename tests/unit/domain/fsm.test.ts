import { describe, expect, it } from "vitest";
import { Rng } from "../../../src/core/rng";
import { EntityStore } from "../../../src/domain/entities/entityStore";
import { newBrain, think, type MachineDef, type Perception } from "../../../src/domain/entities/fsm";
import { SPECIES, SPECIES_IDS } from "../../../src/domain/entities/species";

const calm: Perception = { threatDistance: Infinity, outsideHome: false, leaderDistance: Infinity, inWater: false, arrived: false };

const machine: MachineDef = {
  initial: "a",
  interrupts: [{ to: "scared", when: [{ if: "threatNear", within: 6 }] }],
  states: {
    a: { action: "idle", ms: [1000, 1000], next: [{ to: "b", when: [{ if: "timeUp" }, { if: "chance", p: 0.5 }] }, { to: "c", when: [{ if: "timeUp" }] }] },
    b: { action: "wander", ms: [500, 1500], next: [{ to: "a", when: [{ if: "arrived" }] }] },
    c: { action: "graze", ms: [200, 200], next: [{ to: "a", when: [{ if: "timeUp" }] }] },
    scared: { action: "flee", ms: [3000, 3000], next: [{ to: "a", when: [{ if: "timeUp" }] }] },
  },
};

describe("[animales-y-granja] Máquinas de estado por datos", () => {
  it("no cambia de estado antes de tiempo y sortea la duración al entrar", () => {
    const rng = new Rng(1);
    const brain = newBrain(machine, 0, rng);
    expect(brain).toEqual({ state: "a", enteredAt: 0, until: 1000 });
    expect(think(machine, brain, calm, 999, rng)).toBeNull();
    const next = think(machine, brain, calm, 1000, rng);
    expect(["b", "c"]).toContain(next);
    expect(brain.enteredAt).toBe(1000);
  });

  it("las interrupciones tienen prioridad y no se repiten si ya está en ese estado", () => {
    const rng = new Rng(2);
    const brain = newBrain(machine, 0, rng);
    expect(think(machine, brain, { ...calm, threatDistance: 4 }, 10, rng)).toBe("scared");
    expect(brain.until).toBe(3010);
    expect(think(machine, brain, { ...calm, threatDistance: 3 }, 20, rng)).toBeNull();
    expect(think(machine, brain, calm, 3010, rng)).toBe("a");
  });

  it("'arrived' termina el deambular aunque no se haya acabado el tiempo", () => {
    const rng = new Rng(3);
    const brain = newBrain(machine, 0, rng);
    brain.state = "b";
    brain.until = 10_000;
    expect(think(machine, brain, { ...calm, arrived: true }, 100, rng)).toBe("a");
  });

  it("con la misma semilla, la misma secuencia de estados", () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      const brain = newBrain(machine, 0, rng);
      const seen: string[] = [];
      for (let t = 0; t < 60_000; t += 200) if (think(machine, brain, { ...calm, arrived: t % 3000 === 0 }, t, rng)) seen.push(`${t}:${brain.state}`);
      return seen;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
    // La rama al azar toma los dos caminos.
    expect(run(42).some((s) => s.endsWith(":b"))).toBe(true);
    expect(run(42).some((s) => s.endsWith(":c"))).toBe(true);
  });

  it("todas las especies tienen máquinas válidas (estados destino definidos)", () => {
    for (const id of SPECIES_IDS) {
      const m = SPECIES[id].machine;
      expect(m.states[m.initial], id).toBeDefined();
      for (const t of [...m.interrupts, ...Object.values(m.states).flatMap((s) => s.next)]) expect(m.states[t.to], `${id} -> ${t.to}`).toBeDefined();
    }
  });
});

describe("EntityStore", () => {
  const body = (x: number, z: number) => ({ pos: { x, y: 10, z }, vel: { x: 0, y: 0, z: 0 }, halfWidth: 0.3, height: 1, onGround: true });

  it("busca vecinos por radio con el índice espacial, en orden de creación", () => {
    const store = new EntityStore();
    store.add({ id: "b", species: "sheep", yaw: 0, body: body(10, 10) });
    store.add({ id: "a", species: "cow", yaw: 0, body: body(17, 10) });
    store.add({ id: "c", species: "hen", yaw: 0, body: body(40, 40) });
    expect(store.near({ x: 12, y: 10, z: 10 }, 6).map((e) => e.id)).toEqual(["b", "a"]);
    expect(store.near({ x: 12, y: 10, z: 10 }, 6, (e) => e.species === "cow").map((e) => e.id)).toEqual(["a"]);
    store.get("c")!.body.pos.x = 13;
    store.get("c")!.body.pos.z = 10;
    expect(store.near({ x: 12, y: 10, z: 10 }, 1.5).map((e) => e.id)).toEqual([]);
    store.reindex();
    expect(store.near({ x: 12, y: 10, z: 10 }, 1.5).map((e) => e.id)).toEqual(["c"]);
    expect(() => store.add({ id: "a", species: "cow", yaw: 0, body: body(0, 0) })).toThrow(/repetida/);
    store.remove("b");
    expect([...store.all()].map((e) => e.id)).toEqual(["a", "c"]);
  });
});
