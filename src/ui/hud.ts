import { BLOCKS, BUILDABLE_IDS, type BlockId } from "../domain/blocks";
import { TOOL_IDS, TOOLS, type ToolId } from "../domain/rules/tools";
import type { Game, Selection } from "../sim/game";
import { MAX_HEARTS } from "../sim/player";

export type HudActions = {
  createWorld(): void;
  openWorlds(): void;
  /** Alterna el silencio y devuelve si quedó en silencio. */
  toggleMute(): boolean;
  /** Sonido corto de UI (respuesta inmediata a cada botón). */
  click(): void;
};

export type Hud = {
  setBusy(busy: boolean): void;
  setMuted(muted: boolean): void;
  /** Elige el bloque n (0 a 8) de la barra inferior. */
  selectSlot(index: number): void;
  cycleSlot(delta: 1 | -1): void;
};

const TOO_FAR_MS = 700;
/** Bloques que no se reconocen solo por el color. */
const BLOCK_ICONS: Partial<Record<BlockId, string>> = { torch: "🔥" };

function button(className: string, label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.textContent = icon;
  b.addEventListener("click", onClick);
  return b;
}

/**
 * HUD del niño según la referencia visual: herramientas en vertical a la derecha, bloques abajo al
 * centro, corazones arriba a la izquierda, botones grandes arriba a la derecha y ayuda de controles
 * abajo a la izquierda. Todo con íconos de 64 px o más; nada requiere leer.
 */
export function setupHud(game: Game, actions: HudActions): Hud {
  const el = (id: string) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Falta #${id} en la interfaz`);
    return node;
  };
  const toolbar = el("toolbar");
  const hotbar = el("hotbar");
  const hearts = el("hearts");
  const tooFar = el("too-far");
  const worldsBtn = el("worlds-btn") as HTMLButtonElement;
  const newWorldBtn = el("new-world-btn") as HTMLButtonElement;
  const muteBtn = el("mute-btn") as HTMLButtonElement;
  const send = game.enqueue.bind(game);
  const withClick = (fn: () => void) => () => {
    actions.click();
    fn();
  };

  const toolButtons = new Map<ToolId, HTMLButtonElement>();
  for (const id of TOOL_IDS) {
    const t = TOOLS[id];
    const b = button("tool-btn", t.name, t.icon, withClick(() => {
      showSelection({ ...game.selection, tool: id });
      send({ type: "selectTool", tool: id });
    }));
    b.dataset.tool = id;
    toolButtons.set(id, b);
    toolbar.append(b);
  }

  const blockButtons = new Map<BlockId, HTMLButtonElement>();
  BUILDABLE_IDS.forEach((id, i) => {
    const b = button("block-btn", BLOCKS[id].name, BLOCK_ICONS[id] ?? "", withClick(() => pickBlock(id)));
    b.style.background = `#${BLOCKS[id].color.toString(16).padStart(6, "0")}`;
    b.dataset.id = id;
    if (i < 9) {
      const key = document.createElement("span");
      key.className = "slot-key";
      key.textContent = String(i + 1);
      b.append(key);
    }
    blockButtons.set(id, b);
    hotbar.append(b);
  });

  const heartIcons: HTMLSpanElement[] = [];
  for (let i = 0; i < MAX_HEARTS; i++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = "❤️";
    heartIcons.push(h);
    hearts.append(h);
  }
  const showHearts = (n: number) => {
    heartIcons.forEach((h, i) => h.classList.toggle("empty", i >= n));
    hearts.dataset.hearts = String(n);
    hearts.setAttribute("aria-label", `${n} corazones`);
  };
  showHearts(game.player.hearts);
  game.events.on("heartsChanged", ({ hearts: n }) => showHearts(n));
  game.events.on("playerHit", () => {
    hearts.classList.remove("hit");
    void hearts.offsetWidth;
    hearts.classList.add("hit");
  });

  function showSelection(s: Selection): void {
    for (const [id, b] of toolButtons) b.classList.toggle("active", id === s.tool);
    for (const [id, b] of blockButtons) b.classList.toggle("selected", id === s.block && s.tool === "hand");
  }
  showSelection(game.selection);
  game.events.on("selectionChanged", showSelection);

  function pickBlock(id: BlockId): void {
    showSelection({ tool: "hand", block: id });
    send({ type: "selectBlock", block: id });
  }

  let tooFarTimer: ReturnType<typeof setTimeout> | null = null;
  game.events.on("tooFar", () => {
    tooFar.classList.add("show");
    if (tooFarTimer) clearTimeout(tooFarTimer);
    tooFarTimer = setTimeout(() => tooFar.classList.remove("show"), TOO_FAR_MS);
  });

  const bagBtn = el("bag-btn");
  bagBtn.addEventListener("click", withClick(() => send({ type: "toggleInventory" })));
  game.events.on("inventoryToggled", ({ open }) => bagBtn.setAttribute("aria-pressed", String(open)));
  // La mochila da un saltito cada vez que se guarda algo en ella.
  game.events.on("itemCollected", () => {
    bagBtn.classList.remove("got");
    void bagBtn.offsetWidth;
    bagBtn.classList.add("got");
  });

  el("undo-btn").addEventListener("click", withClick(() => send({ type: "undo" })));
  worldsBtn.addEventListener("click", withClick(() => actions.openWorlds()));
  newWorldBtn.addEventListener("click", withClick(() => actions.createWorld()));
  const setMuted = (muted: boolean) => {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.classList.toggle("muted", muted);
    muteBtn.setAttribute("aria-pressed", String(muted));
  };
  muteBtn.addEventListener("click", () => {
    const muted = actions.toggleMute();
    setMuted(muted);
    if (!muted) actions.click();
  });
  el("full-btn").addEventListener("click", withClick(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
    else void document.exitFullscreen();
  }));

  return {
    setBusy(busy) {
      newWorldBtn.disabled = busy;
      worldsBtn.disabled = busy;
    },
    setMuted,
    selectSlot(index) {
      const id = BUILDABLE_IDS[index];
      if (id) pickBlock(id);
    },
    cycleSlot(delta) {
      const i = BUILDABLE_IDS.indexOf(game.selection.block);
      pickBlock(BUILDABLE_IDS[(i + delta + BUILDABLE_IDS.length) % BUILDABLE_IDS.length]);
    },
  };
}
