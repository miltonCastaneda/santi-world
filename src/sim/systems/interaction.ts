import type { Entity, EntityStore } from "../../domain/entities/entityStore";
import { isItemId, PICKUP_RADIUS } from "../../domain/entities/items";
import type { Body } from "../../domain/physics/collide";

/** Diferencia de altura máxima para recoger un objeto al pasar (no se recoge desde un techo). */
const PICKUP_HEIGHT = 2;

/** Objetos que el personaje recoge al pasar: a `PICKUP_RADIUS` o menos en XZ, a su altura y ya listos. */
export function itemsInPickupRange(store: EntityStore, player: Body, now: number): Entity[] {
  return store.near(player.pos, PICKUP_RADIUS, (e) => isItemId(e.species) && (e.readyAt ?? 0) <= now && Math.abs(e.body.pos.y - player.pos.y) < PICKUP_HEIGHT);
}
