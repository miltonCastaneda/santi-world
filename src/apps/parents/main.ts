import type { Clock } from "../../core/clock";
import { TRASH_RETENTION_MS, type World } from "../../domain/repository/model";
import { readOnly } from "../../domain/repository/worldRepository";
import { openChannel } from "../../persistence/broadcast";
import { DexieWorldRepository, SantiDatabase } from "../../persistence/dexieRepository";
import { errorMessage, recordError } from "../../persistence/errorLog";
import { PinGuard } from "../../persistence/pin";
import { pinGate, renderParents } from "../../ui/parents/parentsView";
import { openWorldViewer } from "./viewer";

const root = document.querySelector<HTMLElement>("#parents-root");
if (!root) throw new Error("No se encontró la vista de padres");

const clock: Clock = { now: () => Date.now() };
const db = new SantiDatabase();
const newId = () => crypto.randomUUID();
const repo = new DexieWorldRepository(db, { clock, newId });
const channel = openChannel();

function download(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileName = (w: World) => `${w.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "mundo"}.santi.json`;

async function boot(): Promise<void> {
  const user = await repo.ensureDefaultUser();
  await repo.purgeExpired(clock.now(), TRASH_RETENTION_MS).catch((error) => recordError(repo, { at: clock.now(), context: "vaciar la papelera", message: errorMessage(error) }));

  const pin = new PinGuard(repo, clock);
  if (await pin.isEnabled()) await pinGate(root!, { verify: (p) => pin.verify(p), lockedUntil: () => pin.lockedUntil(), now: clock.now });

  const viewerRepo = readOnly(repo);
  const view = renderParents(root!, {
    worlds: () => repo.listWorlds(user.id),
    trash: async () => (await repo.listWorlds(user.id, { includeDeleted: true })).filter((w) => w.deletedAt !== undefined),
    thumbnail: (id) => repo.getThumbnail(id),
    openViewer: (world, canvas) => openWorldViewer(viewerRepo, world, canvas),
    softDelete: async (id) => {
      await repo.softDelete(id);
      channel.post({ type: "worldsChanged" });
    },
    restore: async (id) => {
      await repo.restore(id);
      channel.post({ type: "worldsChanged" });
    },
    saveSettings: async (id, settings) => {
      const w = await repo.updateSettings(id, settings);
      channel.post({ type: "settingsChanged", worldId: id });
      return w;
    },
    exportWorld: async (w) => download(await repo.exportWorld(w.id), fileName(w)),
    importWorld: async (file) => {
      const w = await repo.importWorld(file, user.id);
      channel.post({ type: "worldsChanged" });
      return w;
    },
    storage: async () => {
      const est = await navigator.storage?.estimate?.();
      return est ? { usage: est.usage ?? 0, quota: est.quota ?? 0 } : null;
    },
    pin,
    now: clock.now,
    retentionMs: TRASH_RETENTION_MS,
  });
  await view.refresh();

  // El juego avisa cuando guarda (quizá en otra pestaña): se refresca la lista sin recargar.
  let pending: ReturnType<typeof setTimeout> | null = null;
  channel.onMessage((msg) => {
    if (msg.type === "settingsChanged" || pending) return;
    pending = setTimeout(() => {
      pending = null;
      void view.refresh();
    }, 200);
  });

  if (import.meta.env.DEV && new URLSearchParams(location.search).has("test")) {
    const { installParentsTestApi } = await import("../../testing/parentsTestApi");
    installParentsTestApi({
      repo,
      ownerId: user.id,
      pin,
      refresh: () => view.refresh(),
      repoAt: (offsetMs) => new DexieWorldRepository(db, { clock: { now: () => clock.now() + offsetMs }, newId }),
    });
  }
}

void boot();
