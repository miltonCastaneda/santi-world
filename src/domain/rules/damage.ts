import type { ToolId } from "./tools";

/** A qué le pega el niño. Lobos, cerdo-gallinas y el dragón se agregan con sus incrementos. */
export const TARGET_KINDS = ["animal", "zombie"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/**
 * Qué pasa con un golpe (sin sangre ni dolor, spec experiencia-infantil): `boing` es un rebote con
 * sonido, `defeat` cuenta un golpe y, al llegar a los de `HITS_TO_DEFEAT`, el objetivo hace "poof".
 */
export type HitOutcome = "none" | "boing" | "defeat";

/** Tabla de herramientas sobre criaturas (design D11). El Arco actúa con flechas, no de cerca. */
export const MELEE: Readonly<Record<ToolId, Readonly<Record<TargetKind, HitOutcome>>>> = {
  hand: { animal: "boing", zombie: "defeat" },
  pickaxe: { animal: "boing", zombie: "defeat" },
  sword: { animal: "boing", zombie: "defeat" },
  bow: { animal: "none", zombie: "none" },
  collar: { animal: "boing", zombie: "none" },
};

/** Golpes que hacen falta para el "poof": **zombi = 1 golpe**. */
export const HITS_TO_DEFEAT: Readonly<Record<TargetKind, number>> = { animal: Infinity, zombie: 1 };

/** Resultado de un golpe sobre un objetivo que ya recibió `hitsBefore` golpes. */
export function resolveHit(tool: ToolId, target: TargetKind, hitsBefore = 0): { outcome: HitOutcome; defeated: boolean; hits: number } {
  const outcome = MELEE[tool][target];
  if (outcome !== "defeat") return { outcome, defeated: false, hits: hitsBefore };
  const hits = hitsBefore + 1;
  return { outcome, defeated: hits >= HITS_TO_DEFEAT[target], hits };
}
