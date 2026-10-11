import { AudioService, type AudioContextLike } from "../../audio/audioService";
import { connectGameAudio, musicFor } from "../../audio/gameAudio";
import { SOUND_NAMES } from "../../audio/synth";
import type { Clock } from "../../core/clock";
import { TRASH_RETENTION_MS, type WorldSettings } from "../../domain/repository/model";
import { GameInput } from "../../input/gameInput";
import { PointerInput } from "../../input/pointerInput";
import { AutosaveService } from "../../persistence/autosave";
import { openChannel } from "../../persistence/broadcast";
import { DexieWorldRepository, SantiDatabase } from "../../persistence/dexieRepository";
import { errorMessage, recordError } from "../../persistence/errorLog";
import { importLegacyWorld } from "../../persistence/legacyImport";
import { requestPersistentStorage } from "../../persistence/storage";
import type { EntityView } from "../../render/entityRenderer";
import type { PlayerView } from "../../render/playerModel";
import type { ArrowView } from "../../render/projectileRenderer";
import { RenderApp } from "../../render/renderApp";
import { Game } from "../../sim/game";
import { FixedStepLoop, STEP_MS } from "../../sim/loop";
import { ACTION_MS } from "../../sim/player";
import { GameSession } from "../../sim/session";
import { MAX_ZOMBIES } from "../../sim/systems/spawn";
import { setupDebugOverlay } from "../../ui/debugOverlay";
import { setupHud } from "../../ui/hud";
import { setupHudClock } from "../../ui/kid/hudClock";
import { setupInventory } from "../../ui/kid/inventory";
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

const playerView = (): PlayerView => {
  const p = game.player;
  const t = game.timeMs;
  return {
    pos: p.pos,
    yaw: p.yaw,
    anim: p.animAt(t),
    swing: p.swing,
    actionProgress: Math.min(1, Math.max(0, 1 - (p.actionUntil - t) / ACTION_MS)),
    tool: p.tool,
    invulnerable: p.isInvulnerable(t),
  };
};

/** Parpadeo tras un rebote (hasta este momento, por entidad). */
const blinkUntil = new Map<string, number>();
const BLINK_MS = 400;

function* entityViews(): Iterable<EntityView> {
  const now = performance.now();
  for (const e of game.entities.all()) {
    const until = blinkUntil.get(e.id);
    if (until !== undefined && until < now) blinkUntil.delete(e.id);
    const species = e.species === "wolf" && e.tamed ? "wolfTame" : e.species;
    yield { id: e.id, species, pos: e.body.pos, yaw: e.yaw, anim: e.anim ?? "idle", blink: until !== undefined && until >= now };
  }
}

/** Las flechas van a 30 bloques/s: entre dos pasos de la simulación se adelantan con su velocidad. */
function* arrowViews(): Iterable<ArrowView> {
  const ahead = (loop.alpha * STEP_MS) / 1000;
  for (const a of game.projectiles.arrows) {
    yield { pos: { x: a.pos.x + a.vel.x * ahead, y: a.pos.y + a.vel.y * ahead, z: a.pos.z + a.vel.z * ahead }, vel: a.vel };
  }
}

const view = new RenderApp(canvas, game.world.store, game.world.gen, game.world.spawn, {
  viewRadius,
  workers,
  follow: { player: playerView, isSolid: (x, y, z) => game.collision(x, y, z) > 0, now: () => performance.now() },
  entities: entityViews,
  arrows: arrowViews,
});

