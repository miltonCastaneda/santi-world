import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { TerrainWorld } from "../../../src/domain/world/terrainWorld";
import { createHeadlessGame } from "../../../src/sim/game";
import { durationsFrom, NIGHT_WARNING_MS, TRANSITION_MS, WorldClock, type ClockEvent } from "../../../src/sim/systems/dayNight";

const MIN = 60_000;

/** Juego sin render en una pradera plana (sin animales ni zombis): solo interesa el reloj. */
function headless(minutes: number) {
  const h = createHeadlessGame({ world: TerrainWorld.create("reloj", "legacy-flat"), clock: new FakeClock() });
  h.game.configureTime({ dayMinutes: minutes, nightMinutes: minutes, quietNight: true });
  return h;
}

describe("[ciclo-dia-noche] WorldClock", () => {
  it.each([15, 2, 30])("[ciclo-dia-noche] Duración por defecto (y con %i min): la noche empieza a su hora (± 1 s) y después vuelve el día", (minutes) => {
    const h = headless(minutes);
    const phases: string[] = [];
    h.game.events.on("phaseChanged", ({ phase }) => phases.push(phase));
    h.advance(minutes * MIN - 1000, 50);
    expect(h.game.clock.isNight).toBe(false);
    h.advance(2000, 50);
    expect(h.game.clock.isNight).toBe(true);
    expect(h.game.clock.phase).toBe("night");
    h.advance(minutes * MIN - 2000, 50);
    expect(h.game.clock.isNight).toBe(true);
    h.advance(2000, 50);
    expect(h.game.clock.phase).toBe("day");
    expect(h.game.clock.dayCount).toBe(2);
    expect(phases).toEqual(["dusk", "night", "dawn", "day"]);
  });

  it("[ciclo-dia-noche] Pestaña oculta: con el bucle en pausa durante 10 min, siguen faltando 2 min para la noche", () => {
    const h = headless(15);
    h.advance(13 * MIN, 50);
    expect(h.game.clock.msUntilNight).toBeCloseTo(2 * MIN, -2);
    h.loop.setPaused(true);
    h.advance(10 * MIN, 50);
    h.loop.setPaused(false);
    h.advance(100, 50);
    expect(Math.abs(h.game.clock.msUntilNight - 2 * MIN)).toBeLessThanOrEqual(200);
  });

  it("[ciclo-dia-noche] Contador de días: del día 3, al terminar la noche pasa al 4", () => {
    const clock = new WorldClock(durationsFrom({ dayMinutes: 2, nightMinutes: 2 }));
    clock.restore(4 * MIN - 100, 3);
    const events = clock.advance(200);
    expect(clock.dayCount).toBe(4);
    expect(events).toContainEqual({ type: "dawn", dayCount: 4 });
  });

  it("[ciclo-dia-noche] Atardecer gradual: la luz baja de forma continua durante 30 s o más, sin saltos de más del 10 %", () => {
    const clock = new WorldClock(durationsFrom({ dayMinutes: 2, nightMinutes: 2 }));
    let prev = clock.daylight;
    let firstBelow: number | null = null;
    let reachedZero: number | null = null;
    let maxJump = 0;
    for (let t = 0; t < 2 * MIN + 1000; t += 50) {
      clock.advance(50);
      const d = clock.daylight;
      maxJump = Math.max(maxJump, Math.abs(d - prev));
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      if (firstBelow === null && d < 1) firstBelow = clock.timeOfCycleMs;
      if (reachedZero === null && d === 0) reachedZero = clock.timeOfCycleMs;
      prev = d;
    }
    expect(maxJump).toBeLessThanOrEqual(0.1);
    expect(reachedZero! - firstBelow!).toBeGreaterThanOrEqual(TRANSITION_MS - 100);
    // Al amanecer sube igual de suave.
    for (let i = 0; i < (2 * MIN) / 50; i++) clock.advance(50);
    expect(clock.daylight).toBe(1);
  });

  it("eventos del ciclo en orden: aviso un minuto antes, atardecer, noche, medianoche, amanecer", () => {
    const clock = new WorldClock(durationsFrom({ dayMinutes: 2, nightMinutes: 2 }));
    const events: ClockEvent[] = [];
    for (let t = 0; t < 4 * MIN; t += 50) events.push(...clock.advance(50));
    expect(events.map((e) => (e.type === "phase" ? e.phase : e.type))).toEqual(["nightSoon", "dusk", "night", "midnight", "dawn", "dawn", "day"]);
    const warnAt = 2 * MIN - NIGHT_WARNING_MS;
    const c2 = new WorldClock(durationsFrom({ dayMinutes: 2, nightMinutes: 2 }));
    expect(c2.advance(warnAt - 50)).toEqual([]);
    expect(c2.advance(50)).toEqual([{ type: "nightSoon" }]);
  });

  it("[vista-de-padres] Cambiar la duración de la noche en caliente: la próxima noche dura 5 min (± 1 s)", () => {
    const h = headless(15);
    h.advance(MIN, 50);
    h.game.configureTime({ dayMinutes: 15, nightMinutes: 5, quietNight: true });
    expect(h.game.quietNight).toBe(true);
    // Lo que ya pasó del día se conserva.
    expect(Math.abs(h.game.clock.timeOfCycleMs - MIN)).toBeLessThanOrEqual(50);
    let nightStart: number | null = null;
    let nightEnd: number | null = null;
    h.game.events.on("phaseChanged", ({ phase }) => {
      if (phase === "night") nightStart = h.game.timeMs;
    });
    h.game.events.on("dawn", () => (nightEnd = h.game.timeMs));
    h.advance(14 * MIN + 5 * MIN + 2000, 50);
    expect(nightStart).not.toBeNull();
    expect(Math.abs(nightEnd! - nightStart! - 5 * MIN)).toBeLessThanOrEqual(1000);
  });

  it("de noche, acortar la noche conserva lo que pasó y nunca salta el amanecer", () => {
    const clock = new WorldClock(durationsFrom({ dayMinutes: 2, nightMinutes: 10 }));
    clock.restore(2 * MIN + 6 * MIN, 1);
    clock.setDurations(durationsFrom({ dayMinutes: 2, nightMinutes: 4 }));
    expect(clock.isNight).toBe(true);
    expect(clock.msUntilDawn).toBe(1);
    expect(clock.advance(50)).toContainEqual({ type: "dawn", dayCount: 2 });
  });
});
