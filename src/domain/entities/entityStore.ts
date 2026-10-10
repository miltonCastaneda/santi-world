import type { Vec3 } from "../../core/math";
import type { Body } from "../physics/collide";
import type { Brain } from "./fsm";
import type { ItemId } from "./items";
import type { HomeId, SpeciesId } from "./species";
import type { WolfRole } from "./wolf";

export type EntityAnim = "idle" | "walk" | "run" | "graze" | "rest" | "swim" | "fly";

/** Animales de granja, cerdo-gallinas, lobos, zombis, el dragón, objetos para recoger y el marcador de amenaza de las pruebas. */
export type EntityKind = SpeciesId | ItemId | "pigChicken" | "wolf" | "zombie" | "dragon" | "threat";

/** Vuelo en arco del cerdo-gallina: de dónde sale, adónde va (en XZ) y la altura de la cima. */
export type Flight = { from: Vec3; to: Vec3; peak: number };

/** Camino calculado por el pathfinding: puntos de pies (centro de celda) y versiones de los chunks que cruza. */
export type Path = { points: Vec3[]; chunks: Map<string, number> };

export type PathStatus = "none" | "pending" | "following" | "done" | "failed";

/** Una entidad viva del mundo (design D6: objetos planos con componentes opcionales). */
export type Entity = {
  id: string;
  /** Orden de creación: reparte el "pensar" entre ticks y fija el orden de iteración. */
  seq: number;
  species: EntityKind;
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
  /** A quién persigue un zombi ("player" o el id de un animal). */
  targetId?: string | null;
  /** Objetivos sin camino y hasta cuándo no se vuelven a intentar. */
  unreachable?: Map<string, number>;
  /** Cuándo pidió el último camino (se renueva si el objetivo se mueve). */
  pathAt?: number;
  /** Momento en que hace "poof" (zombis al amanecer). */
  despawnAt?: number | null;
  /** Golpes recibidos (para las criaturas que necesitan más de uno). */
  hits?: number;
  /** Desde cuándo un objeto se recoge al pasar (el recién caído se ve un momento). */
  readyAt?: number;
  /** Lobo domesticado con el Collar (para siempre) y qué hace: seguir al niño o cuidar la granja. */
  tamed?: boolean;
  role?: WolfRole;
  /** Lobo salvaje: último día del juego en que salió a cazar, momento del día en que sale y hasta cuándo dura. */
  huntDay?: number;
  huntFrac?: number;
  huntUntil?: number;
  /** Destino lejano al que viaja por tramos (el camino de cada tramo cabe en el presupuesto del A*). */
  dest?: Vec3 | null;
  /** Tramos seguidos sin camino: al llegar a varios, se da por vencido. */
  hopFails?: number;
  flight?: Flight | null;
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
