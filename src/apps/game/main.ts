import { PointerInput } from "../../input/pointerInput";
import { BASE_Y } from "../../domain/worldgen/layout";
import { RenderApp } from "../../render/renderApp";
import { Game } from "../../sim/game";
import { FixedStepLoop } from "../../sim/loop";
import { setupDebugOverlay } from "../../ui/debugOverlay";
import { setupHud } from "../../ui/hud";
import { FrameStats, percentile } from "./frameStats";
import { createPerfRoute } from "./perfRoute";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("No se encontró el lienzo");

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? (params.has("perf") ? "perf-001" : "santi");

// Incremento 2: el mundo por chunks todavía no se guarda. El mundo v1 de localStorage queda intacto
// hasta que el incremento 3 lo importe como "Mi primer mundo".
const game = new Game({ seed });
const loop = new FixedStepLoop((dt) => game.step(dt));
const farm = game.world.layout.farm;
const viewRadius = Math.max(2, Math.min(8, Number(params.get("view") ?? 6)));
const workers = params.has("workers") ? Math.max(0, Math.min(4, Number(params.get("workers")))) : undefined;
const view = new RenderApp(canvas, game.world.store, game.seed, { x: (farm.x0 + farm.x1) / 2, y: BASE_Y, z: (farm.z0 + farm.z1) / 2 }, { viewRadius, workers });

game.events.on("blockChanged", ({ pos }) => view.chunks.invalidateBlock(pos.x, pos.z));
game.events.on("worldReplaced", ({ world }) => view.chunks.rebuildAll(world.store, world.seed));

new PointerInput(canvas, view.camera, (intent) => game.enqueue(intent));
setupHud(game);

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

const perf = params.has("perf") ? createPerfRoute(view, game.world.layout, seed, Number(params.get("perfMs") ?? 60_000)) : null;

document.addEventListener("visibilitychange", () => loop.setPaused(document.hidden));

function frame(now: number): void {
  frameStats.frame(now);
  loop.frame(now);
  perf?.frame(now);
  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV && params.has("test")) {
  void import("../../testing/testApi").then(({ installTestApi }) =>
    installTestApi({
      game,
      loop,
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
    }),
  );
}
