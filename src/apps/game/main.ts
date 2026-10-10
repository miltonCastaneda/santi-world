import { PointerInput } from "../../input/pointerInput";
import { loadLegacyWorld, saveLegacyWorld } from "../../persistence/legacyLocalStorage";
import { RenderApp } from "../../render/renderApp";
import { sceneToVoxelSpace } from "../../render/worldMesh";
import { Game } from "../../sim/game";
import { FixedStepLoop } from "../../sim/loop";
import { setupHud } from "../../ui/hud";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("No se encontró el lienzo");

const world = loadLegacyWorld(localStorage) ?? undefined;
const game = new Game({ world });
const loop = new FixedStepLoop((dt) => game.step(dt));
const view = new RenderApp(canvas);

view.worldMesh.rebuild(game.world);
game.events.on("blockChanged", () => {
  view.worldMesh.rebuild(game.world);
  saveLegacyWorld(localStorage, game.world);
});

new PointerInput(canvas, view.camera, sceneToVoxelSpace, (intent) => game.enqueue(intent));
setupHud(game);

document.addEventListener("visibilitychange", () => loop.setPaused(document.hidden));

function frame(now: number): void {
  loop.frame(now);
  view.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV && new URLSearchParams(location.search).has("test")) {
  void import("../../testing/testApi").then(({ installTestApi }) => installTestApi({ game, loop }));
}
