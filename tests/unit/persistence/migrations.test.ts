import { describe, expect, it } from "vitest";
import { defaultGameState, SCHEMA_VERSION, type World } from "../../../src/domain/repository/model";
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

  it("los documentos de la versión actual pasan sin cambios", () => {
    const state = defaultGameState("w1", 5);
    expect(migrateState(state)).toEqual(state);
    const world = { id: "w1", schemaVersion: SCHEMA_VERSION, name: "A" } as World;
    expect(migrateWorld(world)).toEqual(world);
  });
});
