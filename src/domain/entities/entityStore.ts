import type { Vec3 } from "../../core/math";
import type { Body } from "../physics/collide";
import type { Brain } from "./fsm";
import type { HomeId, SpeciesId } from "./species";

export type EntityAnim = "idle" | "walk" | "run" | "graze" | "rest" | "swim";

/** Camino calculado por el pathfinding: puntos de pies (centro de celda) y versiones de los chunks que cruza. */
export type Path = { points: Vec3[]; chunks: Map<string, number> };

export type PathStatus = "none" | "pending" | "following" | "done" | "failed";

/** Una entidad viva del mundo (design D6: objetos planos con componentes opcionales). */
export type Entity = {
  id: string;
  /** Orden de creación: reparte el "pensar" entre ticks y fija el orden de iteración. */
  seq: number;
  species: SpeciesId | "threat";
  body: Body;
  yaw: number;
  /** Amenaza para los animales (lobos salvajes y zombis; en pruebas, un marcador). */
  threat?: boolean;
  brain?: Brain;
  slotId?: string;
  home?: HomeId;
  path?: Path | null;
  pathIndex?: number;
  pathStatus?: PathStatus;
  /** Destino del camino pedido (para saber si hay que pedir otro). */
  goal?: Vec3 | null;
  leaderId?: string | null;
  nextSoundAt?: number;
  anim?: EntityAnim;
  /** Huye en esta dirección (unitaria, en XZ). */
  fleeDir?: { x: number; z: number } | null;
};

const CELL = 8;
const cellKey = (cx: number, cz: number) => cx * 4096 + cz;

/**
 * Entidades por id, con un índice espacial de celdas de 8 bloques para buscar vecinos. La
 * iteración sigue el orden de creación, así la simulación es determinista.
 */
export class EntityStore {
  private readonly byId = new Map<string, Entity>();
  private readonly cells = new Map<number, Entity[]>();
  private nextSeq = 0;

  get size(): number {
    return this.byId.size;
  }

  all(): IterableIterator<Entity> {
    return this.byId.values();
  }

  get(id: string): Entity | undefined {
    return this.byId.get(id);
  }

  add(entity: Omit<Entity, "seq"> & { seq?: number }): Entity {
    if (this.byId.has(entity.id)) throw new Error(`Entidad repetida: ${entity.id}`);
    const e = { ...entity, seq: entity.seq ?? this.nextSeq } as Entity;
    this.nextSeq = Math.max(this.nextSeq, e.seq) + 1;
    this.byId.set(e.id, e);
    this.index(e);
    return e;
  }

  remove(id: string): Entity | undefined {
    const e = this.byId.get(id);
    if (!e) return undefined;
    this.byId.delete(id);
    this.reindex();
    return e;
  }

  clear(): void {
    this.byId.clear();
    this.cells.clear();
    this.nextSeq = 0;
  }

  /** Recalcula el índice espacial (una vez por tick: son pocas entidades). */
  reindex(): void {
    this.cells.clear();
    for (const e of this.byId.values()) this.index(e);
  }

  /** Entidades a `radius` bloques o menos (en XZ) de `pos`, en orden de creación. */
  near(pos: Vec3, radius: number, filter?: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    const c0x = Math.floor((pos.x - radius) / CELL);
    const c1x = Math.floor((pos.x + radius) / CELL);
    const c0z = Math.floor((pos.z - radius) / CELL);
    const c1z = Math.floor((pos.z + radius) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const e of this.cells.get(cellKey(cx, cz)) ?? []) {
          const d = Math.hypot(e.body.pos.x - pos.x, e.body.pos.z - pos.z);
          if (d <= radius && (!filter || filter(e))) out.push(e);
        }
      }
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  private index(e: Entity): void {
    const key = cellKey(Math.floor(e.body.pos.x / CELL), Math.floor(e.body.pos.z / CELL));
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push(e);
  }
}
