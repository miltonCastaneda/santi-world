import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import type { ChunkRecord } from "../../../src/domain/repository/model";
import { DexieWorldRepository, SantiDatabase } from "../../../src/persistence/dexieRepository";
import { chunkRecord, describeRepositoryContract, sequentialIds } from "./repositoryContract";

const freshDb = () => new SantiDatabase("santi-test", { indexedDB: new IDBFactory(), IDBKeyRange });

describeRepositoryContract("IndexedDB con Dexie (fake-indexeddb)", (deps) => new DexieWorldRepository(freshDb(), deps));

describe("[mundos-y-persistencia] DexieWorldRepository", () => {
  it("saveSnapshot es atómico: si una parte falla, no se guarda nada", async () => {
    const repo = new DexieWorldRepository(freshDb(), { clock: new FakeClock(1), newId: sequentialIds() });
    const w = await repo.createWorld({ ownerId: "u", name: "A", seed: "s", generator: "zones", generatorVersion: 1 });
    const loaded = await repo.loadWorld(w.id);
    const broken = { ...chunkRecord(w.id, 1, 1, 3), cx: undefined } as unknown as ChunkRecord;
    await expect(
      repo.saveSnapshot({ ...loaded, world: { ...w, name: "cambiado", version: 1 }, dirtyChunks: [chunkRecord(w.id, 0, 0, 3), broken] }),
    ).rejects.toThrow();
    expect((await repo.loadWorld(w.id)).world.name).toBe("A");
    expect(await repo.listChunks(w.id)).toEqual([]);
  });
});
