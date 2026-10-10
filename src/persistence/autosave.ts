import type { Clock } from "../core/clock";
import type { SaveSnapshot } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";

/** De dónde sale lo que se guarda (GameSession). `collect` copia los datos de forma síncrona. */
export type SaveSource = {
  hasChanges(): boolean;
  collect(): { snapshot: SaveSnapshot; onSaved(): void } | null;
};

export type AutosaveOptions = {
  intervalMs?: number;
  /** Miniatura del mundo (WebP de 320x180), si hay render. */
  thumbnail?: () => Promise<Blob | null>;
  onError?: (error: unknown) => void;
  onSaved?: () => void;
  /** Solo la primera vez que un guardado se confirma (para navigator.storage.persist()). */
  onFirstSave?: () => void;
};

export const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * Autoguardado (design D4): cada 30 s si hay cambios, al ocultar o cerrar la pestaña y al perder el
 * foco. Vuelo único: si llega otro pedido durante un guardado, se encola uno solo para después.
 */
export class AutosaveService {
  saveCount = 0;
  failureCount = 0;
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private lastAttemptAt: number;
  private firstSaveDone = false;
  private readonly intervalMs: number;

  constructor(
    private readonly repo: WorldRepository,
    private readonly source: SaveSource,
    private readonly clock: Clock,
    private readonly options: AutosaveOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? AUTOSAVE_INTERVAL_MS;
    this.lastAttemptAt = clock.now();
  }

  get isSaving(): boolean {
    return this.running !== null;
  }

  /** Llamar con frecuencia (cada frame): guarda si hay cambios y ya pasó el intervalo. */
  tick(): void {
    if (this.running || this.clock.now() - this.lastAttemptAt < this.intervalMs) return;
    if (!this.source.hasChanges()) return;
    this.saveNow().catch(() => {});
  }

  /** Guarda ya. La promesa se rechaza si el guardado falla (lo usan las operaciones que limpian). */
  saveNow(): Promise<void> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null;
      });
      return this.running;
    }
    if (!this.queued) {
      this.queued = this.running
        .catch(() => {})
        .then(() => {
          this.queued = null;
          return this.saveNow();
        });
    }
    return this.queued;
  }

  /** Engancha los disparadores del navegador (o de un doble de pruebas). */
  attachLifecycle(win: Pick<EventTarget, "addEventListener">, doc: Pick<EventTarget, "addEventListener"> & { visibilityState: string }): void {
    const save = () => this.saveNow().catch(() => {});
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "hidden") save();
    });
    win.addEventListener("pagehide", save);
    win.addEventListener("blur", save);
  }

  private async run(): Promise<void> {
    this.lastAttemptAt = this.clock.now();
    if (!this.source.hasChanges()) return;
    const pending = this.source.collect();
    if (!pending) return;
    try {
      const thumbnail = (await this.options.thumbnail?.().catch(() => null)) ?? undefined;
      await this.repo.saveSnapshot(thumbnail ? { ...pending.snapshot, thumbnail } : pending.snapshot);
    } catch (error) {
      this.failureCount++;
      this.options.onError?.(error);
      throw error;
    }
    pending.onSaved();
    this.saveCount++;
    this.options.onSaved?.();
    if (!this.firstSaveDone) {
      this.firstSaveDone = true;
      this.options.onFirstSave?.();
    }
  }
}
