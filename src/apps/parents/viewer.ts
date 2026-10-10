import type { World } from "../../domain/repository/model";
import type { ReadOnlyWorldRepository } from "../../domain/repository/worldRepository";
import { TerrainWorld } from "../../domain/world/terrainWorld";

/**
 * Visor de solo lectura (design D13): reutiliza el render con la cámara orbital, sin simulación,
 * sin reloj del mundo y sin guardar. Muestra el último estado guardado.
 */
export async function openWorldViewer(repo: ReadOnlyWorldRepository, world: World, canvas: HTMLCanvasElement): Promise<() => void> {
  const [{ state }, records, { RenderApp }] = await Promise.all([repo.loadWorld(world.id), repo.listChunks(world.id), import("../../render/renderApp")]);
  const terrain = TerrainWorld.fromRecords(world.seed, world.generator, records);
  const view = new RenderApp(canvas, terrain.store, terrain.gen, terrain.spawn);
  if (state.camera) view.setView(state.camera.position, state.camera.target);
  else view.setSpawnView(terrain.spawn);
  let raf = 0;
  const frame = () => {
    view.render();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    view.dispose();
  };
}
