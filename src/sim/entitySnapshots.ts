import type { Entity } from "../domain/entities/entityStore";
import { isSpeciesId, SPECIES } from "../domain/entities/species";
import type { EntitySnapshot } from "../domain/repository/model";

type AnimalData = { yaw: number; seq: number; untilIn: number; soundIn: number; enteredAgo: number };

/** Entidad a guardar. Los tiempos se guardan relativos (el reloj de la simulación vuelve a 0 al abrir). */
export function entityToSnapshot(e: Entity, worldId: string, now: number): EntitySnapshot | null {
  if (e.species === "threat" || !e.brain) return null;
  const data: AnimalData = {
    yaw: e.yaw,
    seq: e.seq,
    untilIn: Math.max(0, e.brain.until - now),
    soundIn: Math.max(0, (e.nextSoundAt ?? now) - now),
    enteredAgo: Math.max(0, now - e.brain.enteredAt),
  };
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

/** Entidad guardada a entidad viva. Devuelve null si la especie o el estado ya no existen. */
export function entityFromSnapshot(s: EntitySnapshot, now: number): Entity | null {
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
    home: s.homeId === "farm" || s.homeId === "pond" ? s.homeId : def.home,
    path: null,
    pathStatus: "none",
    goal: null,
    leaderId: null,
    nextSoundAt: now + (d.soundIn ?? 0),
    anim: "idle",
    fleeDir: null,
  };
}
