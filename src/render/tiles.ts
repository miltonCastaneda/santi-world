import { BLOCKS_BY_NUM } from "../domain/blocks";

/** Orden de las capas del arreglo de texturas. Cada nombre es un tile de 16x16. */
export const TILE_NAMES = [
  "grass_top",
  "grass_side",
  "dirt",
  "stone",
  "log_top",
  "log_side",
  "water",
  "red",
  "blue",
  "yellow",
  "planks",
  "leaves",
  "torch",
  "diamond_ore",
  "sand",
  "snow",
  "snow_side",
  "wool",
] as const;

export type TileName = (typeof TILE_NAMES)[number];

const LAYER = new Map<string, number>(TILE_NAMES.map((n, i) => [n, i]));

export function tileLayer(name: string): number {
  const layer = LAYER.get(name);
  if (layer === undefined) throw new Error(`Tile desconocido: ${name}`);
  return layer;
}

/** Capas (arriba, lado, abajo) por número de bloque, precalculadas para el mesher. */
export const BLOCK_LAYERS: readonly (readonly [number, number, number] | undefined)[] = BLOCKS_BY_NUM.map((def) =>
  def ? ([tileLayer(def.tiles.top), tileLayer(def.tiles.side), tileLayer(def.tiles.bottom)] as const) : undefined,
);
