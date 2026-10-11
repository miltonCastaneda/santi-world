/**
 * Catálogo de bloques. El número de cada bloque es su posición en BLOCK_IDS más 1 (0 es aire) y se
 * guarda en los chunks: solo se agregan bloques al final y nunca se reordenan.
 */
export const BLOCK_IDS = [
  "grass",
  "dirt",
  "stone",
  "wood",
  "water",
  "red",
  "blue",
  "yellow",
  "planks",
  "leaves",
  "fence",
  "torch",
  "diamond_ore",
  "sand",
  "snow",
  "wool",
] as const;

export type BlockId = (typeof BLOCK_IDS)[number];

export const AIR = 0;

export type BlockShape = "cube" | "fence" | "torch";

export type TileSet = { top: string; side: string; bottom: string };

export type BlockDef = {
  id: BlockId;
  /** Número guardado en los chunks. */
  num: number;
  name: string;
  /** Color plano del HUD y de respaldo cuando no hay textura. */
  color: number;
  shape: BlockShape;
  /** Ocupa espacio para la física. */
  solid: boolean;
  /** Tapa por completo las caras vecinas y la luz. */
  opaque: boolean;
  /** Se dibuja en la pasada transparente (agua, hojas). */
  transparent: boolean;
  /** Altura de colisión en bloques (la cerca no se puede saltar). */
  collisionHeight: number;
  /** Luz que emite (0 a 15). */
  light: number;
  /** El niño lo puede elegir en la barra de bloques (ilimitado). */
  buildable: boolean;
  tiles: TileSet;
};

const same = (tile: string): TileSet => ({ top: tile, side: tile, bottom: tile });

type BlockProps = Omit<BlockDef, "id" | "num">;

const cube = (name: string, color: number, tiles: TileSet, extra: Partial<BlockProps> = {}): BlockProps => ({
  name,
  color,
  shape: "cube",
  solid: true,
  opaque: true,
  transparent: false,
  collisionHeight: 1,
  light: 0,
  buildable: true,
  tiles,
  ...extra,
});

const PROPS: Record<BlockId, BlockProps> = {
  grass: cube("Hierba", 0x5cb85c, { top: "grass_top", side: "grass_side", bottom: "dirt" }),
  dirt: cube("Tierra", 0x8b5a2b, same("dirt")),
  stone: cube("Piedra", 0x8a8f99, same("stone")),
  wood: cube("Madera", 0xa86b32, { top: "log_top", side: "log_side", bottom: "log_top" }),
  water: cube("Agua", 0x3aa0d8, same("water"), { solid: false, opaque: false, transparent: true, collisionHeight: 0 }),
  red: cube("Rojo", 0xe74c3c, same("red")),
  blue: cube("Azul", 0x4a7dff, same("blue")),
  yellow: cube("Amarillo", 0xf4d03f, same("yellow")),
  planks: cube("Tablones", 0xc8955a, same("planks")),
  leaves: cube("Hojas", 0x3f9b3a, same("leaves"), { opaque: false, transparent: true }),
  fence: cube("Cerca", 0xb07a45, same("planks"), { shape: "fence", opaque: false, collisionHeight: 1.5 }),
  torch: cube("Antorcha", 0xffb030, same("torch"), {
    shape: "torch",
    solid: false,
    opaque: false,
    collisionHeight: 0,
    light: 14,
  }),
  diamond_ore: cube("Diamante", 0x5fe0e0, same("diamond_ore"), { buildable: false }),
  sand: cube("Arena", 0xe8d79a, same("sand")),
  snow: cube("Nieve", 0xf4f8ff, { top: "snow", side: "snow_side", bottom: "stone" }),
  wool: cube("Lana", 0xf2f2f2, same("wool")),
};

export const BLOCKS = Object.fromEntries(
  BLOCK_IDS.map((id, i) => [id, { id, num: i + 1, ...PROPS[id] }]),
) as Record<BlockId, BlockDef>;

/** Definición por número; el índice 0 (aire) es undefined. */
export const BLOCKS_BY_NUM: readonly (BlockDef | undefined)[] = [undefined, ...BLOCK_IDS.map((id) => BLOCKS[id])];

/** Altura de colisión por número de bloque (0 si no es sólido): la física la consulta millones de veces. */
export const COLLISION_BY_NUM: readonly number[] = BLOCKS_BY_NUM.map((def) => (def?.solid ? def.collisionHeight : 0));

export const BUILDABLE_IDS: readonly BlockId[] = BLOCK_IDS.filter((id) => BLOCKS[id].buildable);

export const BLOCK_NUM = Object.fromEntries(BLOCK_IDS.map((id) => [id, BLOCKS[id].num])) as Record<BlockId, number>;

export function isBlockId(value: string): value is BlockId {
  return (BLOCK_IDS as readonly string[]).includes(value);
}

export function blockDef(num: number): BlockDef | undefined {
  return BLOCKS_BY_NUM[num];
}

export function isOpaque(num: number): boolean {
  return BLOCKS_BY_NUM[num]?.opaque ?? false;
}

export function isSolid(num: number): boolean {
  return BLOCKS_BY_NUM[num]?.solid ?? false;
}
