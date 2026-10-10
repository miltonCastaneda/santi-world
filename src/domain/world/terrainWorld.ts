import type { Vec3 } from "../../core/math";
import { BLOCK_NUM, type BlockId } from "../blocks";
import { createWorldStore } from "../worldgen/generator";
import type { WorldLayout } from "../worldgen/layout";
import type { BlockChange, ChunkStore } from "./chunkStore";

const MAX_UNDO = 100;

/** Mundo por chunks con las reglas de construcción del niño (poner, quitar y deshacer). */
export class TerrainWorld {
  private history: BlockChange[] = [];

  constructor(
    readonly seed: string,
    readonly store: ChunkStore,
    readonly layout: WorldLayout,
  ) {}

  static create(seed: string): TerrainWorld {
    const { store, generator } = createWorldStore(seed);
    return new TerrainWorld(seed, store, generator.layout);
  }

  /** El agua natural no se apunta: el rayo la atraviesa hasta el fondo. */
  isPickable(x: number, y: number, z: number): boolean {
    const num = this.store.get(x, y, z);
    if (num === 0) return false;
    if (num === BLOCK_NUM.water) return this.store.isPlaced(x, y, z);
    return true;
  }

  canPlaceAt(x: number, y: number, z: number): boolean {
    if (!this.store.inBounds(x, y, z) || y === 0) return false;
    const num = this.store.get(x, y, z);
    return num === 0 || num === BLOCK_NUM.water;
  }

  place(x: number, y: number, z: number, id: BlockId, now = 0): Vec3 | null {
    if (!this.canPlaceAt(x, y, z)) return null;
    return this.record(this.store.set(x, y, z, BLOCK_NUM[id], true, now));
  }

  /** La capa 0 es indestructible para que nunca haya un agujero al vacío. */
  remove(x: number, y: number, z: number, now = 0): Vec3 | null {
    if (y <= 0 || this.store.get(x, y, z) === 0) return null;
    return this.record(this.store.set(x, y, z, 0, false, now));
  }

  undo(now = 0): Vec3 | null {
    const last = this.history.pop();
    if (!last) return null;
    this.store.set(last.x, last.y, last.z, last.before, last.wasPlaced, now);
    return { x: last.x, y: last.y, z: last.z };
  }

  private record(change: BlockChange | null): Vec3 | null {
    if (!change) return null;
    this.history.push(change);
    if (this.history.length > MAX_UNDO) this.history.shift();
    return { x: change.x, y: change.y, z: change.z };
  }
}
