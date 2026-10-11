import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { readOnly } from "../../../src/domain/repository/worldRepository";
import { InMemoryWorldRepository } from "../../../src/persistence/inMemoryRepository";
import { sequentialIds } from "./repositoryContract";

describe("[vista-de-padres] Repositorio de solo lectura", () => {
  it("lee lo mismo que el repositorio y no expone ningún método que escriba", async () => {
    const repo = new InMemoryWorldRepository({ clock: new FakeClock(1_000), newId: sequentialIds() });
    const user = await repo.ensureDefaultUser();
    const w = await repo.createWorld({ ownerId: user.id, name: "A", seed: "s", generator: "zones", generatorVersion: 1 });
    await repo.setMeta("clave", 7);
    const ro = readOnly(repo);

    expect(Object.keys(ro).sort()).toEqual(["getMeta", "getThumbnail", "listChunks", "listWorlds", "loadChunk", "loadWorld"]);
    expect(await ro.listWorlds(user.id)).toEqual(await repo.listWorlds(user.id));
    expect((await ro.loadWorld(w.id)).world.id).toBe(w.id);
    expect(await ro.loadChunk(w.id, 0, 0)).toBeNull();
    expect(await ro.listChunks(w.id)).toEqual([]);
    expect(await ro.getThumbnail(w.id)).toBeNull();
    expect(await ro.getMeta("clave")).toBe(7);
  });
});
