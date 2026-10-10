import type { Vec3 } from "../core/math";
import type { Entity } from "../domain/entities/entityStore";
import { isItemId, ITEMS, type ItemId } from "../domain/entities/items";
import { PIG_CHICKEN, PIG_CHICKEN_MACHINE } from "../domain/entities/pigChicken";
import { isHomeId, isSpeciesId, SPECIES } from "../domain/entities/species";
import { FRIEND_WOLF_MACHINE, WILD_WOLF_MACHINE, WOLF } from "../domain/entities/wolf";
import type { EntitySnapshot } from "../domain/repository/model";

type AnimalData = { yaw: number; seq: number; untilIn: number; soundIn: number; enteredAgo: number };
type WolfData = AnimalData & { role?: "follow" | "guard"; huntDay: number; huntFrac: number; hits: number };

/** Entidad a guardar. Los tiempos se guardan relativos (el reloj de la simulación vuelve a 0 al abrir). */
export function entityToSnapshot(e: Entity, worldId: string, now: number): EntitySnapshot | null {
  // La carne sin recoger se conserva (spec "Carne no recogida").
  if (isItemId(e.species)) {
    return { id: e.id, worldId, kind: "item", species: e.species, pos: { ...e.body.pos }, vel: { x: 0, y: 0, z: 0 }, state: "", data: { seq: e.seq } };
  }
  // El lobo amigo sigue siendo amigo al volver a abrir el mundo (spec "Lobo amigo persistente").
  if (e.species === "wolf" && e.brain) {
    const data: WolfData = {
      ...timing(e, now),
      role: e.role,
      huntDay: e.huntDay ?? 0,
      huntFrac: e.huntFrac ?? 0.5,
      hits: e.hits ?? 0,
    };
    return { id: e.id, worldId, kind: "wolf", species: "wolf", pos: { ...e.body.pos }, vel: { ...e.body.vel }, state: e.brain.state, slotId: e.slotId, homeId: e.home, tamed: e.tamed === true, data };
  }
  if (e.species === "pigChicken" && e.brain) {
    return { id: e.id, worldId, kind: "pigChicken", species: "pigChicken", pos: { ...e.body.pos }, vel: { ...e.body.vel }, state: e.brain.state, slotId: e.slotId, homeId: e.home, data: timing(e, now) };
  }
  // Los zombis y el dragón no se guardan: de noche vuelven a aparecer.
  if (!isSpeciesId(e.species) || !e.brain) return null;
  const data: AnimalData = timing(e, now);
  return {
    id: e.id,
    worldId,
    kind: "animal",
    species: e.species,
    pos: { ...e.body.pos },
    vel: { ...e.body.vel },
    state: e.brain.state,
    slotId: e.slotId,
    homeId: e.home,
    data,
  };
}

function timing(e: Entity, now: number): AnimalData {
  const brain = e.brain!;
  return {
    yaw: e.yaw,
    seq: e.seq,
    untilIn: Math.max(0, brain.until - now),
    soundIn: Math.max(0, (e.nextSoundAt ?? now) - now),
    enteredAgo: Math.max(0, now - brain.enteredAt),
  };
}

