import { BLOCKS, BLOCK_IDS, type BlockId } from "../domain/blocks";
import type { Game, InteractionMode } from "../sim/game";

/** HUD v1: paleta de bloques, modos, deshacer, empezar de nuevo y pantalla completa. */
export function setupHud(game: Game): void {
  const palette = document.getElementById("palette");
  const placeBtn = document.getElementById("place-btn");
  const removeBtn = document.getElementById("remove-btn");
  const undoBtn = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const fullBtn = document.getElementById("full-btn");

  if (!palette || !placeBtn || !removeBtn || !undoBtn || !resetBtn || !fullBtn) {
    throw new Error("Faltan elementos de la interfaz");
  }

  for (const id of BLOCK_IDS) {
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
  resetBtn.addEventListener("click", () => game.enqueue({ type: "reset" }));
  fullBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  });
}

function highlightPalette(selected: BlockId): void {
  document.querySelectorAll<HTMLButtonElement>(".block-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.id === selected);
  });
}
