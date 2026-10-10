import { SCHEMA_VERSION, type GameState, type World } from "../domain/repository/model";

type Doc = { schemaVersion?: number } & Record<string, unknown>;

/** `table[n]` convierte un documento de la versión n-1 en uno de la versión n. Debe ser pura. */
export type MigrationTable = Record<number, (doc: Doc) => Doc>;

/**
 * Migraciones de los documentos World y GameState (design D4, nivel 2). Cuando cambie la forma de un
 * documento: subir SCHEMA_VERSION, agregar aquí la función y un fixture de la versión anterior en
 * tests/fixtures/. La estructura de IndexedDB se migra aparte, con `db.version(n).upgrade()`.
 */
export const WORLD_MIGRATIONS: MigrationTable = {
  // Esquema 2 (animales): el mundo no cambia de forma.
  2: (doc) => doc,
};
export const STATE_MIGRATIONS: MigrationTable = {
  // Esquema 2: los mundos guardados antes de los animales reciben su población al abrirse.
  2: (doc) => ({ ...doc, animalsSpawned: false }),
};

/**
 * Lleva un documento a la versión `target`. Trabaja sobre una copia: si una migración falla, lanza
 * el error y el original queda intacto.
 */
export function runMigrations<T>(doc: Doc, table: MigrationTable, target: number): T {
  const from = doc.schemaVersion ?? 0;
  if (from > target) throw new Error(`Datos de una versión más nueva (${from}) que la del juego (${target}).`);
  let current = structuredClone(doc);
  for (let v = from + 1; v <= target; v++) {
    const step = table[v];
    if (!step) throw new Error(`Falta la migración a la versión ${v}.`);
    current = { ...step(current), schemaVersion: v };
  }
  return current as T;
}

export function migrateWorld(doc: World): World {
  return runMigrations<World>(doc as unknown as Doc, WORLD_MIGRATIONS, SCHEMA_VERSION);
}

export function migrateState(doc: GameState): GameState {
  return runMigrations<GameState>(doc as unknown as Doc, STATE_MIGRATIONS, SCHEMA_VERSION);
}
