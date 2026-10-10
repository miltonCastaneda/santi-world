import type { WorldLayout } from "../../domain/worldgen/layout";
import { BASE_Y, riverCenterX } from "../../domain/worldgen/layout";
import type { RenderApp } from "../../render/renderApp";
import { percentile } from "./frameStats";

export type PerfResult = {
  seed: string;
  durationMs: number;
  loadMs: number;
  frames: number;
  fpsAvg: number;
  p50: number;
  p95: number;
  p99: number;
  maxFrame: number;
  drawCallsMax: number;
  drawCallsAvg: number;
  mesherMainMaxMs: number;
  mesherMainP99Ms: number;
  mesherWorkerMsAvg: number;
  gpu: string;
  userAgent: string;
};

declare global {
  interface Window {
    __perfResult?: PerfResult;
  }
}

/**
 * Ruta de cámara estándar (`?perf=1`): espera la carga inicial y recorre la granja, el bosque, la
 * montaña de roca, el puente y el estanque durante `durationMs`, midiendo cada frame.
 */
export function createPerfRoute(view: RenderApp, layout: WorldLayout, seed: string, durationMs = 60_000) {
  const farm = { x: (layout.farm.x0 + layout.farm.x1) / 2, z: (layout.farm.z0 + layout.farm.z1) / 2 };
  const waypoints = [
    farm,
    { x: layout.forestMountain.x, z: layout.forestMountain.z },
    { x: layout.rockMountain.x, z: layout.rockMountain.z },
    { x: riverCenterX(layout.river, layout.bridgeZ), z: layout.bridgeZ },
    { x: layout.pond.x, z: layout.pond.z },
    farm,
  ];
  const t0 = performance.now();
  let loadedAt: number | null = null;
  let startedAt = 0;
  let last = 0;
  const frames: number[] = [];
  const calls: number[] = [];
  let done = false;

  const targetAt = (u: number) => {
    const seg = Math.min(waypoints.length - 2, Math.floor(u * (waypoints.length - 1)));
    const local = u * (waypoints.length - 1) - seg;
    const a = waypoints[seg];
    const b = waypoints[seg + 1];
    return { x: a.x + (b.x - a.x) * local, z: a.z + (b.z - a.z) * local };
  };

  const gpuName = () => {
    const gl = view.renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "desconocida";
  };

  return {
    /** Llamar antes de render() en cada frame. */
    frame(now: number): void {
      if (done) return;
      if (loadedAt === null) {
        if (view.chunks.idle && view.chunks.stats.meshed > 0) {
          loadedAt = now;
          startedAt = now;
          last = now;
          view.chunks.resetMaxStats();
        }
        return;
      }
      frames.push(now - last);
      last = now;
      calls.push(view.renderer.info.render.calls);
      const u = Math.min(1, (now - startedAt) / durationMs);
      const t = targetAt(u);
      const angle = u * Math.PI * 4;
      view.setView({ x: t.x + Math.cos(angle) * 40, y: BASE_Y + 28, z: t.z + Math.sin(angle) * 40 }, { x: t.x, y: BASE_Y + 4, z: t.z });
      if (u >= 1) {
        done = true;
        const result: PerfResult = {
          seed,
          durationMs,
          loadMs: Math.round(loadedAt - t0),
          frames: frames.length,
          fpsAvg: frames.length / (durationMs / 1000),
          p50: percentile(frames, 0.5),
          p95: percentile(frames, 0.95),
          p99: percentile(frames, 0.99),
          maxFrame: Math.max(...frames),
          drawCallsMax: Math.max(...calls),
          drawCallsAvg: calls.reduce((a, b) => a + b, 0) / calls.length,
          mesherMainMaxMs: view.chunks.stats.maxMainThreadMs,
          mesherMainP99Ms: percentile(view.chunks.updateSamples, 0.99),
          mesherWorkerMsAvg: view.chunks.stats.workerMsAvg,
          gpu: gpuName(),
          userAgent: navigator.userAgent,
        };
        window.__perfResult = result;
        console.info(`PERF_RESULT ${JSON.stringify(result)}`);
      }
    },
  };
}
