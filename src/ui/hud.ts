import { BLOCKS, BUILDABLE_IDS, type BlockId } from "../domain/blocks";
import type { Game, InteractionMode } from "../sim/game";

export type HudActions = {
  createWorld(): void;
  openWorlds(): void;
};

/** HUD del niño: paleta de bloques, modos, deshacer, Mis Mundos, crear nuevo mundo y pantalla completa. */
export function setupHud(game: Game, actions: HudActions): { setBusy(busy: boolean): void } {
  const palette = document.getElementById("palette");
  const placeBtn = document.getElementById("place-btn");
  const removeBtn = document.getElementById("remove-btn");
  const undoBtn = document.getElementById("undo-btn");
  const worldsBtn = document.getElementById("worlds-btn") as HTMLButtonElement | null;
  const newWorldBtn = document.getElementById("new-world-btn") as HTMLButtonElement | null;
  const fullBtn = document.getElementById("full-btn");

  if (!palette || !placeBtn || !removeBtn || !undoBtn || !worldsBtn || !newWorldBtn || !fullBtn) {
    throw new Error("Faltan elementos de la interfaz");
  }

  for (const id of BUILDABLE_IDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "block-btn";
    button.style.background = `#${BLOCKS[id].color.toString(16).padStart(6, "0")}`;
    button.title = BLOCKS[id].name;
    button.setAttribute("aria-label", BLOCKS[id].name);
    button.dataset.id = id;
    button.addEventListener("click", () => game.enqueue({ type: "selectBlock", block: id }));
    palette.append(button);
  }

  const showSelection = (mode: InteractionMode, block: BlockId) => {
    highlightPalette(block);
    placeBtn.classList.toggle("active", mode === "place");
    removeBtn.classList.toggle("active", mode === "remove");
  };
  showSelection(game.selection.mode, game.selection.block);
  game.events.on("selectionChanged", (s) => showSelection(s.mode, s.block));

  placeBtn.addEventListener("click", () => game.enqueue({ type: "setMode", mode: "place" }));
  removeBtn.addEventListener("click", () => game.enqueue({ type: "setMode", mode: "remove" }));
  undoBtn.addEventListener("click", () => game.enqueue({ type: "undo" }));
  worldsBtn.addEventListener("click", () => actions.openWorlds());
  newWorldBtn.addEventListener("click", () => actions.createWorld());
  fullBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  });

  return {
    setBusy(busy) {
      newWorldBtn.disabled = busy;
      worldsBtn.disabled = busy;
    },
  };
}

function highlightPalette(selected: BlockId): void {
  document.querySelectorAll<HTMLButtonElement>(".block-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.id === selected);
  });
}
