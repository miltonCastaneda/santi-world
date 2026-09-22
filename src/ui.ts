import { BLOCKS, BLOCK_IDS, type BlockId } from "./blocks";
import type { GameInput, InteractionMode } from "./input";
import type { World } from "./world";

export function setupUi(input: GameInput, world: World, onWorldChange: () => void): void {
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
    button.addEventListener("click", () => {
      input.selected = id;
      input.mode = "place";
      highlightPalette(id);
      setMode("place", placeBtn, removeBtn);
    });
    palette.append(button);
  }
  highlightPalette(input.selected);
  setMode(input.mode, placeBtn, removeBtn);

  placeBtn.addEventListener("click", () => {
    input.mode = "place";
    setMode("place", placeBtn, removeBtn);
  });
  removeBtn.addEventListener("click", () => {
    input.mode = "remove";
    setMode("remove", placeBtn, removeBtn);
  });
  undoBtn.addEventListener("click", () => {
    if (world.undo()) onWorldChange();
  });
  resetBtn.addEventListener("click", () => {
    world.reset();
    onWorldChange();
  });
  fullBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  });
}

function highlightPalette(selected: BlockId): void {
  document.querySelectorAll<HTMLButtonElement>(".block-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.id === selected);
  });
}

function setMode(
  mode: InteractionMode,
  placeBtn: HTMLElement,
  removeBtn: HTMLElement,
): void {
  placeBtn.classList.toggle("active", mode === "place");
  removeBtn.classList.toggle("active", mode === "remove");
}
