import type { World } from "../domain/repository/model";
import type { WorldRepository } from "../domain/repository/worldRepository";
import type { PinGuard } from "../persistence/pin";

export type ParentsTestDeps = {
  repo: WorldRepository;
  ownerId: string;
  pin: PinGuard;
  refresh(): Promise<void>;
  /** El mismo repositorio con el reloj desplazado (para fechar borrados en el pasado). */
  repoAt(offsetMs: number): WorldRepository;
};

async function solidThumbnail(color: string): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 180;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6"];

export type ParentsTestApi = ReturnType<typeof createApi>;

declare global {
  interface Window {
    __padres?: ParentsTestApi;
  }
}

/** API de prueba de la vista de padres (solo en desarrollo con ?test). */
export function installParentsTestApi(deps: ParentsTestDeps): void {
  window.__padres = createApi(deps);
}

function createApi(deps: ParentsTestDeps) {
  const { repo, ownerId } = deps;
  return {
    /** Crea n mundos guardados, uno tras otro (el último es el más reciente). */
    async createWorlds(n: number, opts: { thumbnails?: boolean } = {}): Promise<World[]> {
      const out: World[] = [];
      for (let i = 0; i < n; i++) {
        const w = await repo.createWorld({ ownerId, name: `Prueba ${i + 1}`, seed: `prueba-${i + 1}`, generator: "zones", generatorVersion: 1 });
        const loaded = await repo.loadWorld(w.id);
        const thumbnail = opts.thumbnails === false ? null : await solidThumbnail(COLORS[i % COLORS.length]);
        const world = { ...loaded.world, version: 1, updatedAt: w.updatedAt + i };
        await repo.saveSnapshot({ ...loaded, world, dirtyChunks: [], ...(thumbnail ? { thumbnail } : {}) });
        out.push(world);
      }
      await deps.refresh();
      return out;
    },
    worlds: () => repo.listWorlds(ownerId),
    trash: async () => (await repo.listWorlds(ownerId, { includeDeleted: true })).filter((w) => w.deletedAt !== undefined),
    loadWorld: (id: string) => repo.loadWorld(id),
    listChunks: async (id: string) => (await repo.listChunks(id)).map((c) => ({ cx: c.cx, cz: c.cz, version: c.version })),
    setPin: (pin: string) => deps.pin.set(pin),
    /** Borra el mundo como si hubiera sido hace `days` días. */
    deleteDaysAgo: (id: string, days: number) => deps.repoAt(-days * 24 * 60 * 60 * 1000).softDelete(id),
    refresh: () => deps.refresh(),
  };
}
