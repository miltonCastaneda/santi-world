export const BLOCK_IDS = [
  "grass",
  "dirt",
  "stone",
  "wood",
  "water",
  "red",
  "blue",
  "yellow",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

export type BlockDef = {
  id: BlockId;
  name: string;
  color: number;
};

export const BLOCKS: Record<BlockId, BlockDef> = {
  grass: { id: "grass", name: "Hierba", color: 0x5cb85c },
  dirt: { id: "dirt", name: "Tierra", color: 0x8b5a2b },
  stone: { id: "stone", name: "Piedra", color: 0x8a8f99 },
  wood: { id: "wood", name: "Madera", color: 0xa86b32 },
  water: { id: "water", name: "Agua", color: 0x3aa0d8 },
  red: { id: "red", name: "Rojo", color: 0xe74c3c },
  blue: { id: "blue", name: "Azul", color: 0x4a7dff },
  yellow: { id: "yellow", name: "Amarillo", color: 0xf4d03f },
};
