import type { Vec3 } from "../../core/math";
import { isBlockId, type BlockId } from "../blocks";

export const WORLD_SIZE = 32;
export const MAX_HEIGHT = 12;

export type UndoAction =
  | { kind: "place"; pos: Vec3 }
  | { kind: "remove"; pos: Vec3; previous: BlockId };

export function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function parseBlockKey(k: string): Vec3 {
  const [x, y, z] = k.split(",").map(Number);
  return { x, y, z };
}

export function inBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < MAX_HEIGHT;
}

const NEIGHBORS: readonly Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

export function createDefaultBlocks(): Map<string, BlockId> {
  const blocks = new Map<string, BlockId>();

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const hill = 1 + Math.floor((Math.sin(x * 0.28) + Math.cos(z * 0.22) + Math.sin((x + z) * 0.15)) * 0.7);
      const height = Math.max(1, Math.min(3, hill));
      for (let y = 0; y < height; y++) {
        let id: BlockId = "dirt";
        if (y === height - 1) id = "grass";
        else if (y === 0) id = "stone";
        blocks.set(blockKey(x, y, z), id);
      }
    }
  }

  const treeSpots = [
    [6, 8],
    [10, 22],
    [18, 12],
    [24, 7],
    [22, 24],
    [8, 16],
  ] as const;

  for (const [tx, tz] of treeSpots) {
    let ground = -1;
    for (let y = MAX_HEIGHT - 1; y >= 0; y--) {
      if (blocks.has(blockKey(tx, y, tz))) {
        ground = y;
        break;
      }
    }
    if (ground < 0) continue;

    const trunkH = 3;
    for (let i = 1; i <= trunkH; i++) {
      const y = ground + i;
      if (inBounds(tx, y, tz)) blocks.set(blockKey(tx, y, tz), "wood");
    }

    const top = ground + trunkH;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 1; dy <= 2; dy++) {
          const x = tx + dx;
          const y = top + dy;
          const z = tz + dz;
          if (!inBounds(x, y, z)) continue;
          if (dx === 0 && dz === 0 && dy === 1) continue;
          blocks.set(blockKey(x, y, z), "grass");
        }
      }
    }
  }

  return blocks;
}

/** Mundo de bloques v1 (32x32x12) con sus reglas de colocación y deshacer. Sin persistencia. */
export class VoxelWorld {
  blocks: Map<string, BlockId>;
  private undoStack: UndoAction[] = [];

  constructor(blocks: Map<string, BlockId> = createDefaultBlocks()) {
    this.blocks = blocks;
  }

  static fromEntries(entries: Iterable<[string, string]>): VoxelWorld | null {
    const blocks = new Map<string, BlockId>();
    for (const [k, id] of entries) {
      if (!isBlockId(id)) continue;
      const pos = parseBlockKey(k);
      if (!inBounds(pos.x, pos.y, pos.z)) continue;
      blocks.set(k, id);
    }
    return blocks.size > 0 ? new VoxelWorld(blocks) : null;
  }

  entries(): [string, BlockId][] {
    return [...this.blocks.entries()];
  }

  get(x: number, y: number, z: number): BlockId | null {
    return this.blocks.get(blockKey(x, y, z)) ?? null;
  }

  has(x: number, y: number, z: number): boolean {
    return this.blocks.has(blockKey(x, y, z));
  }

  place(x: number, y: number, z: number, id: BlockId): boolean {
    if (!inBounds(x, y, z)) return false;
    if (this.has(x, y, z)) return false;
    if (!this.hasNeighbor(x, y, z)) return false;
    this.blocks.set(blockKey(x, y, z), id);
    this.undoStack.push({ kind: "place", pos: { x, y, z } });
    return true;
  }

  remove(x: number, y: number, z: number): boolean {
    if (!inBounds(x, y, z)) return false;
    if (y === 0) return false;
    const previous = this.get(x, y, z);
    if (!previous) return false;
    this.blocks.delete(blockKey(x, y, z));
    this.undoStack.push({ kind: "remove", pos: { x, y, z }, previous });
    return true;
  }

  /** Devuelve la posición afectada, o null si no había nada que deshacer. */
  undo(): Vec3 | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    const { x, y, z } = action.pos;
    if (action.kind === "place") this.blocks.delete(blockKey(x, y, z));
    else this.blocks.set(blockKey(x, y, z), action.previous);
    return action.pos;
  }

  reset(): void {
    this.blocks = createDefaultBlocks();
    this.undoStack = [];
  }

  private hasNeighbor(x: number, y: number, z: number): boolean {
    return NEIGHBORS.some((d) => this.has(x + d.x, y + d.y, z + d.z));
  }
}
