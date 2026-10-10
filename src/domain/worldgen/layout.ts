import { fbm2, noiseSeed } from "../../core/noise";
import { Rng } from "../../core/rng";
import { BLOCK_NUM } from "../blocks";

/** Sube cuando cambia el resultado del generador; cada mundo guarda la versión con la que se creó. */
export const GENERATOR_VERSION = 1;

export const WORLD_CHUNKS = 16;
export const WORLD_BLOCKS = WORLD_CHUNKS * 16;
/** Altura de la pradera y de la granja (bloque superior). */
export const BASE_Y = 10;
/** Superficie del agua del río y del estanque. */
export const WATER_Y = 9;

export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type Mountain = { x: number; z: number; r: number; peak: number };
export type Disk = { x: number; z: number; r: number };
export type River = { baseX: number; amp: number; freq: number; phase: number; halfWidth: number };

export type Zone = "farm" | "meadow" | "forestMountain" | "rockMountain" | "river" | "pond" | "border";

export type TreeFeature = { id: string; x: number; y: number; z: number; trunk: number; zone: "forestMountain" | "meadow" };
export type OreFeature = { id: string; x: number; y: number; z: number };

export type WorldLayout = {
  seed: number;
  farm: Rect;
  barn: Rect;
  forestMountain: Mountain;
  rockMountain: Mountain;
  river: River;
  pond: Disk;
  bridgeZ: number;
  trees: TreeFeature[];
  ores: OreFeature[];
};

export type Column = {
  /** Y del bloque superior sólido. */
  height: number;
  surface: number;
  /** Y de la superficie del agua sobre la columna, o -1. */
  waterTop: number;
  zone: Zone;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function riverCenterX(river: River, z: number): number {
  return river.baseX + river.amp * Math.sin(z * river.freq + river.phase);
}

function distToRect(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Altura y material de una columna. Es la única fuente de verdad del relieve. */
export function columnAt(layout: WorldLayout, x: number, z: number): Column {
  const s = layout.seed;
  let height = BASE_Y + Math.round((fbm2(s, x / 40, z / 40) - 0.5) * 4);
  let surface = BLOCK_NUM.grass;
  let zone: Zone = "meadow";
  let waterTop = -1;

  const farmDist = distToRect(layout.farm, x, z);
  if (farmDist < 6) {
    height = Math.round(BASE_Y + (height - BASE_Y) * smooth(farmDist / 6));
    if (farmDist === 0) zone = "farm";
  }

  for (const [m, kind] of [
    [layout.forestMountain, "forestMountain"],
    [layout.rockMountain, "rockMountain"],
  ] as const) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d >= m.r) continue;
    const k = smooth(1 - d / m.r);
    const bumpy = 0.7 + 0.3 * fbm2(s + 7, x / 12, z / 12);
    height += Math.round(m.peak * k * bumpy);
    if (k > 0.12) zone = kind;
    if (kind === "rockMountain" && k > 0.15) surface = height >= BASE_Y + 22 ? BLOCK_NUM.snow : BLOCK_NUM.stone;
  }

  const edge = Math.min(x, z, WORLD_BLOCKS - 1 - x, WORLD_BLOCKS - 1 - z);
  if (edge < 12) {
    height += Math.round(Math.pow(12 - edge, 1.3) * 0.9);
    zone = "border";
    if (edge < 4) surface = BLOCK_NUM.stone;
  }

  const rdx = Math.abs(x - riverCenterX(layout.river, z));
  const hw = layout.river.halfWidth;
  if (rdx <= hw) {
    height = Math.min(height, WATER_Y - (rdx <= hw - 1.5 ? 2 : 1));
    waterTop = WATER_Y;
    surface = BLOCK_NUM.sand;
    zone = "river";
  } else if (rdx <= hw + 1.5) {
    height = Math.min(height, BASE_Y);
    surface = BLOCK_NUM.sand;
  }

  const pd = Math.hypot(x - layout.pond.x, z - layout.pond.z);
  if (pd < layout.pond.r) {
    height = Math.min(height, WATER_Y - (pd < layout.pond.r - 2 ? 2 : 1));
    waterTop = WATER_Y;
    surface = BLOCK_NUM.sand;
    zone = "pond";
  } else if (pd < layout.pond.r + 1.5) {
    height = Math.min(height, BASE_Y);
    surface = BLOCK_NUM.sand;
  }

  return { height: clamp(height, 1, 58), surface, waterTop, zone };
}

