import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { defaultGameState, type ChunkRecord, type World } from "../../../src/domain/repository/model";
import type { WorldRepository } from "../../../src/domain/repository/worldRepository";
import type { RepositoryDeps } from "../../../src/persistence/inMemoryRepository";

export type RepoFactory = (deps: RepositoryDeps) => Promise<WorldRepository> | WorldRepository;

export function sequentialIds(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, "0")}`;
}

export function chunkRecord(worldId: string, cx: number, cz: number, fill: number, version = 1): ChunkRecord {
  const blocks = new Uint8Array(16 * 16 * 64);
  blocks.fill(fill, 0, 256);
  const placed = new Uint8Array(blocks.length / 8);
  placed[0] = 0b101;
  return { worldId, cx, cz, version, updatedAt: 1000 + version, blocks, placed };
}

/**
 * Suite de contrato del puerto WorldRepository (spec plataforma-escalable, "Pruebas de contrato").
 * Se ejecuta sin cambios contra cada implementación.
 */
export function describeRepositoryContract(name: string, factory: RepoFactory): void {
  describe(`[plataforma-escalable] Pruebas de contrato: ${name}`, () => {
    let clock: FakeClock;
    let repo: WorldRepository;

    beforeEach(async () => {
      clock = new FakeClock(1_700_000_000_000);
      repo = await factory({ clock, newId: sequentialIds() });
    });

    const newWorld = async (ownerId: string, name = "Mundo") =>
      repo.createWorld({ ownerId, name, seed: `s-${name}`, generator: "zones", generatorVersion: 1 });

    it("[plataforma-escalable] Usuario por defecto: se crea una vez con un id único", async () => {
      const a = await repo.ensureDefaultUser();
      const b = await repo.ensureDefaultUser();
      expect(a.id).toBeTruthy();
      expect(b).toEqual(a);
      const w = await newWorld(a.id);
      expect(w.ownerId).toBe(a.id);
    });

    it("crea un mundo con estado inicial, versión de esquema y marcas de tiempo", async () => {
      const w = await newWorld("u1", "A");
      expect(w).toMatchObject({ name: "A", ownerId: "u1", schemaVersion: 1, version: 0, createdAt: clock.now(), updatedAt: clock.now() });
      const loaded = await repo.loadWorld(w.id);
      expect(loaded.world).toEqual(w);
      expect(loaded.state).toEqual(defaultGameState(w.id, clock.now()));
      expect(loaded.entities).toEqual([]);
    });

    it("lista solo los mundos del usuario, del más reciente al más antiguo", async () => {
      const a = await newWorld("u1", "A");
      clock.advance(10);
      const b = await newWorld("u1", "B");
      await newWorld("u2", "C");
      expect((await repo.listWorlds("u1")).map((w) => w.id)).toEqual([b.id, a.id]);
    });

    it("saveSnapshot guarda mundo, estado, entidades, chunks y miniatura", async () => {
      const w = await newWorld("u1");
      const { state } = await repo.loadWorld(w.id);
      clock.advance(5000);
      const world: World = { ...w, version: 1, updatedAt: clock.now() };
      await repo.saveSnapshot({
        world,
        state: { ...state, version: 1, updatedAt: clock.now(), dayCount: 3 },
        entities: [{ id: "e1", worldId: w.id, kind: "animal", species: "cow", pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, state: "idle" }],
        dirtyChunks: [chunkRecord(w.id, 3, 4, 7), chunkRecord(w.id, 5, 5, 2)],
        thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
      });
      const loaded = await repo.loadWorld(w.id);
      expect(loaded.world).toEqual(world);
      expect(loaded.state.dayCount).toBe(3);
      expect(loaded.entities.map((e) => e.species)).toEqual(["cow"]);
      const c = await repo.loadChunk(w.id, 3, 4);
      expect(c?.blocks[0]).toBe(7);
      expect(c?.placed[0]).toBe(0b101);
      expect(c?.version).toBe(1);
      expect(await repo.loadChunk(w.id, 0, 0)).toBeNull();
      expect((await repo.listChunks(w.id)).length).toBe(2);
      const thumb = await repo.getThumbnail(w.id);
      expect(thumb?.type).toBe("image/webp");
      expect([...new Uint8Array(await thumb!.arrayBuffer())]).toEqual([1, 2, 3]);
    });

    it("un chunk guardado de nuevo reemplaza al anterior", async () => {
      const w = await newWorld("u1");
      const { state } = await repo.loadWorld(w.id);
      await repo.saveSnapshot({ world: w, state, entities: [], dirtyChunks: [chunkRecord(w.id, 1, 1, 4, 1)] });
      await repo.saveSnapshot({ world: w, state, entities: [], dirtyChunks: [chunkRecord(w.id, 1, 1, 9, 2)] });
      const chunks = await repo.listChunks(w.id);
      expect(chunks.length).toBe(1);
      expect(chunks[0].blocks[0]).toBe(9);
      expect(chunks[0].version).toBe(2);
    });

    it("los datos devueltos son copias: modificarlos no cambia lo guardado", async () => {
      const w = await newWorld("u1");
      const { state } = await repo.loadWorld(w.id);
      await repo.saveSnapshot({ world: w, state, entities: [], dirtyChunks: [chunkRecord(w.id, 1, 1, 4)] });
      const c = (await repo.loadChunk(w.id, 1, 1))!;
      c.blocks[0] = 99;
      (await repo.loadWorld(w.id)).world.name = "otro";
      expect((await repo.loadChunk(w.id, 1, 1))!.blocks[0]).toBe(4);
      expect((await repo.loadWorld(w.id)).world.name).toBe("Mundo");
    });

    it("loadWorld de un mundo inexistente falla", async () => {
      await expect(repo.loadWorld("no-existe")).rejects.toThrow();
    });

    it("papelera: borrar, restaurar y purgar los vencidos", async () => {
      const a = await newWorld("u1", "A");
      const b = await newWorld("u1", "B");
      await repo.saveSnapshot({ ...(await repo.loadWorld(b.id)), dirtyChunks: [chunkRecord(b.id, 0, 0, 1)] });
      await repo.softDelete(a.id);
      expect((await repo.listWorlds("u1")).map((w) => w.name)).toEqual(["B"]);
      expect((await repo.listWorlds("u1", { includeDeleted: true })).length).toBe(2);
      await repo.restore(a.id);
      expect((await repo.listWorlds("u1")).length).toBe(2);

      await repo.softDelete(b.id);
      clock.advance(10);
      expect(await repo.purgeExpired(clock.now(), 1000)).toBe(0);
      clock.advance(1000);
      expect(await repo.purgeExpired(clock.now(), 1000)).toBe(1);
      expect((await repo.listWorlds("u1", { includeDeleted: true })).map((w) => w.name)).toEqual(["A"]);
      expect(await repo.listChunks(b.id)).toEqual([]);
      await expect(repo.loadWorld(b.id)).rejects.toThrow();
    });

    it("[plataforma-escalable] Exportación preparada para sincronizar: el archivo tiene ids, versión de esquema y marcas", async () => {
      const user = await repo.ensureDefaultUser();
      const w = await newWorld(user.id, "Casa");
      const loaded = await repo.loadWorld(w.id);
      await repo.saveSnapshot({ ...loaded, dirtyChunks: [chunkRecord(w.id, 2, 3, 5, 4)] });
      const file = await repo.exportWorld(w.id);
      const doc = JSON.parse(await file.text());
      expect(doc).toMatchObject({ format: "santi-world", userId: user.id, schemaVersion: 1, world: { id: w.id, updatedAt: w.updatedAt, version: 0 } });
      expect(doc.state).toMatchObject({ worldId: w.id, version: 0, updatedAt: expect.any(Number) });
      expect(doc.chunks[0]).toMatchObject({ cx: 2, cz: 3, version: 4, updatedAt: 1004 });

      const imported = await repo.importWorld(file, user.id);
      expect(imported.id).not.toBe(w.id);
      expect(imported.name).toBe("Casa");
      expect((await repo.loadChunk(imported.id, 2, 3))?.blocks[0]).toBe(5);
      expect((await repo.listWorlds(user.id)).length).toBe(2);
    });

    it("importar un archivo que no es un mundo falla sin crear nada", async () => {
      await expect(repo.importWorld(new Blob(["hola"]), "u1")).rejects.toThrow();
      await expect(repo.importWorld(new Blob([JSON.stringify({ format: "otro" })]), "u1")).rejects.toThrow();
      expect(await repo.listWorlds("u1")).toEqual([]);
    });

    it("guarda y lee metadatos", async () => {
      expect(await repo.getMeta("x")).toBeUndefined();
      await repo.setMeta("x", { a: 1 });
      expect(await repo.getMeta("x")).toEqual({ a: 1 });
    });
  });
}
