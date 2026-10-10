export const STEP_MS = 50;
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Bucle de paso fijo: convierte el tiempo real entre frames en pasos de simulación de 50 ms (20 Hz).
 * Limita a 5 pasos por frame para evitar la "espiral de la muerte" y se puede pausar sin saltos de tiempo.
 */
export class FixedStepLoop {
  private accumulator = 0;
  private last: number | null = null;
  private paused = false;

  constructor(
    private readonly step: (dtMs: number) => void,
    readonly stepMs = STEP_MS,
    readonly maxStepsPerFrame = MAX_STEPS_PER_FRAME,
  ) {}

  /** Procesa un frame en el instante nowMs y devuelve cuántos pasos de simulación ejecutó. */
  frame(nowMs: number): number {
    if (this.paused || this.last === null) {
      this.last = nowMs;
      return 0;
    }
    this.accumulator += Math.max(0, nowMs - this.last);
    this.last = nowMs;

    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.step(this.stepMs);
      this.accumulator -= this.stepMs;
      steps++;
    }
    if (this.accumulator >= this.stepMs) this.accumulator %= this.stepMs;
    return steps;
  }

  /** Fracción [0, 1) del paso siguiente, para interpolar el render. */
  get alpha(): number {
    return this.accumulator / this.stepMs;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Al reanudar, el siguiente frame toma un nuevo punto de partida: el tiempo pausado no cuenta. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.last = null;
  }
}
