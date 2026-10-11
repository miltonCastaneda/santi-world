import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE, chunkIndex, chunkKey } from "./chunk";

export type ChunkGenerator = (cx: number, cz: number) => Chunk;

export type BlockChange = { x: number; y: number; z: number; before: number; after: number; wasPlaced: boolean };

/** División entera hacia abajo (también para negativos). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function worldToChunk(x: number, z: number): { cx: number; cz: number; lx: number; lz: number } {
  const cx = floorDiv(x, CHUNK_SIZE);
  const cz = floorDiv(z, CHUNK_SIZE);
  return { cx, cz, lx: x - cx * CHUNK_SIZE, lz: z - cz * CHUNK_SIZE };
}

/**
 * Mundo finito de sizeInChunks x sizeInChunks chunks. Los chunks se crean bajo demanda con el
 * generador. Los "modificados" difieren de lo que daría la semilla (no se descargan nunca, porque
 * regenerarlos perdería los cambios); los "sucios" además tienen cambios sin guardar.
 */
export class ChunkStore {
  readonly sizeInChunks: number;
  readonly sizeInBlocks: number;
  readonly height = CHUNK_HEIGHT;
  private chunks = new Map<string, Chunk>();
  /** Los mismos chunks por índice numérico: `get` se llama millones de veces (A*, física, luz). */
  private grid: (Chunk | undefined)[];
  private dirty = new Set<string>();
  private modified = new Set<string>();

  constructor(private readonly options: { sizeInChunks: number; generate: ChunkGenerator }) {
    this.sizeInChunks = options.sizeInChunks;
    this.sizeInBlocks = options.sizeInChunks * CHUNK_SIZE;
    this.grid = new Array<Chunk | undefined>(this.sizeInChunks * this.sizeInChunks);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && z >= 0 && y >= 0 && x < this.sizeInBlocks && z < this.sizeInBlocks && y < CHUNK_HEIGHT;
  }

  chunkInBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.sizeInChunks && cz < this.sizeInChunks;
  }

  /** Devuelve el chunk, generándolo si hace falta (null fuera del mundo). */
  chunk(cx: number, cz: number): Chunk | null {
    if (!this.chunkInBounds(cx, cz)) return null;
    const i = cz * this.sizeInChunks + cx;
    let c = this.grid[i];
    if (!c) {
      c = this.options.generate(cx, cz);
      this.chunks.set(c.key, c);
      this.grid[i] = c;
    }
    return c;
  }

  /** Chunk ya en memoria, sin generar. */
  peek(cx: number, cz: number): Chunk | undefined {
    return this.chunkInBounds(cx, cz) ? this.grid[cz * this.sizeInChunks + cx] : undefined;
  }

  isLoaded(cx: number, cz: number): boolean {
    return this.peek(cx, cz) !== undefined;
  }

  /** Reemplaza un chunk. `modified` indica que difiere del generador (por ejemplo, uno cargado de la base de datos). */
  put(chunk: Chunk, modified = false): void {
    this.chunks.set(chunk.key, chunk);
    if (this.chunkInBounds(chunk.cx, chunk.cz)) this.grid[chunk.cz * this.sizeInChunks + chunk.cx] = chunk;
    if (modified) this.modified.add(chunk.key);
  }

  /** Libera un chunk que se puede regenerar con la semilla. Los modificados se conservan siempre. */
  unload(cx: number, cz: number): boolean {
    const key = chunkKey(cx, cz);
    if (this.modified.has(key)) return false;
    if (this.chunkInBounds(cx, cz)) this.grid[cz * this.sizeInChunks + cx] = undefined;
    return this.chunks.delete(key);
  }

  loadedChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    // Dentro del mundo x y z no son negativos: truncar es lo mismo que redondear hacia abajo.
    const cx = (x / CHUNK_SIZE) | 0;
    const cz = (z / CHUNK_SIZE) | 0;
    const c = this.grid[cz * this.sizeInChunks + cx] ?? this.chunk(cx, cz)!;
    return c.blocks[chunkIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] ?? 0;
  }

  isPlaced(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    return this.chunk(cx, cz)?.isPlaced(lx, y, lz) ?? false;
  }

  /** Cambia un bloque y devuelve el cambio (null si está fuera del mundo). */
  set(x: number, y: number, z: number, num: number, placed: boolean, now = 0): BlockChange | null {
    if (!this.inBounds(x, y, z)) return null;
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const c = this.chunk(cx, cz);
    if (!c) return null;
    const before = c.get(lx, y, lz);
    const wasPlaced = c.isPlaced(lx, y, lz);
    c.set(lx, y, lz, num, placed, now);
    this.dirty.add(c.key);
    this.modified.add(c.key);
    return { x, y, z, before, after: num, wasPlaced };
  }

  /** Chunks afectados por un cambio en (x, z): el propio y los vecinos si está en un borde. */
  affectedChunks(x: number, z: number): { cx: number; cz: number }[] {
    const { cx, cz, lx, lz } = worldToChunk(x, z);
    const out = [{ cx, cz }];
    if (lx === 0) out.push({ cx: cx - 1, cz });
    if (lx === CHUNK_SIZE - 1) out.push({ cx: cx + 1, cz });
    if (lz === 0) out.push({ cx, cz: cz - 1 });
    if (lz === CHUNK_SIZE - 1) out.push({ cx, cz: cz + 1 });
    return out.filter((c) => this.chunkInBounds(c.cx, c.cz));
  }

  isDirty(cx: number, cz: number): boolean {
    return this.dirty.has(chunkKey(cx, cz));
  }

  dirtyChunks(): Chunk[] {
    return [...this.dirty].map((k) => this.chunks.get(k)).filter((c): c is Chunk => !!c);
  }

  markClean(keys: Iterable<string>): void {
    for (const k of keys) this.dirty.delete(k);
  }

  /** Confirma un guardado: limpia solo los chunks que no cambiaron desde que se copiaron. */
  markSaved(saved: Iterable<{ cx: number; cz: number; version: number }>): void {
    for (const s of saved) {
      const c = this.chunks.get(chunkKey(s.cx, s.cz));
      if (c && c.version === s.version) this.dirty.delete(c.key);
    }
  }

  isModified(cx: number, cz: number): boolean {
    return this.modified.has(chunkKey(cx, cz));
  }

  modifiedChunks(): Chunk[] {
    return [...this.modified].map((k) => this.chunks.get(k)).filter((c): c is Chunk => !!c);
  }

  /** Altura del bloque más alto que no es aire en la columna (o -1). */
  surfaceY(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) if (this.get(x, y, z) !== 0) return y;
    return -1;
  }
}
