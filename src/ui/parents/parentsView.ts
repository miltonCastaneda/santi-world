import type { World, WorldSettings } from "../../domain/repository/model";
import { clampSettings, MAX_PHASE_MINUTES, MIN_PHASE_MINUTES, type SettingsField } from "../../domain/settings";
import { isValidPin } from "../../persistence/pin";

export type ParentsDeps = {
  /** Mundos no borrados, el más reciente primero. */
  worlds(): Promise<World[]>;
  trash(): Promise<World[]>;
  thumbnail(worldId: string): Promise<Blob | null>;
  /** Abre el visor de solo lectura en el lienzo; devuelve cómo cerrarlo. */
  openViewer(world: World, canvas: HTMLCanvasElement): Promise<() => void>;
  softDelete(worldId: string): Promise<void>;
  restore(worldId: string): Promise<void>;
  saveSettings(worldId: string, settings: WorldSettings): Promise<World>;
  exportWorld(world: World): Promise<void>;
  importWorld(file: File): Promise<World>;
  storage(): Promise<{ usage: number; quota: number } | null>;
  pin: { isEnabled(): Promise<boolean>; set(pin: string): Promise<void>; clear(): Promise<void> };
  now(): number;
  retentionMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Imagen genérica para los mundos que nunca generaron miniatura. */
export const GENERIC_THUMBNAIL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="120" fill="#8fd3ff"/><rect y="120" width="320" height="60" fill="#5fae3e"/><rect y="150" width="320" height="30" fill="#8b5a2b"/><circle cx="260" cy="40" r="18" fill="#ffe066"/></svg>`,
  );

const FIELD_LABEL: Record<SettingsField, string> = {
  dayMinutes: "Día",
  nightMinutes: "Noche",
  master: "Volumen general",
  music: "Música",
  sfx: "Efectos",
};

const fmtDate = (ts: number) => new Date(ts).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
const fmtBytes = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Vista de padres (spec vista-de-padres): histórico, visor de solo lectura, papelera, configuración
 * por mundo, PIN y exportar/importar. Pensada para adultos: texto claro, sin estilo infantil.
 */
export function renderParents(root: HTMLElement, deps: ParentsDeps): { refresh(): Promise<void> } {
  const urls: string[] = [];
  const status = el("p", { className: "status", id: "parents-status" });
  status.setAttribute("role", "status");
  const usage = el("span", { id: "storage-usage", className: "usage" });
  const list = el("ul", { id: "world-list", className: "world-list" });
  const trash = el("ul", { id: "trash-list", className: "trash-list" });
  const pinBox = el("div", { id: "pin-settings", className: "pin-settings" });
  const importInput = el("input", { type: "file", id: "import-file", accept: ".json,application/json", hidden: true });
  const importBtn = el("button", { type: "button", id: "import-btn", textContent: "Importar mundo…" });
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const w = await deps.importWorld(file);
      say(`Se importó «${w.name}».`);
      await refresh();
    } catch {
      say("Ese archivo no es un mundo válido. No se importó nada.");
    }
  });

  root.replaceChildren(
    el("header", { className: "parents-header" }, el("h1", { textContent: "Vista de padres" }), usage),
    el("div", { className: "toolbar" }, importBtn, importInput),
    status,
    el("h2", { textContent: "Mundos" }),
    list,
    el("h2", { textContent: "Papelera" }),
    el("p", { className: "hint", textContent: `Los mundos borrados se pueden restaurar durante ${Math.round(deps.retentionMs / DAY_MS)} días; después se eliminan definitivamente.` }),
    trash,
    el("h2", { textContent: "PIN de acceso" }),
    pinBox,
  );

  function say(text: string): void {
    status.textContent = text;
  }

  async function thumbUrl(worldId: string): Promise<string> {
    const blob = await deps.thumbnail(worldId).catch(() => null);
    if (!blob) return GENERIC_THUMBNAIL;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  }

  async function worldCard(w: World): Promise<HTMLLIElement> {
    const img = el("img", { className: "thumb", alt: `Miniatura de ${w.name}`, src: await thumbUrl(w.id) });
    img.addEventListener("error", () => (img.src = GENERIC_THUMBNAIL), { once: true });
    const info = el(
      "div",
      { className: "info" },
      el("h3", { textContent: w.name }),
      el("p", { className: "dates", textContent: `Creado: ${fmtDate(w.createdAt)} · Modificado: ${fmtDate(w.updatedAt)}` }),
      el("p", { className: "day", textContent: `Día ${w.dayCount} del juego` }),
    );
    const btn = (label: string, action: string, fn: () => void) => {
      const b = el("button", { type: "button", textContent: label });
      b.dataset.action = action;
      b.addEventListener("click", fn);
      return b;
    };
    const actions = el(
      "div",
      { className: "actions" },
      btn("Ver", "view", () => void openViewer(w)),
      btn("Configurar", "settings", () => openSettings(w)),
      btn("Exportar", "export", () => void deps.exportWorld(w).then(() => say(`Se exportó «${w.name}».`))),
      btn("Borrar", "delete", () => void confirmDelete(w)),
    );
    const li = el("li", { className: "world-card" }, img, info, actions);
    li.dataset.worldId = w.id;
    li.dataset.updatedAt = String(w.updatedAt);
    return li;
  }

  function trashCard(w: World): HTMLLIElement {
    const left = Math.max(0, Math.ceil(((w.deletedAt ?? 0) + deps.retentionMs - deps.now()) / DAY_MS));
    const restore = el("button", { type: "button", textContent: "Restaurar" });
    restore.dataset.action = "restore";
    restore.addEventListener("click", async () => {
      await deps.restore(w.id);
      say(`«${w.name}» volvió al histórico.`);
      await refresh();
    });
    const li = el(
      "li",
      { className: "trash-card" },
      el("span", { textContent: `${w.name} — borrado el ${fmtDate(w.deletedAt ?? 0)}; se elimina en ${left} días` }),
      restore,
    );
    li.dataset.worldId = w.id;
    return li;
  }

  async function confirmDelete(w: World): Promise<void> {
    const ok = await confirmDialog(`¿Borrar «${w.name}»?`, `Irá a la papelera; se puede restaurar durante ${Math.round(deps.retentionMs / DAY_MS)} días.`, "Sí, borrar");
    if (!ok) return;
    await deps.softDelete(w.id);
    say(`«${w.name}» está en la papelera.`);
    await refresh();
  }

  function confirmDialog(title: string, body: string, yes: string): Promise<boolean> {
    return new Promise((resolve) => {
      const cancel = el("button", { type: "button", textContent: "Cancelar" });
      cancel.dataset.action = "cancel";
      const accept = el("button", { type: "button", className: "danger", textContent: yes });
      accept.dataset.action = "confirm";
      const dialog = el("dialog", { className: "confirm-dialog" }, el("h3", { textContent: title }), el("p", { textContent: body }), el("div", { className: "actions" }, cancel, accept));
      const close = (result: boolean) => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      cancel.addEventListener("click", () => close(false));
      accept.addEventListener("click", () => close(true));
      dialog.addEventListener("cancel", () => close(false));
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  function openSettings(w: World): void {
    const s = w.settings;
    const num = (name: string, value: number, min: number, max: number) => el("input", { type: "number", name, value: String(value), min: String(min), max: String(max), step: "1" });
    const day = num("dayMinutes", s.dayMinutes, MIN_PHASE_MINUTES, MAX_PHASE_MINUTES);
    const night = num("nightMinutes", s.nightMinutes, MIN_PHASE_MINUTES, MAX_PHASE_MINUTES);
    const quiet = el("input", { type: "checkbox", name: "quietNight", checked: s.quietNight });
    const vol = (name: string, v: number) => num(name, Math.round(v * 100), 0, 100);
    const master = vol("master", s.volume.master);
    const music = vol("music", s.volume.music);
    const sfx = vol("sfx", s.volume.sfx);
    const note = el("p", { className: "limits", id: "settings-limits" });
    const label = (text: string, input: HTMLInputElement) => el("label", {}, text, input);
    const save = el("button", { type: "submit", textContent: "Guardar" });
    const cancel = el("button", { type: "button", textContent: "Cerrar" });
    const form = el(
      "form",
      // Sin validación del navegador: los valores fuera de rango se limitan y se explica el límite.
      { method: "dialog", noValidate: true },
      el("h3", { textContent: `Configuración de «${w.name}»` }),
      label(`Duración del día (${MIN_PHASE_MINUTES}–${MAX_PHASE_MINUTES} min)`, day),
      label(`Duración de la noche (${MIN_PHASE_MINUTES}–${MAX_PHASE_MINUTES} min)`, night),
      label("Noche tranquila (sin zombis ni dragón)", quiet),
      label("Volumen general (0–100)", master),
      label("Música (0–100)", music),
      label("Efectos (0–100)", sfx),
      note,
      el("div", { className: "actions" }, cancel, save),
    );
    const dialog = el("dialog", { className: "settings-dialog" }, form);
    dialog.dataset.worldId = w.id;
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    cancel.addEventListener("click", close);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = clampSettings(
        {
          dayMinutes: day.valueAsNumber,
          nightMinutes: night.valueAsNumber,
          quietNight: quiet.checked,
          volume: { master: master.valueAsNumber / 100, music: music.valueAsNumber / 100, sfx: sfx.valueAsNumber / 100 },
        },
        s,
      );
      day.value = String(r.settings.dayMinutes);
      night.value = String(r.settings.nightMinutes);
      master.value = String(Math.round(r.settings.volume.master * 100));
      music.value = String(Math.round(r.settings.volume.music * 100));
      sfx.value = String(Math.round(r.settings.volume.sfx * 100));
      await deps.saveSettings(w.id, r.settings);
      if (r.clamped.length > 0) {
        note.textContent = `Se ajustó al límite permitido: ${r.clamped.map((f) => FIELD_LABEL[f]).join(", ")}. Día y noche van de ${MIN_PHASE_MINUTES} a ${MAX_PHASE_MINUTES} min.`;
        say("Configuración guardada con valores ajustados.");
        return;
      }
      say(`Configuración de «${w.name}» guardada.`);
      close();
      await refresh();
    });
    document.body.append(dialog);
    dialog.showModal();
  }

  async function openViewer(w: World): Promise<void> {
    const canvas = el("canvas", { id: "viewer-canvas" });
    const closeBtn = el("button", { type: "button", id: "viewer-close", textContent: "Cerrar visor" });
    const overlay = el(
      "div",
      { className: "viewer", id: "viewer" },
      canvas,
      el("div", { className: "viewer-bar" }, el("span", { textContent: `${w.name} — solo lectura (no se guarda ningún cambio)` }), closeBtn),
    );
    document.body.append(overlay);
    let dispose: (() => void) | null = null;
    closeBtn.addEventListener("click", () => {
      dispose?.();
      overlay.remove();
    });
    try {
      dispose = await deps.openViewer(w, canvas);
      overlay.dataset.ready = "true";
    } catch {
      overlay.remove();
      say(`No se pudo abrir «${w.name}».`);
    }
  }

  async function renderPin(): Promise<void> {
    const enabled = await deps.pin.isEnabled();
    if (enabled) {
      const off = el("button", { type: "button", id: "pin-disable", textContent: "Quitar PIN" });
      off.addEventListener("click", async () => {
        await deps.pin.clear();
        say("PIN desactivado.");
        await renderPin();
      });
      pinBox.replaceChildren(el("p", { textContent: "El PIN está activo: se pide al entrar a esta vista." }), off);
      return;
    }
    const input = el("input", { type: "password", inputMode: "numeric", maxLength: 4, id: "pin-new", placeholder: "4 dígitos", autocomplete: "new-password" });
    const on = el("button", { type: "button", id: "pin-enable", textContent: "Activar PIN" });
    on.addEventListener("click", async () => {
      if (!isValidPin(input.value)) return say("El PIN debe tener exactamente 4 dígitos.");
      await deps.pin.set(input.value);
      say("PIN activado.");
      await renderPin();
    });
    pinBox.replaceChildren(
      el("p", { className: "hint", textContent: "Opcional y desactivado por defecto. Es disuasorio: los datos están en este navegador. Si lo olvidas, la guía de padres explica cómo quitarlo." }),
      input,
      on,
    );
  }

  async function refresh(): Promise<void> {
    const [worlds, deleted, est] = await Promise.all([deps.worlds(), deps.trash(), deps.storage().catch(() => null)]);
    for (const u of urls.splice(0)) URL.revokeObjectURL(u);
    list.replaceChildren(...(await Promise.all(worlds.map(worldCard))));
    if (worlds.length === 0) list.append(el("li", { className: "empty", textContent: "No hay mundos todavía." }));
    trash.replaceChildren(...deleted.map(trashCard));
    if (deleted.length === 0) trash.append(el("li", { className: "empty", textContent: "La papelera está vacía." }));
    usage.textContent = est ? `Espacio usado: ${fmtBytes(est.usage)} de ${fmtBytes(est.quota)}` : "";
    root.dataset.ready = "true";
  }

  void renderPin();
  return { refresh };
}

export type PinGateDeps = {
  verify(pin: string): Promise<{ ok: true } | { ok: false; lockedUntil: number | null; attemptsLeft: number }>;
  lockedUntil(): Promise<number | null>;
  now(): number;
};

/** Pantalla de PIN (solo si está activo). Se resuelve cuando el PIN es correcto. */
export function pinGate(root: HTMLElement, deps: PinGateDeps): Promise<void> {
  return new Promise((resolve) => {
    const input = el("input", { type: "password", inputMode: "numeric", maxLength: 4, id: "pin-input", autocomplete: "current-password" });
    const submit = el("button", { type: "submit", id: "pin-submit", textContent: "Entrar" });
    const msg = el("p", { id: "pin-message", className: "status" });
    msg.setAttribute("role", "status");
    const form = el("form", { className: "pin-gate" }, el("h1", { textContent: "Vista de padres" }), el("label", {}, "PIN", input), submit, msg);
    root.replaceChildren(form);

    const lock = (until: number) => {
      input.disabled = true;
      submit.disabled = true;
      msg.textContent = `Demasiados intentos. Espera ${Math.ceil((until - deps.now()) / 1000)} s para volver a intentarlo.`;
      setTimeout(() => {
        input.disabled = false;
        submit.disabled = false;
        msg.textContent = "";
        input.focus();
      }, Math.max(0, until - deps.now()));
    };

    void deps.lockedUntil().then((until) => until !== null && lock(until));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await deps.verify(input.value);
      input.value = "";
      if (r.ok) return resolve();
      if (r.lockedUntil !== null) return lock(r.lockedUntil);
      msg.textContent = `PIN incorrecto. Quedan ${r.attemptsLeft} intentos.`;
    });
    input.focus();
  });
}
