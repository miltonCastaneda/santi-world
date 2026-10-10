import { dotsFor, RESOURCE_IDS, RESOURCES, type Inventory, type ResourceId } from "../../domain/rules/inventory";

export type InventoryPanel = {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  update(inventory: Inventory): void;
  /** El cerdo-gallina está elegido: el próximo clic en el suelo lo suelta. */
  setReleaseArmed(armed: boolean): void;
};

/**
 * Mochila del niño (spec "Inventario visual"): un ícono grande por recurso con su número y, de 1 a
 * 5, un punto por unidad. No es modal: el juego sigue y se cierra con E, la mochila o la ✕. El
 * ícono del cerdo-gallina es un botón: al tocarlo queda elegido para soltarlo en el suelo.
 */
export function setupInventory(close: () => void, toggleRelease?: () => void): InventoryPanel {
  const panel = document.createElement("div");
  panel.className = "inventory-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Mochila");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="inventory-items"></div>
    <button type="button" class="inventory-close" aria-label="Cerrar">✕</button>`;
  document.body.append(panel);
  panel.querySelector(".inventory-close")!.addEventListener("click", close);

  const list = panel.querySelector<HTMLDivElement>(".inventory-items")!;
  const rows = new Map<ResourceId, { row: HTMLDivElement; count: HTMLSpanElement; dots: HTMLSpanElement }>();
  for (const id of RESOURCE_IDS) {
    const row = document.createElement("div");
    row.className = "inventory-item";
    row.dataset.resource = id;
    const icon =
      id === "pigChicken" && toggleRelease
        ? `<button type="button" class="inventory-icon inventory-release" aria-label="Soltar un ${RESOURCES[id].name.toLowerCase()}" aria-pressed="false">${RESOURCES[id].icon}</button>`
        : `<span class="inventory-icon" aria-hidden="true">${RESOURCES[id].icon}</span>`;
    row.innerHTML = `${icon}<span class="inventory-count"></span><span class="inventory-dots" aria-hidden="true"></span>`;
    list.append(row);
    rows.set(id, { row, count: row.querySelector(".inventory-count")!, dots: row.querySelector(".inventory-dots")! });
  }
  const releaseBtn = panel.querySelector<HTMLButtonElement>(".inventory-release");
  releaseBtn?.addEventListener("click", () => toggleRelease?.());

  return {
    get isOpen() {
      return !panel.hidden;
    },
    setOpen(open) {
      panel.hidden = !open;
    },
    update(inventory) {
      for (const [id, r] of rows) {
        const n = inventory[id];
        r.count.textContent = String(n);
        r.dots.textContent = "●".repeat(dotsFor(n));
        r.row.dataset.count = String(n);
        r.row.classList.toggle("empty", n === 0);
        r.row.setAttribute("aria-label", `${RESOURCES[id].name}: ${n}`);
      }
      if (releaseBtn) releaseBtn.disabled = inventory.pigChicken === 0;
    },
    setReleaseArmed(armed) {
      if (!releaseBtn) return;
      releaseBtn.classList.toggle("armed", armed);
      releaseBtn.setAttribute("aria-pressed", String(armed));
    },
  };
}
