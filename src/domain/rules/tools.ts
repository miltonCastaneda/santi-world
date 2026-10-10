export const TOOL_IDS = ["hand", "pickaxe", "sword", "bow", "collar"] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Qué hace cada herramienta sobre un bloque (design D11). Animales, enemigos y dragón llegan después. */
export type BlockAction = "place" | "break" | "arrow" | "none";

/** Animación del personaje al usar la herramienta. */
export type ToolSwing = "place" | "mine" | "strike" | "shoot" | "throw";

export type ToolDef = {
  id: ToolId;
  /** Ícono del HUD (el niño no lee: el nombre solo va en aria-label y en la guía). */
  icon: string;
  name: string;
  onBlock: BlockAction;
  swing: ToolSwing;
};

export const TOOLS: Record<ToolId, ToolDef> = {
  hand: { id: "hand", icon: "✋", name: "Mano", onBlock: "place", swing: "place" },
  pickaxe: { id: "pickaxe", icon: "⛏️", name: "Pico", onBlock: "break", swing: "mine" },
  sword: { id: "sword", icon: "⚔️", name: "Espada", onBlock: "none", swing: "strike" },
  bow: { id: "bow", icon: "🏹", name: "Arco", onBlock: "arrow", swing: "shoot" },
  collar: { id: "collar", icon: "📿", name: "Collar", onBlock: "none", swing: "throw" },
};

export function isToolId(value: string): value is ToolId {
  return (TOOL_IDS as readonly string[]).includes(value);
}

/** Alcance de la Mano y el Pico, en bloques, desde los ojos del personaje. */
export const REACH = 6;
