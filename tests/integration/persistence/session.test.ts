import { describe, expect, it } from "vitest";
import { BLOCK_NUM } from "../../../src/domain/blocks";
import { CHUNK_SIZE } from "../../../src/domain/world/chunk";
import { CREATE_COOLDOWN_MS } from "../../../src/sim/session";
import { placeRow, setupSession } from "./helpers";

describe("[plataforma-escalable] identificadores y marcas", () => {
  it("[plataforma-escalable] Usuario por defecto: los mundos quedan asociados a él", async () => {
    const { session, repo, user } = await setupSession();
    await session.openInitial();
    await session.createWorld();
    const worlds = await repo.listWorlds(user.id);
    expect(worlds.length).toBe(2);
    expect(worlds.every((w) => w.ownerId === user.id)).toBe(true);
    expect(new Set(worlds.map((w) => w.id)).size).toBe(2);
  });

  it("cada guardado sube version y updatedAt del mundo, el estado y los chunks", async () => {
    const { session, game, repo, clock, autosave } = await setupSession();
    const w0 = await session.openInitial();
    placeRow(game, 1);
    clock.advance(5000);
    await autosave.saveNow();
    const { world, state } = await repo.loadWorld(w0.id);
    expect(world.version).toBe(1);
    expect(world.updatedAt).toBe(clock.now());
    expect(state.version).toBe(1);
    expect(state.updatedAt).toBe(clock.now());
    const [chunk] = await repo.listChunks(w0.id);
    expect(chunk.version).toBeGreaterThan(0);
    expect(chunk.updatedAt).toBe(clock.now());
  });
});

describe("[mundos-y-persistencia] solo se guardan los chunks modificados", () => {
  it("se recarga idéntico tras editar 3 chunks", async () => {
    const first = await setupSession();
    const w = await first.session.openInitial();
    const { game } = first;
    const sp = game.world.spawn;
    const edits: [number, number][] = [
      [Math.floor(sp.x), Math.floor(sp.z)],
      [Math.floor(sp.x) + CHUNK_SIZE, Math.floor(sp.z)],
      [Math.floor(sp.x), Math.floor(sp.z) + CHUNK_SIZE],
    ];
    for (const [x, z] of edits) {
      const y = game.world.store.surfaceY(x, z);
      game.world.place(x, y + 1, z, "blue");
      game.world.remove(x + 1, y, z);
    }
    await first.autosave.saveNow();
    expect((await first.repo.listChunks(w.id)).length).toBe(3);

    const second = await setupSession({ repo: first.repo, clock: first.clock });
    await second.session.openInitial();
    expect(second.session.world?.id).toBe(w.id);
    for (const c of first.game.world.store.modifiedChunks()) {
      const again = second.game.world.store.chunk(c.cx, c.cz)!;
      expect(again.blocks).toEqual(c.blocks);
      expect(again.placed).toEqual(c.placed);
    }
    // Un chunk no modificado se regenera igual con la semilla.
    expect(second.game.world.store.chunk(0, 0)!.blocks).toEqual(first.game.world.store.chunk(0, 0)!.blocks);
  });

  it("[mundos-y-persistencia] Los cambios en regiones descargadas se conservan", async () => {
    const { session, game } = await setupSession();
    await session.openInitial();
    const [p] = placeRow(game, 1, "yellow");
    const { cx, cz } = { cx: Math.floor(p.x / CHUNK_SIZE), cz: Math.floor(p.z / CHUNK_SIZE) };
    expect(game.world.store.unload(cx, cz)).toBe(false);
    expect(game.world.store.get(p.x, p.y, p.z)).toBe(BLOCK_NUM.yellow);
  });
});

