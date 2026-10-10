import type { WorldSettings } from "./repository/model";

export const MIN_PHASE_MINUTES = 2;
export const MAX_PHASE_MINUTES = 30;

export type SettingsField = "dayMinutes" | "nightMinutes" | "master" | "music" | "sfx";

export type SettingsInput = {
  dayMinutes: number;
  nightMinutes: number;
  quietNight: boolean;
  volume: { master: number; music: number; sfx: number };
};

export type ClampResult = {
  settings: WorldSettings;
  /** Campos que se limitaron al rango permitido, para avisar a los padres. */
  clamped: SettingsField[];
};

function clamp(value: number, min: number, max: number, fallback: number): { value: number; changed: boolean } {
  if (!Number.isFinite(value)) return { value: fallback, changed: true };
  const v = Math.min(max, Math.max(min, value));
  return { value: v, changed: v !== value };
}

/** Limita la configuración de padres: día y noche de 2 a 30 min (enteros), volúmenes de 0 a 1. */
export function clampSettings(input: SettingsInput, fallback: WorldSettings): ClampResult {
  const clamped: SettingsField[] = [];
  const minutes = (field: "dayMinutes" | "nightMinutes") => {
    const r = clamp(Math.round(input[field]), MIN_PHASE_MINUTES, MAX_PHASE_MINUTES, fallback[field]);
    if (r.changed || Math.round(input[field]) !== input[field]) clamped.push(field);
    return r.value;
  };
  const volume = (field: "master" | "music" | "sfx") => {
    const r = clamp(input.volume[field], 0, 1, fallback.volume[field]);
    if (r.changed) clamped.push(field);
    return r.value;
  };
  return {
    settings: {
      dayMinutes: minutes("dayMinutes"),
      nightMinutes: minutes("nightMinutes"),
      quietNight: input.quietNight,
      volume: { master: volume("master"), music: volume("music"), sfx: volume("sfx") },
    },
    clamped,
  };
}
