import { BLOCK_IDS, type BlockId } from "./blocks";

export const WORLD_SIZE = 32;
export const MAX_HEIGHT = 12;
export const STORAGE_KEY = "minecraf-de-santi-world-v2";

export type VoxelPos = { x: number; y: number; z: number };

export type UndoAction =
  | { kind: "place"; pos: VoxelPos; previous: BlockId | null }
  | { kind: "remove"; pos: VoxelPos; previous: BlockId };

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseKey(k: string): VoxelPos {
  const [x, y, z] = k.split(",").map(Number);
  return { x, y, z };
}

export function inBounds(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    x < WORLD_SIZE &&
    z >= 0 &&
    z < WORLD_SIZE &&
    y >= 0 &&
    y < MAX_HEIGHT
  );
}

export function createDefaultWorld(): Map<string, BlockId> {
  const blocks = new Map<string, BlockId>();

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const hill =
        1 +
        Math.floor(
          (Math.sin(x * 0.28) + Math.cos(z * 0.22) + Math.sin((x + z) * 0.15)) *
            0.7,
        );
      const height = Math.max(1, Math.min(3, hill));

      for (let y = 0; y < height; y++) {
        let id: BlockId = "dirt";
        if (y === height - 1) id = "grass";
        else if (y === 0) id = "stone";
        blocks.set(key(x, y, z), id);
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
      if (blocks.has(key(tx, y, tz))) {
        ground = y;
        break;
      }
    }
    if (ground < 0) continue;

    const trunkH = 3;
    for (let i = 1; i <= trunkH; i++) {
      const y = ground + i;
      if (inBounds(tx, y, tz)) blocks.set(key(tx, y, tz), "wood");
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
          blocks.set(key(x, y, z), "grass");
        }
      }
    }
  }

  return blocks;
}

export class World {
  blocks: Map<string, BlockId>;
  private undoStack: UndoAction[] = [];

  constructor(blocks: Map<string, BlockId>) {
    this.blocks = blocks;
  }

  get(x: number, y: number, z: number): BlockId | null {
    return this.blocks.get(key(x, y, z)) ?? null;
  }

  has(x: number, y: number, z: number): boolean {
    return this.blocks.has(key(x, y, z));
  }

  place(x: number, y: number, z: number, id: BlockId): boolean {
    if (!inBounds(x, y, z)) return false;
    if (this.has(x, y, z)) return false;
    if (!this.hasNeighbor(x, y, z)) return false;

    const previous = this.get(x, y, z);
    this.blocks.set(key(x, y, z), id);
    this.undoStack.push({ kind: "place", pos: { x, y, z }, previous });
    this.save();
    return true;
  }

  remove(x: number, y: number, z: number): boolean {
    if (!inBounds(x, y, z)) return false;
    if (y === 0) return false;
    const previous = this.get(x, y, z);
    if (!previous) return false;
    this.blocks.delete(key(x, y, z));
    this.undoStack.push({ kind: "remove", pos: { x, y, z }, previous });
    this.save();
    return true;
  }

  undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;
    const { x, y, z } = action.pos;
    if (action.kind === "place") {
      if (action.previous) this.blocks.set(key(x, y, z), action.previous);
      else this.blocks.delete(key(x, y, z));
    } else {
      this.blocks.set(key(x, y, z), action.previous);
    }
    this.save();
    return true;
  }

  reset(): void {
    this.blocks = createDefaultWorld();
    this.undoStack = [];
    this.save();
  }

  save(): void {
    const data: [string, BlockId][] = [...this.blocks.entries()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  static loadOrCreate(): World {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new World(createDefaultWorld());
    try {
      const parsed = JSON.parse(raw) as [string, string][];
      const blocks = new Map<string, BlockId>();
      for (const [k, id] of parsed) {
        if (!BLOCK_IDS.includes(id as BlockId)) continue;
        const pos = parseKey(k);
        if (!inBounds(pos.x, pos.y, pos.z)) continue;
        blocks.set(k, id as BlockId);
      }
      if (blocks.size === 0) return new World(createDefaultWorld());
      return new World(blocks);
    } catch {
      return new World(createDefaultWorld());
    }
  }

  private hasNeighbor(x: number, y: number, z: number): boolean {
    const dirs: VoxelPos[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];
    return dirs.some((d) => this.has(x + d.x, y + d.y, z + d.z));
  }
}
