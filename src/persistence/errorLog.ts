import type { WorldRepository } from "../domain/repository/worldRepository";

export const ERROR_LOG_KEY = "errorLog";
const MAX_ENTRIES = 50;

export type ErrorLogEntry = { at: number; context: string; message: string };

/** Registra un error para la vista de padres. Nunca lanza: si tampoco se puede escribir, queda en la consola. */
export async function recordError(repo: WorldRepository, entry: ErrorLogEntry): Promise<void> {
  console.warn(`[${entry.context}] ${entry.message}`);
  try {
    const list = (await repo.getMeta<ErrorLogEntry[]>(ERROR_LOG_KEY)) ?? [];
    list.push(entry);
    await repo.setMeta(ERROR_LOG_KEY, list.slice(-MAX_ENTRIES));
  } catch {
    // Sin espacio o sin base de datos: el aviso ya quedó en la consola.
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
