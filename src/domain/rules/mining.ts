import type { BlockId } from "../blocks";
import type { ResourceId } from "./inventory";
import type { ToolId } from "./tools";

/** Bloques que el Pico "mina": se vuelven otro bloque natural y suman un recurso. */
export const MINEABLE: Partial<Record<BlockId, { becomes: BlockId; resource: ResourceId }>> = {
  diamond_ore: { becomes: "stone", resource: "diamond" },
};

/** Los diamantes minados vuelven cada tantos días del juego (solo en piedra natural). */
export const REGROW_EVERY_DAYS = 3;

/** Qué pasa al usar `tool` sobre `block`: minarlo, o null si no es un mineral o la herramienta no mina. */
export function mineResult(tool: ToolId, block: BlockId | null): { becomes: BlockId; resource: ResourceId } | null {
  if (tool !== "pickaxe" || !block) return null;
  return MINEABLE[block] ?? null;
}

/** Al amanecer del día `dayCount` vuelven los diamantes: los días 4, 7, 10… (cada 3 días). */
export function regrowDue(dayCount: number): boolean {
  return dayCount > 1 && (dayCount - 1) % REGROW_EVERY_DAYS === 0;
}
