import type { Clock } from "../../core/clock";
import { PointerInput } from "../../input/pointerInput";
import { AutosaveService } from "../../persistence/autosave";
import { DexieWorldRepository, SantiDatabase } from "../../persistence/dexieRepository";
import { errorMessage, recordError } from "../../persistence/errorLog";
import { importLegacyWorld } from "../../persistence/legacyImport";
import { requestPersistentStorage } from "../../persistence/storage";
import { RenderApp } from "../../render/renderApp";
import { Game } from "../../sim/game";
import { FixedStepLoop } from "../../sim/loop";
import { GameSession } from "../../sim/session";
import { setupDebugOverlay } from "../../ui/debugOverlay";
import { setupHud } from "../../ui/hud";
import { setupMisMundos } from "../../ui/kid/misMundos";
import { setupSaveWarning } from "../../ui/kid/saveWarning";
import { FrameStats, percentile } from "./frameStats";
import { createPerfRoute } from "./perfRoute";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("No se encontró el lienzo");

const params = new URLSearchParams(location.search);
const seedParam = params.get("seed") ?? (params.has("perf") ? "perf-001" : undefined);
const viewRadius = Math.max(2, Math.min(8, Number(params.get("view") ?? 6)));
const workers = params.has("workers") ? Math.max(0, Math.min(4, Number(params.get("workers")))) : undefined;

/** Reloj de pared para las marcas de tiempo de lo guardado (la simulación usa el bucle). */
const wallClock: Clock = { now: () => Date.now() };
const newSeed = () => crypto.randomUUID().slice(0, 8);

// Mundo provisional hasta que la sesión abra el guardado (no se dibuja: el bucle arranca después).
const game = new Game({ seed: seedParam ?? "santi" });
const loop = new FixedStepLoop((dt) => game.step(dt));
const view = new RenderApp(canvas, game.world.store, game.world.gen, game.world.spawn, { viewRadius, workers });

game.events.on("blockChanged", ({ pos }) => view.chunks.invalidateBlock(pos.x, pos.z));
game.events.on("worldReplaced", ({ world }) => view.chunks.rebuildAll(world.store, world.gen));

const repo = new DexieWorldRepository(new SantiDatabase(), { clock: wallClock, newId: () => crypto.randomUUID() });
const warning = setupSaveWarning();
const logError = (context: string, error: unknown) => void recordError(repo, { at: wallClock.now(), context, message: errorMessage(error) });

new PointerInput(canvas, view.camera, (intent) => game.enqueue(intent));

const frameStats = new FrameStats();
setupDebugOverlay(() => ({
  fps: frameStats.fps,
  frameMsAvg: frameStats.avg,
  frameMsP95: frameStats.p95,
  drawCalls: view.renderer.info.render.calls,
  triangles: view.renderer.info.render.triangles,
  chunksMeshed: view.chunks.stats.meshed,
  chunksPending: view.chunks.stats.pending + view.chunks.stats.inFlight,
  chunksLoaded: view.chunks.stats.loadedChunks,
  mesherMainMs: view.chunks.stats.mainThreadMs,
  mesherMainMaxMs: view.chunks.stats.maxMainThreadMs,
  mesherWorkerMsAvg: view.chunks.stats.workerMsAvg,
  tick: game.tick,
}));

async function boot(): Promise<void> {
  const user = await repo.ensureDefaultUser();
  const legacy = await importLegacyWorld({ storage: localStorage, repo, ownerId: user.id, clock: wallClock });

  const session = new GameSession(game, user.id, { repo, clock: wallClock, newSeed, camera: () => view.cameraView() });
  session.events.on("worldOpened", ({ state }) => {
    if (state.camera) view.setView(state.camera.position, state.camera.target);
    else view.setSpawnView(game.world.spawn);
  });

  const autosave = new AutosaveService(repo, session, wallClock, {
    thumbnail: () => view.thumbnail(),
    onError: (error) => {
      warning.show();
      logError("autoguardado", error);
    },
    onSaved: () => warning.hide(),
    onFirstSave: () => void requestPersistentStorage(),
  });
  session.attachSaver(autosave);
  autosave.attachLifecycle(window, document);
  session.events.on("saveFailed", ({ error, during }) => {
    warning.show();
    logError(during === "create" ? "crear nuevo mundo" : "cambiar de mundo", error);
  });

  const worldsPanel = setupMisMundos({
    list: async () =>
      (await repo.listWorlds(user.id)).map((w) => ({
        id: w.id,
        name: w.name,
        updatedAt: w.updatedAt,
        current: w.id === session.world?.id,
        thumbnail: () => repo.getThumbnail(w.id),
      })),
    open: (id) => session.switchWorld(id),
    create: () => session.createWorld(),
  });
  const hud = setupHud(game, {
    createWorld: () => void session.createWorld(),
    openWorlds: () => void worldsPanel.show(),
  });
  session.events.on("busyChanged", ({ busy }) => hud.setBusy(busy));

  try {
    await session.openInitial({ seed: seedParam, worldId: legacy.status === "imported" && !seedParam ? legacy.world.id : undefined });
  } catch (error) {
    // Un guardado ilegible no debe dejar al niño sin juego: se registra y se empieza un mundo nuevo.
    logError("abrir el último mundo", error);
    await session.openInitial({ seed: newSeed() });
  }

  const perf = params.has("perf") && game.world.layout ? createPerfRoute(view, game.world.layout, game.seed, Number(params.get("perfMs") ?? 60_000)) : null;

  document.addEventListener("visibilitychange", () => loop.setPaused(document.hidden));

  const frame = (now: number) => {
    frameStats.frame(now);
    loop.frame(now);
    perf?.frame(now);
    view.render();
    autosave.tick();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV && params.has("test")) {
    const { installTestApi } = await import("../../testing/testApi");
    installTestApi({
      game,
      loop,
      session,
      autosave,
      repo,
      legacy,
      view: {
        setView: (p, t) => view.setView(p, t),
        isWorldReady: () => view.chunks.idle && view.chunks.stats.meshed > 0,
        stats: () => ({
          updateP95: percentile(view.chunks.updateSamples, 0.95),
          updateP99: percentile(view.chunks.updateSamples, 0.99),
          drawCalls: view.renderer.info.render.calls,
          meshed: view.chunks.stats.meshed,
          maxMainThreadMs: view.chunks.stats.maxMainThreadMs,
          workerMsAvg: view.chunks.stats.workerMsAvg,
          fps: frameStats.fps,
        }),
      },
    });
  }
}

void boot();
