import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/domain/repository/model";
import { clampSettings } from "../../../src/domain/settings";

const input = (over: Partial<typeof DEFAULT_SETTINGS> = {}) => ({ ...DEFAULT_SETTINGS, ...over, volume: { ...DEFAULT_SETTINGS.volume, ...over.volume } });

describe("[vista-de-padres] Configuración del juego por los padres", () => {
  it("acepta valores dentro del rango sin avisos", () => {
    const r = clampSettings(input({ nightMinutes: 5, quietNight: true }), DEFAULT_SETTINGS);
    expect(r.clamped).toEqual([]);
    expect(r.settings).toEqual({ ...DEFAULT_SETTINGS, nightMinutes: 5, quietNight: true });
  });

  it("[vista-de-padres] Valor fuera de rango: 0 y 45 min se limitan a 2 y 30 y se indica el límite", () => {
    const r = clampSettings(input({ nightMinutes: 0, dayMinutes: 45 }), DEFAULT_SETTINGS);
    expect(r.settings.nightMinutes).toBe(2);
    expect(r.settings.dayMinutes).toBe(30);
    expect(r.clamped.sort()).toEqual(["dayMinutes", "nightMinutes"]);
  });

  it("redondea los minutos y limita los volúmenes de 0 a 1", () => {
    const r = clampSettings(input({ dayMinutes: 7.4, volume: { master: 1.5, music: -1, sfx: 0.3 } }), DEFAULT_SETTINGS);
    expect(r.settings.dayMinutes).toBe(7);
    expect(r.settings.volume).toEqual({ master: 1, music: 0, sfx: 0.3 });
    expect(r.clamped.sort()).toEqual(["dayMinutes", "master", "music"]);
  });

  it("un valor que no es un número vuelve al anterior", () => {
    const r = clampSettings(input({ dayMinutes: Number.NaN }), { ...DEFAULT_SETTINGS, dayMinutes: 9 });
    expect(r.settings.dayMinutes).toBe(9);
    expect(r.clamped).toEqual(["dayMinutes"]);
  });
});
