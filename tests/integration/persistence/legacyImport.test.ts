import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCK_NUM, type BlockId } from "../../../src/domain/blocks";
import { parseBlockKey } from "../../../src/domain/world/voxelWorld";
import { LEGACY_OFFSET } from "../../../src/domain/worldgen/generator";
import { ERROR_LOG_KEY, type ErrorLogEntry } from "../../../src/persistence/errorLog";
import { importLegacyWorld, LEGACY_BACKUP_KEY, LEGACY_IMPORTED_KEY, LEGACY_WORLD_NAME } from "../../../src/persistence/legacyImport";
import { LEGACY_STORAGE_KEY } from "../../../src/persistence/legacyLocalStorage";
import { setupSession } from "./helpers";

/** Mundo real guardado por la versión 1.0.0 (mundo por defecto, una casita, un hoyo y agua). */
const V1_FIXTURE = readFileSync("tests/fixtures/v1-world.json", "utf8");

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("[mundos-y-persistencia] Migración del mundo heredado", () => {
  it("crea 'Mi primer mundo' con exactamente los mismos bloques en las mismas posiciones relativas", async () => {
    const { repo, user, clock, session, game } = await setupSession();
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: V1_FIXTURE });

    const result = await importLegacyWorld({ storage, repo, ownerId: user.id, clock });
    expect(result.status).toBe("imported");
    if (result.status !== "imported") return;
    const entries = JSON.parse(V1_FIXTURE) as [string, BlockId][];
    expect(result.blocks).toBe(entries.length);

    const worlds = await repo.listWorlds(user.id);
    expect(worlds.map((w) => w.name)).toEqual([LEGACY_WORLD_NAME]);
    expect(worlds[0].generator).toBe("legacy-flat");

    await session.openInitial({ worldId: result.world.id });
    const store = game.world.store;
    for (const [key, id] of entries) {
      const { x, y, z } = parseBlockKey(key);
      const wx = LEGACY_OFFSET.x + x;
      const wy = LEGACY_OFFSET.y + y;
      const wz = LEGACY_OFFSET.z + z;
      expect(store.get(wx, wy, wz)).toBe(BLOCK_NUM[id]);
      expect(store.isPlaced(wx, wy, wz)).toBe(true);
    }
    // Las celdas vacías del mundo v1 siguen vacías (por ejemplo, el hoyo en 3,?,3 y el aire de la casita).
    const present = new Set(entries.map(([k]) => k));
    for (let x = 0; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        for (let y = 0; y < 12; y++) {
          if (!present.has(`${x},${y},${z}`)) expect(store.get(LEGACY_OFFSET.x + x, LEGACY_OFFSET.y + y, LEGACY_OFFSET.z + z)).toBe(0);
        }
      }
    }
  });

  it("los datos originales se renombran a -backup solo después de confirmar, y no se importa dos veces", async () => {
    const { repo, user, clock } = await setupSession();
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: V1_FIXTURE });
    await importLegacyWorld({ storage, repo, ownerId: user.id, clock });
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBeUndefined();
    expect(storage.data.get(LEGACY_BACKUP_KEY)).toBe(V1_FIXTURE);
    expect(await repo.getMeta(LEGACY_IMPORTED_KEY)).toMatchObject({ blocks: expect.any(Number) });

    storage.setItem(LEGACY_STORAGE_KEY, V1_FIXTURE);
    expect((await importLegacyWorld({ storage, repo, ownerId: user.id, clock })).status).toBe("already");
    expect((await repo.listWorlds(user.id)).length).toBe(1);
  });

  it("sin mundo v1 no hace nada", async () => {
    const { repo, user, clock } = await setupSession();
    expect((await importLegacyWorld({ storage: memoryStorage(), repo, ownerId: user.id, clock })).status).toBe("none");
    expect(await repo.listWorlds(user.id)).toEqual([]);
  });

  it("si el guardado del mundo importado falla, los datos originales quedan intactos y se reintenta después", async () => {
    const { repo, user, clock } = await setupSession();
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: V1_FIXTURE });
    repo.failSaves = new Error("QuotaExceededError");
    expect((await importLegacyWorld({ storage, repo, ownerId: user.id, clock })).status).toBe("failed");
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(V1_FIXTURE);
    expect(storage.data.has(LEGACY_BACKUP_KEY)).toBe(false);
    expect(await repo.listWorlds(user.id)).toEqual([]);

    repo.failSaves = null;
    expect((await importLegacyWorld({ storage, repo, ownerId: user.id, clock })).status).toBe("imported");
  });
});

describe("[mundos-y-persistencia] Migración fallida", () => {
  it.each([
    ["JSON roto", '[["1,0,1","grass"'],
    ["no es una lista", '{"a":1}'],
    ["sin bloques válidos", '[["99,0,0","lava"]]'],
  ])("datos corruptos (%s): el original se conserva y el juego arranca con un mundo nuevo", async (_name, raw) => {
    const { repo, user, clock, session } = await setupSession();
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: raw });

    const result = await importLegacyWorld({ storage, repo, ownerId: user.id, clock });
    expect(result.status).toBe("failed");
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(storage.data.has(LEGACY_BACKUP_KEY)).toBe(false);
    expect(await repo.getMeta(LEGACY_IMPORTED_KEY)).toBeUndefined();

    const log = await repo.getMeta<ErrorLogEntry[]>(ERROR_LOG_KEY);
    expect(log?.[0].context).toBe("importación del mundo v1");

    const world = await session.openInitial();
    expect(world.generator).toBe("zones");
    expect((await repo.listWorlds(user.id)).map((w) => w.id)).toEqual([world.id]);
  });
});
