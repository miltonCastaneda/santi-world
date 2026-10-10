export type WorldCard = {
  id: string;
  name: string;
  updatedAt: number;
  current: boolean;
  thumbnail: () => Promise<Blob | null>;
};

export type MisMundosDeps = {
  list(): Promise<WorldCard[]>;
  /** Devuelve false si no se pudo (por ejemplo, porque falló el guardado previo). */
  open(id: string): Promise<boolean>;
  create(): Promise<boolean>;
};

export type MisMundosPanel = { show(): Promise<void>; hide(): void; readonly isOpen: boolean };

/**
 * Panel "Mis Mundos" del niño: tarjetas grandes con la miniatura de cada mundo y una tarjeta para
 * crear uno nuevo. No hay ninguna forma de borrar un mundo desde aquí (eso es de la vista de padres).
 */
export function setupMisMundos(deps: MisMundosDeps): MisMundosPanel {
  const panel = document.createElement("div");
  panel.className = "worlds-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Mis Mundos");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="worlds-box">
      <div class="worlds-header">
        <h2>🌍 Mis Mundos</h2>
        <button type="button" class="worlds-close" aria-label="Cerrar">✕</button>
      </div>
      <div class="worlds-grid"></div>
    </div>`;
  document.body.append(panel);

  const grid = panel.querySelector<HTMLDivElement>(".worlds-grid")!;
  const closeBtn = panel.querySelector<HTMLButtonElement>(".worlds-close")!;
  let urls: string[] = [];
  let working = false;

  const hide = () => {
    panel.hidden = true;
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  };
  closeBtn.addEventListener("click", hide);

  const run = async (action: () => Promise<boolean>) => {
    if (working) return;
    working = true;
    panel.classList.add("busy");
    try {
      if (await action()) hide();
    } finally {
      working = false;
      panel.classList.remove("busy");
    }
  };

  const render = async () => {
    const cards = await deps.list();
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    grid.replaceChildren();

    const create = document.createElement("button");
    create.type = "button";
    create.className = "world-card new-world";
    create.dataset.action = "create";
    create.innerHTML = `<span class="world-thumb new">＋</span><span class="world-name">Crear nuevo mundo</span>`;
    create.addEventListener("click", () => void run(deps.create));
    grid.append(create);

    for (const card of cards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `world-card${card.current ? " current" : ""}`;
      btn.dataset.worldId = card.id;
      btn.setAttribute("aria-label", card.name);
      const thumb = document.createElement("span");
      thumb.className = "world-thumb";
      const name = document.createElement("span");
      name.className = "world-name";
      name.textContent = card.name;
      const date = document.createElement("span");
      date.className = "world-date";
      date.textContent = new Date(card.updatedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
      btn.append(thumb, name, date);
      btn.addEventListener("click", () => void run(() => (card.current ? Promise.resolve(true) : deps.open(card.id))));
      grid.append(btn);
      void card.thumbnail().then((blob) => {
        if (!blob || panel.hidden) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        thumb.style.backgroundImage = `url(${url})`;
      });
    }
  };

  return {
    async show() {
      panel.hidden = false;
      await render();
    },
    hide,
    get isOpen() {
      return !panel.hidden;
    },
  };
}
