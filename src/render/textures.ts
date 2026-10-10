import { Rng } from "../core/rng";
import { TILE_NAMES, type TileName } from "./tiles";

export const TILE_SIZE = 16;

type Rgb = [number, number, number];
type Painter = (x: number, y: number, rng: Rng) => [number, number, number, number];

const hex = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const vary = (c: Rgb, rng: Rng, amount: number): [number, number, number, number] => {
  const k = 1 + (rng.next() - 0.5) * amount;
  return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), 255];
};
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const GRASS = hex(0x5fb848);
const DIRT = hex(0x8b5a2b);
const STONE = hex(0x8a8f99);
const BARK = hex(0x7a4e26);
const WOOD_IN = hex(0xc8955a);
const SNOW = hex(0xf4f8ff);

/** Borde de hierba o nieve irregular sobre otro material (caras laterales). */
const topped = (top: Rgb, below: Rgb, rng0: Rng): Painter => {
  const edge = Array.from({ length: TILE_SIZE }, () => 3 + Math.floor(rng0.next() * 3));
  return (x, y, rng) => (y < edge[x] ? vary(top, rng, 0.18) : vary(below, rng, 0.25));
};

function painters(): Record<TileName, Painter> {
  const r = new Rng("tiles");
  return {
    grass_top: (_x, _y, rng) => vary(GRASS, rng, 0.25),
    grass_side: topped(GRASS, DIRT, r),
    dirt: (_x, _y, rng) => vary(DIRT, rng, 0.3),
    stone: (x, y, rng) => vary(STONE, rng, (x * 7 + y * 3) % 11 === 0 ? 0.6 : 0.18),
    log_top: (x, y, rng) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.8) return vary(BARK, rng, 0.2);
      return vary(Math.floor(d) % 2 === 0 ? WOOD_IN : hex(0xb07a45), rng, 0.1);
    },
    log_side: (x, _y, rng) => vary(x % 4 === 0 ? hex(0x5e3a1c) : BARK, rng, 0.2),
    water: (x, y, rng) => {
      const ripple = (x + y * 2) % 7 === 0 ? 1.25 : 1;
      const c = vary(hex(0x3a8fd8), rng, 0.08);
      return [clamp(c[0] * ripple), clamp(c[1] * ripple), clamp(c[2] * ripple), 255];
    },
    red: (x, y, rng) => vary(hex(0xe74c3c), rng, x === 0 || y === 0 || x === 15 || y === 15 ? 0.4 : 0.08),
    blue: (x, y, rng) => vary(hex(0x4a7dff), rng, x === 0 || y === 0 || x === 15 || y === 15 ? 0.4 : 0.08),
    yellow: (x, y, rng) => vary(hex(0xf4d03f), rng, x === 0 || y === 0 || x === 15 || y === 15 ? 0.4 : 0.08),
    planks: (x, y, rng) => {
      const seam = y % 4 === 3 || (x === ((Math.floor(y / 4) * 5) % 16));
      return vary(seam ? hex(0x8f5e2e) : WOOD_IN, rng, 0.12);
    },
    leaves: (_x, _y, rng) => {
      if (rng.next() < 0.12) return [0, 0, 0, 0];
      return vary(hex(0x3f9b3a), rng, 0.35);
    },
    torch: (x, y, rng) => {
      if (y < 5) return vary(y < 2 ? hex(0xfff2a0) : hex(0xffa020), rng, 0.15);
      return vary(hex(0x7a4e26), rng, 0.1 + (x % 3) * 0.02);
    },
    diamond_ore: (x, y, rng) => {
      const gem = (x * 5 + y * 3) % 9 === 0 || (x * 3 + y * 7) % 13 === 0;
      return gem ? vary(hex(0x5fe0e0), rng, 0.2) : vary(STONE, rng, 0.18);
    },
    sand: (_x, _y, rng) => vary(hex(0xe8d79a), rng, 0.12),
    snow: (_x, _y, rng) => vary(SNOW, rng, 0.05),
    snow_side: topped(SNOW, STONE, r),
    wool: (x, y, rng) => vary(hex(0xf2f2f2), rng, (x + y) % 3 === 0 ? 0.12 : 0.05),
  };
}

/**
 * Genera los tiles como RGBA consecutivos (una capa de 16x16 por tile, en el orden de TILE_NAMES).
 * Son pixel-art procedural propio (CC0); ver docs/assets.md.
 */
export function generateTiles(): Uint8Array<ArrayBuffer> {
  const p = painters();
  const out = new Uint8Array(TILE_SIZE * TILE_SIZE * 4 * TILE_NAMES.length);
  TILE_NAMES.forEach((name, layer) => {
    const rng = new Rng(`tile:${name}`);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const px = p[name](x, y, rng);
        // La fila 0 de la textura es la parte de abajo del tile (v = 0).
        const i = ((layer * TILE_SIZE + (TILE_SIZE - 1 - y)) * TILE_SIZE + x) * 4;
        out.set(px, i);
      }
    }
  });
  return out;
}
