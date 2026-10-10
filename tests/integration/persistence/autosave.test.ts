import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { CHUNK_SIZE } from "../../../src/domain/world/chunk";
import { AUTOSAVE_INTERVAL_MS, AutosaveService } from "../../../src/persistence/autosave";
import { requestPersistentStorage } from "../../../src/persistence/storage";
import { placeRow, setupSession } from "./helpers";

/** Doble de window y document para disparar los eventos del ciclo de vida de la página. */
function fakePage() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { win, doc };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("[mundos-y-persistencia] autoguardado", () => {
  it("[mundos-y-persistencia] Autoguardado periódico: a los 30 s el bloque está guardado y sobrevive a una recarga", async () => {
    const first = await setupSession();
    await first.session.openInitial();
    const [p] = placeRow(first.game, 1, "blue");

    first.clock.advance(AUTOSAVE_INTERVAL_MS - 1);
    first.autosave.tick();
    await flush();
    expect(first.repo.saveCount).toBe(0);

    first.clock.advance(1);
    first.autosave.tick();
    await flush();
    expect(first.repo.saveCount).toBe(1);

    const reload = await setupSession({ repo: first.repo, clock: first.clock });
    await reload.session.openInitial();
    expect(reload.game.world.store.get(p.x, p.y, p.z)).toBe(BLOCK_NUM.blue);
  });

  it("sin cambios no se guarda", async () => {
    const { session, autosave, repo, clock } = await setupSession();
    await session.openInitial();
    clock.advance(AUTOSAVE_INTERVAL_MS * 3);
    autosave.tick();
    await autosave.saveNow();
    expect(repo.saveCount).toBe(0);
  });

  it.each(["visibilitychange", "pagehide", "blur"])("[mundos-y-persistencia] Cerrar la pestaña (%s): el guardado empieza de inmediato", async (event) => {
    const first = await setupSession();
    await first.session.openInitial();
    const page = fakePage();
    first.autosave.attachLifecycle(page.win, page.doc);
    const [p] = placeRow(first.game, 1, "red");
    first.clock.advance(2000);

    if (event === "visibilitychange") {
      page.doc.visibilityState = "hidden";
      page.doc.dispatchEvent(new Event(event));
    } else {
      page.win.dispatchEvent(new Event(event));
    }
    expect(first.autosave.isSaving).toBe(true);
    await flush();
    expect(first.repo.saveCount).toBe(1);

    const reopened = await setupSession({ repo: first.repo, clock: first.clock });
    await reopened.session.openInitial();
    expect(reopened.game.world.store.get(p.x, p.y, p.z)).toBe(BLOCK_NUM.red);
  });

  it("vuelo único: varios pedidos durante un guardado producen como mucho uno más", async () => {
    const { session, game, autosave, repo } = await setupSession();
    await session.openInitial();
    placeRow(game, 1);
    const a = autosave.saveNow();
    placeRow(game, 1, "blue", 2);
    const b = autosave.saveNow();
    const c = autosave.saveNow();
    expect(b).toBe(c);
    await Promise.all([a, b, c]);
    expect(repo.saveCount).toBe(2);
    expect(session.hasChanges()).toBe(false);
  });

  it("un cambio durante el guardado queda pendiente para el siguiente", async () => {
    const { session, game, autosave } = await setupSession();
    await session.openInitial();
    placeRow(game, 1);
    const saving = autosave.saveNow();
    placeRow(game, 1, "blue");
    await saving;
    expect(session.hasChanges()).toBe(true);
  });

  it("[mundos-y-persistencia] El guardado no congela el juego: copiar 50 chunks modificados tarda mucho menos de 50 ms", async () => {
    const { session, game, autosave, repo } = await setupSession();
    await session.openInitial();
    let n = 0;
    for (let cx = 2; cx < 12 && n < 50; cx++) {
      for (let cz = 2; cz < 12 && n < 50; cz++, n++) {
        const x = cx * CHUNK_SIZE + 3;
        const z = cz * CHUNK_SIZE + 3;
        game.world.place(x, game.world.store.surfaceY(x, z) + 1, z, "red");
      }
    }
    expect(game.world.store.dirtyChunks().length).toBe(50);
    for (let i = 0; i < 3; i++) session.collect();

    const t0 = performance.now();
    const pending = autosave.saveNow();
    const syncMs = performance.now() - t0;
    await pending;
    expect(syncMs).toBeLessThan(50);
    expect(repo.saveCount).toBe(1);
    expect(game.world.store.dirtyChunks().length).toBe(0);
  });

  it("onFirstSave se llama una sola vez, con el primer guardado confirmado (navigator.storage.persist())", async () => {
    const { session, game, repo, clock } = await setupSession();
    await session.openInitial();
    let calls = 0;
    const autosave = new AutosaveService(repo, session, clock, { onFirstSave: () => calls++ });
    placeRow(game, 1);
    await autosave.saveNow();
    placeRow(game, 1, "blue", 2);
    await autosave.saveNow();
    expect(calls).toBe(1);
  });

  it("requestPersistentStorage pide persistencia solo si no la tiene y nunca lanza", async () => {
    let asked = 0;
    expect(await requestPersistentStorage({ storage: { persisted: async () => true, persist: async () => (asked++, true) } })).toBe(true);
    expect(asked).toBe(0);
    expect(await requestPersistentStorage({ storage: { persisted: async () => false, persist: async () => (asked++, true) } })).toBe(true);
    expect(asked).toBe(1);
    expect(await requestPersistentStorage({ storage: { persist: () => Promise.reject(new Error("no")) } })).toBe(false);
    expect(await requestPersistentStorage({})).toBe(false);
  });

  it("si el guardado falla, avisa y lo vuelve a intentar en el siguiente intervalo", async () => {
    const { session, game, autosave, repo, clock } = await setupSession();
    await session.openInitial();
    placeRow(game, 1);
    repo.failSaves = new Error("QuotaExceededError");
    await expect(autosave.saveNow()).rejects.toThrow("QuotaExceededError");
    expect(autosave.failureCount).toBe(1);
    expect(session.hasChanges()).toBe(true);

    repo.failSaves = null;
    clock.advance(AUTOSAVE_INTERVAL_MS);
    autosave.tick();
    await flush();
    expect(repo.saveCount).toBe(1);
  });
});
