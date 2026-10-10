/**
 * Inventario de recursos (spec recursos-e-inventario): diamantes, carne y cerdo-gallinas. Los
 * bloques de construcción son ilimitados y nunca pasan por aquí.
 */
export const RESOURCE_IDS = ["diamond", "meat", "pigChicken"] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Inventory = Record<ResourceId, number>;

export const RESOURCES: Readonly<Record<ResourceId, { name: string; icon: string }>> = {
  diamond: { name: "Diamantes", icon: "💎" },
  meat: { name: "Carne", icon: "🍖" },
  pigChicken: { name: "Cerdo-gallinas", icon: "🐷" },
};

/** Hasta esta cantidad el contador muestra además un punto por unidad (para quien no sabe contar). */
export const MAX_DOTS = 5;

export function emptyInventory(): Inventory {
  return { diamond: 0, meat: 0, pigChicken: 0 };
}

/** Inventario guardado a inventario válido: enteros de 0 en adelante, 0 si falta. */
export function sanitizeInventory(raw: Partial<Record<string, unknown>> | null | undefined): Inventory {
  const out = emptyInventory();
  for (const id of RESOURCE_IDS) {
    const v = Number(raw?.[id]);
    out[id] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  return out;
}

/** Puntos que acompañan al número: uno por unidad de 1 a 5; ninguno con 0 o más de 5. */
export function dotsFor(count: number): number {
  return count >= 1 && count <= MAX_DOTS ? count : 0;
}