game.events.on("blockChanged", ({ pos }) => view.chunks.invalidateBlock(pos.x, pos.z));
// Brillo del diamante minado: destellos que salen del bloque, que ya es piedra.
game.events.on("blockMined", ({ pos }) => view.entities?.poof({ x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 }, "sparkle"));
game.events.on("entityHit", ({ id, pos, outcome, defeated }) => {
  // Rebote o golpe que no hace "poof" (el lobo salvaje retrocede): parpadeo cartoon.
  if (outcome === "boing" || (outcome === "defeat" && !defeated)) blinkUntil.set(id, performance.now() + BLINK_MS);
  if (outcome === "tame" || outcome === "happy") view.entities?.poof(pos, "hearts");
});
game.events.on("worldReplaced", ({ world }) => {
  view.chunks.rebuildAll(world.store, world.gen);
  view.entities?.clear();
  view.projectiles?.clear();
});
// El fuego del dragón: llamaradas cartoon mientras quema el árbol, y una nube cuando desaparece.
const FIRE_BURSTS_MS = [0, 600, 1200];
game.events.on("dragonFire", ({ pos }) => {
  for (const ms of FIRE_BURSTS_MS) setTimeout(() => view.projectiles?.fire(pos), ms);
});
game.events.on("treeBurnt", ({ pos }) => {
  view.projectiles?.fire(pos);
  view.entities?.poof({ x: pos.x, y: pos.y + 2, z: pos.z }, "cloud");
});
game.events.on("dragonHit", ({ id }) => blinkUntil.set(id, performance.now() + BLINK_MS));
game.events.on("dragonDefeated", ({ pos }) => {
  // Un "poof" de estrellas grande, del tamaño del dragón.
  for (const [dx, dy, dz] of [[0, 0.5, 0], [-1, 1, 0.5], [1, 1, -0.5], [0, 1.5, 1]]) view.entities?.poof({ x: pos.x + dx, y: pos.y + dy, z: pos.z + dz }, "sparkle");
});
game.events.on("dragonAte", ({ pos }) => view.entities?.poof(pos, "cloud"));
game.events.on("playerRespawned", () => view.isFollowing && view.followPlayer());

const repo = new DexieWorldRepository(new SantiDatabase(), { clock: wallClock, newId: () => crypto.randomUUID() });
const warning = setupSaveWarning();
const logError = (context: string, error: unknown) => void recordError(repo, { at: wallClock.now(), context, message: errorMessage(error) });

const hudClock = setupHudClock(document.getElementById("day-clock")!, () => game.clock);
const inventoryPanel = setupInventory(
  () => game.enqueue({ type: "toggleInventory" }),
  () => game.enqueue({ type: "toggleRelease" }),
);
inventoryPanel.update(game.inventory);
game.events.on("inventoryToggled", ({ open }) => inventoryPanel.setOpen(open));
game.events.on("inventoryChanged", ({ inventory }) => inventoryPanel.update(inventory));
game.events.on("releaseArmed", ({ armed }) => inventoryPanel.setReleaseArmed(armed));
game.events.on("pigChickenReleased", ({ pos }) => view.entities?.poof(pos, "cloud"));

const audio = new AudioService(() => (typeof AudioContext === "undefined" ? null : (new AudioContext() as unknown as AudioContextLike)));
audio.attachUnlock(window);
setTimeout(() => audio.prepare(SOUND_NAMES), 0);
connectGameAudio(audio, game);
const applyVolumes = (s: WorldSettings) => audio.setVolumes(s.volume);

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
  entities: game.entities.size,
  entitiesDrawn: view.entities?.stats.drawn ?? 0,
  entityDrawCalls: view.entities?.stats.drawCalls ?? 0,
  pathNodes: game.animals.paths.lastExpanded,
  tick: game.tick,
}));

