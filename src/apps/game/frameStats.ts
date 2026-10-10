/** Tiempos de frame recientes (ventana deslizante) para el overlay F3. */
export class FrameStats {
  private samples: number[] = [];
  private last: number | null = null;

  constructor(private readonly window = 120) {}

  frame(now: number): void {
    if (this.last !== null) {
      this.samples.push(now - this.last);
      if (this.samples.length > this.window) this.samples.shift();
    }
    this.last = now;
  }

  get avg(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  get p95(): number {
    return percentile(this.samples, 0.95);
  }

  get fps(): number {
    const a = this.avg;
    return a > 0 ? 1000 / a : 0;
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