/** Calcula el plano del mundo (zonas y objetos con ID) a partir de la semilla. */
export function createLayout(seed: string | number): WorldLayout {
  const rng = new Rng(`${seed}:layout`);
  const fx = 110 + rng.int(-4, 4);
  const fz = 124 + rng.int(-4, 4);
  const farm: Rect = { x0: fx, z0: fz, x1: fx + 36, z1: fz + 28 };
  const barn: Rect = { x0: farm.x1 - 9, z0: farm.z0 + 2, x1: farm.x1 - 3, z1: farm.z0 + 7 };

  const layout: WorldLayout = {
    seed: noiseSeed(seed),
    farm,
    barn,
    forestMountain: { x: 92 + rng.int(-8, 8), z: 50 + rng.int(-5, 5), r: 44, peak: 24 },
    rockMountain: { x: 214 + rng.int(-5, 5), z: 112 + rng.int(-8, 8), r: 36, peak: 30 },
    river: { baseX: 162, amp: 5, freq: 0.04 + rng.range(0, 0.02), phase: rng.range(0, Math.PI * 2), halfWidth: 3 },
    pond: { x: 94 + rng.int(-3, 3), z: 176 + rng.int(-3, 3), r: 7 },
    bridgeZ: Math.round((farm.z0 + farm.z1) / 2),
    trees: [],
    ores: [],
  };

  layout.trees = placeTrees(layout, new Rng(`${seed}:trees`));
  layout.ores = placeOres(layout, new Rng(`${seed}:ores`));
  return layout;
}

function placeTrees(layout: WorldLayout, rng: Rng): TreeFeature[] {
  const trees: TreeFeature[] = [];
  const farFromOthers = (x: number, z: number) => trees.every((t) => Math.hypot(t.x - x, t.z - z) >= 4);
  const add = (x: number, z: number, zone: TreeFeature["zone"]) => {
    const col = columnAt(layout, x, z);
    trees.push({ id: `T${trees.length}`, x, y: col.height, z, trunk: rng.int(4, 5), zone });
  };

  const m = layout.forestMountain;
  for (let i = 0; i < 600 && trees.length < 36; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * m.r * 0.85;
    const x = Math.round(m.x + Math.cos(a) * d);
    const z = Math.round(m.z + Math.sin(a) * d);
    const col = columnAt(layout, x, z);
    if (col.zone !== "forestMountain" || col.surface !== BLOCK_NUM.grass || col.height > 48) continue;
    if (farFromOthers(x, z)) add(x, z, "forestMountain");
  }

  let meadow = 0;
  for (let i = 0; i < 600 && meadow < 14; i++) {
    const x = rng.int(16, WORLD_BLOCKS - 17);
    const z = rng.int(16, WORLD_BLOCKS - 17);
    const col = columnAt(layout, x, z);
    if (col.zone !== "meadow" || col.surface !== BLOCK_NUM.grass) continue;
    if (distToRect(layout.farm, x, z) < 6) continue;
    if (!farFromOthers(x, z)) continue;
    add(x, z, "meadow");
    meadow++;
  }
  return trees;
}

function placeOres(layout: WorldLayout, rng: Rng): OreFeature[] {
  const ores: OreFeature[] = [];
  const m = layout.rockMountain;
  for (let i = 0; i < 800 && ores.length < 16; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * m.r * 0.7;
    const x = Math.round(m.x + Math.cos(a) * d);
    const z = Math.round(m.z + Math.sin(a) * d);
    const col = columnAt(layout, x, z);
    if (col.zone !== "rockMountain" || col.surface === BLOCK_NUM.grass) continue;
    if (ores.some((o) => o.x === x && o.z === z)) continue;
    const depth = col.surface === BLOCK_NUM.snow ? rng.int(1, 2) : rng.int(0, 2);
    ores.push({ id: `O${ores.length}`, x, y: col.height - depth, z });
  }
  return ores;
}
