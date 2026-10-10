import type { ResourceId } from "../rules/inventory";

/** Objetos que quedan flotando en el mundo hasta que el niño los recoge (por ahora, la carne). */
export const ITEM_IDS = ["meat"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const ITEMS: Readonly<Record<ItemId, { halfWidth: number; height: number; resource: ResourceId }>> = {
  meat: { halfWidth: 0.25, height: 0.6, resource: "meat" },
};

/** Al pasar a esta distancia o menos (en XZ) el personaje recoge el objeto (spec "Recoger carne"). */
export const PICKUP_RADIUS = 1.5;
/** Un objeto recién caído no se recoge al pasar hasta pasado este tiempo (con un clic, enseguida). */
export const PICKUP_DELAY_MS = 800;

export function isItemId(value: string): value is ItemId {
  return (ITEM_IDS as readonly string[]).includes(value);
}