function wolfFromSnapshot(s: EntitySnapshot, now: number): Entity {
  const tamed = s.tamed === true;
  const machine = tamed ? FRIEND_WOLF_MACHINE : WILD_WOLF_MACHINE;
  const d = (s.data ?? {}) as Partial<WolfData>;
  // Un estado que ya no existe (o la caza a medias) vuelve al reposo.
  const state = machine.states[s.state] && s.state !== "hunt" && s.state !== "stalk" ? s.state : "idle";
  return {
    id: s.id,
    seq: d.seq ?? 0,
    species: "wolf",
    threat: !tamed,
    tamed,
    role: tamed ? (d.role === "guard" ? "guard" : "follow") : undefined,
    body: { pos: { ...s.pos }, vel: { ...s.vel }, halfWidth: WOLF.halfWidth, height: WOLF.height, onGround: false },
    yaw: d.yaw ?? 0,
    brain: { state, enteredAt: now - (d.enteredAgo ?? 0), until: now + (d.untilIn ?? 0) },
    slotId: s.slotId,
    home: tamed ? "farm" : "den",
    path: null,
    pathStatus: "none",
    goal: null,
    dest: null,
    hopFails: 0,
    targetId: null,
    huntDay: d.huntDay ?? 0,
    huntFrac: d.huntFrac ?? 0.5,
    hits: d.hits ?? 0,
    nextSoundAt: now + (d.soundIn ?? 0),
    anim: "idle",
    fleeDir: null,
  };
}

/** Uno que estaba volando (o huyendo) vuelve aterrizando: el arco no se guarda. */
function pigChickenFromSnapshot(s: EntitySnapshot, now: number): Entity {
  const d = (s.data ?? {}) as Partial<AnimalData>;
  const airborne = s.state === "fly" || s.state === "flee" || s.state === "land";
  const state = airborne ? "land" : PIG_CHICKEN_MACHINE.states[s.state] ? s.state : "idle";
  return {
    id: s.id,
    seq: d.seq ?? 0,
    species: "pigChicken",
    body: { pos: { ...s.pos }, vel: { x: 0, y: 0, z: 0 }, halfWidth: PIG_CHICKEN.halfWidth, height: PIG_CHICKEN.height, onGround: false },
    yaw: d.yaw ?? 0,
    brain: airborne ? { state, enteredAt: now, until: now + PIG_CHICKEN_MACHINE.states.land.ms[0] } : { state, enteredAt: now - (d.enteredAgo ?? 0), until: now + (d.untilIn ?? 0) },
    slotId: s.slotId,
    home: "farm",
    goal: null,
    flight: null,
    nextSoundAt: now + (d.soundIn ?? 0),
    anim: "idle",
    fleeDir: null,
  };
}

/** Entidad guardada a entidad viva. Devuelve null si la especie o el estado ya no existen. */
export function entityFromSnapshot(s: EntitySnapshot, now: number): Entity | null {
  if (s.kind === "item") return isItemId(s.species) ? { ...itemEntity(s.id, s.species, s.pos), seq: Number(s.data?.seq ?? 0) } : null;
  if (s.kind === "wolf") return s.species === "wolf" ? wolfFromSnapshot(s, now) : null;
  if (s.kind === "pigChicken") return s.species === "pigChicken" ? pigChickenFromSnapshot(s, now) : null;
  if (s.kind !== "animal" || !isSpeciesId(s.species)) return null;
  const def = SPECIES[s.species];
  if (!def.machine.states[s.state]) return null;
  const d = (s.data ?? {}) as Partial<AnimalData>;
  return {
    id: s.id,
    seq: d.seq ?? 0,
    species: s.species,
    body: { pos: { ...s.pos }, vel: { ...s.vel }, halfWidth: def.halfWidth, height: def.height, onGround: false },
    yaw: d.yaw ?? 0,
    brain: { state: s.state, enteredAt: now - (d.enteredAgo ?? 0), until: now + (d.untilIn ?? 0) },
    slotId: s.slotId,
    home: isHomeId(s.homeId) ? s.homeId : def.home,
    path: null,
    pathStatus: "none",
    goal: null,
    leaderId: null,
    nextSoundAt: now + (d.soundIn ?? 0),
    anim: "idle",
    fleeDir: null,
  };
}

/** Objeto flotante quieto (no tiene física: queda donde cayó). */
export function itemEntity(id: string, item: ItemId, pos: Vec3): Omit<Entity, "seq"> {
  const def = ITEMS[item];
  return { id, species: item, body: { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, halfWidth: def.halfWidth, height: def.height, onGround: true }, yaw: 0 };
}
