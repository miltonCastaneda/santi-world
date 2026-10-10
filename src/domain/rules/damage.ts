import type { ItemId } from "../entities/items";
import type { ToolId } from "./tools";

/** A qué le pega el niño. El dragón se agrega con su incremento. */
export const TARGET_KINDS = ["animal", "zombie", "pigChicken", "wolf", "friendWolf"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/**
 * Qué pasa con un golpe (sin sangre ni dolor, spec experiencia-infantil): `boing` es un rebote con
 * sonido, `defeat` cuenta un golpe y, al llegar a los de `HITS_TO_DEFEAT`, el objetivo hace "poof";
 * `capture` guarda al cerdo-gallina en el inventario, `tame` domestica a un lobo salvaje y `happy`
 * es el saltito contento de un lobo amigo (nunca recibe daño).
 */
export type HitOutcome = "none" | "boing" | "defeat" | "capture" | "tame" | "happy";

/** Tabla de herramientas sobre criaturas (design D11). El Arco actúa con flechas, no de cerca. */
export const MELEE: Readonly<Record<ToolId, Readonly<Record<TargetKind, HitOutcome>>>> = {
  hand: { animal: "boing", zombie: "defeat", pigChicken: "capture", wolf: "boing", friendWolf: "happy" },
  pickaxe: { animal: "boing", zombie: "defeat", pigChicken: "capture", wolf: "boing", friendWolf: "happy" },
  sword: { animal: "defeat", zombie: "defeat", pigChicken: "capture", wolf: "defeat", friendWolf: "happy" },
  bow: { animal: "none", zombie: "none", pigChicken: "capture", wolf: "none", friendWolf: "none" },
  collar: { animal: "boing", zombie: "none", pigChicken: "capture", wolf: "tame", friendWolf: "happy" },
};

/** Golpes que hacen falta para el "poof": **zombi = 1 golpe**; un animal de granja, 1 espadazo; un lobo salvaje, 2. */
export const HITS_TO_DEFEAT: Readonly<Record<TargetKind, number>> = { animal: 1, zombie: 1, pigChicken: Infinity, wolf: 2, friendWolf: Infinity };

/** Lo que queda en el lugar tras el "poof": carne de los animales de granja (nunca del cerdo-gallina ni de los lobos). */
export const DROPS: Readonly<Record<TargetKind, ItemId | null>> = { animal: "meat", zombie: null, pigChicken: null, wolf: null, friendWolf: null };

export type HitResult = { outcome: HitOutcome; defeated: boolean; hits: number; drop: ItemId | null };

/** Resultado de un golpe sobre un objetivo que ya recibió `hitsBefore` golpes. */
export function resolveHit(tool: ToolId, target: TargetKind, hitsBefore = 0): HitResult {
  const outcome = MELEE[tool][target];
  if (outcome !== "defeat") return { outcome, defeated: false, hits: hitsBefore, drop: null };
  const hits = hitsBefore + 1;
  const defeated = hits >= HITS_TO_DEFEAT[target];
  return { outcome, defeated, hits, drop: defeated ? DROPS[target] : null };
}
