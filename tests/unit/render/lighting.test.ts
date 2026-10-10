import { describe, expect, it } from "vitest";
import { colorDistance, DAY_SKY, NIGHT_HEMI, NIGHT_SKY, skyLighting } from "../../../src/render/lighting";
import { STEP_MS } from "../../../src/sim/loop";
import { TRANSITION_MS, WorldClock } from "../../../src/sim/systems/dayNight";

describe("[ciclo-dia-noche] Luz del cielo", () => {
  it("de día el cielo es el de siempre y no hay estrellas; de noche, azul oscuro con estrellas", () => {
    const day = skyLighting(1);
    expect(day.sky).toBe(DAY_SKY);
    expect(day.stars).toBe(0);
    expect(day.moon).toBe(0);
    const night = skyLighting(0);
    expect(night.sky).toBe(NIGHT_SKY);
    expect(night.stars).toBe(1);
    expect(night.sun).toBe(0);
    expect(night.moon).toBeGreaterThan(0);
  });

  it("Visibilidad nocturna mínima: la luz de las entidades nunca baja del mínimo", () => {
    for (let d = 0; d <= 1; d += 0.05) expect(skyLighting(d).hemi).toBeGreaterThanOrEqual(NIGHT_HEMI);
    expect(NIGHT_HEMI).toBeGreaterThanOrEqual(0.5);
  });

  it("Transición gradual: de un tick a otro del atardecer el cielo cambia menos de un 10 %", () => {
    const clock = new WorldClock();
    clock.restore(clock.durations.dayMs - TRANSITION_MS - STEP_MS, 1);
    let prev = skyLighting(clock.daylight);
    let total = 0;
    for (let t = 0; t < TRANSITION_MS + 2 * STEP_MS; t += STEP_MS) {
      clock.advance(STEP_MS);
      const cur = skyLighting(clock.daylight);
      const step = colorDistance(prev.sky, cur.sky);
      expect(step).toBeLessThan(0.1);
      expect(Math.abs(cur.hemi - prev.hemi)).toBeLessThan(0.1);
      total += step;
      prev = cur;
    }
    expect(clock.isNight).toBe(true);
    expect(prev.sky).toBe(NIGHT_SKY);
    // Hubo cambio de verdad (no se quedó quieto y luego saltó).
    expect(total).toBeGreaterThan(colorDistance(DAY_SKY, NIGHT_SKY) * 0.9);
  });
});