describe("[mundos-y-persistencia] crear y cambiar de mundo", () => {
  it("[mundos-y-persistencia] Crear un mundo nuevo guarda primero", async () => {
    const { session, game, repo, clock } = await setupSession();
    const old = await session.openInitial();
    clock.advance(1000);
    placeRow(game, 20);
    clock.advance(5000);
    let savedBeforeNewWorld = -1;
    game.events.on("worldReplaced", () => {
      savedBeforeNewWorld = repo.saveCount;
    });
    expect(await session.createWorld()).toBe(true);
    expect(savedBeforeNewWorld).toBe(1);
    expect(session.world?.id).not.toBe(old.id);
    expect(game.world.store.modifiedChunks().length).toBe(0);

    const chunks = await repo.listChunks(old.id);
    let placed = 0;
    for (const c of chunks) for (const byte of c.placed) for (let b = byte; b; b &= b - 1) placed++;
    expect(placed).toBe(20);
  });

  it("[mundos-y-persistencia] Falla el guardado previo: el mundo actual no se limpia ni se reemplaza", async () => {
    const { session, game, repo, user } = await setupSession();
    const current = await session.openInitial();
    const placed = placeRow(game, 5);
    repo.failSaves = new Error("QuotaExceededError");
    const failures: unknown[] = [];
    session.events.on("saveFailed", ({ error }) => failures.push(error));

    expect(await session.createWorld()).toBe(false);
    expect(session.world?.id).toBe(current.id);
    expect(failures.length).toBe(1);
    for (const p of placed) expect(game.world.store.get(p.x, p.y, p.z)).toBe(BLOCK_NUM.red);
    expect((await repo.listWorlds(user.id)).length).toBe(1);
    expect(session.hasChanges()).toBe(true);
  });

  it("[mundos-y-persistencia] Clics repetidos en Crear nuevo mundo: como máximo 1 mundo y 1 guardado", async () => {
    const { session, game, repo, user, clock } = await setupSession();
    await session.openInitial();
    placeRow(game, 3);
    const clicks: Promise<boolean>[] = [];
    for (let i = 0; i < 5; i++) {
      clicks.push(session.createWorld());
      if (i === 2) await Promise.all(clicks);
      clock.advance(300);
    }
    await Promise.all(clicks);
    expect((await repo.listWorlds(user.id)).length).toBe(2);
    expect(repo.saveCount).toBe(1);

    clock.advance(CREATE_COOLDOWN_MS);
    expect(await session.createWorld()).toBe(true);
    expect((await repo.listWorlds(user.id)).length).toBe(3);
  });

  it("[mundos-y-persistencia] Cambiar de mundo con cambios sin guardar", async () => {
    const { session, game, repo } = await setupSession();
    const a = await session.openInitial();
    await session.createWorld();
    const b = session.world!;
    await session.switchWorld(a.id);
    const [p] = placeRow(game, 1, "blue");
    expect(await session.switchWorld(b.id)).toBe(true);
    const chunk = await repo.loadChunk(a.id, Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE));
    expect(chunk).not.toBeNull();
    expect(session.world?.id).toBe(b.id);
  });

  it("[mundos-y-persistencia] Volver a un mundo anterior: bloques y bloque elegido como estaban", async () => {
    const { session, game } = await setupSession();
    const a = await session.openInitial();
    const placed = placeRow(game, 4, "yellow");
    game.enqueue({ type: "selectBlock", block: "planks" });
    game.step(50);
    await session.createWorld();
    expect(game.world.store.get(placed[0].x, placed[0].y, placed[0].z)).not.toBe(BLOCK_NUM.yellow);
    await session.switchWorld(a.id);
    for (const p of placed) expect(game.world.store.get(p.x, p.y, p.z)).toBe(BLOCK_NUM.yellow);
    expect(game.selection.block).toBe("planks");
  });
});

describe("[vista-de-padres] borrado y configuración desde la vista de padres", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("[vista-de-padres] Borrar el mundo que el niño está usando: el próximo arranque abre el más reciente que quede", async () => {
    const first = await setupSession();
    const a = await first.session.openInitial();
    first.clock.advance(1000);
    await first.session.createWorld();
    const b = first.session.world!;
    expect(await first.repo.getMeta("lastWorldId")).toBe(b.id);
    await first.repo.softDelete(b.id);

    const next = await setupSession({ repo: first.repo, clock: first.clock });
    expect((await next.session.openInitial()).id).toBe(a.id);
  });

  it("[vista-de-padres] Borrar el mundo que el niño está usando: si no queda ninguno, se crea uno nuevo", async () => {
    const first = await setupSession();
    const a = await first.session.openInitial();
    await first.repo.softDelete(a.id);
    const next = await setupSession({ repo: first.repo, clock: first.clock });
    const opened = await next.session.openInitial();
    expect(opened.id).not.toBe(a.id);
    expect(opened.deletedAt).toBeUndefined();
  });

  it("[vista-de-padres] Restaurar desde la papelera (10 días) y eliminación definitiva tras 30 días", async () => {
    const { session, repo, clock, game, user } = await setupSession();
    const a = await session.openInitial();
    placeRow(game, 3, "blue");
    await session.createWorld();
    const b = session.world!;
    await repo.softDelete(a.id);
    await repo.softDelete(b.id);
    clock.advance(10 * DAY);
    await repo.restore(a.id);
    expect((await repo.listChunks(a.id)).length).toBeGreaterThan(0);
    clock.advance(21 * DAY);
    expect(await repo.purgeExpired(clock.now(), 30 * DAY)).toBe(1);
    expect((await repo.listWorlds(user.id, { includeDeleted: true })).map((w) => w.id)).toEqual([a.id]);
  });

  it("[vista-de-padres] Configuración: se aplica en caliente si el mundo está abierto", async () => {
    const { session, repo } = await setupSession();
    const a = await session.openInitial();
    const seen: number[] = [];
    session.events.on("settingsChanged", ({ world }) => seen.push(world.settings.nightMinutes));
    await repo.updateSettings(a.id, { ...a.settings, nightMinutes: 5 });
    expect(await session.reloadSettings("otro")).toBe(false);
    expect(await session.reloadSettings(a.id)).toBe(true);
    expect(seen).toEqual([5]);
    expect(session.world?.settings.nightMinutes).toBe(5);
    await repo.saveSnapshot(session.collect()!.snapshot);
    expect((await repo.loadWorld(a.id)).world.settings.nightMinutes).toBe(5);
  });
});
