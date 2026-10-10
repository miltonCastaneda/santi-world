/** Atardecer y amanecer: la luz cambia de forma gradual durante 30 s (spec "Atardecer gradual"). */
export const TRANSITION_MS = 30_000;
/** Un minuto antes de la noche, la luna del HUD parpadea y suena un aviso. */
export const NIGHT_WARNING_MS = 60_000;

export type Phase = "day" | "dusk" | "night" | "dawn";

export type Durations = { dayMs: number; nightMs: number };

export type ClockEvent =
  | { type: "phase"; phase: Phase }
  | { type: "nightSoon" }
  | { type: "midnight" }
  /** Empieza un día nuevo: reaparecen los que faltan y se van los enemigos. */
  | { type: "dawn"; dayCount: number };

export function durationsFrom(settings: { dayMinutes: number; nightMinutes: number }): Durations {
  return { dayMs: settings.dayMinutes * 60_000, nightMs: settings.nightMinutes * 60_000 };
}

const smooth = (u: number) => {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
};

/**
 * Hora del mundo (design D10): un ciclo es el día seguido de la noche. El atardecer son los últimos
 * 30 s del día y el amanecer, los últimos 30 s de la noche. Solo avanza con los pasos de la
 * simulación, así que con la pestaña oculta (bucle en pausa) o el juego cerrado el tiempo no pasa.
 */
export class WorldClock {
  timeOfCycleMs = 0;
  dayCount = 1;
  private d: Durations;

  constructor(durations: Durations = { dayMs: 15 * 60_000, nightMs: 15 * 60_000 }) {
    this.d = { ...durations };
  }

  get durations(): Durations {
    return { ...this.d };
  }

  get cycleMs(): number {
    return this.d.dayMs + this.d.nightMs;
  }

  get phase(): Phase {
    return this.phaseAt(this.timeOfCycleMs);
  }

  get isNight(): boolean {
    return this.timeOfCycleMs >= this.d.dayMs;
  }

  /** 1 de día, 0 de noche y una curva suave en el atardecer y el amanecer. */
  get daylight(): number {
    const t = this.timeOfCycleMs;
    const duskStart = this.d.dayMs - TRANSITION_MS;
    const dawnStart = this.cycleMs - TRANSITION_MS;
    if (t < duskStart) return 1;
    if (t < this.d.dayMs) return 1 - smooth((t - duskStart) / TRANSITION_MS);
    if (t < dawnStart) return 0;
    return smooth((t - dawnStart) / TRANSITION_MS);
  }

  /** Cuánto falta para que empiece la noche (0 si ya es de noche). */
  get msUntilNight(): number {
    return Math.max(0, this.d.dayMs - this.timeOfCycleMs);
  }

  /** Cuánto falta para el amanecer (0 si es de día). */
  get msUntilDawn(): number {
    return this.isNight ? this.cycleMs - this.timeOfCycleMs : 0;
  }

  /** Fracción de la fase actual (día o noche) que ya pasó, de 0 a 1. */
  get phaseProgress(): number {
    return this.isNight ? (this.timeOfCycleMs - this.d.dayMs) / this.d.nightMs : this.timeOfCycleMs / this.d.dayMs;
  }

  phaseAt(t: number): Phase {
    if (t < this.d.dayMs - TRANSITION_MS) return "day";
    if (t < this.d.dayMs) return "dusk";
    if (t < this.cycleMs - TRANSITION_MS) return "night";
    return "dawn";
  }

  /** Hora guardada (se ajusta a las duraciones actuales). */
  restore(timeOfCycleMs: number, dayCount: number): void {
    this.timeOfCycleMs = Math.max(0, Math.min(this.cycleMs - 1, timeOfCycleMs));
    this.dayCount = Math.max(1, Math.floor(dayCount));
  }

  /**
   * Nuevas duraciones (configuración de los padres, en caliente). Se conserva lo que ya pasó de la
   * fase actual, así la próxima noche dura exactamente lo nuevo.
   */
  setDurations(durations: Durations): void {
    const night = this.isNight;
    const elapsed = night ? this.timeOfCycleMs - this.d.dayMs : this.timeOfCycleMs;
    this.d = { ...durations };
    this.timeOfCycleMs = night ? this.d.dayMs + Math.min(elapsed, this.d.nightMs - 1) : Math.min(elapsed, this.d.dayMs - 1);
  }

  /** Avanza la hora y devuelve lo que pasó en este intervalo, en orden. */
  advance(dtMs: number): ClockEvent[] {
    const events: ClockEvent[] = [];
    let t0 = this.timeOfCycleMs;
    let remaining = dtMs;
    while (remaining > 0) {
      const step = Math.min(remaining, this.cycleMs - t0);
      const t1 = t0 + step;
      const crossed = (mark: number) => t0 < mark && t1 >= mark;
      if (crossed(this.d.dayMs - NIGHT_WARNING_MS)) events.push({ type: "nightSoon" });
      for (const mark of [this.d.dayMs - TRANSITION_MS, this.d.dayMs, this.cycleMs - TRANSITION_MS]) {
        if (crossed(mark)) events.push({ type: "phase", phase: this.phaseAt(mark) });
      }
      if (crossed(this.d.dayMs + this.d.nightMs / 2)) events.push({ type: "midnight" });
      remaining -= step;
      if (t1 >= this.cycleMs) {
        this.dayCount++;
        t0 = 0;
        events.push({ type: "dawn", dayCount: this.dayCount }, { type: "phase", phase: "day" });
      } else {
        t0 = t1;
      }
    }
    this.timeOfCycleMs = t0;
    return events;
  }
}
