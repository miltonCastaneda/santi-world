export type DebugStats = {
  fps: number;
  frameMsAvg: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  chunksMeshed: number;
  chunksPending: number;
  chunksLoaded: number;
  mesherMainMs: number;
  mesherMainMaxMs: number;
  mesherWorkerMsAvg: number;
  entities: number;
  entitiesDrawn: number;
  entityDrawCalls: number;
  /** Nodos que expandió el pathfinding en el último tick. */
  pathNodes: number;
  tick: number;
};

/** Panel de depuración (F3): FPS, tiempos de frame, draw calls y chunks. Solo para adultos. */
export function setupDebugOverlay(read: () => DebugStats): { toggle(): void; isVisible(): boolean } {
  const el = document.createElement("pre");
  el.className = "debug-overlay";
  el.hidden = true;
  document.body.append(el);

  let timer: ReturnType<typeof setInterval> | null = null;
  const refresh = () => {
    const s = read();
    el.textContent = [
      `FPS ${s.fps.toFixed(0)}   frame ${s.frameMsAvg.toFixed(1)} ms (p95 ${s.frameMsP95.toFixed(1)})`,
      `draw calls ${s.drawCalls}   triángulos ${(s.triangles / 1000).toFixed(0)} k`,
      `chunks dibujados ${s.chunksMeshed}   pendientes ${s.chunksPending}   en memoria ${s.chunksLoaded}`,
      `mesher hilo principal ${s.mesherMainMs.toFixed(2)} ms (máx ${s.mesherMainMaxMs.toFixed(2)})   worker ${s.mesherWorkerMsAvg.toFixed(1)} ms/chunk`,
      `entidades ${s.entities}   dibujadas ${s.entitiesDrawn}   draw calls ${s.entityDrawCalls}   nodos A* ${s.pathNodes}`,
      `tick ${s.tick}`,
    ].join("\n");
  };

  const api = {
    toggle() {
      el.hidden = !el.hidden;
      if (!el.hidden) {
        refresh();
        timer = setInterval(refresh, 250);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    isVisible: () => !el.hidden,
  };

  window.addEventListener("keydown", (e) => {
    if (e.key === "F3") {
      e.preventDefault();
      api.toggle();
    }
  });
  return api;
}
