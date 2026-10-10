import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultGameState, SCHEMA_VERSION, type GameState, type World } from "../../../src/domain/repository/model";
import { migrateState, migrateWorld, runMigrations, type MigrationTable } from "../../../src/persistence/migrations";

describe("[mundos-y-persistencia] Esquema versionado y migraciones", () => {
  const table: MigrationTable = {
    1: (d) => ({ ...d, name: d.title, title: undefined }),
    2: (d) => ({ ...d, dayCount: d.dayCount ?? 1 }),
  };

  it("aplica las migraciones en orden hasta la versión pedida", () => {
    const v0 = { title: "Casa" };
    expect(runMigrations(v0, table, 2)).toEqual({ name: "Casa", title: undefined, dayCount: 1, schemaVersion: 2 });
  });

  it("no modifica el documento original", () => {
    const v1 = { schemaVersion: 1, name: "A" };
    const copy = structuredClone(v1);
    runMigrations(v1, table, 2);
    expect(v1).toEqual(copy);
  });

  it("si una migración falla, lanza el error y el original queda intacto", () => {
    const broken: MigrationTable = {
      1: () => {
        throw new Error("dato inesperado");
      },
    };
    const v0 = { title: "Casa" };
    expect(() => runMigrations(v0, broken, 1)).toThrow("dato inesperado");
    expect(v0).toEqual({ title: "Casa" });
  });

  it("rechaza datos de una versión más nueva que la del juego y migraciones que faltan", () => {
    expect(() => runMigrations({ schemaVersion: 9 }, table, 2)).toThrow(/más nueva/);
    expect(() => runMigrations({ schemaVersion: 0 }, {}, 1)).toThrow(/Falta la migración/);
  });

  it("esquema 1 a 2: un estado guardado antes de los animales queda pendiente de poblar", () => {
    const v1 = JSON.parse(readFileSync("tests/fixtures/state-v1.json", "utf8")) as GameState;
    const v2 = migrateState(v1);
    expect(v2).toMatchObject({ schemaVersion: 2, animalsSpawned: false, player: v1.player, inventory: v1.inventory });
    expect(migrateWorld({ id: "w1", schemaVersion: 1, name: "A" } as World)).toEqual({ id: "w1", schemaVersion: 2, name: "A" });
  });

  it("los documentos de la versión actual pasan sin cambios", () => {
    const state = defaultGameState("w1", 5);
    expect(migrateState(state)).toEqual(state);
    const world = { id: "w1", schemaVersion: SCHEMA_VERSION, name: "A" } as World;
    expect(migrateWorld(world)).toEqual(world);
  });
});
