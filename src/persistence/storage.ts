/**
 * Pide al navegador que no desaloje los datos del juego (se llama en el primer guardado). Devuelve
 * true si el almacenamiento queda persistente. Nunca lanza: si no se concede, el juego sigue igual.
 */
export async function requestPersistentStorage(nav: { storage?: Partial<Pick<StorageManager, "persist" | "persisted">> } = navigator): Promise<boolean> {
  try {
    if (await nav.storage?.persisted?.()) return true;
    return (await nav.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
