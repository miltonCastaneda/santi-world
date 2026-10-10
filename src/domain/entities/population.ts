import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import { BLOCK_NUM } from "../blocks";
import { columnAt, inRect, type Rect, type WorldLayout } from "../worldgen/layout";
import { PIG_CHICKEN } from "./pigChicken";
import type { HomeId, SpeciesId } from "./species";
import { WOLF } from "./wolf";

/** Lugar de origen de un animal o un lobo (design D10): especie, hogar y punto de aparición (celda X, Z). */
export type SpawnSlot = { id: string; species: SpeciesId | "wolf" | "pigChicken"; home: HomeId; x: number; z: number };

export type Home = { id: HomeId; center: Vec3; /** Cercado del hogar, si tiene. */ rect: Rect | null };

/** Población inicial (spec "Población inicial"): 15 animales domésticos. */
export const INITIAL_POPULATION: Readonly<Record<SpeciesId, number>> = { sheep: 3, cow: 2, goat: 2, hen: 3, chick: 3, duck: 2 };

export function homesOf(layout: WorldLayout): Record<HomeId, Home> {
  const { farm, pond, forestMountain: m } = layout;
  return {
    farm: { id: "farm", center: { x: (farm.x0 + farm.x1 + 1) / 2, y: 0, z: (farm.z0 + farm.z1 + 1) / 2 }, rect: farm },
    pond: { id: "pond", center: { x: pond.x + 0.5, y: 0, z: pond.z + 0.5 }, rect: null },
    den: { id: "den", center: { x: m.x + 0.5, y: 0, z: m.z + 0.5 }, rect: null },
  };
}

/** Dentro del cercado de la granja (sin contar la cerca). */
export function insideFarm(layout: WorldLayout, x: number, z: number): boolean {
  const f = layout.farm;
  return x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1;
}

/** Slots deterministas a partir de la semilla: animales de granja en el cercado y patos en el estanque. */
export function createSpawnSlots(layout: WorldLayout, seed: string): SpawnSlot[] {
  const rng = new Rng(`${seed}:spawn-slots`);
  const { farm, barn, pond } = layout;
  const slots: SpawnSlot[] = [];
  const taken = (x: number, z: number) => slots.some((s) => Math.abs(s.x - x) < 2 && Math.abs(s.z - z) < 2);
  // Lejos de la cerca, del establo y del centro (ahí aparece el personaje).
  const barnZone: Rect = { x0: barn.x0 - 2, z0: barn.z0 - 2, x1: barn.x1 + 2, z1: barn.z1 + 3 };
  const cx = Math.floor((farm.x0 + farm.x1) / 2);
  const cz = Math.floor((farm.z0 + farm.z1) / 2);
  const farmSpot = (): { x: number; z: number } => {
    for (let i = 0; i < 200; i++) {
      const x = rng.int(farm.x0 + 3, farm.x1 - 3);
      const z = rng.int(farm.z0 + 3, farm.z1 - 3);
      if (inRect(barnZone, x, z) || (Math.abs(x - cx) < 3 && Math.abs(z - cz) < 3) || taken(x, z)) continue;
      return { x, z };
    }
    return { x: farm.x0 + 3 + slots.length, z: farm.z0 + 3 };
  };

  const add = (species: SpeciesId, home: HomeId, at: { x: number; z: number }) => {
    const n = slots.filter((s) => s.species === species).length;
    slots.push({ id: `${species}-${n}`, species, home, x: at.x, z: at.z });
  };

  for (const species of ["sheep", "cow", "goat", "hen"] as const) {
    for (let i = 0; i < INITIAL_POPULATION[species]; i++) add(species, "farm", farmSpot());
  }
  const hens = slots.filter((s) => s.species === "hen");
  for (let i = 0; i < INITIAL_POPULATION.chick; i++) {
    const h = hens[i % hens.length];
    add("chick", "farm", { x: h.x + (i % 2 === 0 ? 1 : -1), z: h.z + 1 });
  }
  for (let i = 0; i < INITIAL_POPULATION.duck; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(1, pond.r - 3);
    add("duck", "pond", { x: Math.round(pond.x + Math.cos(a) * d), z: Math.round(pond.z + Math.sin(a) * d) });
  }
  slots.push(...wolfSlots(layout, seed));
  // Con su propio RNG: los slots de antes no cambian (los mundos guardados los reconocen).
  const pigRng = new Rng(`${seed}:pig-chicken-slots`);
  for (let n = 0; n < PIG_CHICKEN.maxFree; n++) {
    let at = { x: farm.x0 + 3 + n * 2, z: farm.z1 - 3 };
    for (let i = 0; i < 200; i++) {
      const x = pigRng.int(farm.x0 + 3, farm.x1 - 3);
      const z = pigRng.int(farm.z0 + 3, farm.z1 - 3);
      if (inRect(barnZone, x, z) || (Math.abs(x - cx) < 3 && Math.abs(z - cz) < 3) || taken(x, z)) continue;
      at = { x, z };
      break;
    }
    slots.push({ id: `pigChicken-${n}`, species: "pigChicken", home: "farm", x: at.x, z: at.z });
  }
  return slots;
}

/**
 * Entre 4 y 6 lobos en la montaña boscosa, a 12 bloques o menos de su centro (spec "Lobos en su
 * montaña"), sobre pasto y lejos de los árboles (debajo de la copa quedarían sobre las hojas).
 */
function wolfSlots(layout: WorldLayout, seed: string): SpawnSlot[] {
  const rng = new Rng(`${seed}:wolves`);
  const m = layout.forestMountain;
  const count = rng.int(WOLF.count[0], WOLF.count[1]);
  const out: SpawnSlot[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 12);
    const x = Math.round(m.x + Math.cos(a) * d);
    const z = Math.round(m.z + Math.sin(a) * d);
    if (columnAt(layout, x, z).surface !== BLOCK_NUM.grass) continue;
    if (layout.trees.some((t) => Math.abs(t.x - x) <= 3 && Math.abs(t.z - z) <= 3)) continue;
    if (out.some((s) => Math.abs(s.x - x) < 2 && Math.abs(s.z - z) < 2)) continue;
    out.push({ id: `wolf-${out.length}`, species: "wolf", home: "den", x, z });
  }
  return out;
}
