import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { createHeadlessGame } from "../../../src/sim/game";
import { FixedStepLoop } from "../../../src/sim/loop";

describe("[plataforma-escalable] bucle de paso fijo", () => {
  it("N ticks avanzan exactamente N x 50 ms", () => {
    const headless = createHeadlessGame({ clock: new FakeClock() });
    headless.advance(1000);
    expect(headless.game.tick).toBe(20);
    expect(headless.game.timeMs).toBe(1000);
  });

  it("limita a 5 pasos por frame y descarta el atraso", () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    loop.frame(0);
    expect(loop.frame(10_000)).toBe(5);
    expect(steps).toBe(5);
    expect(loop.alpha).toBeLessThan(1);
  });

  it("pausado no avanza y al reanudar no cuenta el tiempo oculto", () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    loop.frame(0);
    loop.setPaused(true);
    loop.frame(60_000);
    loop.setPaused(false);
    loop.frame(60_000);
    loop.frame(60_100);
    expect(steps).toBe(2);
  });

  it("[plataforma-escalable] Independencia de los FPS: mismo estado a 30 y a 144 FPS", () => {
    const run = (fps: number) => {
      const h = createHeadlessGame({ seed: "det", clock: new FakeClock() });
      const eye = h.game.player.eye();
      const down = (dx: number, dz: number) => ({ origin: { x: eye.x + dx, y: eye.y + 1, z: eye.z + dz }, direction: { x: 0.05, y: -1, z: 0 } });
      h.game.enqueue({ type: "selectBlock", block: "red" });
      h.game.enqueue({ type: "useTool", ray: down(2, 0) });
      h.game.enqueue({ type: "useTool", ray: down(0, 2) });
      h.game.enqueue({ type: "selectTool", tool: "pickaxe" });
      h.game.enqueue({ type: "useTool", ray: down(0, 2) });
      h.game.enqueue({ type: "move", x: 1, z: 0.5 });
      h.game.enqueue({ type: "jump" });
      h.advance(3000, 1000 / fps);
      h.game.enqueue({ type: "move", x: 0, z: 0 });
      h.advance(5 * 60_000, 1000 / fps);
      const dirty = h.game.world.store.dirtyChunks().map((c) => [c.key, Array.from(c.blocks).join("")]);
      return { tick: h.game.tick, dirty, pos: h.game.player.pos };
    };
    expect(run(30)).toEqual(run(144));
  });
});
