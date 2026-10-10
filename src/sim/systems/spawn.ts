import type { Vec3 } from "../../core/math";
import { Rng } from "../../core/rng";
import { ZOMBIE } from "../../domain/entities/zombie";
import { isWalkable, type PathAgent, type PathWorld } from "./pathfinding";

/** Uno cada 20 s hasta 8 a la vez (design D10). */
export const SPAWN_EVERY_MS = 20_000;
export const MAX_ZOMBIES = 8;
/** Siempre a más de 24 bloques del personaje (spec "Distancia de aparición"). */
export const MIN_SPAWN_DISTANCE = 24;
/** Con luz de antorcha de 8 o más no aparecen (una antorcha a 6 bloques o menos). */
export const SAFE_BLOCK_LIGHT = 8;
const RING: readonly [number, number] = [MIN_SPAWN_DISTANCE + 3, 40];
const FIRST_SPAWN_MS = 8000;
const RETRY_MS = 2000;
const CANDIDATES = 10;

export const ZOMBIE_AGENT: PathAgent = { height: ZOMBIE.height, swims: false };

export type SpawnWorld = PathWorld & {
  size: number;
  /** Altura del bloque más alto de la columna (techos incluidos). */
  surfaceY(x: number, z: number): number;
  /** Suelo natural (hierba, tierra, arena, nieve o piedra que no puso el niño). */
  isNaturalGround(x: number, y: number, z: number): boolean;
  blockLight(x: number, y: number, z: number): number;
};

/**
 * Celda donde puede aparecer un zombi: de pie sobre el bloque más alto de la columna (nada encima, así
 * que nunca dentro de una casa techada), sobre suelo natural, con espacio para su cuerpo y lejos de
 * la luz de las antorchas.
 */
export function canSpawnAt(w: SpawnWorld, x: number, y: number, z: number): boolean {
  if (x < 1 || z < 1 || x >= w.size - 1 || z >= w.size - 1) return false;
  if (y !== w.surfaceY(x, z) + 1) return false;
  if (!w.isNaturalGround(x, y - 1, z)) return false;
  if (!isWalkable(w, x, y, z, ZOMBIE_AGENT)) return false;
  return w.blockLight(x, y, z) < SAFE_BLOCK_LIGHT;
}

/** Decide cuándo y dónde aparece el próximo zombi. Determinista con la semilla del mundo. */
export class NightSpawner {
  private rng: Rng;
  private nextAt: number | null = null;

  constructor(seed: string) {
    this.rng = new Rng(`${seed}:night`);
  }

  reset(seed: string): void {
    this.rng = new Rng(`${seed}:night`);
    this.nextAt = null;
  }

  /** Un paso: devuelve dónde aparece un zombi ahora, o null. `active` es "es de noche y no es tranquila". */
  step(now: number, active: boolean, count: number, player: Vec3, world: SpawnWorld): Vec3 | null {
    if (!active) {
      this.nextAt = null;
      return null;
    }
    if (this.nextAt === null) this.nextAt = now + FIRST_SPAWN_MS;
    if (count >= MAX_ZOMBIES) {
      // Lleno: el próximo llega 20 s después de que se vaya uno.
      this.nextAt = now + SPAWN_EVERY_MS;
      return null;
    }
    if (now < this.nextAt) return null;
    const spot = this.findSpot(player, world);
    this.nextAt = now + (spot ? SPAWN_EVERY_MS : RETRY_MS);
    return spot;
  }

  private findSpot(player: Vec3, world: SpawnWorld): Vec3 | null {
    for (let i = 0; i < CANDIDATES; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(RING[0], RING[1]);
      const x = Math.floor(player.x + Math.sin(a) * d);
      const z = Math.floor(player.z + Math.cos(a) * d);
      if (x < 1 || z < 1 || x >= world.size - 1 || z >= world.size - 1) continue;
      const y = world.surfaceY(x, z) + 1;
      const pos = { x: x + 0.5, y, z: z + 0.5 };
      if (Math.hypot(pos.x - player.x, pos.z - player.z) <= MIN_SPAWN_DISTANCE) continue;
      if (canSpawnAt(world, x, y, z)) return pos;
    }
    return null;
  }
}
