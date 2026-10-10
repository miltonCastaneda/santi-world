/** Fuente de tiempo en milisegundos. El núcleo nunca lee el reloj del navegador directamente. */
export interface Clock {
  now(): number;
}

/** Reloj manual para pruebas: el tiempo solo avanza cuando se llama a advance(). */
export class FakeClock implements Clock {
  constructor(private current = 0) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
