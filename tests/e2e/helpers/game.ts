import type { Page } from "@playwright/test";

/**
 * Abre el juego en modo de pruebas y espera a que el mundo visible esté dibujado. Con WebGL por
 * software el radio de vista por defecto de las pruebas es 3 chunks.
 */
export async function openTestGame(page: Page, seed = "e2e", view = 3): Promise<void> {
  await page.goto(`/?test=1&seed=${seed}&view=${view}`);
  await page.waitForFunction(() => window.__santi?.ready === true);
  await waitWorldReady(page);
}

export async function waitWorldReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__santi!.isWorldReady(), undefined, { timeout: 45_000 });
}

/** Cámara mirando hacia abajo, en diagonal, a un punto de la granja. */
export async function lookAtFarm(page: Page, dx = 0, dz = 0): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(
    ([dx, dz]) => {
      const farm = window.__santi!.layout()!.farm;
      const x = Math.floor((farm.x0 + farm.x1) / 2) + dx + 0.5;
      const z = Math.floor((farm.z0 + farm.z1) / 2) + dz + 0.5;
      const y = window.__santi!.surfaceY(Math.floor(x), Math.floor(z)) + 1;
      window.__santi!.setView({ x: x + 0.001, y: y + 14, z: z + 10 }, { x, y, z });
      return { x, y, z };
    },
    [dx, dz],
  );
}