async function boot(): Promise<void> {
  const user = await repo.ensureDefaultUser();
  await repo.purgeExpired(wallClock.now(), TRASH_RETENTION_MS).catch((error) => logError("vaciar la papelera", error));
  const legacy = await importLegacyWorld({ storage: localStorage, repo, ownerId: user.id, clock: wallClock });
  const channel = openChannel();

  // La cámara se guarda solo para que el visor de padres abra donde estaba jugando el niño.
  const session = new GameSession(game, user.id, { repo, clock: wallClock, newSeed, camera: () => view.cameraView() });
  session.events.on("worldOpened", ({ world }) => {
    view.followPlayer();
    applyVolumes(world.settings);
    audio.setMusic(musicFor(game.clock));
    hudClock.refresh();
  });
  session.events.on("settingsChanged", ({ world }) => applyVolumes(world.settings));

  const autosave = new AutosaveService(repo, session, wallClock, {
    thumbnail: () => view.thumbnail(),
    onError: (error) => {
      warning.show();
      logError("autoguardado", error);
    },
    onSaved: () => {
      warning.hide();
      if (session.world) channel.post({ type: "saved", worldId: session.world.id });
    },
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
    toggleMute: () => audio.toggleMute(),
    click: () => audio.play("click"),
  });
  session.events.on("busyChanged", ({ busy }) => hud.setBusy(busy));
  channel.onMessage((msg) => {
    if (msg.type === "settingsChanged") void session.reloadSettings(msg.worldId).catch((error) => logError("aplicar la configuración", error));
  });

  const input = new GameInput(window, canvas!, {
    send: (intent) => game.enqueue(intent),
    headingYaw: () => view.headingYaw,
    selectSlot: (i) => hud.selectSlot(i),
    cycleSlot: (d) => hud.cycleSlot(d),
    isBlocked: () => document.querySelector(".worlds-panel:not([hidden])") !== null,
  });
  game.events.on("worldReplaced", () => input.resync());

  try {
    await session.openInitial({ seed: seedParam, worldId: legacy.status === "imported" && !seedParam ? legacy.world.id : undefined });
  } catch (error) {
    // Un guardado ilegible no debe dejar al niño sin juego: se registra y se empieza un mundo nuevo.
    logError("abrir el último mundo", error);
    await session.openInitial({ seed: newSeed() });
  }
  // Marcas de User Timing del arranque (docs/performance.md): mundo abierto y primer paso del personaje.
  performance.mark("santi:jugable");
  let firstMoveFrom: { x: number; z: number } | null = { x: game.player.pos.x, z: game.player.pos.z };

  const perf = params.has("perf") && game.world.layout ? createPerfRoute(view, game.world.layout, game.seed, Number(params.get("perfMs") ?? 60_000)) : null;
  if (perf && params.has("night")) startPerfNight();

  document.addEventListener("visibilitychange", () => loop.setPaused(document.hidden));

  const frame = (now: number) => {
    frameStats.frame(now);
    input.update();
    loop.frame(now);
    if (firstMoveFrom && Math.hypot(game.player.pos.x - firstMoveFrom.x, game.player.pos.z - firstMoveFrom.z) > 0.05) {
      performance.mark("santi:primer-movimiento");
      firstMoveFrom = null;
    }
    perf?.frame(now);
    const clock = game.clock;
    view.setTime(clock.daylight, { isNight: clock.isNight, progress: clock.phaseProgress });
    view.render(now);
    audio.setListener(view.camera.position, view.headingYaw);
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
      audio,
      view: {
        setView: (p, t) => view.setView(p, t),
        followPlayer: () => view.followPlayer(),
        cameraPos: () => ({ ...view.camera.position }),
        playerModel: () => (view.playerModel ? { anim: view.playerModel.anim, shownTool: view.playerModel.shownTool } : null),
        setPlayerVisible: (visible) => {
          if (view.playerModel) view.playerModel.root.visible = visible;
        },
        setEntitiesVisible: (visible) => {
          if (view.entities) view.entities.group.visible = visible;
        },
        isWorldReady: () => view.chunks.idle && view.chunks.stats.meshed > 0,
        chunkMeshed: (cx, cz) => view.chunks.isMeshed(cx, cz),
        chunkUpToDate: (cx, cz) => view.chunks.isUpToDate(cx, cz),
        stats: () => ({
          updateP95: percentile(view.chunks.updateSamples, 0.95),
          updateP99: percentile(view.chunks.updateSamples, 0.99),
          drawCalls: view.renderer.info.render.calls,
          frames: view.renderer.info.render.frame,
          meshed: view.chunks.stats.meshed,
          maxMainThreadMs: view.chunks.stats.maxMainThreadMs,
          workerMsAvg: view.chunks.stats.workerMsAvg,
          meshJobs: view.chunks.stats.jobs,
          fps: frameStats.fps,
          entitiesDrawn: view.entities?.stats.drawn ?? 0,
          entityDrawCalls: view.entities?.stats.drawCalls ?? 0,
          poofs: view.entities?.stats.poofs ?? 0,
          effectDrawCalls: view.projectiles?.drawCalls ?? 0,
        }),
        resetStats: () => view.chunks.resetMaxStats(),
      },
    });
  }
}

/** `?perf=1&night=1`: la ruta de cámara de noche, con el máximo de zombis alrededor de la granja. */
function startPerfNight(): void {
  game.clock.restore(game.clock.durations.dayMs, game.clock.dayCount);
  const p = game.player.pos;
  for (let i = 0; i < MAX_ZOMBIES; i++) {
    const a = (i / MAX_ZOMBIES) * Math.PI * 2;
    const x = Math.floor(p.x + Math.cos(a) * 12);
    const z = Math.floor(p.z + Math.sin(a) * 12);
    game.spawnZombie({ x: x + 0.5, y: game.world.store.surfaceY(x, z) + 1, z: z + 0.5 });
  }
}

void boot();
