export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

export function chunkIndex(lx: number, ly: number, lz: number): number {
  return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Bloques de una columna de 16x16x64. `placed` marca las celdas que puso el jugador (procedencia). */
export class Chunk {
  /** Sube con cada cambio; sirve para remallar, invalidar caminos y sincronizar. */
  version = 0;
  updatedAt = 0;

  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly blocks: Uint8Array<ArrayBuffer> = new Uint8Array(CHUNK_VOLUME),
    readonly placed: Uint8Array<ArrayBuffer> = new Uint8Array(CHUNK_VOLUME / 8),
  ) {}

  get key(): string {
    return chunkKey(this.cx, this.cz);
  }

  get(lx: number, ly: number, lz: number): number {
    if (ly < 0 || ly >= CHUNK_HEIGHT) return 0;
    return this.blocks[chunkIndex(lx, ly, lz)];
  }

  isPlaced(lx: number, ly: number, lz: number): boolean {
    if (ly < 0 || ly >= CHUNK_HEIGHT) return false;
    const i = chunkIndex(lx, ly, lz);
    return (this.placed[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /** Escritura del generador: no cambia la versión ni la procedencia. */
  setGenerated(lx: number, ly: number, lz: number, num: number): void {
    if (ly < 0 || ly >= CHUNK_HEIGHT) return;
    this.blocks[chunkIndex(lx, ly, lz)] = num;
  }

  /** Escritura del jugador o de la simulación. */
  set(lx: number, ly: number, lz: number, num: number, placed: boolean, now = 0): void {
    const i = chunkIndex(lx, ly, lz);
    this.blocks[i] = num;
    if (placed && num !== 0) this.placed[i >> 3] |= 1 << (i & 7);
    else this.placed[i >> 3] &= ~(1 << (i & 7));
    this.version++;
    this.updatedAt = now;
  }
}
